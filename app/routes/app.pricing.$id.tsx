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
 * Legacy /app/tiers/:id route deleted 2026-05-27 — /app/pricing/:id
 * is the only edit URL now.
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
  deleteTier,
  getTier,
  updateTier,
  type TierAggregation,
  type TierCustomerEligibility,
  type TierDiscountType,
  type TierScope,
} from "../services/tiers.server";

/* -------------------------------------------------------------------------- */
/*                                  LOADER                                    */
/* -------------------------------------------------------------------------- */

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { admin, shop } = await authenticateAdmin(request);
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
      console.error("[pricing.$id] scope-target fetch failed:", err);
      scopeItems = targetIds.map((id) => ({ id, title: "", image: null }));
    }
  }

  return json({
    tier,
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
  // Multi-target (2026-05-27). Same parsing strategy as
  // /app/pricing/new: scopeIds arrives as multiple hidden inputs and
  // we de-dupe before validating.
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
  const aggregation = (form.get("aggregation") ?? "per_line")
    .toString() as TierAggregation;
  const customerEligibility = (
    form.get("customerEligibility") ?? "wholesale_tagged"
  ).toString() as TierCustomerEligibility;
  const active = form.get("active") === "on";

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Name is required";
  if (!["product", "variant", "collection", "all"].includes(scope))
    errors.scope = "Invalid scope";
  if (scope !== "all" && scopeIds.length === 0)
    errors.scopeIds = "Select at least one target";
  if (!["per_line", "cart_total"].includes(aggregation))
    errors.aggregation = "Invalid aggregation mode";
  if (scope === "variant" && aggregation === "cart_total") {
    errors.aggregation =
      "Variant-scoped pricing rules must use per-line aggregation.";
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
        scopeIds,
        minQtyStr,
        discountType,
        discountPctStr,
        discountAmountStr,
        aggregation,
        customerEligibility,
        active,
      },
    });
  }

  await updateTier(id, {
    name,
    scope,
    scopeIds: scope === "all" ? [] : scopeIds,
    minQty,
    discountPct,
    discountType,
    discountAmount,
    aggregation,
    customerEligibility,
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
  const { tier, baselinePct, scopeItems: initialScopeItems } =
    useLoaderData<typeof loader>();
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
  // Selected targets list. After a validation error round-trip we only
  // have ids, so titles re-blank until the picker is re-opened; on
  // first render we use the loader-fetched titles + images.
  const [scopeItems, setScopeItems] = useState<ScopeItem[]>(
    actionData?.values?.scopeIds
      ? actionData.values.scopeIds.map((id) => ({ id, title: "" }))
      : initialScopeItems,
  );
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
  const [customerEligibility, setCustomerEligibility] =
    useState<TierCustomerEligibility>(
      (actionData?.values?.customerEligibility as TierCustomerEligibility) ??
        ((tier.customerEligibility as TierCustomerEligibility | null) ??
          "wholesale_tagged"),
    );
  const [active, setActive] = useState<boolean>(
    actionData?.values?.active ?? tier.active,
  );

  const errors = actionData?.errors ?? {};

  /* ----- SaveBar (App Bridge, sticky top) ----- */
  // Initial scopeIds = those on the persisted tier. Used both for
  // Discard (restore to the original selection) and for isDirty
  // comparison (so re-opening the picker without changes doesn't
  // flag the form as dirty).
  const initialScopeIds =
    tier.scopeIds && tier.scopeIds.length > 0
      ? tier.scopeIds
      : tier.scopeId
        ? [tier.scopeId]
        : [];
  const initial = {
    name: tier.name,
    scope: tier.scope as TierScope,
    scopeIds: initialScopeIds,
    minQty: String(tier.minQty),
    discountType: ((tier.discountType as TierDiscountType | null) ??
      "percentage") as TierDiscountType,
    discountPct: String(tier.discountPct ?? ""),
    discountAmount:
      tier.discountAmount != null ? String(tier.discountAmount) : "",
    aggregation: tier.aggregation as TierAggregation,
    customerEligibility:
      ((tier.customerEligibility as TierCustomerEligibility | null) ??
        "wholesale_tagged") as TierCustomerEligibility,
    active: tier.active,
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
    setScopeItems(initialScopeItems);
    setMinQty(initial.minQty);
    setDiscountType(initial.discountType);
    setDiscountPct(initial.discountPct);
    setDiscountAmount(initial.discountAmount);
    setAggregation(initial.aggregation);
    setCustomerEligibility(initial.customerEligibility);
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
        <input
          type="hidden"
          name="customerEligibility"
          value={customerEligibility}
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
 * One target picked from the Resource Picker. Mirrors the type in
 * app.pricing.new.tsx — kept duplicated (not in a shared module) so
 * each route remains self-contained for the audit.
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
