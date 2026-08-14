/**
 * Mandatory GDPR webhook: shop/redact.
 *
 * Triggered 48 hours after a merchant uninstalls the app. Shopify
 * gives us this grace period so an accidental uninstall + reinstall
 * doesn't lose the merchant's setup. After the 48h window expires,
 * we MUST delete everything we hold for that shop within 30 days.
 *
 * Shopify's contract:
 *   - We MUST respond 200 (or any 2xx) to acknowledge receipt.
 *   - We MUST verify the HMAC header; on mismatch return 401.
 *     `authenticate.webhook` from shopify-app-remix does both.
 *   - We MUST erase all shop data within 30 days.
 *
 * What Stockly holds per shop (see prisma/schema.prisma):
 *   - Shop row + cascaded Tier, WholesaleCustomer,
 *     WholesaleApplication, OnboardingResponse (all have
 *     onDelete: Cascade defined in the schema)
 *   - Session rows (auth, not cascaded from Shop because Session
 *     uses the SDK's own table that doesn't reference Shop.id)
 *
 * Note: webhooks.app.uninstalled also runs at uninstall time and
 * already cleans up Session rows. shop/redact is the belt-and-
 * suspenders deletion that runs ~48h later and removes everything,
 * including the Shop row itself.
 */
import type { ActionFunctionArgs } from "@remix-run/node";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { logProtectedDataAccess } from "../services/access-log.server";

interface ShopRedactPayload {
  shop_id?: number;
  shop_domain?: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);
  // eslint-disable-next-line no-console
  console.log(`[Stockly GDPR] ${topic} received for ${shop}`);

  const p = payload as ShopRedactPayload;
  const shopDomain = p.shop_domain ?? shop;

  // Defense in depth: shop and payload.shop_domain should match. If
  // they don't, log and proceed with the authenticated value (the one
  // verified by HMAC) — never the unverified payload field.
  if (p.shop_domain && p.shop_domain !== shop) {
    // eslint-disable-next-line no-console
    console.warn(
      "[Stockly GDPR shop/redact] payload.shop_domain mismatches authenticated shop",
      { authenticatedShop: shop, payloadShopDomain: p.shop_domain },
    );
  }

  // Audit trail (Shopify Level 2 protected customer data) — written BEFORE
  // the deletion, because it references the Shop row we are about to drop.
  //
  // This entry cascade-deletes together with the Shop (onDelete: Cascade),
  // so it does NOT survive this request. That is correct and intended:
  // shop/redact means nothing about this shop should remain, including its
  // audit trail. The durable record of the redaction is the structured
  // console log below, which lives in the host's logs, not our database.
  // Do not "fix" this by decoupling the FK.
  await logProtectedDataAccess({
    shopId: shop,
    actor: "webhook",
    action: "delete",
    subjectRef: null,
    fields: ["name", "email", "phone", "company", "tax_id", "address"],
    context: "gdpr.shop_redact",
  });

  // Hard delete in a transaction. Session rows aren't cascaded by
  // the schema (Session.shop is a String, not a FK) so we delete
  // them explicitly first. Deleting the Shop row cascades to Tier,
  // WholesaleCustomer, WholesaleApplication, OnboardingResponse via
  // the onDelete: Cascade declarations in schema.prisma.
  //
  // `deleteMany` on Shop is used (instead of `delete`) so the call
  // is idempotent: if shop/redact arrives twice (Shopify can retry),
  // the second call is a no-op instead of a P2025 error.
  let deletedSessions: { count: number };
  let deletedShops: { count: number };
  try {
    [deletedSessions, deletedShops] = await prisma.$transaction([
      prisma.session.deleteMany({ where: { shop } }),
      prisma.shop.deleteMany({ where: { id: shop } }),
    ]);
  } catch (error) {
    // Rethrow so Shopify retries — but say why first. On 2026-08-13 this
    // returned a silent 500 eighteen times for a reviewer's store; Shopify
    // exhausted its retries and the shop's data survived a redaction request,
    // which is a GDPR failure we only found by reading the database by hand.
    // If this fires again, the reason must be in the logs.
    console.error(
      "[Stockly GDPR shop/redact] DELETION FAILED",
      JSON.stringify({
        shop,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }),
    );
    throw error;
  }

  // eslint-disable-next-line no-console
  console.log(
    "[Stockly GDPR shop/redact]",
    JSON.stringify({
      shop: shopDomain,
      deletedShops: deletedShops.count,
      deletedSessions: deletedSessions.count,
    }),
  );

  return new Response();
};
