import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { buildBillingConfig } from "./services/billing.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  // Plan names/amounts/trial live in one place: services/billing.server.ts
  // (ADR-008 pricing: Starter $39 / Growth $79 / Plus $149).
  billing: buildBillingConfig(),
  hooks: {
    /**
     * Install-time bootstrap (2026-08-22). Two jobs, both fire-and-
     * forget with every error swallowed — a bootstrap failure must
     * never break OAuth, and every step here is retried later by the
     * normal admin flows (settings save, approve, webhooks):
     *
     *   1. Register the checkout Validation. Before this hook existed
     *      the Validation was only registered on a settings save, so a
     *      merchant who installed and never touched Pricing settings
     *      had NO checkout minimum at all — made worse by the apiType
     *      string bug that kept validationCreate from ever running
     *      (see opening-order-sync.server.ts). Install now arms it.
     *   2. Backfill established B2B companies (ordersCount > 0 →
     *      qualified metafield), so a wholesale shop's existing buyers
     *      land under the recurring minimum, not the opening-order
     *      gate. One-off per shop, gated by Shop.companiesBackfilledAt.
     */
    afterAuth: async ({ session, admin }) => {
      // Truly fire-and-forget: the SDK AWAITS this hook inside the
      // token-exchange auth path and converts any rejection into a 500,
      // so nothing here may block or throw — the merchant's first admin
      // request must not wait on serial Admin API work, and an install
      // must never fail because a bootstrap step hiccuped. Everything
      // below is retried by the normal admin flows (settings save,
      // approve, webhooks). Imports live INSIDE the guarded closure so
      // even a module-evaluation error cannot reject the hook.
      void (async () => {
        const { getOrCreateShop } = await import("./services/shops.server");
        const { syncOpeningOrderValidation } = await import(
          "./services/opening-order-sync.server"
        );
        const { backfillEstablishedCompanies } = await import(
          "./services/company-qualification.server"
        );
        const shop = await getOrCreateShop(session.shop);
        await syncOpeningOrderValidation(admin, shop.id);
        await backfillEstablishedCompanies(admin, shop.id);
      })().catch((error: unknown) => {
        console.error(
          "[afterAuth] bootstrap failed (will be retried by admin flows):",
          error instanceof Error ? error.message : String(error),
        );
      });
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
