/**
 * Admin home — Stockly dashboard.
 *
 * URL: /app
 *
 * Two responsibilities:
 *   1. Gate to onboarding: if `Shop.onboarded === false`, redirect to
 *      `/app/onboarding`. This is the wizard's entry point on first
 *      install (Sprint 4 P0 #5 — ADR-008).
 *   2. Surface live counts (active tiers, pending applications,
 *      qualified customers) plus a "what's next" card pointing the
 *      merchant at the gap they should close first.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Box,
  Button,
  Badge,
  List,
  ProgressBar,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticateAdmin } from "../lib/auth.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await authenticateAdmin(request);

  // First-install gate — send the merchant through the wizard before
  // they ever see the dashboard.
  //
  // CRITICAL: preserve query params (shop, host, embedded, id_token) when
  // redirecting between admin routes. Without them, the destination
  // loader's authenticate.admin() can't find Shopify context and falls
  // back to /auth/login, which renders the boilerplate "Log in" form
  // instead of our app. Lost an entire afternoon to this in production.
  if (!shop.onboarded) {
    const url = new URL(request.url);
    const search = url.searchParams.toString();
    throw redirect(`/app/onboarding${search ? "?" + search : ""}`);
  }

  const [activeTiers, pendingApps, qualifiedCustomers, activeForms] =
    await Promise.all([
      prisma.tier.count({ where: { shopId: shop.id, active: true } }),
      prisma.wholesaleApplication.count({
        where: { shopId: shop.id, status: "pending" },
      }),
      prisma.wholesaleCustomer.count({
        where: { shopId: shop.id, qualifiedAt: { not: null } },
      }),
      prisma.registrationForm.count({
        where: { shopId: shop.id, status: "active" },
      }),
    ]);

  return {
    shop,
    counts: { activeTiers, pendingApps, qualifiedCustomers },
    // Setup-guide step completion. pricing + form are detectable from the
    // DB; the theme steps (embed, QOF block) need read_themes to detect —
    // shown as CTAs for now (auto-detection is a follow-up).
    setup: {
      pricingDone: shop.wholesaleBaselinePct > 0 || activeTiers > 0,
      formDone: activeForms > 0,
    },
  };
};

export default function Dashboard() {
  const { shop, counts, setup } = useLoaderData<typeof loader>();

  const tips = buildTips(shop, counts);

  return (
    <Page
      title="Dashboard"
      subtitle={shop.id}
      primaryAction={{
        content: "Re-run setup",
        url: "/app/onboarding?force=1",
      }}
    >
      <TitleBar title="Stockly" />
      <BlockStack gap="400">
        <Layout>
          <Layout.Section>
            <SetupGuide pricingDone={setup.pricingDone} formDone={setup.formDone} />
          </Layout.Section>
          <Layout.Section>
            <InlineStack gap="400" wrap>
              <StatCard
                title="Active pricing rules"
                value={counts.activeTiers}
                href="/app/pricing"
                cta={
                  counts.activeTiers === 0
                    ? "Create your first wholesale pricing"
                    : "Manage Wholesale Pricing"
                }
              />
              <NavCard
                title="Volume Pricing"
                body="Quantity-break discounts for your customers."
                href="/app/volume-pricing"
                cta="Manage Volume Pricing"
              />
              <StatCard
                title="Pending applications"
                value={counts.pendingApps}
                href="/app/customers/applications"
                cta={counts.pendingApps === 0 ? "Open queue" : "Review now"}
                attention={counts.pendingApps > 0}
              />
              <StatCard
                title="Qualified customers"
                value={counts.qualifiedCustomers}
                href="/app/qualify-customer"
                cta="View"
              />
            </InlineStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Suggested next steps
                </Text>
                {tips.length === 0 ? (
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Your setup looks complete. Keep an eye on incoming
                    applications and qualifying orders.
                  </Text>
                ) : (
                  <List>
                    {tips.map((tip) => (
                      <List.Item key={tip.id}>
                        <InlineStack gap="200" align="start" blockAlign="center">
                          {tip.tone && <Badge tone={tip.tone}>{tip.badge ?? "Tip"}</Badge>}
                          <Text as="span" variant="bodyMd">
                            {tip.body}{" "}
                            {tip.cta && (
                              <Link to={tip.cta.url}>{tip.cta.label}</Link>
                            )}
                          </Text>
                        </InlineStack>
                      </List.Item>
                    ))}
                  </List>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

/* -------------------------------------------------------------------------- */
/*                                helpers                                      */
/* -------------------------------------------------------------------------- */

function StatCard({
  title,
  value,
  href,
  cta,
  attention,
}: {
  title: string;
  value: number;
  href: string;
  cta: string;
  attention?: boolean;
}) {
  return (
    <Box minWidth="220px">
      <Card>
        <BlockStack gap="200">
          <Text as="h3" variant="headingSm" tone="subdued">
            {title}
          </Text>
          <InlineStack align="space-between" blockAlign="center">
            <Text as="span" variant="heading2xl" fontWeight="bold">
              {value}
            </Text>
            {attention && <Badge tone="attention">Action</Badge>}
          </InlineStack>
          <Button url={href} variant="plain">
            {cta}
          </Button>
        </BlockStack>
      </Card>
    </Box>
  );
}

