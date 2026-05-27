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
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect, useState } from "react";
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
  Modal,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticateAdmin } from "../lib/auth.server";
import prisma from "../db.server";
import { syncTiersToFunction } from "../services/discount-function-sync.server";

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
/*                                  ACTION                                    */
/* -------------------------------------------------------------------------- */

/**
 * Inline-edit handler for the 3 single-field cards: baseline, MOQ,
 * order minimum. Keeps the merchant on /app/pricing — modal opens,
 * one input, save, modal closes, badge updates via loader
 * revalidation. No navigation.
 *
 * FPQ and Volume tiers stay on their dedicated pages — they're
 * multi-field / list views that don't fit a 1-field modal.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, shop } = await authenticateAdmin(request);
  const form = await request.formData();
  const intent = (form.get("intent") ?? "").toString();
  const valueRaw = (form.get("value") ?? "").toString();

  if (intent === "set-baseline") {
    const pct = Number(valueRaw);
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
      return json({
        ok: false,
        error: "Baseline must be an integer between 0 and 100.",
      } as const);
    }
    await prisma.shop.update({
      where: { id: shop.id },
      data: { wholesaleBaselinePct: pct },
    });
    // Resync the Discount Function so checkout reflects the new
    // baseline immediately. Without this, the merchant sees the
    // new value in the hub but customers keep paying the old price.
    try {
      await syncTiersToFunction(admin, shop.id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[pricing-hub] syncTiersToFunction failed:", err);
    }
    return json({ ok: true, intent } as const);
  }

  if (intent === "set-moq") {
    const moq = Number(valueRaw);
    if (!Number.isInteger(moq) || moq < 1) {
      return json({
        ok: false,
        error: "MOQ must be a positive integer (1 = no minimum).",
      } as const);
    }
    await prisma.shop.update({
      where: { id: shop.id },
      data: { postQualificationMOQ: moq },
    });
    try {
      await syncTiersToFunction(admin, shop.id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[pricing-hub] syncTiersToFunction failed:", err);
    }
    return json({ ok: true, intent } as const);
  }

  if (intent === "set-order-min") {
    // Empty string → clear the minimum (null).
    const value =
      valueRaw.trim() === "" ? null : Number(valueRaw);
    if (value !== null && (Number.isNaN(value) || value < 0)) {
      return json({
        ok: false,
        error: "Order minimum must be a non-negative number, or empty to clear.",
      } as const);
    }
    await prisma.shop.update({
      where: { id: shop.id },
      data: { minOrderValue: value },
    });
    return json({ ok: true, intent } as const);
  }

  return json({ ok: false, error: `Unknown intent: ${intent}` } as const);
};

/* -------------------------------------------------------------------------- */
/*                                    UI                                      */
/* -------------------------------------------------------------------------- */

/**
 * The 3 fields that support inline edit via modal (single TextField).
 * FPQ and Volume tiers don't — they have their own dedicated pages
 * because they're multi-field / list views.
 */
type EditField = "baseline" | "moq" | "order-min";

interface EditConfig {
  title: string;
  label: string;
  helpText: string;
  intent: "set-baseline" | "set-moq" | "set-order-min";
  type?: "number";
  suffix?: string;
}

const EDIT_CONFIG: Record<EditField, EditConfig> = {
  baseline: {
    title: "Edit wholesale baseline",
    label: "Discount percent off retail (0–100)",
    helpText:
      "0 = no baseline. 55 = wholesale customers see 55% off retail. Volume tiers stack on top multiplicatively.",
    intent: "set-baseline",
    type: "number",
    suffix: "%",
  },
  moq: {
    title: "Edit post-qualification MOQ",
    label: "Minimum units per order after qualifying",
    helpText:
      "Applied AFTER the FPQ gate is cleared. Use 1 to let qualified customers buy any quantity.",
    intent: "set-moq",
    type: "number",
  },
  "order-min": {
    title: "Set cart order minimum",
    label: "Minimum cart subtotal (in shop currency)",
    helpText:
      "Optional. Leave empty to disable. Applied at cart-level, independent from FPQ.",
    intent: "set-order-min",
    type: "number",
    suffix: "€",
  },
};

