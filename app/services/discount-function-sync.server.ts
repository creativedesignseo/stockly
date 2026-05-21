/**
 * Discount Function sync — keeps the Shopify Discount Function fed
 * with the merchant's current shop-wide tier configuration.
 *
 * Pipeline:
 *   1. Stockly stores Tier rows in our DB (Prisma).
 *   2. After any tier create/update/delete in admin, we call
 *      `syncTiersToFunction(admin, shopId)` from the route action.
 *   3. This service:
 *        a. Ensures an Automatic App Discount exists for this shop,
 *           backed by our `stockly-volume-discount` Function.
 *        b. Writes the latest shop-wide tier rules into that
 *           discount's `function-configuration` metafield.
 *   4. At cart/checkout time, the Function reads the metafield and
 *      applies per-line percentage discounts.
 *
 * Scope: v1 syncs only tiers with `scope='all'` and `active=true`.
 * Collection- and product-scoped tiers remain client-side display only
 * for now; they will require per-product metafields read by the
 * Function in a future revision.
 *
 * Required Admin scopes: `write_discounts`.
 */
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

import { listTiers } from "./tiers.server";

const FUNCTION_HANDLE = "stockly-volume-discount";
const METAFIELD_NAMESPACE = "$app:stockly-volume-discount";
const METAFIELD_KEY = "function-configuration";
const DISCOUNT_TITLE = "Stockly Wholesale Volume Pricing";

/**
 * Find the Function ID for our `stockly-volume-discount` handle.
 * Functions are listed under `currentAppInstallation.functions`.
 */
async function findFunctionId(admin: AdminApiContext): Promise<string | null> {
  const response = await admin.graphql(
    `#graphql
    query AppFunctions {
      shopifyFunctions(first: 25) {
        nodes {
          id
          apiType
          title
          app {
            title
          }
        }
      }
    }`,
  );

  const json = (await response.json()) as {
    data?: { shopifyFunctions?: { nodes?: Array<{ id: string; apiType: string; title: string }> } };
  };

  const nodes = json.data?.shopifyFunctions?.nodes ?? [];
  // Match by apiType (product_discounts) + our handle in title.
  // Shopify normalizes the Function title from `shopify.extension.toml`
  // `name` (which we left as i18n key `t:name` — Shopify falls back to
  // the handle when no locale file resolves it).
  const match = nodes.find(
    (n) =>
      n.apiType === "product_discounts" &&
      (n.title === FUNCTION_HANDLE || n.title.toLowerCase().includes("volume")),
  );
  return match?.id ?? null;
}

/**
 * Find an existing automatic discount for this shop that's backed
 * by our Function. We identify it by title (set on create).
 *
 * Note: `discountNodes(query: "type:automatic_app")` looks plausible
 * but Shopify rejects it with `Input "automatic_app" is not an
 * accepted value`. The accepted filter for app-Function discounts
 * isn't well documented and behavior varies by API version, so we
 * fetch unfiltered (up to 50, typical shops have <10 discounts) and
 * filter in JS by __typename + title. Safer and version-stable.
 */
async function findExistingDiscountId(
  admin: AdminApiContext,
): Promise<string | null> {
  const response = await admin.graphql(
    `#graphql
    query AppDiscounts {
      discountNodes(first: 50) {
        nodes {
          id
          discount {
            __typename
            ... on DiscountAutomaticApp {
              title
            }
          }
        }
      }
    }`,
  );

  const json = (await response.json()) as {
    data?: {
      discountNodes?: {
        nodes?: Array<{
          id: string;
          discount: { __typename: string; title?: string };
        }>;
      };
    };
  };

  const node = json.data?.discountNodes?.nodes?.find(
    (n) =>
      n.discount.__typename === "DiscountAutomaticApp" &&
      n.discount.title === DISCOUNT_TITLE,
  );
  return node?.id ?? null;
}

/**
 * Create the automatic discount. Activates immediately and runs
 * indefinitely. The metafield is set in the same mutation.
 */
