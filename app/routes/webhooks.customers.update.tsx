/**
 * Webhook handler: customers/update.
 *
 * Detects when a Shopify customer receives the shop's wholesale tag
 * via an external approval flow (e.g. Piro's native B2B form) and
 * automatically enrolls them in Stockly's opening-order pending list.
 *
 * Once enrolled (qualifiedAt = null), the stockly-opening-order
 * Validation Function will block their checkout until their cart
 * meets the shop's configured opening-order minimum. After they pay
 * a qualifying order, the orders/paid webhook releases them.
 *
 * Idempotent: if the customer is already tracked in WholesaleCustomer
 * (regardless of qualifiedAt), this is a no-op — we never overwrite
 * existing state set by Stockly's own approval flow.
 */
import type { ActionFunctionArgs } from "@remix-run/node";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { syncOpeningOrderValidation } from "../services/opening-order-sync.server";

interface CustomersUpdatePayload {
  id?: number;
  admin_graphql_api_id?: string;
  /// Shopify sends customer tags as a comma-separated string.
  tags?: string;
}

function parseTags(raw: string | undefined | null): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  );
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, admin, topic } =
    await authenticate.webhook(request);
  // eslint-disable-next-line no-console
  console.log(`[Stockly webhook] ${topic} for ${shop}`);

  if (!admin) {
    return new Response();
  }

  const customer = payload as CustomersUpdatePayload;
  const customerId = customer.id?.toString();
  if (!customerId) return new Response();

  const shopRow = await prisma.shop.findUnique({ where: { id: shop } });
  if (!shopRow) return new Response();

  // Only act when the customer carries the shop's wholesale tag.
  const tags = parseTags(customer.tags);
  if (!tags.has(shopRow.wholesaleTag)) {
    return new Response();
  }

  // If already tracked in Stockly, do not overwrite any existing state
  // (qualifiedAt, qualifyingOrderId, etc.) — this webhook can fire for
  // many reasons (address change, marketing opt-in, ...) and we must
  // not accidentally reset a customer who already completed their
  // opening order.
  const existing = await prisma.wholesaleCustomer.findUnique({
    where: {
      shopId_shopifyCustomerId: {
        shopId: shopRow.id,
        shopifyCustomerId: customerId,
      },
    },
  });

  if (existing) {
    return new Response();
  }

  // New wholesale customer detected via external approval.
  // Enroll with qualifiedAt = null (pending opening order) so the
  // Validation Function enforces the first-purchase minimum at checkout.
  await prisma.wholesaleCustomer.create({
    data: {
      shopId: shopRow.id,
      shopifyCustomerId: customerId,
      qualifiedAt: null,
      notes: "Auto-detected via customers/update webhook (external approval)",
    },
  });

  // Push the updated pending-customers list to the Validation Function's
  // metafield so the checkout block takes effect immediately.
  try {
    await syncOpeningOrderValidation(admin, shopRow.id);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "[Stockly webhook customers/update] syncOpeningOrderValidation failed:",
      err,
    );
  }

  // eslint-disable-next-line no-console
  console.log(
    `[Stockly webhook] customers/update: enrolled ${customerId} in opening-order pending list on ${shop}`,
  );

  return new Response();
};
