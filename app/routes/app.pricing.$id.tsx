/**
 * Admin route: edit (or delete) an existing wholesale pricing rule.
 *
 * URL: /app/pricing/:id
 *
 * Same Sami-style layout as /app/pricing/new (validated with Jonatan
 * 2026-05-27 — he asked why the edit form was still the legacy ugly
 * page: "qué pasó con lo bonito que habíamos hecho"). Direct port
 * with these add-ons:
 *
 *   - Loader fetches the tier by id (with shop-id ownership check)
 *     and pre-populates state.
 *   - "Pricing rule information" card gets an Active/Inactive toggle
 *     in the top-right. Lets the merchant disable the rule without
 *     deleting (preserves history).
 *   - Action handles two intents:
 *       intent=update  → validate + updateTier (same logic as create)
 *       intent=delete  → deleteTier (hard delete)
 *   - Danger zone Card at the bottom with a destructive "Delete this
 *     wholesale pricing" button (uses fetcher.submit so the page
 *     redirects on success and shows a loading state on the button).
 *   - Both Save and Delete redirect to /app/pricing (the list) so the
 *     merchant sees the updated/missing row immediately.
 *
 * The legacy /app/tiers/:id route is left in place for any external
 * links/bookmarks but the list now points here.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Form,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import {
  Page,
  Layout,
  Card,
  TextField,
  Button,
  Banner,
  BlockStack,
  InlineStack,
  Text,
  RadioButton,
  Divider,
  Box,
  InlineGrid,
} from "@shopify/polaris";
import { SaveBar, TitleBar, useAppBridge } from "@shopify/app-bridge-react";

import { authenticateAdmin } from "../lib/auth.server";
import prisma from "../db.server";
import { syncTiersToFunction } from "../services/discount-function-sync.server";
import {
  deleteTier,
  getTier,
  updateTier,
  type TierAggregation,
  type TierDiscountType,
  type TierScope,
} from "../services/tiers.server";

/* -------------------------------------------------------------------------- */
/*                                  LOADER                                    */
/* -------------------------------------------------------------------------- */

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { shop } = await authenticateAdmin(request);
  const id = params.id;
  if (!id) throw new Response("Rule id is required", { status: 400 });

  const [tier, shopRow] = await Promise.all([
    getTier(id, shop.id),
    prisma.shop.findUnique({
      where: { id: shop.id },
      select: { wholesaleBaselinePct: true },
    }),
  ]);
  if (!tier)
    throw new Response("Wholesale pricing not found", { status: 404 });

  return json({
    tier,
    baselinePct: shopRow?.wholesaleBaselinePct ?? 0,
  });
};

