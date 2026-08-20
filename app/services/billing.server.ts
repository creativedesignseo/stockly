/**
 * Billing service — server-only logic that sits on top of the plan
 * constants in `app/services/billing-plans.ts` (Starter $39 / Growth
 * $79 / Plus $149, ADR-008). This file builds the `shopifyApp({ billing })`
 * config and wraps `billing.check` so routes/UI never call the Shopify
 * SDK directly.
 *
 * Re-exports the plan constants from `billing-plans.ts` so existing
 * server-side imports (`app/shopify.server.ts`, route loaders/actions)
 * can pull everything billing-related from this one module. The plan
 * constants themselves live in a non-`.server` file because
 * `app/routes/app.billing.tsx`'s client component also needs them to
 * render the plan cards — Remix strips `.server` files from the
 * client bundle, so importing them from here would break the build
 * (see commit history / progress notes for the "Server-only module
 * referenced by client" build error this avoids).
 *
 * Soft-gate, not hard-gate (decided — see the billing plumbing plan):
 * no active/trialing subscription never blocks the merchant from using
 * the app. It only surfaces a dismissible banner pointing at
 * `/app/billing`. Current install base is dev/test stores only.
 */
import type { BillingConfigSubscriptionLineItemPlan } from "@shopify/shopify-api";
import {
  BILLING_PLAN_NAMES,
  BILLING_PLANS,
  type BillingPlanName,
} from "./billing-plans";

export {
  STARTER_PLAN,
  BILLING_PLAN_NAMES,
  BILLING_PLANS,
  type BillingPlanName,
  type BillingPlanDefinition,
} from "./billing-plans";

/**
 * Builds the `billing` config object `shopifyApp()` expects, derived
 * from `BILLING_PLANS` so the numbers are never duplicated.
 */
export function buildBillingConfig(): Record<
  BillingPlanName,
  BillingConfigSubscriptionLineItemPlan
> {
  const config = {} as Record<BillingPlanName, BillingConfigSubscriptionLineItemPlan>;
  for (const planName of BILLING_PLAN_NAMES) {
    const plan = BILLING_PLANS[planName];
    config[planName] = {
      trialDays: plan.trialDays,
      lineItems: [
        {
          amount: plan.amount,
          currencyCode: plan.currencyCode,
          interval: plan.interval,
        },
      ],
    };
  }
  return config;
}

/**
 * Whether Shopify Billing calls should run in test mode (no real
 * money changes hands — required for dev stores and safe to leave on
 * for any non-production environment).
 *
 * Two triggers:
 *   1. `NODE_ENV !== "production"` — mirrors the existing convention in
 *      `app/db.server.ts` (the Prisma dev-singleton gate).
 *   2. The shop is listed in `BILLING_TEST_SHOPS` (comma-separated
 *      myshopify.com domains). The production container always runs
 *      NODE_ENV=production, so without this our OWN dev stores got REAL
 *      charges — which a development store cannot approve ("No tienes
 *      ninguna forma de pago guardada", greyed-out Approve button,
 *      2026-08-21). The allowlist flips ONLY the named test stores to
 *      test charges; every unlisted (real) merchant keeps real billing.
 *
 * This must NEVER be a hardcoded literal: hardcoding `true` would
 * silently stop charging (and stop detecting real subscriptions);
 * hardcoding `false` would create real charges against dev/test stores.
 */
export function isTestBillingEnvironment(shopDomain?: string): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  if (!shopDomain) return false;
  const testShops = (process.env.BILLING_TEST_SHOPS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return testShops.includes(shopDomain.toLowerCase());
}

/**
 * Minimal shape of the real `billing` context (from
 * `authenticate.admin` / `authenticateAdmin`) that this module needs.
 * Deliberately loose/structural (rather than importing the SDK's
 * generic `BillingContext<Config>`, which isn't part of
 * `@shopify/shopify-app-remix/server`'s public export surface) so
 * tests can mock this with a plain object — no real Shopify SDK
 * client required.
 */
export interface BillingContextLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the
  // real `billing.check` is generically typed against the app's full
  // `Config['billing']` plan-name union, which isn't exported publicly;
  // callers always pass through `checkActiveSubscription`, so the loose
  // signature here is safe (the concrete plan names are enforced by
  // `BILLING_PLAN_NAMES` at the call site, not by this type).
  check: (options?: any) => Promise<{
    hasActivePayment: boolean;
    appSubscriptions: Array<{ name: string; status: string; id: string }>;
  }>;
}

export interface ActiveSubscriptionSummary {
  hasActivePayment: boolean;
  appSubscriptions: Array<{ name: string; status: string; id: string }>;
}

/**
 * Checks whether the shop has an active (or trialing) subscription to
 * any Stockly plan. Wraps `billing.check` so callers (routes, loaders,
 * the Setup Guide) never call the Shopify SDK directly — this keeps
 * the SDK call isolated in one module so it can be mocked in tests
 * without touching real Shopify/Prisma clients.
 *
 * `billing.check` reports both fully active and trialing subscriptions
 * as active (Shopify's `hasActivePayment` already covers "on trial").
 *
 * `shopDomain` feeds the BILLING_TEST_SHOPS allowlist: a listed test
 * store subscribes with test charges, so its check must also look at
 * test subscriptions or the dashboard would deny an active plan.
 */
export async function checkActiveSubscription(
  billing: BillingContextLike,
  shopDomain?: string,
): Promise<ActiveSubscriptionSummary> {
  const result = await billing.check({
    plans: [...BILLING_PLAN_NAMES],
    isTest: isTestBillingEnvironment(shopDomain),
  });

  return {
    hasActivePayment: result.hasActivePayment,
    appSubscriptions: result.appSubscriptions,
  };
}