export default function PricingHub() {
  const { shop, tiers } = useLoaderData<typeof loader>();

  // ----- Inline edit modal state -----
  const [editing, setEditing] = useState<EditField | null>(null);
  const [draftValue, setDraftValue] = useState<string>("");
  const fetcher = useFetcher<typeof action>();
  const isSubmitting = fetcher.state !== "idle";

  // Close modal + clear draft when save succeeds. Loader revalidation
  // (automatic on fetcher submit) refreshes the badges with new values.
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.ok) {
      setEditing(null);
      setDraftValue("");
    }
  }, [fetcher.state, fetcher.data]);

  const openEdit = (field: EditField, currentValue: string) => {
    setEditing(field);
    setDraftValue(currentValue);
    // Discard any previous error from the fetcher so the modal opens clean.
  };

  const submitEdit = () => {
    if (!editing) return;
    const cfg = EDIT_CONFIG[editing];
    const fd = new FormData();
    fd.append("intent", cfg.intent);
    fd.append("value", draftValue);
    fetcher.submit(fd, { method: "POST" });
  };

  const fetcherError =
    fetcher.data && !fetcher.data.ok
      ? (fetcher.data as { error: string }).error
      : null;

  // ----- Derive each card's "current value" Badge string -----

  const baselineBadge =
    shop.wholesaleBaselinePct > 0
      ? { tone: "success" as const, label: `${shop.wholesaleBaselinePct}% off retail` }
      : { tone: undefined, label: "No baseline" };

  const tiersBadge =
    tiers.active > 0
      ? {
          tone: "success" as const,
          label: `${tiers.active} active ${tiers.active === 1 ? "rule" : "rules"}`,
        }
      : tiers.total > 0
        ? { tone: "attention" as const, label: `${tiers.total} inactive` }
        : { tone: undefined, label: "None yet" };

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
                  onAction: () =>
                    openEdit("baseline", String(shop.wholesaleBaselinePct)),
                }}
              />

              <PricingCard
                title="Wholesale pricing"
                description="Quantity-based pricing rules that stack on top of the baseline. Scoped per-product, per-variant, per-collection, or shop-wide."
                badge={tiersBadge}
                primaryAction={{
                  content:
                    tiers.total === 0
                      ? "Create your first wholesale pricing"
                      : "Manage wholesale pricing",
                  // When no rules exist yet, drop the merchant straight
                  // into /app/pricing/new (no point seeing an empty
                  // list). Once at least one exists, take them to the
                  // Sami-style list at /app/pricing/list. Legacy
                  // /app/tiers route still works for bookmarks.
                  url: tiers.total === 0 ? "/app/pricing/new" : "/app/pricing/list",
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
                  onAction: () =>
                    openEdit("moq", String(shop.postQualificationMOQ)),
                }}
              />

              <PricingCard
                title="Order minimums"
                description="Optional cart-level minimum subtotal in shop currency. Independent from FPQ."
                badge={orderMinBadge}
                primaryAction={{
                  content: "Set minimum",
                  onAction: () =>
                    openEdit("order-min", shop.minOrderValue ? String(shop.minOrderValue) : ""),
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

      {/*
        Inline-edit modal. Always mounted (open={editing !== null})
        to avoid the React-batch / portal mount race we hit on the
        applications modal (see commit 029aa5d). The single TextField
        is populated with the current value when the modal opens and
        submits via fetcher — loader revalidates on success and the
        badges update without a navigation.
       */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? EDIT_CONFIG[editing].title : "Edit"}
        primaryAction={{
          content: "Save",
          loading: isSubmitting,
          onAction: submitEdit,
          disabled: editing === null,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setEditing(null),
            disabled: isSubmitting,
          },
        ]}
      >
        {editing && (
          <Modal.Section>
            <BlockStack gap="300">
              {fetcherError && (
                <Banner tone="critical">
                  <p>{fetcherError}</p>
                </Banner>
              )}
              <TextField
                label={EDIT_CONFIG[editing].label}
                value={draftValue}
                onChange={setDraftValue}
                autoComplete="off"
                type={EDIT_CONFIG[editing].type}
                suffix={EDIT_CONFIG[editing].suffix}
                helpText={EDIT_CONFIG[editing].helpText}
                autoFocus
                disabled={isSubmitting}
              />
            </BlockStack>
          </Modal.Section>
        )}
      </Modal>
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
  /**
   * primaryAction accepts EITHER `url` (navigation) OR `onAction`
   * (in-place modal). The 3 simple-field cards use onAction to keep
   * the merchant on /app/pricing. Tiers + FPQ use url because they
   * need their own rich page.
   */
  primaryAction:
    | {
        content: string;
        url: string;
        external?: boolean;
        disabled?: boolean;
      }
    | {
        content: string;
        onAction: () => void;
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
  const isNavigation = "url" in primaryAction;
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
          {isNavigation ? (
            <Button
              url={primaryAction.url}
              external={primaryAction.external}
              disabled={primaryAction.disabled}
              variant="primary"
            >
              {primaryAction.content}
            </Button>
          ) : (
            <Button
              onClick={primaryAction.onAction}
              disabled={primaryAction.disabled}
              variant="primary"
            >
              {primaryAction.content}
            </Button>
          )}
        </Box>
      </BlockStack>
    </Card>
  );
}