function NavCard({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <Box minWidth="220px">
      <Card>
        <BlockStack gap="200">
          <Text as="h3" variant="headingSm" tone="subdued">
            {title}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            {body}
          </Text>
          <Button url={href} variant="plain">
            {cta}
          </Button>
        </BlockStack>
      </Card>
    </Box>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Setup Guide                                  */
/* -------------------------------------------------------------------------- */

interface SetupStepData {
  key: string;
  title: string;
  body: string;
  /** true = done, false = to do, null = theme step (not auto-detectable). */
  done: boolean | null;
  cta: { label: string; url: string };
}

function SetupGuide({
  pricingDone,
  formDone,
}: {
  pricingDone: boolean;
  formDone: boolean;
}) {
  const steps: SetupStepData[] = [
    {
      key: "embed",
      title: "Activate Stockly in your store",
      body: "Enable the app embed in your theme so wholesale content shows on your storefront.",
      done: null,
      cta: {
        label: "Open theme editor",
        url: "shopify://admin/themes/current/editor?context=apps",
      },
    },
    {
      key: "pricing",
      title: "Set your wholesale pricing",
      body: "Define your baseline discount and pricing rules.",
      done: pricingDone,
      cta: { label: "Go to Pricing", url: "/app/pricing" },
    },
    {
      key: "form",
      title: "Create your registration form",
      body: "Let customers apply for wholesale access.",
      done: formDone,
      cta: { label: "Create form", url: "/app/registration-form" },
    },
    {
      key: "qof",
      title: "Add the Quick Order Form",
      body: "The fast bulk-order table for your wholesale buyers.",
      done: null,
      cta: {
        label: "Add to store",
        url: "shopify://admin/themes/current/editor",
      },
    },
  ];

  const detectable = steps.filter((s) => s.done !== null);
  const completed = detectable.filter((s) => s.done).length;
  const progress = detectable.length
    ? (completed / detectable.length) * 100
    : 0;

  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            Setup guide
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Follow these steps to start selling wholesale.
          </Text>
          <ProgressBar progress={progress} size="small" />
          <Text as="span" variant="bodySm" tone="subdued">
            {completed} of {detectable.length} in-app steps done · the theme
            steps are activated from your theme editor.
          </Text>
        </BlockStack>
        <Divider />
        <BlockStack gap="300">
          {steps.map((s, i) => (
            <SetupStep key={s.key} step={s} last={i === steps.length - 1} />
          ))}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

function SetupStep({ step, last }: { step: SetupStepData; last: boolean }) {
  return (
    <BlockStack gap="300">
      <InlineStack
        align="space-between"
        blockAlign="center"
        gap="300"
        wrap={false}
      >
        <InlineStack gap="300" blockAlign="center">
          {step.done === true ? (
            <Badge tone="success">Done</Badge>
          ) : step.done === false ? (
            <Badge tone="attention">To do</Badge>
          ) : (
            <Badge>In your theme</Badge>
          )}
          <BlockStack gap="050">
            <Text as="span" variant="bodyMd" fontWeight="semibold">
              {step.title}
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              {step.body}
            </Text>
          </BlockStack>
        </InlineStack>
        {step.done !== true && (
          <Button url={step.cta.url} variant="primary">
            {step.cta.label}
          </Button>
        )}
      </InlineStack>
      {!last && <Divider />}
    </BlockStack>
  );
}

interface Tip {
  id: string;
  body: string;
  tone?: "info" | "attention" | "success" | "warning";
  badge?: string;
  cta?: { label: string; url: string };
}

function buildTips(
  shop: { wholesaleBaselinePct: number },
  counts: { activeTiers: number; pendingApps: number; qualifiedCustomers: number },
): Tip[] {
  const tips: Tip[] = [];
  if (counts.pendingApps > 0) {
    tips.push({
      id: "pending",
      tone: "attention",
      badge: "Action",
      body: `${counts.pendingApps} wholesale application${counts.pendingApps === 1 ? "" : "s"} pending review.`,
      cta: { label: "Open queue", url: "/app/customers/applications" },
    });
  }
  if (counts.activeTiers === 0) {
    tips.push({
      id: "no-tiers",
      tone: "info",
      badge: "Tip",
      body:
        "You don't have any wholesale pricing rules yet. Add at least one to start offering volume discounts.",
      cta: {
        label: "Create wholesale pricing",
        url: "/app/pricing/new",
      },
    });
  }
  if (shop.wholesaleBaselinePct === 0) {
    tips.push({
      id: "no-baseline",
      tone: "info",
      badge: "Tip",
      body:
        "Your wholesale baseline is 0% — approved B2B customers will see retail prices unless a tier matches.",
      cta: { label: "Set baseline", url: "/app/settings/pricing" },
    });
  }
  return tips;
}
