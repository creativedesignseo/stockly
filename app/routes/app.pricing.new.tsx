/**
 * Admin route: create a new flat Wholesale Pricing rule.
 *
 * URL: /app/pricing/new
 *
 * Wholesale Pricing (ADR-014) is a FLAT discount: "these customers pay
 * X off these products." ONE discount per rule. No quantity dimension,
 * no quantity bands, no trigger / minimum-quantity. The quantity-break
 * editor lives in the separate Volume Pricing area (/app/volume-pricing).
 *
 * This form was restored 2026-05-28 from the pre-multi-band shape: a
 * single-discount selector. The earlier multi-band editor that had
 * crept into this route (conflating Wholesale with Volume) was removed.
 *
 * UX pattern: Sami Wholesale's "New Wholesale Pricing" form.
 *   - Two-column layout: form sections on left (2/3), live "Pricing
 *     summary" + Preview panel on right (1/3).
 *   - Each form section is its own Polaris Card with title + subtitle.
 *   - Scope + discount-type selection use radio CARDS (click anywhere
 *     on the card) not a Select dropdown — more discoverable.
 *   - Preview card shows the math for an example €100 retail product.
 *
 * Storage: createTier with kind="wholesale", minQty=1 and
 * aggregation="per_line" hardcoded (Wholesale has no quantity concept).
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
  // ("On a €100 retail product, with 55% baseline + this rule 10%,
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
  const discountType = (form.get("discountType") ?? "percentage")
    .toString() as TierDiscountType;
  const discountPctStr = (form.get("discountPct") ?? "").toString();
  const discountAmountStr = (form.get("discountAmount") ?? "").toString();
  const discountFixedPriceStr = (form.get("discountFixedPrice") ?? "").toString();
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

  if (!["percentage", "fixed_amount", "fixed_price"].includes(discountType))
    errors.discountType = "Invalid discount type";

  // Branch validation by discount type. Exactly one value field is
  // relevant per type; the others are nulled before the DB write.
  let discountPct = 0;
  let discountAmount: number | null = null;
  let discountFixedPrice: number | null = null;
  if (discountType === "percentage") {
    discountPct = Number(discountPctStr);
    if (Number.isNaN(discountPct) || discountPct <= 0 || discountPct > 100)
      errors.discountPct = "Discount must be between 0 and 100";
  } else if (discountType === "fixed_amount") {
    discountAmount = Number(discountAmountStr);
    if (Number.isNaN(discountAmount) || discountAmount <= 0)
      errors.discountAmount =
        "Amount must be a positive number (in shop currency)";
  } else {
    discountFixedPrice = Number(discountFixedPriceStr);
    if (Number.isNaN(discountFixedPrice) || discountFixedPrice <= 0)
      errors.discountFixedPrice =
        "Price must be a positive number (in shop currency)";
  }

  if (Object.keys(errors).length > 0) {
    return json({
      errors,
      values: {
        name,
        scope,
        scopeIds,
        discountType,
        discountPctStr,
        discountAmountStr,
        discountFixedPriceStr,
        customerEligibility,
        marketEligibility,
      },
    });
  }

  await createTier({
    shopId: shop.id,
    name,
    kind: "wholesale",
    scope,
    scopeIds,
    // Wholesale Pricing has no quantity concept — every qualifying line
    // gets the discount. minQty=1 / per_line makes the Discount Function
    // treat it as an always-on flat discount on the scoped products.
    minQty: 1,
    aggregation: "per_line",
    discountType,
    discountPct,
    discountAmount,
    discountFixedPrice,
    customerEligibility,
    marketEligibility,
  });

  // Sync to the Shopify Discount Function so checkout enforces it.
  try {
    await syncTiersToFunction(admin, shop.id);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[pricing.new] syncTiersToFunction failed:", err);
  }

  // After creating, go back to /app/pricing (the list) so the merchant
  // sees the new row appear immediately.
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
    description: "Any customer with an account — no wholesale tag required.",
  },
  {
    value: "all_customers",
    title: "All customers",
    description: "Everyone, including anonymous shoppers. Use with care.",
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

const DISCOUNT_TYPE_OPTIONS: Array<{
  value: TierDiscountType;
  title: string;
  description: string;
}> = [
  {
    value: "percentage",
    title: "Percentage off",
    description: "Example: 65% off the line price.",
  },
  {
    value: "fixed_amount",
    title: "Fixed amount off per unit",
    description: "Example: €10 off each unit.",
  },
  {
    value: "fixed_price",
    title: "Fixed price per unit",
    description: "Example: each unit costs exactly €25.",
  },
];

export default function NewWholesalePricing() {
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
  const [discountType, setDiscountType] = useState<TierDiscountType>(
    (actionData?.values?.discountType as TierDiscountType) ?? "percentage",
  );
  const [discountPct, setDiscountPct] = useState<string>(
    actionData?.values?.discountPctStr ?? "65",
  );
  const [discountAmount, setDiscountAmount] = useState<string>(
    actionData?.values?.discountAmountStr ?? "",
  );
  const [discountFixedPrice, setDiscountFixedPrice] = useState<string>(
    actionData?.values?.discountFixedPriceStr ?? "",
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

  /* ----- Save bar (sticky top, App Bridge style) ----- */
  const initial = {
    name: actionData?.values?.name ?? "",
    scope: (actionData?.values?.scope as TierScope) ?? ("all" as TierScope),
    scopeIds: actionData?.values?.scopeIds ?? ([] as string[]),
    discountType:
      (actionData?.values?.discountType as TierDiscountType) ??
      ("percentage" as TierDiscountType),
    discountPct: actionData?.values?.discountPctStr ?? "65",
    discountAmount: actionData?.values?.discountAmountStr ?? "",
    discountFixedPrice: actionData?.values?.discountFixedPriceStr ?? "",
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
    discountType !== initial.discountType ||
    discountPct !== initial.discountPct ||
    discountAmount !== initial.discountAmount ||
    discountFixedPrice !== initial.discountFixedPrice ||
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
    return () => {
      shopify.saveBar.hide(SAVE_BAR_ID);
    };
  }, [isDirty, shopify]);

  const handleDiscard = () => {
    setName(initial.name);
    setScope(initial.scope);
    setScopeItems(initial.scopeIds.map((id) => ({ id, title: "" })));
    setDiscountType(initial.discountType);
    setDiscountPct(initial.discountPct);
    setDiscountAmount(initial.discountAmount);
    setDiscountFixedPrice(initial.discountFixedPrice);
    setCustomerEligibility(initial.customerEligibility);
    setMarketEligibility(initial.marketEligibility);
  };

  /* ----- Resource Picker (multi-select) ----- */
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

  /* ----- preview math (single discount on a €100 retail unit) -----
   *  baseline applies multiplicatively first. Then the discount either
   *  layers on as another multiplicative factor (percentage), subtracts
   *  a flat amount per unit (fixed_amount), or overrides the per-unit
   *  price entirely (fixed_price — baseline ignored).
   */
  const previewRetail = 100;
  const baselineFactor = 1 - baselinePct / 100;
  const tierPct = Number(discountPct) || 0;
  const tierAmount = Number(discountAmount) || 0;
  const tierFixedPrice = Number(discountFixedPrice) || 0;
  let previewWholesale: number;
  if (discountType === "fixed_price") {
    previewWholesale = Math.min(previewRetail, tierFixedPrice);
  } else if (discountType === "fixed_amount") {
    previewWholesale = Math.max(0, previewRetail * baselineFactor - tierAmount);
  } else {
    previewWholesale = Math.max(
      0,
      previewRetail * baselineFactor * (1 - tierPct / 100),
    );
  }
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

  const discountSummary =
    discountType === "fixed_price"
      ? tierFixedPrice
        ? `€${tierFixedPrice}/unit`
        : "—"
      : discountType === "fixed_amount"
        ? tierAmount
          ? `€${tierAmount} off per unit`
          : "—"
        : tierPct
          ? `${tierPct}% off`
          : "—";

  return (
    <Page backAction={{ content: "Wholesale pricing", url: "/app/pricing" }}>
      <TitleBar title="New wholesale pricing" />
      <SaveBar id={SAVE_BAR_ID}>
        <button
          variant="primary"
          onClick={() => {
            // Dismiss before the redirect so App Bridge's leave-
            // confirmation doesn't fire / leak the bar to the list.
            shopify.saveBar.hide(SAVE_BAR_ID);
            formRef.current?.requestSubmit();
          }}
          loading={submitting ? "" : undefined}
        >
          Save
        </button>
        <button
          onClick={() => {
            shopify.saveBar.hide(SAVE_BAR_ID);
            handleDiscard();
          }}
        >
          Discard
        </button>
      </SaveBar>
      <Form method="post" ref={formRef}>
        {/*
          Hidden inputs mirror the state so the standard <form> POST
          carries everything — keeps the action contract unchanged
          while the visible UI uses Polaris components that don't submit
          by name on their own (radio cards, etc.).
         */}
        <input type="hidden" name="scope" value={scope} />
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
                    placeholder="e.g. Wholesale — 65% off"
                    requiredIndicator
                  />
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

              {/* ----- Scope ----- */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">
                      Scope
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Which products does this rule apply to? You can have
                      multiple rules with different scopes — the most specific
                      rule wins at checkout (variant &gt; product &gt; all).
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
                        Collection-scoped rules display on the storefront but
                        the checkout Discount Function falls back to baseline
                        for them. Use product or variant scope if you need the
                        discount enforced at checkout.
                      </p>
                    </Banner>
                  )}
                </BlockStack>
              </Card>

              {/* ----- Discount (single value) ----- */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">
                      Discount
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      One flat discount for this rule. Percentage and fixed
                      amount compose with the shop&apos;s wholesale baseline;
                      fixed price overrides it. The Preview panel on the right
                      shows the live math.
                    </Text>
                  </BlockStack>

                  <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
                    {DISCOUNT_TYPE_OPTIONS.map((opt) => (
                      <ChoiceCard
                        key={opt.value}
                        selected={discountType === opt.value}
                        onSelect={() => setDiscountType(opt.value)}
                        title={opt.title}
                        description={opt.description}
                      />
                    ))}
                  </InlineGrid>

                  {discountType === "percentage" && (
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
                  )}
                  {discountType === "fixed_amount" && (
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
                  {discountType === "fixed_price" && (
                    <TextField
                      label="Final price per unit"
                      name="discountFixedPrice"
                      type="number"
                      min={0}
                      step={0.01}
                      autoComplete="off"
                      value={discountFixedPrice}
                      onChange={setDiscountFixedPrice}
                      error={errors.discountFixedPrice}
                      prefix="€"
                      helpText="Each unit costs exactly this amount. The shop baseline is ignored for fixed-price rules."
                      placeholder="25.00"
                      requiredIndicator
                    />
                  )}
                </BlockStack>
              </Card>
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
                  <SummaryRow label="Name" value={name || "—"} />
                  <SummaryRow label="Scope" value={scopeSummary} />
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
                    value={
                      discountType === "fixed_price"
                        ? "ignored (fixed price)"
                        : `× ${baselineFactor.toFixed(2)}`
                    }
                  />
                  <SummaryRow
                    label={
                      discountType === "fixed_price"
                        ? "This rule (fixed price)"
                        : discountType === "fixed_amount"
                          ? "This rule (flat)"
                          : `This rule (${tierPct}%)`
                    }
                    value={
                      discountType === "fixed_price"
                        ? `€${tierFixedPrice.toFixed(2)}`
                        : discountType === "fixed_amount"
                          ? `− €${tierAmount.toFixed(2)}`
                          : `× ${(1 - tierPct / 100).toFixed(2)}`
                    }
                  />
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
 * One target picked from the Resource Picker. We keep title + image so
 * the UI can render a real thumbnail + label instead of the raw GID.
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
 * RadioButton inside. Used for Scope, discount-type, customer/market
 * eligibility selection so the merchant sees the options as cards
 * (Sami-style) instead of a hidden Select dropdown.
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
 * One row of the "Pricing summary" / "Preview" sidebar cards: label on
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
