/**
 * Admin route: edit (or delete) an existing volume pricing rule.
 *
 * URL: /app/volume-pricing/:id
 *
 * ADR-014: sibling of /app/pricing/:id but always operates on
 * `kind: "volume"` rules. Same rich Sami-style multi-band editor:
 *   - Loader fetches the rule by id (with shop-id ownership check)
 *     and pre-populates state.
 *   - "Pricing rule information" card has an Active/Inactive toggle.
 *   - Action handles two intents:
 *       intent=update  → validate + updateRule(kind:"volume")
 *       intent=delete  → deleteRule (hard delete)
 *   - Danger zone Card with a destructive "Delete this volume pricing".
 *   - Both Save and Delete redirect to /app/volume-pricing (the list).
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
  Thumbnail,
  Icon,
} from "@shopify/polaris";
import { ImageIcon, XSmallIcon } from "@shopify/polaris-icons";
import { SaveBar, TitleBar, useAppBridge } from "@shopify/app-bridge-react";

import { authenticateAdmin } from "../lib/auth.server";
import prisma from "../db.server";
import { syncTiersToFunction } from "../services/discount-function-sync.server";
import {
  deleteRule,
  getRule,
  getTier,
  updateRule,
  type TierAggregation,
  type TierCustomerEligibility,
  type TierDiscountType,
  type TierMarketEligibility,
  type TierScope,
} from "../services/tiers.server";
import {
  BandRangeTable,
  editorBandToRawBand,
  rawBandToEditorBand,
  tierRowToEditorBand,
  type Band,
} from "../components/pricing/band-range-table";

/* -------------------------------------------------------------------------- */
/*                                  LOADER                                    */
/* -------------------------------------------------------------------------- */

/**
 * ADR-012: the list view links use a rule's `groupId`. Legacy
 * bookmarks still use `Tier.id`. Resolve either by trying id first,
 * then falling back to groupId. Returns the FIRST band of the group
 * (sorted ascending by minQty) — for legacy 1-band rules that's the
 * only band; for multi-band rules the rule-level fields all match.
 */
