/**
 * Admin route: Billing — plan picker.
 *
 * URL: /app/billing
 *
 * Soft-gate only (decided — see billing plumbing plan): this route is
 * where a merchant chooses/starts a Stockly subscription. Nothing in
 * the app hard-blocks usage without one; the dashboard's Setup Guide
 * and a dismissible Banner just point here.
 *
 * Loader: authenticates, checks the shop's current subscription state
 * via the billing service (never calls the Shopify SDK directly —
 * see app/services/billing.server.ts), and returns the plan config
 * plus whichever plan (if any) is currently active/trialing.
 *
 * Action: `intent=subscribe` with a `plan` field calls `billing.request`,
 * which throws a redirect to Shopify's subscription confirmation page.
 * `isTest` is derived from the environment, never hardcoded (see
 * `isTestBillingEnvironment` — this is the easiest way to silently
 * create real charges in test or fail to detect real subscriptions in
 * prod).
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  List,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticateAdmin } from "../lib/auth.server";
import {
  checkActiveSubscription,
  isTestBillingEnvironment,
} from "../services/billing.server";
// Plan names/amounts are a plain data module (not `.server`) so the
// client-rendered component below can import them too — see the
// docblock in services/billing-plans.ts for why this is split out
// from billing.server.ts.
import {
  BILLING_PLAN_NAMES,
  BILLING_PLANS,
  GROWTH_PLAN,
  PLUS_PLAN,
  STARTER_PLAN,
  type BillingPlanName,
} from "../services/billing-plans";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticateAdmin(request);

  const { hasActivePayment, appSubscriptions } =
    await checkActiveSubscription(billing);

  // Shopify reports both fully active and trialing subscriptions
  // inside `appSubscriptions` with `hasActivePayment: true` — no
  // separate "trialing" status to special-case here.
  const currentSubscription = hasActivePayment
    ? (appSubscriptions.find((sub) =>
        BILLING_PLAN_NAMES.includes(sub.name as BillingPlanName),
      ) ?? null)
    : null;

  return json({
    plans: BILLING_PLANS,
    currentSubscription,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticateAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const plan = String(form.get("plan") ?? "");

  if (intent !== "subscribe") {
    return json({ ok: false, error: "unknown intent" }, { status: 400 });
  }

  if (!BILLING_PLAN_NAMES.includes(plan as BillingPlanName)) {
    return json({ ok: false, error: "unknown plan" }, { status: 400 });
  }

  // billing.request() throws (redirects to Shopify's confirmation
  // page) rather than returning — it never resolves normally. The cast
  // is safe: the guard above already confirmed `plan` is one of the 3
  // known plan names.
  return billing.request({
    plan: plan as BillingPlanName,
    isTest: isTestBillingEnvironment(),
    returnUrl: "/app/billing",
  });
};

const PLAN_BLURBS: Record<BillingPlanName, string[]> = {
  [STARTER_PLAN]: [
    "Volume tiers (multiplicative pricing)",
    "Wholesale registration form + approval queue",
    "Quick Order Form storefront block",
  ],
  [GROWTH_PLAN]: [
    "Everything in Starter",
    "Variant-level pricing overrides (coming soon)",
    "Quantity increments — sets of 3/6/12 (coming soon)",
    "Max order limits (coming soon)",
  ],
  [PLUS_PLAN]: [
    "Everything in Growth",
    "Net payment terms — 30/60/90 (coming soon)",
    "Quote system via Draft Orders (coming soon)",
    "Manual orders by staff (coming soon)",
    "Custom fields on orders (coming soon)",
    "Public APIs (coming soon)",
  ],
};

export default function Billing() {
  const { plans, currentSubscription } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const submittingPlan =
    navigation.state !== "idle"
      ? String(navigation.formData?.get("plan") ?? "")
      : null;

  return (
    <Page title="Billing">
      <TitleBar title="Billing" />
      <BlockStack gap="400">
        <Layout>
          {BILLING_PLAN_NAMES.map((name) => {
            const plan = plans[name];
            const isCurrent = currentSubscription?.name === name;
            return (
              <Layout.Section key={name} variant="oneThird">
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h2" variant="headingMd">
                        {name}
                      </Text>
                      {isCurrent && <Badge tone="success">Current plan</Badge>}
                    </InlineStack>
                    <Text as="p" variant="heading2xl" fontWeight="bold">
                      ${plan.amount}
                      <Text as="span" variant="bodyMd" tone="subdued">
                        {" "}
                        /mo
                      </Text>
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {plan.trialDays}-day free trial
                    </Text>
                    <List type="bullet">
                      {PLAN_BLURBS[name].map((feature) => (
                        <List.Item key={feature}>{feature}</List.Item>
                      ))}
                    </List>
                    {!isCurrent && (
                      <Form method="post">
                        <input type="hidden" name="intent" value="subscribe" />
                        <input type="hidden" name="plan" value={name} />
                        <Button
                          submit
                          variant="primary"
                          loading={submittingPlan === name}
                        >
                          {`Start ${plan.trialDays}-day trial`}
                        </Button>
                      </Form>
                    )}
                  </BlockStack>
                </Card>
              </Layout.Section>
            );
          })}
        </Layout>
      </BlockStack>
    </Page>
  );
}