/* -------------------------------------------------------------------------- */
/*                                  ACTION                                    */
/* -------------------------------------------------------------------------- */

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const { admin, shop } = await authenticateAdmin(request);
  const id = params.id;
  if (!id) throw new Response("Rule id is required", { status: 400 });

  // Re-verify ownership: action runs independently of the loader and
  // can be hit directly via fetch.
  const existing = await getTier(id, shop.id);
  if (!existing)
    throw new Response("Wholesale pricing not found", { status: 404 });

  const form = await request.formData();
  const intent = (form.get("intent") ?? "").toString();

  if (intent === "delete") {
    await deleteTier(id);
    try {
      await syncTiersToFunction(admin, shop.id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[pricing.$id] syncTiersToFunction failed:", err);
    }
    return redirect("/app/pricing");
  }

  if (intent !== "update") {
    throw new Response(`Unknown form intent: ${intent}`, { status: 400 });
  }

  const name = (form.get("name") ?? "").toString().trim();
  const scope = (form.get("scope") ?? "all").toString() as TierScope;
  const scopeId = (form.get("scopeId") ?? "").toString().trim() || null;
  const minQtyStr = (form.get("minQty") ?? "").toString();
  const discountType = (form.get("discountType") ?? "percentage")
    .toString() as TierDiscountType;
  const discountPctStr = (form.get("discountPct") ?? "").toString();
  const discountAmountStr = (form.get("discountAmount") ?? "").toString();
  const aggregation = (form.get("aggregation") ?? "per_line")
    .toString() as TierAggregation;
  const active = form.get("active") === "on";

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Name is required";
  if (!["product", "variant", "collection", "all"].includes(scope))
    errors.scope = "Invalid scope";
  if (scope !== "all" && !scopeId)
    errors.scopeId = "Pick a target with the Browse button (or paste a GID)";
  if (!["per_line", "cart_total"].includes(aggregation))
    errors.aggregation = "Invalid aggregation mode";
  if (scope === "variant" && aggregation === "cart_total") {
    errors.aggregation =
      "Variant-scoped pricing rules must use per-line aggregation.";
  }

  const minQty = Number(minQtyStr);
  if (!Number.isInteger(minQty) || minQty < 1)
    errors.minQty = "Minimum quantity must be a positive integer";

  if (!["percentage", "fixed_amount"].includes(discountType))
    errors.discountType = "Invalid discount type";

  let discountPct = 0;
  let discountAmount: number | null = null;
  if (discountType === "percentage") {
    discountPct = Number(discountPctStr);
    if (Number.isNaN(discountPct) || discountPct < 0 || discountPct > 100)
      errors.discountPct = "Discount must be between 0 and 100";
  } else {
    discountAmount = Number(discountAmountStr);
    if (Number.isNaN(discountAmount) || discountAmount <= 0)
      errors.discountAmount =
        "Amount must be a positive number (in shop currency)";
  }

  if (Object.keys(errors).length > 0) {
    return json({
      errors,
      values: {
        name,
        scope,
        scopeId,
        minQtyStr,
        discountType,
        discountPctStr,
        discountAmountStr,
        aggregation,
        active,
      },
    });
  }

  await updateTier(id, {
    name,
    scope,
    scopeId: scope === "all" ? null : scopeId,
    minQty,
    discountPct,
    discountType,
    discountAmount,
    aggregation,
    active,
  });

  try {
    await syncTiersToFunction(admin, shop.id);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[pricing.$id] syncTiersToFunction failed:", err);
  }

  return redirect("/app/pricing");
};

/* -------------------------------------------------------------------------- */
/*                                    UI                                      */
/* -------------------------------------------------------------------------- */

const SCOPE_OPTIONS: Array<{
  value: TierScope;
  title: string;
  description: string;
}> = [
  {
    value: "all",
    title: "All products",
    description: "Rule applies shop-wide. Simplest setup.",
  },
  {
    value: "product",
    title: "A specific product",
    description: "Pick one product. All variants of it qualify.",
  },
  {
    value: "variant",
    title: "A specific variant",
    description: "Pick one variant (e.g. size XL). Most granular control.",
  },
  {
    value: "collection",
    title: "All products in a collection",
    description:
      "Storefront-only. Checkout falls back to baseline for collections.",
  },
];

const AGGREGATION_OPTIONS: Array<{
  value: TierAggregation;
  title: string;
  description: string;
}> = [
  {
    value: "per_line",
    title: "Per line",
    description:
      "Each product must hit the minimum on its own. 10 of THIS product.",
  },
  {
    value: "cart_total",
    title: "Cart total (assortment)",
    description:
      "Sum across all products in scope. Mix and match to reach the minimum.",
  },
];

