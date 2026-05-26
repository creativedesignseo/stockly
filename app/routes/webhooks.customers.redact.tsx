/**
 * Mandatory GDPR webhook: customers/redact.
 *
 * Triggered when a customer asks the store to delete their data, OR
 * automatically by Shopify 10 days after the merchant deletes a
 * customer who hasn't ordered in 6 months (otherwise withheld until
 * 6 months pass).
 *
 * Shopify's contract:
 *   - We MUST respond 200 (or any 2xx) to acknowledge receipt.
 *   - We MUST verify the HMAC header; on mismatch return 401.
 *     `authenticate.webhook` from shopify-app-remix does both.
 *   - We MUST redact or delete the customer's data within 30 days,
 *     UNLESS we are legally required to retain it (we aren't — we
 *     hold no financial records ourselves; Shopify holds those).
 *
 * What Stockly holds per customer (see prisma/schema.prisma):
 *   - WholesaleCustomer: shopId + (shopifyCustomerId | email)
 *   - WholesaleApplication: shopId + (shopifyCustomerId | email)
 *
 * Both tables key by shopId, so a redaction is scoped to one tenant
 * even if the same email exists across shops (different merchants).
 *
 * Implementation: hard delete. We have no analytical use for the
 * data after redaction and zero legal basis to retain it.
 */
import type { ActionFunctionArgs } from "@remix-run/node";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

interface CustomersRedactPayload {
  shop_id?: number;
  shop_domain?: string;
  customer?: {
    id?: number;
    email?: string;
    phone?: string;
  };
  orders_to_redact?: number[];
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);
  // eslint-disable-next-line no-console
  console.log(`[Stockly GDPR] ${topic} received for ${shop}`);

  const p = payload as CustomersRedactPayload;
  const customerId = p.customer?.id ? String(p.customer.id) : null;
  const customerEmail = p.customer?.email ?? null;

  if (!customerId && !customerEmail) {
    // Defensive: Shopify always sends one of these but never trust
    // payload completeness. Ack with 200 — no data, nothing to redact.
    // eslint-disable-next-line no-console
    console.warn(
      "[Stockly GDPR customers/redact] payload missing customer id and email; nothing to do",
    );
    return new Response();
  }

  const customerIdMatch = customerId ? { shopifyCustomerId: customerId } : null;
  const customerEmailMatch = customerEmail ? { email: customerEmail } : null;
  const orFilter = [customerIdMatch, customerEmailMatch].filter(
    Boolean,
  ) as Array<Record<string, string>>;

  // Hard delete both tables in a transaction so we don't end up with
  // half-redacted state if one query fails.
  const [deletedWc, deletedApps] = await prisma.$transaction([
    prisma.wholesaleCustomer.deleteMany({
      where: { shopId: shop, OR: orFilter },
    }),
    prisma.wholesaleApplication.deleteMany({
      where: { shopId: shop, OR: orFilter },
    }),
  ]);

  // eslint-disable-next-line no-console
  console.log(
    "[Stockly GDPR customers/redact]",
    JSON.stringify({
      shop,
      customerId,
      customerEmail,
      deletedWholesaleCustomers: deletedWc.count,
      deletedApplications: deletedApps.count,
    }),
  );

  return new Response();
};
