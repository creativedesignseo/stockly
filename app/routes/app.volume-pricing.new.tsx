/**
 * Admin route: create a new volume pricing rule.
 *
 * URL: /app/volume-pricing/new
 *
 * ADR-014: Volume Pricing is its own admin area, sibling to Wholesale
 * Pricing (/app/pricing). Volume Pricing is the multi-band "buy more,
 * save more" quantity-break editor; Wholesale Pricing is a flat
 * single-discount form. They share the DB `Tier` table, separated by
 * `Tier.kind` ("volume" vs "wholesale"). This route always writes
 * `kind: "volume"`.
 *
 * The rich editor below is a 1:1 port of the multi-band Discount Range
 * editor (two-column layout, aggregation card, eligibility cards,
 * scope + product picker, live preview sidebar). Only the kind filter,
 * URLs, titles, and SaveBar id differ from the wholesale form.
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

import {
  BandRangeTable,
  defaultBand,
  defaultBandRaw,
  editorBandToRawBand,
  rawBandToEditorBand,
  type Band,
} from "../components/pricing/band-range-table";
import { useEffect, useRef, useState } from "react";

import { authenticateAdmin } from "../lib/auth.server";
import prisma from "../db.server";
import { syncTiersToFunction } from "../services/discount-function-sync.server";
import {
  createRule,
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
  // ("On a €100 retail product, with 55% baseline + this range 10%,
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
  // mirrored into scopeId by createRule for back-compat reads.
  const scopeIds = Array.from(
    new Set(
      form
        .getAll("scopeIds")
        .map((v) => v.toString().trim())
        .filter(Boolean),
    ),
  );
  const aggregation = (form.get("aggregation") ?? "per_line").toString() as TierAggregation;
  const customerEligibility = (form.get("customerEligibility") ?? "wholesale_tagged")
    .toString() as TierCustomerEligibility;
  const marketEligibility = (form.get("marketEligibility") ?? "all_markets")
    .toString() as TierMarketEligibility;

  // Multi-band (ADR-012): the Discount Range table serializes its rows
  // into one hidden "bands" input as JSON. Each row carries minQty,
  // quantityTo (null = open-ended), discountType, and a single
  // discountValue that maps to pct / amount / fixedPrice by type.
  type RawBand = {
    minQty: number;
    quantityTo: number | null;
    discountType: TierDiscountType;
    discountValue: number;
  };
  let rawBands: RawBand[] = [];
  try {
    rawBands = JSON.parse((form.get("bands") ?? "[]").toString()) as RawBand[];
  } catch {
    rawBands = [];
  }

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Name is required";
  if (!["product", "variant", "collection", "all"].includes(scope))
    errors.scope = "Invalid scope";
  if (scope !== "all" && scopeIds.length === 0)
    errors.scopeIds = "Select at least one target";
  if (!["per_line", "cart_total", "mix_variants"].includes(aggregation))
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
      "Variant-scoped pricing must use per-line aggregation.";
  }
  // ADR-012 §4.8: mix_variants is meaningless on variant scope.
  if (scope === "variant" && aggregation === "mix_variants") {
    errors.aggregation =
      "Mix variants aggregation cannot be combined with variant scope.";
  }

  // Per-band validation. The Discount Range table guarantees at least
  // one row client-side, but we re-validate here defensively.
  if (!Array.isArray(rawBands) || rawBands.length === 0) {
    errors.bands = "Add at least one quantity range";
  } else {
    rawBands.forEach((b, i) => {
      const n = i + 1;
      if (!Number.isInteger(b.minQty) || b.minQty < 1)
        errors.bands = `Range ${n}: "Quantity from" must be a positive whole number`;
      else if (
        b.quantityTo != null &&
        (!Number.isInteger(b.quantityTo) || b.quantityTo < b.minQty)
      )
        errors.bands = `Range ${n}: "Quantity to" must be ≥ "Quantity from" (leave blank for "and above")`;
      else if (!["percentage", "fixed_amount", "fixed_price"].includes(b.discountType))
        errors.bands = `Range ${n}: invalid discount type`;
      else if (
        b.discountType === "percentage" &&
        (Number.isNaN(b.discountValue) || b.discountValue < 0 || b.discountValue > 100)
      )
        errors.bands = `Range ${n}: percentage must be between 0 and 100`;
      else if (
        b.discountType !== "percentage" &&
        (Number.isNaN(b.discountValue) || b.discountValue <= 0)
      )
        errors.bands = `Range ${n}: amount must be greater than 0`;
    });
  }

  // Single failure shape so the action's return union stays uniform
  // (TypeScript otherwise widens `values` to the union of every json
  // return and can't narrow it in the component).
  const fail = (errs: Record<string, string>) =>
    json({
      errors: errs,
      values: {
        name,
        scope,
        scopeIds,
        aggregation,
        customerEligibility,
        marketEligibility,
        bands: rawBands,
      },
    });

  if (Object.keys(errors).length > 0) {
    return fail(errors);
  }

  // Map raw rows → BandInput (split discountValue by type).
  const bands = rawBands.map((b) => ({
    minQty: b.minQty,
    quantityTo: b.quantityTo,
    discountType: b.discountType,
    discountPct: b.discountType === "percentage" ? b.discountValue : 0,
    discountAmount: b.discountType === "fixed_amount" ? b.discountValue : null,
    discountFixedPrice: b.discountType === "fixed_price" ? b.discountValue : null,
  }));

  try {
    await createRule({
      shopId: shop.id,
      name,
      kind: "volume",
      scope,
      scopeIds,
      aggregation,
      customerEligibility,
      marketEligibility,
      bands,
    });
  } catch (e) {
    // createRule.validateBands throws human-readable messages on
    // overlapping / non-ascending / multiple-open-ended bands.
    return fail({
      bands: e instanceof Error ? e.message : "Invalid quantity ranges",
    });
  }

  // Sync to the Shopify Discount Function so checkout enforces it.
  try {
    await syncTiersToFunction(admin, shop.id);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[volume-pricing.new] syncTiersToFunction failed:", err);
  }

  // After creating, go back to /app/volume-pricing (the list) so the
  // merchant sees the new row appear immediately.
  return redirect("/app/volume-pricing");
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
  {
    value: "mix_variants",
    title: "Mix variants of the same product",
    description:
      "Sum quantities across variants of the same product. Mix sizes / colors to hit the minimum.",
  },
];

export default function NewVolumePricing() {
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
  // Multi-band Discount Range table. Each row is one quantity band.
  // On a validation-error replay, actionData.values.bands holds the
  // numeric RawBand[] we POSTed — rehydrate it back into string-based
  // editor rows. Otherwise start with one sensible default band.
  const [bands, setBands] = useState<Band[]>(() =>
    actionData?.values?.bands && actionData.values.bands.length > 0
      ? actionData.values.bands.map(rawBandToEditorBand)
      : [defaultBand()],
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
   * creates the rule, redirects to /app/volume-pricing).
   * Discard resets all state back to the initial values.
   */
  const initial = {
    name: actionData?.values?.name ?? "",
    scope: (actionData?.values?.scope as TierScope) ?? ("all" as TierScope),
    scopeIds: actionData?.values?.scopeIds ?? ([] as string[]),
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
  // Serialize bands for the hidden input + dirty check. One default
  // band = "pristine"; any edit/add/remove flips dirty.
  const bandsPayload = JSON.stringify(bands.map(editorBandToRawBand));
  const initialBandsPayload = JSON.stringify(
    (actionData?.values?.bands ?? [defaultBandRaw()]).map((b) => ({
      minQty: Number(b.minQty),
      quantityTo:
        b.quantityTo === null || b.quantityTo === undefined
          ? null
          : Number(b.quantityTo),
      discountType: b.discountType,
      discountValue: Number(b.discountValue),
    })),
  );
  const currentScopeIds = scopeItems.map((s) => s.id);
  const isDirty =
    name !== initial.name ||
    scope !== initial.scope ||
    !sameIdSet(currentScopeIds, initial.scopeIds) ||
    bandsPayload !== initialBandsPayload ||
    aggregation !== initial.aggregation ||
    customerEligibility !== initial.customerEligibility ||
    marketEligibility !== initial.marketEligibility;

  const SAVE_BAR_ID = "volume-pricing-new-save-bar";
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
    setBands(
      actionData?.values?.bands && actionData.values.bands.length > 0
        ? actionData.values.bands.map(rawBandToEditorBand)
        : [defaultBand()],
    );
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
   *  baseline always applies multiplicatively first. Then the band
   *  either layers on as another multiplicative factor (percentage)
   *  or subtracts a flat amount per unit (fixed_amount). Preview
   *  assumes qty=1 on a €100 retail unit so the merchant can read
   *  the impact at a glance.
   */
  // Preview uses the HIGHEST band (last row) — the deepest discount the
  // customer can unlock — on a €100 retail unit.
  const previewRetail = 100;
  const baselineFactor = 1 - baselinePct / 100;
  const previewBand = bands[bands.length - 1];
  const pType = previewBand?.discountType ?? "percentage";
  const pValue = Number(previewBand?.discountValue) || 0;
  let previewWholesale: number;
  if (pType === "fixed_price") {
    // Final per-unit price overrides retail entirely (baseline ignored).
    previewWholesale = Math.min(previewRetail, pValue);
  } else if (pType === "fixed_amount") {
    previewWholesale = Math.max(0, previewRetail * baselineFactor - pValue);
  } else {
    previewWholesale = Math.max(
      0,
      previewRetail * baselineFactor * (1 - pValue / 100),
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

  const aggLabel =
    aggregation === "per_line"
      ? "per line"
      : aggregation === "mix_variants"
        ? "mix variants"
        : "cart total";
  const triggerSummary = `${bands.length} ${bands.length === 1 ? "range" : "ranges"} · ${aggLabel}`;

  const discountSummary =
    bands.length === 0
      ? "—"
      : bands
          .map((b) => {
            const v = Number(b.discountValue) || 0;
            if (b.discountType === "fixed_price") return `€${v}/unit`;
            if (b.discountType === "fixed_amount") return `−€${v}`;
            return `${v}%`;
          })
          .join(" · ");

  return (
    <Page backAction={{ content: "Volume pricing", url: "/app/volume-pricing" }}>
      <TitleBar title="New volume pricing" />
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
          while the visible UI uses Polaris components that don't
          submit by name on their own (radio cards, etc.).
         */}
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="aggregation" value={aggregation} />
        <input type="hidden" name="bands" value={bandsPayload} />
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
                      Give this volume pricing an internal label so you
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
                      Which products does this rule apply to? You can have
                      multiple rules with different scopes — the most specific
                      rule wins at checkout (variant &gt; product &gt; all).
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
                        Collection-scoped rules display on the storefront but
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

              {/* ----- How quantities are counted (aggregation) ----- */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">
                      How quantities are counted
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Applies to every range below. Choose how the cart
                      quantity is measured against each range&apos;s minimum.
                    </Text>
                  </BlockStack>

                  <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
                    {AGGREGATION_OPTIONS.map((opt) => {
                      const disabled =
                        scope === "variant" &&
                        (opt.value === "cart_total" || opt.value === "mix_variants");
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
                </BlockStack>
              </Card>

              {/* ----- Discount Range (multi-band) ----- */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">
                      Discount Range
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      The more they buy, the bigger the discount. Add one row
                      per quantity band. Leave the last &quot;Quantity to&quot;
                      blank for &quot;and above&quot;.
                    </Text>
                  </BlockStack>

                  <BandRangeTable
                    bands={bands}
                    onChange={setBands}
                    currency="€"
                  />

                  {errors.bands && (
                    <Banner tone="critical">
                      <p>{errors.bands}</p>
                    </Banner>
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
                      On a €100 retail product at the deepest range
                      ({bands.length === 1 ? "the only range" : `range ${bands.length}`}),
                      what a qualifying customer pays at checkout:
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
                      pType === "fixed_price"
                        ? "ignored (fixed price)"
                        : `× ${baselineFactor.toFixed(2)}`
                    }
                  />
                  <SummaryRow
                    label={
                      pType === "fixed_price"
                        ? "This range (fixed price)"
                        : pType === "fixed_amount"
                          ? "This range (flat)"
                          : `This range (${pValue}%)`
                    }
                    value={
                      pType === "fixed_price"
                        ? `€${pValue.toFixed(2)}`
                        : pType === "fixed_amount"
                          ? `− €${pValue.toFixed(2)}`
                          : `× ${(1 - pValue / 100).toFixed(2)}`
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
