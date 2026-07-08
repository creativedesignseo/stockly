/**
 * Billing plan constants — plan names, pricing, and the display copy
 * the UI needs. Deliberately NOT a `.server.ts` module: Remix strips
 * `.server` files from the client bundle, but `app/routes/app.billing.tsx`'s
 * default-exported component (which renders in the browser) needs these
 * plan names/amounts to draw the plan cards. Splitting this out keeps
 * that import safe while `app/services/billing.server.ts` (the actual
 * source of truth used to build the `shopifyApp({ billing })` config
 * and to call the Shopify Billing API) re-exports everything here for
 * server-side consumers, so there is still exactly one place the
 * numbers are typed in.
 *
 * ADR-008 pricing: Starter $39 / Growth $79 / Plus $149. All USD,
 * billed every 30 days, all with a 14-day trial.
 */
import { BillingInterval } from "@shopify/shopify-app-remix/server";

export const STARTER_PLAN = "Starter";
export const GROWTH_PLAN = "Growth";
export const PLUS_PLAN = "Plus";

/** Plan names in display order — reused by the UI to render one card per plan. */
export const BILLING_PLAN_NAMES = [STARTER_PLAN, GROWTH_PLAN, PLUS_PLAN] as const;
export type BillingPlanName = (typeof BILLING_PLAN_NAMES)[number];

export interface BillingPlanDefinition {
  name: BillingPlanName;
  amount: number;
  currencyCode: "USD";
  interval: BillingInterval.Every30Days;
  trialDays: 14;
}

/**
 * The 3 Stockly plans (ADR-008). All USD, billed every 30 days, all
 * with a 14-day trial. Amounts are dollars (Shopify Billing API takes
 * a decimal amount, not cents).
 */
export const BILLING_PLANS: Record<BillingPlanName, BillingPlanDefinition> = {
  [STARTER_PLAN]: {
    name: STARTER_PLAN,
    amount: 39,
    currencyCode: "USD",
    interval: BillingInterval.Every30Days,
    trialDays: 14,
  },
  [GROWTH_PLAN]: {
    name: GROWTH_PLAN,
    amount: 79,
    currencyCode: "USD",
    interval: BillingInterval.Every30Days,
    trialDays: 14,
  },
  [PLUS_PLAN]: {
    name: PLUS_PLAN,
    amount: 149,
    currencyCode: "USD",
    interval: BillingInterval.Every30Days,
    trialDays: 14,
  },
};