async function resolveTierOrGroup(rawId: string, shopId: string) {
  const direct = await getTier(rawId, shopId);
  if (direct) return direct;
  return prisma.tier.findFirst({
    where: { shopId, groupId: rawId },
    orderBy: { minQty: "asc" },
  });
}

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { admin, shop } = await authenticateAdmin(request);
  const id = params.id;
  if (!id) throw new Response("Rule id is required", { status: 400 });

  const [tier, shopRow] = await Promise.all([
    resolveTierOrGroup(id, shop.id),
    prisma.shop.findUnique({
      where: { id: shop.id },
      select: { wholesaleBaselinePct: true },
    }),
  ]);
  if (!tier)
    throw new Response("Volume pricing not found", { status: 404 });

  // ADR-012: load the FULL rule (all bands) so the multi-band editor can
  // render every quantity range. `tier` above is just the first band we
  // resolved from the id/groupId; the group it belongs to has N bands.
  const groupId = tier.groupId ?? tier.id;
  const rule = await getRule(groupId, shop.id);
  if (!rule)
    throw new Response("Volume pricing not found", { status: 404 });

  // Resolve the rule's targets to (id, title, image) so the form can
  // render a real thumbnail + label instead of the raw GID URL. We use
  // the generic `nodes(ids:)` query because the rule's scope determines
  // whether the targets are Products, ProductVariants, or Collections.
  // Read scopeIds[] first (the new field), fall back to legacy scopeId.
  const targetIds =
    tier.scopeIds && tier.scopeIds.length > 0
      ? tier.scopeIds
      : tier.scopeId
        ? [tier.scopeId]
        : [];
  let scopeItems: Array<{ id: string; title: string; image: string | null }> =
    [];
  if (targetIds.length > 0) {
    try {
      const res = await admin.graphql(
        `#graphql
        query ScopeTargets($ids: [ID!]!) {
          nodes(ids: $ids) {
            __typename
            ... on Product {
              id
              title
              featuredImage { url }
            }
            ... on ProductVariant {
              id
              displayName
              image { url }
              product { featuredImage { url } }
            }
            ... on Collection {
              id
              title
              image { url }
            }
          }
        }`,
        { variables: { ids: targetIds } },
      );
      // Loosely typed for normalization below — Shopify returns a
      // mixed array of Product/ProductVariant/Collection so we type
      // each field as optional and pick what's actually present.
      const json = (await res.json()) as {
        data?: {
          nodes?: Array<
            | ({
                __typename: string;
                id?: string;
                title?: string;
                displayName?: string;
                image?: { url?: string } | null;
                featuredImage?: { url?: string } | null;
                product?: { featuredImage?: { url?: string } | null } | null;
              } | null)
          >;
        };
      };
      scopeItems = (json.data?.nodes ?? [])
        .filter((n): n is NonNullable<typeof n> => n != null && !!n.id)
        .map((n) => {
          const isVariant = n.__typename === "ProductVariant";
          return {
            id: n.id as string,
            title: (isVariant ? n.displayName : n.title) ?? "(no title)",
            image:
              n.featuredImage?.url ??
              n.image?.url ??
              n.product?.featuredImage?.url ??
              null,
          };
        });
      // If Shopify dropped any ids (deleted resources), keep the gid so
      // the merchant can see them and decide to remove.
      const returnedIds = new Set(scopeItems.map((s) => s.id));
      for (const id of targetIds) {
        if (!returnedIds.has(id)) {
          scopeItems.push({ id, title: "(deleted or unavailable)", image: null });
        }
      }
    } catch (err) {
      // Don't block the form on a metadata-fetch failure. Show raw
      // ids — the merchant can still edit + save the rule.
      // eslint-disable-next-line no-console
      console.error("[volume-pricing.$id] scope-target fetch failed:", err);
      scopeItems = targetIds.map((id) => ({ id, title: "", image: null }));
    }
  }

  return json({
    rule,
    groupId,
    baselinePct: shopRow?.wholesaleBaselinePct ?? 0,
    scopeItems,
  });
};

