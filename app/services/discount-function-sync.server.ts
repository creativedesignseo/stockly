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

import prisma from "../db.server";
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
 *
 * Shape (v4 — ADR-012 multi-band Volume Pricing):
 *   {
 *     "wholesaleBaselinePct": 65,
 *     "fpq": { ... },
 *     "qualifiedCustomers": ["gid://shopify/Customer/123", ...],
 *     "tiers": [
 *       {
 *         "scope": "product",
 *         "scopeIds": ["gid://shopify/Product/123"],
 *         "groupId": "g_abc123",
 *         "minQty": 1,  "quantityTo": 9,
 *         "discountType": "percentage", "discountPct": 5,
 *         "aggregation": "per_line",
 *         "customerEligibility": "wholesale_tagged",
 *         "startsAt": null, "endsAt": null,
 *         "discountFixedPrice": null
 *       },
 *       {
 *         "scope": "product",
 *         "scopeIds": ["gid://shopify/Product/123"],
 *         "groupId": "g_abc123",
 *         "minQty": 10, "quantityTo": null,
 *         "discountType": "percentage", "discountPct": 10,
 *         ...
 *       }
 *     ]
 *   }
 *
 * Per-line filtering happens in the Function (run.ts): it picks the
 * most-specific qualifying tier for each cart line, gated by
 * quantityTo (band upper bound) and active-date window.
 *
 * Collection-scoped tiers are EXCLUDED from this payload — the Function
 * input doesn't expose a line's collections without a costly
 * `merchandise.product.collections` query (counts against Function input
 * byte budget). Collection enforcement remains storefront-only for now;
 * if the merchant needs checkout-level enforcement they should split the
 * collection into product-scoped tiers (or wait for the per-product
 * metafield follow-up).
 *
 * Back-compat: groupId/quantityTo/startsAt/endsAt/discountFixedPrice are
 * optional in the Function reader (default-on-missing pattern). One
 * release cycle of mixed legacy + new metafield shapes is supported.
 */
export async function buildConfiguration(shopId: string): Promise<string> {
  const [shop, tiers, qualifiedRows] = await Promise.all([
    prisma.shop.findUniqueOrThrow({ where: { id: shopId } }),
    listTiers(shopId, { activeOnly: true }),
    // Camino B (supersedes the ADR-004 price-side FPQ gate): EVERY
    // approved wholesale customer is surfaced here so the Function skips
    // its price-side FPQ gate and they see wholesale pricing from the
    // first unit. `qualifiedAt` no longer gates the discount — it now
    // means "has completed the opening order" and only governs the
    // CHECKOUT-side minimum (a separate Validation Function). Filtering
    // by qualifiedAt here would reintroduce bug C3 (approved customers
    // silently paying retail). See discount-function-sync.test.ts.
    prisma.wholesaleCustomer.findMany({
      where: { shopId },
      select: { shopifyCustomerId: true },
    }),
  ]);

  // Include all, product, and variant scoped tiers. Collection-scoped
  // ones get skipped — see fn-doc comment above.
  const scopedTiers = tiers
    .filter((t) => t.scope === "all" || t.scope === "product" || t.scope === "variant")
    .map((t) => {
      // 2026-05-27: scopeIds is the new multi-target storage. We mirror
      // scopeId into scopeIds[0] on write, so reading scopeIds first
      // and falling back to legacy scopeId keeps both paths correct.
      const ids =
        t.scopeIds && t.scopeIds.length > 0
          ? t.scopeIds
          : t.scopeId
            ? [t.scopeId]
            : [];
      return {
        scope: t.scope,
        // Legacy single-target field. Kept for one release cycle so
        // the Function can fall back if it sees an old metafield. New
        // Function code should read scopeIds.
        scopeId: t.scopeId,
        // NEW: full list of target GIDs the rule matches.
        scopeIds: ids,
        minQty: t.minQty,
        // ADR-012: per-band upper bound. null = open-ended.
        quantityTo: t.quantityTo,
        discountPct: t.discountPct,
        // New fields (2026-05-27). Function falls back to "percentage"
        // when missing, so older tiers in the metafield keep working.
        discountType: t.discountType,
        discountAmount: t.discountAmount, // null when type=percentage
        // ADR-012: final per-unit price for type='fixed_price'. null
        // for other types — Function ignores it then.
        discountFixedPrice: t.discountFixedPrice,
        aggregation: t.aggregation, // 'per_line' | 'cart_total' | 'mix_variants' (ADR-007 + ADR-012)
        // Per-rule customer eligibility (ADR-011). The Function falls
        // back to 'wholesale_tagged' when missing, so pre-2026-05-27
        // tiers keep gated by the shop's wholesale tag.
        customerEligibility: t.customerEligibility,
        // ADR-012: rule grouping key. The Function uses it only for
        // diagnostics today; reserved for future per-group winner
        // selection.
        groupId: t.groupId,
        // ADR-012: active-date window. ISO strings (Function compares
        // to its own `new Date().toISOString()` at run time). null =
        // no gate on that side of the window.
        startsAt: t.startsAt ? t.startsAt.toISOString() : null,
        endsAt: t.endsAt ? t.endsAt.toISOString() : null,
      };
    })
    .sort((a, b) => a.minQty - b.minQty);

  const qualifiedCustomers = qualifiedRows.map(
    (r) => `gid://shopify/Customer/${r.shopifyCustomerId}`,
  );

  return JSON.stringify({
    wholesaleBaselinePct: shop.wholesaleBaselinePct,
    // FPQ config (ADR-004). The Function uses this to gate the
    // discount on non-qualified customers' carts: if their cart
    // doesn't meet the threshold, no discount until they do.
    fpq: {
      mode: shop.fpqMode,
      amount: shop.fpqAmount,
      quantity: shop.fpqQuantity,
      combinedLogic: shop.fpqCombinedLogic,
    },
    postQualificationMOQ: shop.postQualificationMOQ,
    // Qualified customer GIDs. The Function checks membership of
    // `input.cart.buyerIdentity.customer.id` here to decide whether
    // to skip the FPQ gate.
    qualifiedCustomers,
    tiers: scopedTiers,
  });
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
