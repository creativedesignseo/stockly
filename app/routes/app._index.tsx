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

  const [activeTiers, pendingApps, qualifiedCustomers] = await Promise.all([
    prisma.tier.count({ where: { shopId: shop.id, active: true } }),
    prisma.wholesaleApplication.count({
      where: { shopId: shop.id, status: "pending" },
    }),
    prisma.wholesaleCustomer.count({
      where: { shopId: shop.id, qualifiedAt: { not: null } },
    }),
  ]);

  return {
    shop,
    counts: { activeTiers, pendingApps, qualifiedCustomers },
  };
};

export default function Dashboard() {
  const { shop, counts } = useLoaderData<typeof loader>();

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
            <InlineStack gap="400" wrap>
              <StatCard
                title="Active tiers"
                value={counts.activeTiers}
                href="/app/tiers"
                cta={counts.activeTiers === 0 ? "Create your first tier" : "Manage"}
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

          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Current pricing setup
                </Text>
                <Box
                  padding="300"
                  background="bg-surface-secondary"
                  borderRadius="200"
                >
                  <BlockStack gap="100">
                    <SettingRow
                      label="Wholesale baseline"
                      value={`${shop.wholesaleBaselinePct}% off retail`}
                    />
                    <SettingRow
                      label="First-Purchase Qualifier"
                      value={describeFpq(shop)}
                    />
                    <SettingRow
                      label="Post-qualification MOQ"
                      value={
                        (shop.postQualificationMOQ ?? 1) <= 1
                          ? "None — customers buy freely after qualifying"
                          : `${shop.postQualificationMOQ} units/order`
                      }
                    />
                  </BlockStack>
                </Box>
                <InlineStack align="end">
                  <Button url="/app/settings/pricing">Edit pricing settings</Button>
                </InlineStack>
              </BlockStack>
            </Card>
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

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <InlineStack align="space-between" gap="200">
      <Text as="span" variant="bodySm" tone="subdued">
        {label}
      </Text>
      <Text as="span" variant="bodySm" fontWeight="medium">
        {value}
      </Text>
    </InlineStack>
  );
}

/** Plain-English summary of the shop's FPQ config for the dashboard card. */
function describeFpq(shop: {
  fpqMode: string;
  fpqAmount: number | null;
  fpqQuantity: number | null;
  fpqCombinedLogic: string;
}): string {
  switch (shop.fpqMode) {
    case "none":
      return "Off — every wholesale order gets pricing immediately";
    case "amount":
      return `First order ≥ ${shop.fpqAmount ?? "?"}`;
    case "quantity":
      return `First order ≥ ${shop.fpqQuantity ?? "?"} units`;
    case "combined":
      return `First order ≥ ${shop.fpqAmount ?? "?"} ${shop.fpqCombinedLogic.toUpperCase()} ≥ ${shop.fpqQuantity ?? "?"} units`;
    default:
      return shop.fpqMode;
  }
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
        "You don't have any tiers yet. Add at least one to start offering volume discounts.",
      cta: { label: "Create tier", url: "/app/tiers/new" },
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