/* -------------------------------------------------------------------------- */
/*                                  ACTION                                    */
/* -------------------------------------------------------------------------- */

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const { admin, shop } = await authenticateAdmin(request);
  const id = params.id;
  if (!id) throw new Response("Rule id is required", { status: 400 });

  // ADR-012: id may be a Tier.id (legacy bookmark) or a groupId (new
  // list links). Resolve to the underlying band; if the URL was a
  // groupId, `existing.groupId === id` so we always know the group
  // for downstream multi-band operations.
  const existing = await resolveTierOrGroup(id, shop.id);
  if (!existing)
    throw new Response("Volume pricing not found", { status: 404 });
  const groupId = existing.groupId ?? existing.id;

  const form = await request.formData();
  const intent = (form.get("intent") ?? "").toString();

  if (intent === "delete") {
    // ADR-012: delete EVERY band of the rule, not just the resolved
    // one. Legacy 1-band rules remove a single row (unchanged behavior).
    await deleteRule(groupId, shop.id);
    try {
      await syncTiersToFunction(admin, shop.id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[volume-pricing.$id] syncTiersToFunction failed:", err);
    }
    return redirect("/app/volume-pricing");
  }

  if (intent !== "update") {
    throw new Response(`Unknown form intent: ${intent}`, { status: 400 });
  }

  const name = (form.get("name") ?? "").toString().trim();
  const scope = (form.get("scope") ?? "all").toString() as TierScope;
  const scopeIds = Array.from(
    new Set(
      form
        .getAll("scopeIds")
        .map((v) => v.toString().trim())
        .filter(Boolean),
    ),
  );
  const aggregation = (form.get("aggregation") ?? "per_line")
    .toString() as TierAggregation;
  const customerEligibility = (
    form.get("customerEligibility") ?? "wholesale_tagged"
  ).toString() as TierCustomerEligibility;
  const marketEligibility = (
    form.get("marketEligibility") ?? "all_markets"
  ).toString() as TierMarketEligibility;
  const active = form.get("active") === "on";

  // Multi-band (ADR-012): same JSON contract as /app/volume-pricing/new.
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
  if (scope === "variant" && aggregation === "cart_total") {
    errors.aggregation =
      "Variant-scoped pricing rules must use per-line aggregation.";
  }
  if (scope === "variant" && aggregation === "mix_variants") {
    errors.aggregation =
      "Mix variants aggregation cannot be combined with variant scope.";
  }
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
        active,
        bands: rawBands,
      },
    });

  if (Object.keys(errors).length > 0) {
    return fail(errors);
  }

  const bands = rawBands.map((b) => ({
    minQty: b.minQty,
    quantityTo: b.quantityTo,
    discountType: b.discountType,
    discountPct: b.discountType === "percentage" ? b.discountValue : 0,
    discountAmount: b.discountType === "fixed_amount" ? b.discountValue : null,
    discountFixedPrice: b.discountType === "fixed_price" ? b.discountValue : null,
  }));

  try {
    // ADR-012 replace-all: deletes the group's bands and re-creates them
    // atomically. Rule-level fields apply to every band.
    await updateRule(groupId, shop.id, {
      name,
      kind: "volume",
      scope,
      scopeIds: scope === "all" ? [] : scopeIds,
      aggregation,
      customerEligibility,
      marketEligibility,
      active,
      bands,
    });
  } catch (e) {
    return fail({
      bands: e instanceof Error ? e.message : "Invalid quantity ranges",
    });
  }

  try {
    await syncTiersToFunction(admin, shop.id);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[volume-pricing.$id] syncTiersToFunction failed:", err);
  }

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

