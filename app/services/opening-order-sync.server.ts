/**
 * Opening-Order Validation sync — keeps the Cart & Checkout Validation
 * Function (`stockly-opening-order`) fed with the merchant's opening-order
 * config + the list of customers who still owe their opening order.
 *
 * Mirror of `discount-function-sync.server.ts`, but for a Validation
 * (validationCreate) instead of an Automatic App Discount.
 *
 * Pipeline:
 *   1. Build the config JSON from the Shop's FPQ + post-qualification
 *      fields and two disjoint WholesaleCustomer lists, surfaced as
 *      Customer GIDs: qualifiedAt = null (still owes the opening order)
 *      and qualifiedAt != null (already cleared it).
 *   2. Ensure a Validation backed by our Function exists for the shop.
 *   3. Write/refresh the config into that Validation's
 *      `$app:stockly-opening-order/function-configuration` metafield.
 *   4. At checkout, the Function reads the metafield and blocks a buyer
 *      whose cart is below the minimum that applies to their list — the
 *      opening-order minimum for pending buyers, the post-qualification
 *      minimum for qualified ones. Never both.
 *
 * Call after: approve, release-opening-order, and FPQ or
 * post-qualification config changes.
 *
 * Fail-safe: every error is caught and logged, never thrown — a sync
 * failure must not block the admin flow, and the Function fails OPEN
 * (no config → mode none → no checkout block). Required scope:
 * `write_validations`.
 */
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

import prisma from "../db.server";

const FUNCTION_HANDLE = "stockly-opening-order";
/**
 * The apiType string Shopify's Admin API actually returns for Cart &
 * Checkout Validation functions. NOT "cart_and_checkout_validation" —
 * that string (with "and", matching the marketing name) shipped in the
 * original 2026-06-03 commit and NEVER matched anything, so
 * `validationCreate` never ran and no Validation object ever existed on
 * any shop. The checkout minimum was silently disabled for its entire
 * life; a $82.60 B2B order sailed past a $300 FPQ on 2026-08-21, which
 * is how this was finally caught. Verified against the live API on
 * 2025-01, 2025-04 and 2025-07: all return "cart_checkout_validation".
 * `matchesValidationApiType` below also accepts any future
 * "*validation*" apiType so a Shopify rename degrades to the title
 * check instead of silently disabling checkout enforcement again.
 */
const VALIDATION_API_TYPE = "cart_checkout_validation";
const METAFIELD_NAMESPACE = "$app:stockly-opening-order";
const METAFIELD_KEY = "function-configuration";

/** Exported for tests — the string above must never drift again. */
export function matchesValidationApiType(apiType: string): boolean {
  return (
    apiType === VALIDATION_API_TYPE || apiType.toLowerCase().includes("validation")
  );
}

/** Find the Function ID for our `stockly-opening-order` handle. */
async function findValidationFunctionId(
  admin: AdminApiContext,
): Promise<string | null> {
  const response = await admin.graphql(
    `#graphql
    query OpeningOrderFunction {
      shopifyFunctions(first: 25) {
        nodes {
          id
          apiType
          title
        }
      }
    }`,
  );
  const json = (await response.json()) as {
    data?: {
      shopifyFunctions?: {
        nodes?: Array<{ id: string; apiType: string; title: string }>;
      };
    };
  };
  const nodes = json.data?.shopifyFunctions?.nodes ?? [];
  const match = nodes.find(
    (n) =>
      matchesValidationApiType(n.apiType) &&
      (n.title === FUNCTION_HANDLE ||
        n.title.toLowerCase().includes("opening")),
  );
  return match?.id ?? null;
}

/** Find an existing Validation backed by our Function (by functionId). */
async function findExistingValidationId(
  admin: AdminApiContext,
  functionId: string,
): Promise<string | null> {
  const response = await admin.graphql(
    `#graphql
    query AppValidations {
      validations(first: 50) {
        nodes {
          id
          shopifyFunction {
            id
          }
        }
      }
    }`,
  );
  const json = (await response.json()) as {
    data?: {
      validations?: {
        nodes?: Array<{ id: string; shopifyFunction: { id: string } }>;
      };
    };
  };
  const node = json.data?.validations?.nodes?.find(
    (n) => n.shopifyFunction?.id === functionId,
  );
  return node?.id ?? null;
}

