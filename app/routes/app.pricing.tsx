/**
 * Admin route: Pricing hub — single entry point for everything that
 * influences what a wholesale customer pays at checkout.
 *
 * URL: /app/pricing
 *
 * Inspired by BSS B2B Solution's "Precios B2B" card grid (validated
 * with Jonatan 2026-05-27 in docs/competitive/ui-ux-analysis.md), but
 * executed with three deliberate improvements:
 *
 *   1. ONE primary action per card (BSS has 3 redundant sub-links).
 *   2. Each card shows the CURRENT VALUE as a Badge so the merchant
 *      can scan the whole pricing setup at a glance — no clicks
 *      needed for status. BSS shows nothing until you click in.
 *   3. No plan-tier badges. Stockly's tiers are coarse and visible
 *      on a dedicated billing page; we don't repeat the upsell on
 *      every feature card.
 *
 * The page is read-only — every action links to the existing
 * dedicated route (`/app/tiers`, `/app/settings/pricing`, etc.).
 * The hub is glue, not duplication.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  Banner,
  InlineGrid,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticateAdmin } from "../lib/auth.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await authenticateAdmin(request);

  // We need the Shop row for baseline/FPQ/MOQ/minOrderValue + a count
  // of active tiers. Pulled in one round-trip via Promise.all.
  const [shopRow, activeTierCount, anyTierCount] = await Promise.all([
    prisma.shop.findUnique({ where: { id: shop.id } }),
    prisma.tier.count({ where: { shopId: shop.id, active: true } }),
    prisma.tier.count({ where: { shopId: shop.id } }),
  ]);

  if (!shopRow) {
    throw new Response("Shop not found", { status: 404 });
  }

  return json({
    shop: {
      wholesaleBaselinePct: shopRow.wholesaleBaselinePct,
      wholesaleTag: shopRow.wholesaleTag,
      minOrderValue: shopRow.minOrderValue,
      fpqMode: shopRow.fpqMode,
      fpqAmount: shopRow.fpqAmount,
      fpqQuantity: shopRow.fpqQuantity,
      fpqCombinedLogic: shopRow.fpqCombinedLogic,
      postQualificationMOQ: shopRow.postQualificationMOQ,
    },
    tiers: { active: activeTierCount, total: anyTierCount },
  });
};

/* -------------------------------------------------------------------------- */
/*                                    UI                                      */
/* -------------------------------------------------------------------------- */