export default function EditVolumePricing() {
  const { rule, baselinePct, scopeItems: initialScopeItems } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "update";
  const shopify = useAppBridge();

  /* ----- form state (pre-populated from the rule) ----- */
  const [name, setName] = useState<string>(
    actionData?.values?.name ?? rule.name,
  );
  const [scope, setScope] = useState<TierScope>(
    (actionData?.values?.scope as TierScope) ?? (rule.scope as TierScope),
  );
  const [scopeItems, setScopeItems] = useState<ScopeItem[]>(
    actionData?.values?.scopeIds
      ? actionData.values.scopeIds.map((id) => ({ id, title: "" }))
      : initialScopeItems,
  );
  // Multi-band Discount Range. On a validation-error replay use the
  // numeric bands we POSTed; otherwise hydrate from the rule's DB rows.
  const [bands, setBands] = useState<Band[]>(() =>
    actionData?.values?.bands && actionData.values.bands.length > 0
      ? actionData.values.bands.map(rawBandToEditorBand)
      : rule.bands.map(tierRowToEditorBand),
  );
  const [aggregation, setAggregation] = useState<TierAggregation>(
    (actionData?.values?.aggregation as TierAggregation) ??
      (rule.aggregation as TierAggregation),
  );
  const [customerEligibility, setCustomerEligibility] =
    useState<TierCustomerEligibility>(
      (actionData?.values?.customerEligibility as TierCustomerEligibility) ??
        ((rule.customerEligibility as TierCustomerEligibility | null) ??
          "wholesale_tagged"),
    );
  const [marketEligibility, setMarketEligibility] =
    useState<TierMarketEligibility>(
      (actionData?.values?.marketEligibility as TierMarketEligibility) ??
        ((rule.marketEligibility as TierMarketEligibility | null) ??
          "all_markets"),
    );
  const [active, setActive] = useState<boolean>(
    actionData?.values?.active ?? rule.active,
  );

  const errors = actionData?.errors ?? {};

  /* ----- SaveBar (App Bridge, sticky top) ----- */
  const initialScopeIds = rule.scopeIds ?? [];
  const initialBandsPayload = JSON.stringify(
    rule.bands.map(tierRowToEditorBand).map(editorBandToRawBand),
  );
  const initial = {
    name: rule.name,
    scope: rule.scope as TierScope,
    scopeIds: initialScopeIds,
    aggregation: rule.aggregation as TierAggregation,
    customerEligibility:
      ((rule.customerEligibility as TierCustomerEligibility | null) ??
        "wholesale_tagged") as TierCustomerEligibility,
    marketEligibility:
      ((rule.marketEligibility as TierMarketEligibility | null) ??
        "all_markets") as TierMarketEligibility,
    active: rule.active,
  };
  const bandsPayload = JSON.stringify(bands.map(editorBandToRawBand));
  const currentScopeIds = scopeItems.map((s) => s.id);
  const isDirty =
    name !== initial.name ||
    scope !== initial.scope ||
    !sameIdSet(currentScopeIds, initial.scopeIds) ||
    bandsPayload !== initialBandsPayload ||
    aggregation !== initial.aggregation ||
    customerEligibility !== initial.customerEligibility ||
    marketEligibility !== initial.marketEligibility ||
    active !== initial.active;

  const SAVE_BAR_ID = "volume-pricing-edit-save-bar";
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
    setScopeItems(initialScopeItems);
    setBands(rule.bands.map(tierRowToEditorBand));
    setAggregation(initial.aggregation);
    setCustomerEligibility(initial.customerEligibility);
    setMarketEligibility(initial.marketEligibility);
    setActive(initial.active);
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

  /* ----- Delete fetcher (intent=delete, separate from SaveBar) ----- */
  const deleteFetcher = useFetcher<typeof action>();
  const deleting = deleteFetcher.state !== "idle";
  const handleDelete = () => {
    if (
      !confirm(
        `Permanently delete "${rule.name}"?\n\nThis cannot be undone. To keep history, toggle the rule inactive instead.`,
      )
    )
      return;
    const fd = new FormData();
    fd.append("intent", "delete");
    deleteFetcher.submit(fd, { method: "POST" });
  };

  /* ----- preview math (deepest / last band on a €100 unit) ----- */
  const previewRetail = 100;
  const baselineFactor = 1 - baselinePct / 100;
  const previewBand = bands[bands.length - 1];
  const pType = previewBand?.discountType ?? "percentage";
  const pValue = Number(previewBand?.discountValue) || 0;
  let previewWholesale: number;
  if (pType === "fixed_price") {
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
      <TitleBar title={`Edit: ${rule.name}`} />
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
        {active && <input type="hidden" name="active" value="on" />}
        {/* One hidden input per selected resource (see new.tsx). */}
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
                        Draft rules are kept for history but don&apos;t
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
                      Applies to every range below.
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

                  <BandRangeTable bands={bands} onChange={setBands} currency="€" />

                  {errors.bands && (
                    <Banner tone="critical">
                      <p>{errors.bands}</p>
                    </Banner>
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
                      Delete this volume pricing
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
                    value={active ? "Active" : "Draft"}
                  />
                  <SummaryRow label="Name" value={name || "—"} />
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
 * One target picked from the Resource Picker. Mirrors the type in
 * app.volume-pricing.new.tsx — kept duplicated (not in a shared
 * module) so each route remains self-contained for the audit.
 */
type ScopeItem = {
  id: string;
  title: string;
  image?: string | null;
};

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

function sameIdSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((id) => sb.has(id));
}

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
        accessibilityLabel={`Remove ${item.title || item.id}`}
        icon={XSmallIcon}
        variant="tertiary"
        onClick={onRemove}
      />
    </InlineStack>
  );
}

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