/** Create the Validation, with the metafield set in the same mutation. */
async function createValidation(
  admin: AdminApiContext,
  functionId: string,
  configurationJson: string,
): Promise<void> {
  const response = await admin.graphql(
    `#graphql
    mutation CreateOpeningOrderValidation($validation: ValidationCreateInput!) {
      validationCreate(validation: $validation) {
        validation { id }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        validation: {
          functionId,
          enable: true,
          blockOnFailure: false,
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
      validationCreate?: {
        validation?: { id: string };
        userErrors?: Array<{ field: string[]; message: string }>;
      };
    };
  };
  const errors = json.data?.validationCreate?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(
      `validationCreate failed: ${errors
        .map((e) => `${e.field?.join(".")} — ${e.message}`)
        .join("; ")}`,
    );
  }
}

/** Refresh the config metafield on an existing Validation. */
async function updateValidationMetafield(
  admin: AdminApiContext,
  validationId: string,
  configurationJson: string,
): Promise<void> {
  const response = await admin.graphql(
    `#graphql
    mutation SetOpeningOrderMetafield($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId: validationId,
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
 * Both `pendingCustomers` and `qualifiedCustomers` contain ONLY Customer
 * GIDs. That is deliberate, and the Validation Function depends on it.
 *
 * The Function matches a set of candidate identifiers (customer, company,
 * company location) against these lists. Its company/location candidates are
 * inert precisely because nothing here emits those GIDs — `WholesaleCustomer`
 * has no column to hold them. Verified 2026-08-11 against the pilot
 * merchant's live orders: `customer` is populated on native B2B orders, so
 * customer-id matching is sufficient today.
 *
 * ⚠️ Before emitting Company or CompanyLocation GIDs here, read the buyer
 * identity note in
 * `extensions/stockly-opening-order/src/cart_validations_generate_run.ts`.
 * Doing so makes identity two-level and activates a latent precedence bug:
 * the Function's "pending wins" rule would block an already-qualified buyer
 * because a COLLEAGUE at the same company location still owes their opening
 * order. That must be resolved in the Function first.
 */
const customerGid = (shopifyCustomerId: string) =>
  `gid://shopify/Customer/${shopifyCustomerId}`;

/**
 * Build the config the Validation Function reads.
 *
 * Two disjoint buyer lists, two independent gates:
 *
 *   - `pendingCustomers` (qualifiedAt = null) — approved wholesale
 *     customers who still owe their opening order. Gated by the FLAT
 *     top-level FPQ keys (`mode` / `amount` / `quantity` /
 *     `combinedLogic`).
 *   - `qualifiedCustomers` (qualifiedAt != null) — customers who already
 *     cleared the opening order. Gated by the `postQualification` block.
 *
 * The flat FPQ keys stay exactly where they have always been: an older
 * deployed Function reading a newer config must keep working (it simply
 * ignores the two new keys), and a newer Function reading an older
 * config must also keep working (missing `postQualification` /
 * `qualifiedCustomers` → no post-qualification gate → fails open).
 * Never rename or nest the flat keys.
 *
 * NOTE: do not reuse `qualifiedCustomers` from
 * `discount-function-sync.server.ts` — that list is misnamed and
 * deliberately unfiltered (it holds EVERY approved customer so the
 * price-side gate is skipped, guarding bug C3). This one is genuinely
 * filtered on `qualifiedAt: { not: null }`.
 */
export async function buildOpeningOrderConfig(shopId: string): Promise<string> {
  const [shop, pendingRows, qualifiedRows] = await Promise.all([
    prisma.shop.findUniqueOrThrow({ where: { id: shopId } }),
    prisma.wholesaleCustomer.findMany({
      where: { shopId, qualifiedAt: null },
      select: { shopifyCustomerId: true },
    }),
    prisma.wholesaleCustomer.findMany({
      where: { shopId, qualifiedAt: { not: null } },
      select: { shopifyCustomerId: true },
    }),
  ]);
  const pendingCustomers = pendingRows.map((r) =>
    customerGid(r.shopifyCustomerId),
  );
  const qualifiedCustomers = qualifiedRows.map((r) =>
    customerGid(r.shopifyCustomerId),
  );
  return JSON.stringify({
    // ----- Opening order (first purchase), for pendingCustomers -----
    mode: shop.fpqMode,
    amount: shop.fpqAmount,
    quantity: shop.fpqQuantity,
    combinedLogic: shop.fpqCombinedLogic,
    pendingCustomers,
    // ----- Every order after qualification, for qualifiedCustomers -----
    postQualification: {
      mode: shop.postQualificationMode,
      amount: shop.postQualificationMinAmount,
      // `postQualificationMOQ` is the quantity leg; 1 means "no minimum"
      // and is emitted as null so the Function never has to special-case
      // the sentinel value.
      quantity: shop.postQualificationMOQ > 1 ? shop.postQualificationMOQ : null,
      combinedLogic: shop.postQualificationCombinedLogic,
    },
    qualifiedCustomers,
  });
}

/**
 * Public entry point: call after approve / release / FPQ-config change.
 * Idempotent. Errors are swallowed (logged) — a sync failure must not
 * block the admin flow; the Function fails open.
 */
export async function syncOpeningOrderValidation(
  admin: AdminApiContext,
  shopId: string,
): Promise<void> {
  try {
    const configurationJson = await buildOpeningOrderConfig(shopId);
    const functionId = await findValidationFunctionId(admin);
    if (!functionId) {
      // eslint-disable-next-line no-console
      console.error(
        "[opening-order-sync] no stockly-opening-order function found — skipping (deploy the extension first)",
      );
      return;
    }
    const existing = await findExistingValidationId(admin, functionId);
    if (existing) {
      await updateValidationMetafield(admin, existing, configurationJson);
    } else {
      await createValidation(admin, functionId, configurationJson);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[opening-order-sync] failed:", err);
  }
}
