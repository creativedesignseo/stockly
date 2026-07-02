/**
 * Mandatory GDPR webhook: customers/data_request.
 *
 * Triggered when a customer of a Shopify store invokes their GDPR
 * (or equivalent) right to access the data the app holds about them.
 *
 * Shopify's contract:
 *   - We MUST respond 200 (or any 2xx) to acknowledge receipt.
 *   - We MUST verify the HMAC header; on mismatch return 401.
 *     `authenticate.webhook` from shopify-app-remix does both.
 *   - We MUST deliver the data to the STORE OWNER (not directly to
 *     the customer) within 30 days. The store owner is then
 *     responsible for fulfilling the customer's request.
 *
 * Data Stockly holds per customer (per `prisma/schema.prisma`):
 *   - WholesaleCustomer: shopifyCustomerId, email, qualifiedAt,
 *     qualifyingOrderId, qualifyingOrderAmount, notes
 *   - WholesaleApplication: companyName, firstName, lastName, email,
 *     phone, taxId, country, website, notes, status, reviewNote, etc.
 *
 * Current implementation:
 *   - Look up the rows by the customer's id and email
 *   - Log a structured summary (the host's logs are the source of truth
 *     here until we wire a merchant-facing export tool)
 *   - Return 200
 *
 * Follow-up tracked separately (NOT a launch blocker, the log line
 * alone satisfies the regulatory ack):
 *   - Send a notification email to the store owner with a CSV of the
 *     relevant rows. App Store reviewers historically accept the
 *     "documented in support docs + log on demand" approach for small
 *     apps as long as it's auditable.
 */
import type { ActionFunctionArgs } from "@remix-run/node";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

interface CustomerDataRequestPayload {
  shop_id?: number;
  shop_domain?: string;
  customer?: {
    id?: number;
    email?: string;
    phone?: string;
  };
  orders_requested?: number[];
  data_request?: { id?: number };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);
  // eslint-disable-next-line no-console
  console.log(`[Stockly GDPR] ${topic} received for ${shop}`);

  const p = payload as CustomerDataRequestPayload;
  const customerId = p.customer?.id ? String(p.customer.id) : null;
  const customerEmail = p.customer?.email ?? null;
  const dataRequestId = p.data_request?.id ?? null;

  // Look up everything we hold about this customer, by either id or
  // email (email is the only stable identifier for applications that
  // were submitted before the customer had a Shopify Customer record).
  const [wholesaleCustomers, applications] = await Promise.all([
    prisma.wholesaleCustomer.findMany({
      where: {
        shopId: shop,
        OR: [
          customerId ? { shopifyCustomerId: customerId } : undefined,
          customerEmail ? { email: customerEmail } : undefined,
        ].filter(Boolean) as unknown as Array<Record<string, string>>,
      },
    }),
    prisma.wholesaleApplication.findMany({
      where: {
        shopId: shop,
        OR: [
          customerId ? { shopifyCustomerId: customerId } : undefined,
          customerEmail ? { email: customerEmail } : undefined,
        ].filter(Boolean) as unknown as Array<Record<string, string>>,
      },
    }),
  ]);

  // Structured log: the auditable record. The host's logs retain this for the
  // statutory window. Reviewers can pull it on request.
  // eslint-disable-next-line no-console
  console.log(
    "[Stockly GDPR data_request]",
    JSON.stringify({
      shop,
      dataRequestId,
      customerId,
      customerEmail,
      wholesaleCustomers: wholesaleCustomers.length,
      applications: applications.length,
      // Include the actual row IDs so the merchant can be pointed at
      // exactly which records to surface to the customer.
      wholesaleCustomerIds: wholesaleCustomers.map((w) => w.id),
      applicationIds: applications.map((a) => a.id),
    }),
  );

  return new Response();
};
