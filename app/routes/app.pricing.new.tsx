/**
 * Admin route: create a new wholesale pricing rule.
 *
 * URL: /app/pricing/new
 *
 * Renamed 2026-05-27 per Jonatan: "tier" was Stockly-internal jargon,
 * "Wholesale Pricing" matches the merchant's mental model (also
 * what Sami / BSS call this concept). The DB table is still `Tier`
 * — only the UI nomenclature changed.
 *
 * UX pattern: Sami Wholesale's "New Wholesale Pricing" form
 * (validated with Jonatan 2026-05-27).
 *
 *   - Two-column layout: form sections on left (2/3), live "Tier
 *     summary" + Preview panel on right (1/3).
 *   - Each form section is its own Polaris Card with title +
 *     subtitle, never a flat vertical stack of fields.
 *   - Scope selection uses radio CARDS (click anywhere on the card)
 *     not a Select dropdown — much more discoverable.
 *   - Right sidebar updates LIVE as the merchant types: they can
 *     verify "OK, this tier applies to All products, kicks in at
 *     10 units, gives 15% off" without scrolling.
 *   - Preview card shows the math for an example €100 retail
 *     product so the merchant sees exactly what the customer would
 *     pay before saving.
 *
 * Action validation logic preserved 1:1 from the previous version —
 * only the UI changed.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
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
  Thumbnail,
  Icon,
} from "@shopify/polaris";
import { ImageIcon, XSmallIcon } from "@shopify/polaris-icons";
import { SaveBar, TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useRef, useState } from "react";

import { authenticateAdmin } from "../lib/auth.server";
import prisma from "../db.server";
import { syncTiersToFunction } from "../services/discount-function-sync.server";
import {
  createTier,
  type TierAggregation,
  type TierCustomerEligibility,
  type TierDiscountType,
  type TierMarketEligibility,
  type TierScope,
} from "../services/tiers.server";

/* -------------------------------------------------------------------------- */
/*                                  LOADER                                    */
/* -------------------------------------------------------------------------- */

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await authenticateAdmin(request);
  // We need wholesaleBaselinePct to render the Preview card live
  // ("On a €100 retail product, with 55% baseline + this tier 10%,
  // wholesale price is …"). Falling back to 0 keeps the math correct
  // when no baseline has been set yet.
  const shopRow = await prisma.shop.findUnique({
    where: { id: shop.id },
    select: { wholesaleBaselinePct: true },
  });
  return json({
    baselinePct: shopRow?.wholesaleBaselinePct ?? 0,
  });
};

