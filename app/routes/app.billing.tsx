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
  STARTER_PLAN,
  type BillingPlanName,
} from "../services/billing-plans";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticateAdmin(request);

  // billing.check is a live Shopify GraphQL call. Unguarded, one blip
  // (stale token, throttle) rejected the whole loader and rendered
  // Remix's bare "Application Error" inside the admin iframe — on the
  // billing page, in front of a reviewer (App Store 1.2.2/2.1.1).
  // Degrade to "no active subscription": the plan cards still render
  // and the merchant can retry; never crash the page over a status
  // read. Thrown Response objects are NOT errors, they are the SDK's
  // reauth control flow (exit-iframe 302 / App Bridge 401-reauthorize
  // on a revoked access token) and MUST propagate for auth recovery to
  // work — swallowing one would silently render a paying merchant as
  // unsubscribed instead of re-authing.
  const { hasActivePayment, appSubscriptions } = await checkActiveSubscription(
    billing,
    session.shop,
  ).catch((error) => {
    if (error instanceof Response) throw error;
    console.error(
      "[billing] checkActiveSubscription failed, rendering plans without a current subscription:",
      error,
    );
    return { hasActivePayment: false, appSubscriptions: [] };
  });

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
  const { billing, session } = await authenticateAdmin(request);
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
  // is safe: the guard above already confirmed `plan` is one of the
  // known plan names.
  //
  // returnUrl MUST be an admin.shopify.com URL, not our own host.
  // Shopify's "Approve subscription" page is TOP-LEVEL (not framed);
  // after approval it redirects the top-level window to returnUrl.
  // Our first fix pointed it at `${SHOPIFY_APP_URL}/app/billing`, which
  // loads the Railway host outside the admin with no host/embedded
  // params — authenticate.admin cannot bounce that back into the admin,
  // and the merchant dead-ends on the public "Open Stockly from your
  // Shopify admin" page. A Shopify reviewer screencasted exactly that
  // (App Store 1.2.2, 2026-08-20). The admin URL below is the pattern
  // from the official billing docs and matches the SDK's own default
  // (`session.shop` minus ".myshopify.com", plus the app's client id);
  // it lands the merchant back inside the embedded app on the billing
  // page, where the new subscription renders as "Current plan".
  const storeHandle = session.shop.replace(".myshopify.com", "");
  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  return billing.request({
    plan: plan as BillingPlanName,
    isTest: isTestBillingEnvironment(session.shop),
    returnUrl: `https://admin.shopify.com/store/${storeHandle}/apps/${apiKey}/app/billing`,
  });
};

const PLAN_BLURBS: Record<BillingPlanName, string[]> = {
  [STARTER_PLAN]: [
    "Volume tiers (multiplicative pricing)",
    "Wholesale registration form + approval queue",
    "Quick Order Form storefront block",
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