export default function EditPricing() {
  const { tier, baselinePct } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "update";
  const shopify = useAppBridge();

  /* ----- form state (pre-populated from tier) ----- */
  const [name, setName] = useState<string>(
    actionData?.values?.name ?? tier.name,
  );
  const [scope, setScope] = useState<TierScope>(
    (actionData?.values?.scope as TierScope) ?? (tier.scope as TierScope),
  );
  const [scopeId, setScopeId] = useState<string>(
    actionData?.values?.scopeId ?? tier.scopeId ?? "",
  );
  const [scopeLabel, setScopeLabel] = useState<string>("");
  const [minQty, setMinQty] = useState<string>(
    actionData?.values?.minQtyStr ?? String(tier.minQty),
  );
  const [discountType, setDiscountType] = useState<TierDiscountType>(
    (actionData?.values?.discountType as TierDiscountType) ??
      ((tier.discountType as TierDiscountType | null) ?? "percentage"),
  );
  const [discountPct, setDiscountPct] = useState<string>(
    actionData?.values?.discountPctStr ?? String(tier.discountPct ?? ""),
  );
  const [discountAmount, setDiscountAmount] = useState<string>(
    actionData?.values?.discountAmountStr ??
      (tier.discountAmount != null ? String(tier.discountAmount) : ""),
  );
  const [aggregation, setAggregation] = useState<TierAggregation>(
    (actionData?.values?.aggregation as TierAggregation) ??
      (tier.aggregation as TierAggregation),
  );
  const [active, setActive] = useState<boolean>(
    actionData?.values?.active ?? tier.active,
  );

  const errors = actionData?.errors ?? {};

  /* ----- SaveBar (App Bridge, sticky top) ----- */
  const initial = {
    name: tier.name,
    scope: tier.scope as TierScope,
    scopeId: tier.scopeId ?? "",
    minQty: String(tier.minQty),
    discountType: ((tier.discountType as TierDiscountType | null) ??
      "percentage") as TierDiscountType,
    discountPct: String(tier.discountPct ?? ""),
    discountAmount:
      tier.discountAmount != null ? String(tier.discountAmount) : "",
    aggregation: tier.aggregation as TierAggregation,
    active: tier.active,
  };
  const isDirty =
    name !== initial.name ||
    scope !== initial.scope ||
    scopeId !== initial.scopeId ||
    minQty !== initial.minQty ||
    discountType !== initial.discountType ||
    discountPct !== initial.discountPct ||
    discountAmount !== initial.discountAmount ||
    aggregation !== initial.aggregation ||
    active !== initial.active;

  const SAVE_BAR_ID = "pricing-edit-save-bar";
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (isDirty) {
      shopify.saveBar.show(SAVE_BAR_ID);
    } else {
      shopify.saveBar.hide(SAVE_BAR_ID);
    }
    return () => {
      shopify.saveBar.hide(SAVE_BAR_ID);
    };
  }, [isDirty, shopify]);

  const handleDiscard = () => {
    setName(initial.name);
    setScope(initial.scope);
    setScopeId(initial.scopeId);
    setScopeLabel("");
    setMinQty(initial.minQty);
    setDiscountType(initial.discountType);
    setDiscountPct(initial.discountPct);
    setDiscountAmount(initial.discountAmount);
    setAggregation(initial.aggregation);
    setActive(initial.active);
  };

  /* ----- Resource Picker ----- */
  const openResourcePicker = async () => {
    if (scope === "all") return;
    const result = await shopify.resourcePicker({
      type: scope,
      multiple: false,
      filter: { archived: false, draft: false },
    });
    if (!result || result.length === 0) return;
    const picked = result[0] as { id: string; title?: string };
    setScopeId(picked.id);
    setScopeLabel(picked.title ?? "");
  };

  /* ----- Delete fetcher (intent=delete, separate from SaveBar) ----- */
  const deleteFetcher = useFetcher<typeof action>();
  const deleting = deleteFetcher.state !== "idle";
  const handleDelete = () => {
    if (
      !confirm(
        `Permanently delete "${tier.name}"?\n\nThis cannot be undone. To keep history, toggle the rule inactive instead.`,
      )
    )
      return;
    const fd = new FormData();
    fd.append("intent", "delete");
    deleteFetcher.submit(fd, { method: "POST" });
  };

  /* ----- preview math ----- */
  const previewRetail = 100;
  const baselineFactor = 1 - baselinePct / 100;
  const tierPct = Number(discountPct) || 0;
  const tierAmount = Number(discountAmount) || 0;
  const tierFactor = discountType === "percentage" ? 1 - tierPct / 100 : 1;
  const fixedDeduction = discountType === "fixed_amount" ? tierAmount : 0;
  const previewWholesale = Math.max(
    0,
    previewRetail * baselineFactor * tierFactor - fixedDeduction,
  );
  const previewSavings = previewRetail - previewWholesale;

  const scopeOption = SCOPE_OPTIONS.find((s) => s.value === scope)!;
  const scopeSummary =
    scope === "all"
      ? "All products in the shop"
      : scopeLabel
        ? `${scopeOption.title} — ${scopeLabel}`
        : scopeId
          ? `${scopeOption.title} (GID set)`
          : `${scopeOption.title} (not selected)`;

  const triggerSummary = minQty
    ? `${minQty} units · ${aggregation === "per_line" ? "per line" : "cart total"}`
    : "—";

  const discountSummary =
    discountType === "fixed_amount"
      ? tierAmount
        ? `€${tierAmount} off per unit`
        : "—"
      : tierPct
        ? `${tierPct}% off`
        : "—";

  return (
    <Page backAction={{ content: "Wholesale pricing", url: "/app/pricing" }}>
      <TitleBar title={`Edit: ${tier.name}`} />
      <SaveBar id={SAVE_BAR_ID}>
        <button
          variant="primary"
          onClick={() => formRef.current?.requestSubmit()}
          loading={submitting ? "" : undefined}
        >
          Save
        </button>
        <button onClick={handleDiscard}>Discard</button>
      </SaveBar>
      <Form method="post" ref={formRef}>
        <input type="hidden" name="intent" value="update" />
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="aggregation" value={aggregation} />
        <input type="hidden" name="discountType" value={discountType} />
        {active && <input type="hidden" name="active" value="on" />}

        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {Object.keys(errors).length > 0 && (
                <Banner tone="critical" title="Please fix the errors below" />
              )}

              {/* ----- Pricing rule information ----- */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack
                    align="space-between"
                    blockAlign="start"
                    wrap={false}
                  >
                    <BlockStack gap="100">
                      <Text variant="headingMd" as="h2">
                        Pricing rule information
                      </Text>
                      <Text variant="bodySm" as="p" tone="subdued">
                        Internal label for this rule + active/inactive toggle.
                        Inactive rules are kept for history but don&apos;t
                        apply at checkout.
                      </Text>
                    </BlockStack>
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Status
                      </Text>
                      <StatusToggle active={active} onChange={setActive} />
                    </InlineStack>
                  </InlineStack>

                  <TextField
                    label="Name"
                    name="name"
                    autoComplete="off"
                    value={name}
                    onChange={setName}
                    error={errors.name}
                    placeholder="e.g. Volume pricing — 10+ units"
                    requiredIndicator
                  />
                </BlockStack>
              </Card>

              {/* ----- Scope ----- */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">
                      Scope
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Which products does this rule apply to?
                    </Text>
                  </BlockStack>

                  <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                    {SCOPE_OPTIONS.map((opt) => (
                      <ChoiceCard
                        key={opt.value}
                        selected={scope === opt.value}
                        onSelect={() => setScope(opt.value)}
                        title={opt.title}
                        description={opt.description}
                      />
                    ))}
                  </InlineGrid>

                  {scope !== "all" && (
                    <TextField
                      label={
                        scope === "product"
                          ? "Product"
                          : scope === "variant"
                            ? "Variant"
                            : "Collection"
                      }
                      name="scopeId"
                      autoComplete="off"
                      value={scopeId}
                      onChange={(v) => {
                        setScopeId(v);
                        if (v !== scopeId) setScopeLabel("");
                      }}
                      error={errors.scopeId}
                      helpText={
                        scopeLabel
                          ? `Selected: ${scopeLabel}`
                          : "Click Browse to pick from Shopify, or paste a GID."
                      }
                      connectedRight={
                        <Button onClick={openResourcePicker}>Browse…</Button>
                      }
                      requiredIndicator
                    />
                  )}

                  {scope === "collection" && (
                    <Banner tone="warning">
                      <p>
                        Collection-scoped rules display on the storefront but
                        the checkout Discount Function falls back to baseline
                        for them. Use product or variant scope if you need the
                        discount enforced at checkout.
                      </p>
                    </Banner>
                  )}
                </BlockStack>
              </Card>

              {/* ----- Trigger ----- */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">
                      Trigger
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      When does this rule kick in?
                    </Text>
                  </BlockStack>

                  <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                    {AGGREGATION_OPTIONS.map((opt) => {
                      const disabled =
                        scope === "variant" && opt.value === "cart_total";
                      return (
                        <ChoiceCard
                          key={opt.value}
                          selected={aggregation === opt.value}
                          onSelect={() => {
                            if (!disabled) setAggregation(opt.value);
                          }}
                          title={opt.title}
                          description={
                            disabled
                              ? `${opt.description} — not available for variant-scoped pricing.`
                              : opt.description
                          }
                          disabled={disabled}
                        />
                      );
                    })}
                  </InlineGrid>

                  {errors.aggregation && (
                    <Banner tone="critical">
                      <p>{errors.aggregation}</p>
                    </Banner>
                  )}

                  <TextField
                    label="Minimum quantity to activate the rule"
                    name="minQty"
                    type="number"
                    min={1}
                    autoComplete="off"
                    value={minQty}
                    onChange={setMinQty}
                    error={errors.minQty}
                    suffix="units"
                    helpText={
                      aggregation === "per_line"
                        ? "Each cart line must reach this quantity on its own."
                        : "Sum of all in-scope cart lines must reach this quantity."
                    }
                    requiredIndicator
                  />
                </BlockStack>
              </Card>

              {/* ----- Discount ----- */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">
                      Discount
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Both options compose with the shop&apos;s wholesale
                      baseline — the Preview panel shows the live math.
                    </Text>
                  </BlockStack>

                  <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                    <ChoiceCard
                      selected={discountType === "percentage"}
                      onSelect={() => setDiscountType("percentage")}
                      title="Percentage discount"
                      description="Example: 10% off the line price."
                    />
                    <ChoiceCard
                      selected={discountType === "fixed_amount"}
                      onSelect={() => setDiscountType("fixed_amount")}
                      title="Fixed amount discount"
                      description="Example: €10 off each unit."
                    />
                  </InlineGrid>

                  {discountType === "percentage" ? (
                    <TextField
                      label="Discount percent"
                      name="discountPct"
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      autoComplete="off"
                      value={discountPct}
                      onChange={setDiscountPct}
                      error={errors.discountPct}
                      suffix="%"
                      helpText="Between 0 and 100. Composes multiplicatively on top of the baseline."
                      requiredIndicator
                    />
                  ) : (
                    <TextField
                      label="Amount off per unit"
                      name="discountAmount"
                      type="number"
                      min={0}
                      step={0.01}
                      autoComplete="off"
                      value={discountAmount}
                      onChange={setDiscountAmount}
                      error={errors.discountAmount}
                      prefix="€"
                      helpText="Flat amount subtracted from each unit AFTER the baseline applies."
                      placeholder="10.00"
                      requiredIndicator
                    />
                  )}
                </BlockStack>
              </Card>

              {/* ----- Danger zone ----- */}
              <Card>
                <BlockStack gap="300">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2" tone="critical">
                      Danger zone
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Deleting removes this rule permanently. To keep history
                      instead, toggle the rule inactive using the Status
                      switch at the top of the form.
                    </Text>
                  </BlockStack>
                  <InlineStack>
                    <Button
                      tone="critical"
                      variant="primary"
                      onClick={handleDelete}
                      loading={deleting}
                    >
                      Delete this wholesale pricing
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <BlockStack gap="050">
                    <Text variant="headingMd" as="h3">
                      Pricing summary
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Current setup
                    </Text>
                  </BlockStack>
                  <Divider />
                  <SummaryRow
                    label="Status"
                    value={active ? "Active" : "Inactive"}
                  />
                  <SummaryRow label="Name" value={name || "—"} />
                  <SummaryRow label="Scope" value={scopeSummary} />
                  <SummaryRow label="Trigger" value={triggerSummary} />
                  <SummaryRow label="Discount" value={discountSummary} />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <BlockStack gap="050">
                    <Text variant="headingMd" as="h3">
                      Preview
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      On a €100 retail product, what a qualifying customer
                      pays at checkout:
                    </Text>
                  </BlockStack>
                  <Divider />
                  <SummaryRow
                    label="Retail price"
                    value={`€${previewRetail.toFixed(2)}`}
                  />
                  <SummaryRow
                    label={`Baseline (${baselinePct}%)`}
                    value={`× ${baselineFactor.toFixed(2)}`}
                  />
                  {discountType === "percentage" ? (
                    <SummaryRow
                      label={`This rule (${tierPct}%)`}
                      value={`× ${tierFactor.toFixed(2)}`}
                    />
                  ) : (
                    <SummaryRow
                      label={`This rule (flat)`}
                      value={`− €${tierAmount.toFixed(2)}`}
                    />
                  )}
                  <Divider />
                  <SummaryRow
                    label="Wholesale price"
                    value={`€${previewWholesale.toFixed(2)}`}
                    emphasis
                  />
                  <SummaryRow
                    label="Customer saves"
                    value={`€${previewSavings.toFixed(2)}`}
                  />
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Form>
    </Page>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Small helpers                                 */
/* -------------------------------------------------------------------------- */

function ChoiceCard({
  selected,
  onSelect,
  title,
  description,
  disabled,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={disabled ? -1 : 0}
      onClick={() => {
        if (!disabled) onSelect();
      }}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !disabled) {
          e.preventDefault();
          onSelect();
        }
      }}
      style={{
        cursor: disabled ? "not-allowed" : "pointer",
        border: selected
          ? "2px solid var(--p-color-border-success)"
          : "1px solid var(--p-color-border)",
        borderRadius: "var(--p-border-radius-200)",
        padding: "var(--p-space-400)",
        background: selected
          ? "var(--p-color-bg-surface-success)"
          : "var(--p-color-bg-surface)",
        opacity: disabled ? 0.5 : 1,
        transition: "all 0.15s ease",
      }}
    >
      <InlineStack gap="300" align="start" blockAlign="start" wrap={false}>
        <RadioButton
          checked={selected}
          label=""
          labelHidden
          onChange={() => {
            if (!disabled) onSelect();
          }}
          disabled={disabled}
        />
        <BlockStack gap="050">
          <Text as="span" variant="bodyMd" fontWeight="semibold">
            {title}
          </Text>
          <Text as="span" variant="bodySm" tone="subdued">
            {description}
          </Text>
        </BlockStack>
      </InlineStack>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <InlineStack align="space-between" blockAlign="start" wrap={false}>
      <Text variant="bodySm" as="span" tone="subdued">
        {label}
      </Text>
      <Box maxWidth="60%">
        <Text
          variant={emphasis ? "headingSm" : "bodySm"}
          as="span"
          fontWeight={emphasis ? "semibold" : undefined}
        >
          {value}
        </Text>
      </Box>
    </InlineStack>
  );
}

/**
 * Status toggle styled as a Shopify-admin switch. Polaris doesn't
 * ship a first-class "switch" component in v12; we use a button with
 * role="switch" + aria-checked + a small rendered pill.
 */
function StatusToggle({
  active,
  onChange,
}: {
  active: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={() => onChange(!active)}
      style={{
        width: "44px",
        height: "24px",
        borderRadius: "12px",
        border: "none",
        background: active
          ? "var(--p-color-bg-fill-success)"
          : "var(--p-color-bg-fill-tertiary)",
        position: "relative",
        cursor: "pointer",
        transition: "background 0.15s ease",
        padding: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: "2px",
          left: active ? "22px" : "2px",
          width: "20px",
          height: "20px",
          background: "white",
          borderRadius: "50%",
          transition: "left 0.15s ease",
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}