/* -------------------------------------------------------------------------- */
/*                                  ACTION                                    */
/* -------------------------------------------------------------------------- */

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, shop } = await authenticateAdmin(request);
  const form = await request.formData();

  const name = (form.get("name") ?? "").toString().trim();
  const scope = (form.get("scope") ?? "all").toString() as TierScope;
  // Multi-target: scopeIds is sent as multiple hidden inputs (one per
  // selected resource). For 'all' scope we ignore any value. For other
  // scopes we de-dupe and require at least one. The first id is also
  // mirrored into scopeId by createTier for back-compat reads.
  const scopeIds = Array.from(
    new Set(
      form
        .getAll("scopeIds")
        .map((v) => v.toString().trim())
        .filter(Boolean),
    ),
  );
  const minQtyStr = (form.get("minQty") ?? "").toString();
  const discountType = (form.get("discountType") ?? "percentage")
    .toString() as TierDiscountType;
  const discountPctStr = (form.get("discountPct") ?? "").toString();
  const discountAmountStr = (form.get("discountAmount") ?? "").toString();
  const aggregation = (form.get("aggregation") ?? "per_line").toString() as TierAggregation;
  const customerEligibility = (form.get("customerEligibility") ?? "wholesale_tagged")
    .toString() as TierCustomerEligibility;
  const marketEligibility = (form.get("marketEligibility") ?? "all_markets")
    .toString() as TierMarketEligibility;

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Name is required";
  if (!["product", "variant", "collection", "all"].includes(scope))
    errors.scope = "Invalid scope";
  if (scope !== "all" && scopeIds.length === 0)
    errors.scopeIds = "Select at least one target";
  if (!["per_line", "cart_total"].includes(aggregation))
    errors.aggregation = "Invalid aggregation mode";
  if (
    !["wholesale_tagged", "logged_in", "all_customers", "specific_customers"].includes(
      customerEligibility,
    )
  )
    errors.customerEligibility = "Invalid customer eligibility";
  if (customerEligibility === "specific_customers")
    errors.customerEligibility =
      "Specific customers mode is not available yet (Sprint 5). Pick another option.";
  if (!["all_markets", "specific_markets"].includes(marketEligibility))
    errors.marketEligibility = "Invalid market eligibility";
  if (marketEligibility === "specific_markets")
    errors.marketEligibility =
      "Specific markets mode is not available yet (Sprint 5). Pick another option.";

  if (scope === "variant" && aggregation === "cart_total") {
    errors.aggregation =
      "Variant-scoped tiers must use per-line aggregation.";
  }

  const minQty = Number(minQtyStr);
  if (!Number.isInteger(minQty) || minQty < 1)
    errors.minQty = "Minimum quantity must be a positive integer";

  if (!["percentage", "fixed_amount"].includes(discountType))
    errors.discountType = "Invalid discount type";

  // Branch validation by type. The value field is always one of
  // discountPct (for percentage) or discountAmount (for fixed_amount).
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
        scopeIds,
        minQtyStr,
        discountType,
        discountPctStr,
        discountAmountStr,
        aggregation,
        customerEligibility,
        marketEligibility,
      },
    });
  }

  await createTier({
    shopId: shop.id,
    name,
    scope,
    scopeIds,
    minQty,
    discountPct,
    discountType,
    discountAmount,
    aggregation,
    customerEligibility,
    marketEligibility,
  });

  // Sync to the Shopify Discount Function so checkout enforces it.
  try {
    await syncTiersToFunction(admin, shop.id);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[tiers.new] syncTiersToFunction failed:", err);
  }

  // After creating, go back to /app/pricing (the list) so the
  // merchant sees the new row appear immediately.
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
    description: "Tier applies shop-wide. Simplest setup.",
  },
  {
    value: "product",
    title: "A specific product",
    description: "Pick one product. All variants of it qualify.",
  },
  {
    value: "variant",
    title: "A specific variant",
    description:
      "Pick one variant (e.g. size XL). Most granular control.",
  },
  {
    value: "collection",
    title: "All products in a collection",
    description:
      "Storefront-only. Checkout falls back to baseline for collections.",
  },
];

const CUSTOMER_ELIGIBILITY_OPTIONS: Array<{
  value: TierCustomerEligibility;
  title: string;
  description: string;
  disabled?: boolean;
}> = [
  {
    value: "wholesale_tagged",
    title: "Wholesale customers",
    description:
      "Only customers tagged with the shop's wholesale tag (default).",
  },
  {
    value: "logged_in",
    title: "Logged-in customers",
    description:
      "Any customer with an account — no wholesale tag required.",
  },
  {
    value: "all_customers",
    title: "All customers",
    description:
      "Everyone, including anonymous shoppers. Use with care.",
  },
  {
    value: "specific_customers",
    title: "Specific customers",
    description: "Coming soon — manually pick individual customers.",
    disabled: true,
  },
];

