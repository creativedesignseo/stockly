/**
 * One-off operational runner: arm the checkout Validation and run the
 * company backfill for ONE shop, using the app's own offline session
 * token from the database. This executes the exact same service code
 * the app runs (no reimplementation drift) with a minimal
 * AdminApiContext, for shops that were installed before the afterAuth
 * bootstrap existed and where nobody has pressed Save on Pricing
 * settings yet.
 *
 * Usage:
 *   DATABASE_URL=<prod-url> npx tsx scripts/bootstrap-shop.mts <shop-domain>
 *
 * Prints status only — never the token.
 */
import prisma from "../app/db.server";
import { syncOpeningOrderValidation } from "../app/services/opening-order-sync.server";
import { backfillEstablishedCompanies } from "../app/services/company-qualification.server";
import { syncTiersToFunction } from "../app/services/discount-function-sync.server";

const shopDomain = process.argv[2];
if (!shopDomain) {
  console.error("usage: tsx scripts/bootstrap-shop.mts <shop.myshopify.com>");
  process.exit(1);
}

const session = await prisma.session.findFirst({
  where: { shop: shopDomain, isOnline: false },
});
if (!session?.accessToken) {
  console.error(`no offline session for ${shopDomain}`);
  process.exit(1);
}
if (session.expires && session.expires < new Date()) {
  console.error(
    `session token EXPIRED at ${session.expires.toISOString()} — open the app in the shop's admin (any page) to refresh it, then re-run.`,
  );
  process.exit(1);
}

const token = session.accessToken;

/** Minimal AdminApiContext: the services only use admin.graphql(). */
const admin = {
  graphql: async (query: string, options?: { variables?: unknown }) => {
    const response = await fetch(
      `https://${shopDomain}/admin/api/2025-01/graphql.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables: options?.variables }),
      },
    );
    return response;
  },
} as never;

const shopRow = await prisma.shop.findUnique({ where: { id: shopDomain } });
if (!shopRow) {
  console.error(`no Shop row for ${shopDomain}`);
  process.exit(1);
}

console.log(`[bootstrap] ${shopDomain} — validation sync…`);
await syncOpeningOrderValidation(admin, shopRow.id);

console.log(`[bootstrap] ${shopDomain} — discount config sync…`);
await syncTiersToFunction(admin, shopRow.id);

console.log(`[bootstrap] ${shopDomain} — company backfill…`);
const result = await backfillEstablishedCompanies(admin, shopRow.id);
console.log(
  `[bootstrap] backfill:`,
  result ?? "already done (companiesBackfilledAt set)",
);

await prisma.$disconnect();
console.log("[bootstrap] done");
