/**
 * Opening-Order Validation sync — keeps the Cart & Checkout Validation
 * Function (`stockly-opening-order`) fed with the merchant's opening-order
 * config + the list of customers who still owe their opening order.
 *
 * Mirror of `discount-function-sync.server.ts`, but for a Validation
 * (validationCreate) instead of an Automatic App Discount.
 *
 * Pipeline:
 *   1. Build the config JSON from the Shop's FPQ fields + the
 *      WholesaleCustomer rows with qualifiedAt = null (pending opening
 *      order), surfaced as Customer GIDs.
 *   2. Ensure a Validation backed by our Function exists for the shop.
 *   3. Write/refresh the config into that Validation's
 *      `$app:stockly-opening-order/function-configuration` metafield.
 *   4. At checkout, the Function reads the metafield and blocks customers
 *      on the pending list whose cart is below the minimum.
 *
 * Call after: approve, release-opening-order, and FPQ-config changes.
 *
 * Fail-safe: every error is caught and logged, never thrown — a sync
 * failure must not block the admin flow, and the Function fails OPEN
 * (no config → mode none → no checkout block). Required scope:
 * `write_validations`.
 */
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

import prisma from "../db.server";

const FUNCTION_HANDLE = "stockly-opening-order";
const VALIDATION_API_TYPE = "cart_and_checkout_validation";
const METAFIELD_NAMESPACE = "$app:stockly-opening-order";
const METAFIELD_KEY = "function-configuration";

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
      n.apiType === VALIDATION_API_TYPE &&
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
 * Build the config the Validation Function reads. `pendingCustomers` =
 * approved wholesale customers who still owe their opening order
 * (qualifiedAt = null). The minimum mirrors the shop's FPQ config.
 */
export async function buildOpeningOrderConfig(shopId: string): Promise<string> {
  const [shop, pendingRows] = await Promise.all([
    prisma.shop.findUniqueOrThrow({ where: { id: shopId } }),
    prisma.wholesaleCustomer.findMany({
      where: { shopId, qualifiedAt: null },
      select: { shopifyCustomerId: true },
    }),
  ]);
  const pendingCustomers = pendingRows.map(
    (r) => `gid://shopify/Customer/${r.shopifyCustomerId}`,
  );
  return JSON.stringify({
    mode: shop.fpqMode,
    amount: shop.fpqAmount,
    quantity: shop.fpqQuantity,
    combinedLogic: shop.fpqCombinedLogic,
    pendingCustomers,
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