export default function PricingHub() {
  const { shop, tiers } = useLoaderData<typeof loader>();

  // ----- Derive each card's "current value" Badge string -----

  const baselineBadge =
    shop.wholesaleBaselinePct > 0
      ? { tone: "success" as const, label: `${shop.wholesaleBaselinePct}% off retail` }
      : { tone: undefined, label: "No baseline" };

  const tiersBadge =
    tiers.active > 0
      ? {
          tone: "success" as const,
          label: `${tiers.active} active ${tiers.active === 1 ? "tier" : "tiers"}`,
        }
      : tiers.total > 0
        ? { tone: "attention" as const, label: `${tiers.total} inactive` }
        : { tone: undefined, label: "No tiers yet" };

  const fpqBadge = (() => {
    if (shop.fpqMode === "none")
      return { tone: undefined, label: "Disabled" };
    if (shop.fpqMode === "amount")
      return {
        tone: "info" as const,
        label: `First order ≥ €${shop.fpqAmount ?? "?"}`,
      };
    if (shop.fpqMode === "quantity")
      return {
        tone: "info" as const,
        label: `First order ≥ ${shop.fpqQuantity ?? "?"} units`,
      };
    return {
      tone: "info" as const,
      label: `€${shop.fpqAmount ?? "?"} ${shop.fpqCombinedLogic.toUpperCase()} ${shop.fpqQuantity ?? "?"} units`,
    };
  })();

  const moqBadge =
    shop.postQualificationMOQ > 1
      ? {
          tone: "info" as const,
          label: `${shop.postQualificationMOQ} units / order`,
        }
      : { tone: undefined, label: "No minimum" };

  const orderMinBadge =
    shop.minOrderValue && shop.minOrderValue > 0
      ? { tone: "info" as const, label: `€${shop.minOrderValue} minimum` }
      : { tone: undefined, label: "No minimum" };

  return (
    <Page>
      <TitleBar title="Pricing" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Banner tone="info" title="How Stockly applies these">
              <p>
                All pricing rules below compose multiplicatively via the
                Shopify Discount Function at checkout. <strong>What you see
                here is exactly what your customers pay.</strong> Storefront
                blocks (Product Panel, Quick Order Form, Cart drawer) show
                the same numbers — no checkout surprises.
              </p>
            </Banner>

            <InlineGrid columns={{ xs: 1, sm: 1, md: 2 }} gap="400">
              <PricingCard
                title="Wholesale baseline"
                description={`Universal discount applied to every customer with the "${shop.wholesaleTag}" tag.`}
                badge={baselineBadge}
                primaryAction={{
                  content: "Edit baseline",
                  url: "/app/settings/pricing",
                }}
              />

              <PricingCard
                title="Volume tiers"
                description="Quantity-based discounts that stack on top of the baseline. Scoped per-product, per-variant, per-collection, or shop-wide."
                badge={tiersBadge}
                primaryAction={{
                  content: tiers.total === 0 ? "Create your first tier" : "Manage tiers",
                  url: "/app/tiers",
                }}
              />

              <PricingCard
                title="First-Purchase Qualifier (FPQ)"
                description="Self-qualification gate: a customer's first order must clear this threshold before wholesale prices unlock on subsequent visits."
                badge={fpqBadge}
                primaryAction={{
                  content: "Configure FPQ",
                  url: "/app/settings/pricing",
                }}
              />

              <PricingCard
                title="Post-qualification MOQ"
                description="Minimum order quantity applied AFTER the customer is qualified. Use 1 to allow any order size."
                badge={moqBadge}
                primaryAction={{
                  content: "Edit minimum",
                  url: "/app/settings/pricing",
                }}
              />

              <PricingCard
                title="Order minimums"
                description="Optional cart-level minimum subtotal in shop currency. Independent from FPQ."
                badge={orderMinBadge}
                primaryAction={{
                  content: "Set minimum",
                  url: "/app/settings/pricing",
                }}
              />

              <PricingCard
                title="Per-customer overrides"
                description="Override pricing for specific customers (different baseline % or per-product price). Useful for negotiated deals."
                badge={{ tone: undefined, label: "Coming soon" }}
                primaryAction={{
                  content: "Notify me when available",
                  url: "https://forms.gle/stockly-customer-overrides",
                  external: true,
                  disabled: true,
                }}
                tone="muted"
              />
            </InlineGrid>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

/* -------------------------------------------------------------------------- */
/*                              PricingCard                                   */
/* -------------------------------------------------------------------------- */

interface PricingCardProps {
  title: string;
  description: string;
  badge: { tone: "success" | "info" | "attention" | undefined; label: string };
  primaryAction: {
    content: string;
    url: string;
    external?: boolean;
    disabled?: boolean;
  };
  tone?: "muted";
}

function PricingCard({
  title,
  description,
  badge,
  primaryAction,
  tone,
}: PricingCardProps) {
  return (
    <Card padding="400" tone={tone === "muted" ? "subdued" : undefined}>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="start" wrap={false}>
          <Text variant="headingMd" as="h3">
            {title}
          </Text>
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </InlineStack>

        <Text variant="bodyMd" as="p" tone="subdued">
          {description}
        </Text>

        <Box paddingBlockStart="100">
          <Button
            url={primaryAction.url}
            external={primaryAction.external}
            disabled={primaryAction.disabled}
            variant="primary"
          >
            {primaryAction.content}
          </Button>
        </Box>
      </BlockStack>
    </Card>
  );
}