async function createAutomaticDiscount(
  admin: AdminApiContext,
  functionId: string,
  configurationJson: string,
): Promise<string> {
  const response = await admin.graphql(
    `#graphql
    mutation CreateAutomaticDiscount($automaticAppDiscount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
        automaticAppDiscount {
          discountId
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        automaticAppDiscount: {
          title: DISCOUNT_TITLE,
          functionId,
          startsAt: new Date().toISOString(),
          metafields: [
            {
              namespace: METAFIELD_NAMESPACE,
              key: METAFIELD_KEY,
              type: "json",
              value: configurationJson,
            },
          ],
        },
      },
    },
  );

  const json = (await response.json()) as {
    data?: {
      discountAutomaticAppCreate?: {
        automaticAppDiscount?: { discountId: string };
        userErrors?: Array<{ field: string[]; message: string }>;
      };
    };
  };

  const errors = json.data?.discountAutomaticAppCreate?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(
      `discountAutomaticAppCreate failed: ${errors
        .map((e) => `${e.field?.join(".")} — ${e.message}`)
        .join("; ")}`,
    );
  }

  const discountId =
    json.data?.discountAutomaticAppCreate?.automaticAppDiscount?.discountId;
  if (!discountId) {
    throw new Error("discountAutomaticAppCreate returned no discountId");
  }
  return discountId;
}

/**
 * Update the metafield on an existing discount with the new config.
 * Uses metafieldsSet which is the supported way to write metafields
 * onto DiscountNodes.
 */
async function updateDiscountMetafield(
  admin: AdminApiContext,
  discountNodeId: string,
  configurationJson: string,
): Promise<void> {
  const response = await admin.graphql(
    `#graphql
    mutation SetDiscountMetafield($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId: discountNodeId,
            namespace: METAFIELD_NAMESPACE,
            key: METAFIELD_KEY,
            type: "json",
            value: configurationJson,
          },
        ],
      },
    },
  );

  const json = (await response.json()) as {
    data?: {
      metafieldsSet?: {
        userErrors?: Array<{ field: string[]; message: string }>;
      };
    };
  };

  const errors = json.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(
      `metafieldsSet failed: ${errors
        .map((e) => `${e.field?.join(".")} — ${e.message}`)
        .join("; ")}`,
    );
  }
}

/**
 * Build the JSON payload that the Function expects in its metafield.
 * Shape:
 *   {
 *     "tiers": [
 *       { "minQty": 10, "discountPct": 10 },
 *       ...
 *     ]
 *   }
 *
 * v1 only includes shop-wide (`scope='all'`) active tiers — the
 * Function doesn't yet have access to product/collection scoping
 * data at checkout time.
 */
async function buildConfiguration(shopId: string): Promise<string> {
  const tiers = await listTiers(shopId, { activeOnly: true });
  const shopWide = tiers
    .filter((t) => t.scope === "all")
    .map((t) => ({
      minQty: t.minQty,
      discountPct: t.discountPct,
    }))
    .sort((a, b) => a.minQty - b.minQty);
  return JSON.stringify({ tiers: shopWide });
}

/**
 * Public entry point: call this after any tier mutation in the admin.
 * Idempotent — safe to call multiple times.
 *
 * Catches and logs errors instead of throwing: a discount-sync failure
 * shouldn't block the admin tier save flow. The merchant can re-trigger
 * sync by saving any tier again. (We will add an explicit "resync"
 * button + a status indicator in admin in a follow-up.)
 */
export async function syncTiersToFunction(
  admin: AdminApiContext,
  shopId: string,
): Promise<void> {
  try {
    const configurationJson = await buildConfiguration(shopId);

    // Ensure the discount exists.
    let discountId = await findExistingDiscountId(admin);
    if (!discountId) {
      const functionId = await findFunctionId(admin);
      if (!functionId) {
        // eslint-disable-next-line no-console
        console.warn(
          "[Stockly] discount-function-sync: Function not yet deployed; skipping. " +
            "Restart `npm run dev` to deploy the function, then save a tier again.",
        );
        return;
      }
      discountId = await createAutomaticDiscount(admin, functionId, configurationJson);
      // eslint-disable-next-line no-console
      console.log(
        `[Stockly] discount-function-sync: created automatic discount ${discountId}`,
      );
    } else {
      await updateDiscountMetafield(admin, discountId, configurationJson);
      // eslint-disable-next-line no-console
      console.log(
        `[Stockly] discount-function-sync: updated metafield on ${discountId}`,
      );
    }
  } catch (err) {
    // Surface the full error for easier diagnosis in dev logs. Without
    // the stack + cause chain, silent failures (like the
    // `type:automatic_app` invalid-query bug that bit us in testing)
    // are very hard to spot.
    // eslint-disable-next-line no-console
    console.error("[Stockly] discount-function-sync failed:", err);
    if (err instanceof Error && err.stack) {
      // eslint-disable-next-line no-console
      console.error(err.stack);
    }
  }
}
