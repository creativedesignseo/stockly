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

/**
 * Plan names in display order — reused by the UI to render one card per plan.
 *
 * Starter only, deliberately. Growth ($79) and Plus ($149) existed here with
 * three of four and five of six of their bullets marked "(coming soon)" —
 * variant pricing, quantity increments, Net terms, quotes, public APIs. None
 * of it is built. Listing a purchasable plan whose entire differentiator is
 * unbuilt is a direct App Store rejection, and charging for it would be worse.
 * Add them back the day they ship; new plans do not need another review.
 */
export const BILLING_PLAN_NAMES = [STARTER_PLAN] as const;
export type BillingPlanName = (typeof BILLING_PLAN_NAMES)[number];

export interface BillingPlanDefinition {
  name: BillingPlanName;
  amount: number;
  currencyCode: "USD";
  interval: BillingInterval.Every30Days;
  trialDays: 14;
}

/**
 * USD, billed every 30 days, 14-day trial. Amounts are dollars (the Shopify
 * Billing API takes a decimal amount, not cents). ADR-008 planned three
 * tiers; only this one is deliverable today — see BILLING_PLAN_NAMES.
 */
export const BILLING_PLANS: Record<BillingPlanName, BillingPlanDefinition> = {
  [STARTER_PLAN]: {
    name: STARTER_PLAN,
    amount: 39,
    currencyCode: "USD",
    interval: BillingInterval.Every30Days,
    trialDays: 14,
  },
};