const MARKET_ELIGIBILITY_OPTIONS: Array<{
  value: TierMarketEligibility;
  title: string;
  description: string;
  disabled?: boolean;
}> = [
  {
    value: "all_markets",
    title: "All markets",
    description: "All markets can access this price (default).",
  },
  {
    value: "specific_markets",
    title: "Specific markets",
    description:
      "Coming soon — restrict this price to selected Shopify Markets.",
    disabled: true,
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

export default function NewTier() {
  const { baselinePct } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const shopify = useAppBridge();

  /* ----- form state ----- */
  const [name, setName] = useState<string>(actionData?.values?.name ?? "");
  const [scope, setScope] = useState<TierScope>(
    (actionData?.values?.scope as TierScope) ?? "all",
  );
  // Selected targets (multi-product/variant/collection). The picker
  // populates `title` + `image` on selection; on action-data replay
  // (validation error round-trip) we only have ids back, so titles
  // re-appear blank until the merchant re-opens the picker. Empty
  // arr when scope='all'.
  const [scopeItems, setScopeItems] = useState<ScopeItem[]>(
    (actionData?.values?.scopeIds ?? []).map((id) => ({ id, title: "" })),
  );
  const [minQty, setMinQty] = useState<string>(
    actionData?.values?.minQtyStr ?? "10",
  );
  const [discountType, setDiscountType] = useState<TierDiscountType>(
    (actionData?.values?.discountType as TierDiscountType) ?? "percentage",
  );
  const [discountPct, setDiscountPct] = useState<string>(
    actionData?.values?.discountPctStr ?? "10",
  );
  const [discountAmount, setDiscountAmount] = useState<string>(
    actionData?.values?.discountAmountStr ?? "",
  );
  const [aggregation, setAggregation] = useState<TierAggregation>(
    (actionData?.values?.aggregation as TierAggregation) ?? "per_line",
  );
  const [customerEligibility, setCustomerEligibility] =
    useState<TierCustomerEligibility>(
      (actionData?.values?.customerEligibility as TierCustomerEligibility) ??
        "wholesale_tagged",
    );
  const [marketEligibility, setMarketEligibility] =
    useState<TierMarketEligibility>(
      (actionData?.values?.marketEligibility as TierMarketEligibility) ??
        "all_markets",
    );

  const errors = actionData?.errors ?? {};

  /* ----- Save bar (sticky top, App Bridge style) -----
   * Tracks "is the form dirty?" by comparing every field against
   * its initial value. When dirty → show the SaveBar at the top
   * of the Shopify admin (the same UX Sami / BSS have). The bar's
   * primary button triggers formRef.current?.requestSubmit() so
   * the standard Remix <Form> POST flow runs (action validates,
   * creates the tier, redirects to /app/pricing).
   * Discard resets all state back to the initial values.
   */
  const initial = {
    name: actionData?.values?.name ?? "",
    scope: (actionData?.values?.scope as TierScope) ?? ("all" as TierScope),
    scopeIds: actionData?.values?.scopeIds ?? ([] as string[]),
    minQty: actionData?.values?.minQtyStr ?? "10",
    discountType:
      (actionData?.values?.discountType as TierDiscountType) ??
      ("percentage" as TierDiscountType),
    discountPct: actionData?.values?.discountPctStr ?? "10",
    discountAmount: actionData?.values?.discountAmountStr ?? "",
    aggregation:
      (actionData?.values?.aggregation as TierAggregation) ??
      ("per_line" as TierAggregation),
    customerEligibility:
      (actionData?.values?.customerEligibility as TierCustomerEligibility) ??
      ("wholesale_tagged" as TierCustomerEligibility),
    marketEligibility:
      (actionData?.values?.marketEligibility as TierMarketEligibility) ??
      ("all_markets" as TierMarketEligibility),
  };
  const currentScopeIds = scopeItems.map((s) => s.id);
  const isDirty =
    name !== initial.name ||
    scope !== initial.scope ||
    !sameIdSet(currentScopeIds, initial.scopeIds) ||
    minQty !== initial.minQty ||
    discountType !== initial.discountType ||
    discountPct !== initial.discountPct ||
    discountAmount !== initial.discountAmount ||
    aggregation !== initial.aggregation ||
    customerEligibility !== initial.customerEligibility ||
    marketEligibility !== initial.marketEligibility;

  const SAVE_BAR_ID = "pricing-new-save-bar";
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (isDirty) {
      shopify.saveBar.show(SAVE_BAR_ID);
    } else {
      shopify.saveBar.hide(SAVE_BAR_ID);
    }
    // The cleanup hides the bar when the component unmounts — keeps
    // the global Shopify admin state clean on navigation.
    return () => {
      shopify.saveBar.hide(SAVE_BAR_ID);
    };
  }, [isDirty, shopify]);

  const handleDiscard = () => {
    setName(initial.name);
    setScope(initial.scope);
    setScopeItems(initial.scopeIds.map((id) => ({ id, title: "" })));
    setMinQty(initial.minQty);
    setDiscountType(initial.discountType);
    setDiscountPct(initial.discountPct);
    setDiscountAmount(initial.discountAmount);
    setAggregation(initial.aggregation);
    setCustomerEligibility(initial.customerEligibility);
    setMarketEligibility(initial.marketEligibility);
  };

  /* ----- Resource Picker (multi-select) -----
   *
   * `multiple: true` lets the merchant pick N products in one shot
   * (Sami/BSS UX pattern — one rule with many targets is much faster
   * than duplicating the rule N times). We pass `selectionIds` so
   * re-opening the picker keeps the current selection highlighted
   * and the merchant can add/remove without losing the previous set.
   */
  const openResourcePicker = async () => {
    if (scope === "all") return;
    const result = await shopify.resourcePicker({
      type: scope,
      multiple: true,
      filter: { archived: false, draft: false },
      selectionIds: scopeItems.map((s) => ({ id: s.id })),
    });
    if (!result) return;
    setScopeItems(result.map(pickerNodeToItem));
  };

  const removeScopeItem = (id: string) => {
    setScopeItems((prev) => prev.filter((s) => s.id !== id));
  };

  /* ----- preview math -----
   *  baseline always applies multiplicatively first. Then the tier
   *  either layers on as another multiplicative factor (percentage)
   *  or subtracts a flat amount per unit (fixed_amount). Preview
   *  assumes qty=1 on a €100 retail unit so the merchant can read
   *  the impact at a glance.
   */
  const previewRetail = 100;
  const baselineFactor = 1 - baselinePct / 100;
  const tierPct = Number(discountPct) || 0;
  const tierAmount = Number(discountAmount) || 0;
  const tierFactor =
    discountType === "percentage" ? 1 - tierPct / 100 : 1;
  const fixedDeduction = discountType === "fixed_amount" ? tierAmount : 0;
  const previewWholesale = Math.max(
    0,
    previewRetail * baselineFactor * tierFactor - fixedDeduction,
  );
  const previewSavings = previewRetail - previewWholesale;

  /* ----- summary derived strings ----- */
  const scopeOption = SCOPE_OPTIONS.find((s) => s.value === scope)!;
  const scopeNoun =
    scope === "product"
      ? "products"
      : scope === "variant"
        ? "variants"
        : "collections";
  const scopeSummary =
    scope === "all"
      ? "All products in the shop"
      : scopeItems.length === 0
        ? `${scopeOption.title} (none selected)`
        : `${scopeItems.length} ${scopeNoun}`;

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
      <TitleBar title="New wholesale pricing" />
      {/*
        Sticky SaveBar at the top of the Shopify admin. Driven by the
        `isDirty` state computed above — App Bridge handles the actual
        portal rendering. The primary button submits the existing
        Remix <Form> via formRef.current.requestSubmit() so action
        validation + redirect still flow normally.
       */}
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
        {/*
          Hidden inputs mirror the state so the standard <form> POST
          carries everything — keeps the action contract unchanged
          while the visible UI uses Polaris components that don't
          submit by name on their own (radio cards, etc.).
         */}
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="aggregation" value={aggregation} />
        <input type="hidden" name="discountType" value={discountType} />
        <input
          type="hidden"
          name="customerEligibility"
          value={customerEligibility}
        />
        <input
          type="hidden"
          name="marketEligibility"
          value={marketEligibility}
        />
        {/*
          One hidden input per selected resource. action() uses
          form.getAll("scopeIds") to collect them into an array.
         */}
        {scope !== "all" &&
          scopeItems.map((item) => (
            <input
              key={item.id}
              type="hidden"
              name="scopeIds"
              value={item.id}
            />
          ))}

        <Layout>
          {/* ===================== Main column ===================== */}
          <Layout.Section>
            <BlockStack gap="400">
              {Object.keys(errors).length > 0 && (
                <Banner tone="critical" title="Please fix the errors below" />
              )}

              {/* ----- Pricing rule information ----- */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">
                      Pricing rule information
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Give this wholesale pricing an internal label so you
                      can spot it in the list later. This isn&apos;t shown
                      to customers.
                    </Text>
                  </BlockStack>

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
                      Which products does this tier apply to? You can have
                      multiple tiers with different scopes — the most specific
                      tier wins at checkout (variant &gt; product &gt; all).
                    </Text>
                  </BlockStack>

                  {/*
                    Grid 2×2 instead of vertical stack — feedback from
                    Jonatan 2026-05-27 ("4 opciones en línea de 2 hace
                    que sea UX más amigable", referring to Sami's
                    Customer eligibility layout).
                   */}
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
                    <ScopePicker
                      scope={scope}
                      items={scopeItems}
                      onBrowse={openResourcePicker}
                      onRemove={removeScopeItem}
                      error={errors.scopeIds}
                    />
                  )}

                  {scope === "collection" && (
                    <Banner tone="warning">
                      <p>
                        Collection-scoped tiers display on the storefront but
                        the checkout Discount Function falls back to baseline
                        for them. Use product or variant scope if you need
                        the discount enforced at checkout.
                      </p>
                    </Banner>
                  )}
                </BlockStack>
              </Card>

              {/* ----- Customer eligibility ----- */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">
                      Customer eligibility
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Choose which customers can see this wholesale price.
                    </Text>
                  </BlockStack>

                  <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                    {CUSTOMER_ELIGIBILITY_OPTIONS.map((opt) => (
                      <ChoiceCard
                        key={opt.value}
                        selected={customerEligibility === opt.value}
                        onSelect={() => {
                          if (!opt.disabled) setCustomerEligibility(opt.value);
                        }}
                        title={opt.title}
                        description={opt.description}
                        disabled={opt.disabled}
                      />
                    ))}
                  </InlineGrid>

                  {errors.customerEligibility && (
                    <Banner tone="critical">
                      <p>{errors.customerEligibility}</p>
                    </Banner>
                  )}

                  {customerEligibility === "all_customers" && (
                    <Banner tone="warning">
                      <p>
                        Anyone visiting the storefront — including anonymous
                        shoppers and retail customers — will see this price.
                        This breaks the B2B-only premise; use only for
                        public-facing promos on these products.
                      </p>
                    </Banner>
                  )}

                  {customerEligibility === "wholesale_tagged" && (
                    <Text variant="bodySm" as="p" tone="subdued">
                      Uses the shop&apos;s configured wholesale tag (default
                      &quot;wholesale&quot;). Change it in Settings if needed.
                    </Text>
                  )}
                </BlockStack>
              </Card>

              {/* ----- Market eligibility ----- */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">
                      Market eligibility
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Choose which markets can see this wholesale price.
                    </Text>
                  </BlockStack>

                  <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                    {MARKET_ELIGIBILITY_OPTIONS.map((opt) => (
                      <ChoiceCard
                        key={opt.value}
                        selected={marketEligibility === opt.value}
                        onSelect={() => {
                          if (!opt.disabled) setMarketEligibility(opt.value);
                        }}
                        title={opt.title}
                        description={opt.description}
                        disabled={opt.disabled}
                      />
                    ))}
                  </InlineGrid>

                  {errors.marketEligibility && (
                    <Banner tone="critical">
                      <p>{errors.marketEligibility}</p>
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
                      When does this tier kick in? Choose how the minimum
                      quantity is counted.
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
                    label="Minimum quantity to activate the tier"
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
                      How is the wholesale price calculated? Both options
                      compose with the shop&apos;s wholesale baseline — the
                      Preview panel on the right shows the live math.
                    </Text>
                  </BlockStack>

                  {/*
                    2-card grid (Sami pattern). Only two types ship in v1:
                    Percentage and Fixed amount. "Fixed wholesale price"
                    and "Custom price list" deferred — those overlap with
                    the Per-customer overrides card on the Pricing hub
                    (Coming soon) and weren't worth scaffolding as fakes.
                   */}
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
                      helpText="Flat amount subtracted from each unit AFTER the baseline applies. Use shop-currency value."
                      placeholder="10.00"
                      requiredIndicator
                    />
                  )}
                </BlockStack>
              </Card>

              {/*
                PageActions at the bottom removed 2026-05-27 — the
                sticky SaveBar at the top (App Bridge) handles
                Save + Discard. Having both was duplicate UX.
               */}
            </BlockStack>
          </Layout.Section>

          {/* ===================== Sidebar ===================== */}
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
                    label="Name"
                    value={name || "—"}
                  />
                  <SummaryRow label="Scope" value={scopeSummary} />
                  <SummaryRow label="Trigger" value={triggerSummary} />
                  <SummaryRow label="Discount" value={discountSummary} />
                </BlockStack>
              </Card>

              {scope !== "all" && scopeItems.length > 0 && (
                <Card>
                  <BlockStack gap="300">
                    <BlockStack gap="050">
                      <Text variant="headingMd" as="h3">
                        Selected {scopeNoun}
                      </Text>
                      <Text variant="bodySm" as="p" tone="subdued">
                        {scopeItems.length} item{scopeItems.length === 1 ? "" : "s"} this rule applies to
                      </Text>
                    </BlockStack>
                    <Divider />
                    <BlockStack gap="200">
                      {scopeItems.map((item) => (
                        <ScopeItemRow
                          key={item.id}
                          item={item}
                          onRemove={() => removeScopeItem(item.id)}
                        />
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Card>
              )}

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

/**
 * One target picked from the Resource Picker. We keep title + image
 * so the UI can render a real thumbnail + label instead of the
 * `gid://shopify/Product/123` URL the previous form used to show.
 */
type ScopeItem = {
  id: string;
  title: string;
  image?: string | null;
};

/**
 * Resource Picker returns nodes whose shape depends on the type.
 * For Product/Collection: `images[0].originalSrc` (or `image.originalSrc`).
 * For ProductVariant: `image.originalSrc` (and `displayName` for title).
 * We normalize all three into ScopeItem.
 */
function pickerNodeToItem(node: unknown): ScopeItem {
  const n = node as {
    id: string;
    title?: string;
    displayName?: string;
    image?: { originalSrc?: string; url?: string } | null;
    images?: Array<{ originalSrc?: string; url?: string }>;
  };
  const img =
    n.image?.originalSrc ??
    n.image?.url ??
    n.images?.[0]?.originalSrc ??
    n.images?.[0]?.url ??
    null;
  return {
    id: n.id,
    title: n.title ?? n.displayName ?? "(no title)",
    image: img,
  };
}

/** Order-insensitive equality for the two id lists driving isDirty. */
function sameIdSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((id) => sb.has(id));
}

/**
 * Empty/loaded picker UI block. Shows either a "Browse products"
 * call-to-action button (no selection yet) or a "Selected: N items"
 * summary with an "Edit selection" button that re-opens the picker.
 * Per Jonatan 2026-05-27: the picker is the only path — no manual
 * GID input, no raw URL on screen.
 */
function ScopePicker({
  scope,
  items,
  onBrowse,
  onRemove,
  error,
}: {
  scope: TierScope;
  items: ScopeItem[];
  onBrowse: () => void;
  onRemove: (id: string) => void;
  error?: string;
}) {
  const noun =
    scope === "product"
      ? "products"
      : scope === "variant"
        ? "variants"
        : "collections";
  const verb = scope === "collection" ? "Browse collections" : `Browse ${noun}`;

  if (items.length === 0) {
    return (
      <BlockStack gap="200">
        <InlineStack>
          <Button onClick={onBrowse}>{verb}</Button>
        </InlineStack>
        {error && (
          <Banner tone="critical">
            <p>{error}</p>
          </Banner>
        )}
      </BlockStack>
    );
  }
  return (
    <BlockStack gap="300">
      <InlineStack align="space-between" blockAlign="center" wrap={false}>
        <Text variant="bodyMd" as="span">
          {items.length} {items.length === 1 ? noun.replace(/s$/, "") : noun} selected
        </Text>
        <Button onClick={onBrowse}>Edit selection</Button>
      </InlineStack>
      <BlockStack gap="200">
        {items.map((item) => (
          <ScopeItemRow
            key={item.id}
            item={item}
            onRemove={() => onRemove(item.id)}
          />
        ))}
      </BlockStack>
      {error && (
        <Banner tone="critical">
          <p>{error}</p>
        </Banner>
      )}
    </BlockStack>
  );
}

/**
 * One row of the selected-items list: thumbnail + title + remove button.
 * Used both in the main Scope card and in the sidebar Preview card.
 */
function ScopeItemRow({
  item,
  onRemove,
}: {
  item: ScopeItem;
  onRemove: () => void;
}) {
  return (
    <InlineStack gap="300" align="space-between" blockAlign="center" wrap={false}>
      <InlineStack gap="300" blockAlign="center" wrap={false}>
        {item.image ? (
          <Thumbnail source={item.image} alt={item.title} size="small" />
        ) : (
          <Box
            background="bg-surface-secondary"
            padding="200"
            borderRadius="200"
          >
            <Icon source={ImageIcon} tone="subdued" />
          </Box>
        )}
        <Box maxWidth="220px">
          <Text variant="bodyMd" as="span" truncate>
            {item.title || item.id}
          </Text>
        </Box>
      </InlineStack>
      <Button
        accessibilityLabel={`Remove ${item.title}`}
        icon={XSmallIcon}
        variant="tertiary"
        onClick={onRemove}
      />
    </InlineStack>
  );
}

/**
 * Visual "radio card": full-width clickable card that toggles a
 * RadioButton inside. Used for Scope and Aggregation selection so
 * the merchant sees the available options as cards (Sami-style)
 * instead of a hidden Select dropdown.
 */
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

/**
 * One row of the "Tier summary" / "Preview" sidebar cards: label on
 * the left, value on the right. `emphasis` bolds the value (used for
 * the final wholesale price).
 */
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
