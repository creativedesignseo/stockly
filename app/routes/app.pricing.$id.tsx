/**
 * Admin route: edit (or delete) an existing flat Wholesale Pricing rule.
 *
 * URL: /app/pricing/:id
 *
 * Wholesale Pricing (ADR-014) is a FLAT discount: ONE value per rule,
 * no quantity dimension. This is the single-discount edit form restored
 * 2026-05-28 — the multi-band editor that had crept in (conflating
 * Wholesale with Volume Pricing) was removed. Volume's quantity-break
 * editor lives in the separate /app/volume-pricing area.
 *
 * Same Sami-style layout as /app/pricing/new with these add-ons:
 *   - Loader resolves the rule by its Tier.id (legacy bookmark) or
 *     groupId (new list links) and pre-populates state from the FIRST
 *     band. A wholesale rule is always 1 band; a legacy group that
 *     happens to carry multiple bands won't crash — we just edit the
 *     first band's discount.
 *   - "Pricing rule information" card has an Active/Draft toggle.
 *   - Action handles two intents:
 *       intent=update → validate + updateTier on the first band.
 *       intent=delete → deleteRule (removes every band of the group).
 *   - Both Save and Delete redirect to /app/pricing (the list).
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
  updateTier,
  type TierCustomerEligibility,
  type TierDiscountType,
  type TierMarketEligibility,
  type TierScope,
} from "../services/tiers.server";

/* -------------------------------------------------------------------------- */
/*                                  LOADER                                    */
/* -------------------------------------------------------------------------- */

/**
 * The list view links use a rule's `groupId`; legacy bookmarks use
 * `Tier.id`. Resolve either: try id first, then fall back to groupId
 * (returning the first band of the group, sorted ascending by minQty).
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

  const [resolved, shopRow] = await Promise.all([
    resolveTierOrGroup(id, shop.id),
    prisma.shop.findUnique({
      where: { id: shop.id },
      select: { wholesaleBaselinePct: true },
    }),
  ]);
  if (!resolved)
    throw new Response("Wholesale pricing not found", { status: 404 });

  // Load the full rule (its group) so we can read the first band. A
  // wholesale rule is 1 band; a legacy multi-band group resolves to its
  // first band — the form only ever edits that one band's discount.
  const groupId = resolved.groupId ?? resolved.id;
  const rule = await getRule(groupId, shop.id);
  if (!rule || rule.bands.length === 0)
    throw new Response("Wholesale pricing not found", { status: 404 });

  const firstBand = rule.bands[0];

  // Resolve the rule's targets to (id, title, image) so the form can
  // render a real thumbnail + label instead of the raw GID URL. We use
  // the generic `nodes(ids:)` query because the rule's scope determines
  // whether the targets are Products, ProductVariants, or Collections.
  const targetIds =
    firstBand.scopeIds && firstBand.scopeIds.length > 0
      ? firstBand.scopeIds
      : firstBand.scopeId
        ? [firstBand.scopeId]
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
      const data = (await res.json()) as {
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
      scopeItems = (data.data?.nodes ?? [])
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
      for (const targetId of targetIds) {
        if (!returnedIds.has(targetId)) {
          scopeItems.push({
            id: targetId,
            title: "(deleted or unavailable)",
            image: null,
          });
        }
      }
    } catch (err) {
      // Don't block the form on a metadata-fetch failure. Show raw ids —
      // the merchant can still edit + save the rule.
      // eslint-disable-next-line no-console
      console.error("[pricing.$id] scope-target fetch failed:", err);
      scopeItems = targetIds.map((tid) => ({ id: tid, title: "", image: null }));
    }
  }

  // Flatten the first band's fields into a plain object for the form.
  return json({
    rule: {
      groupId,
      tierId: firstBand.id,
      name: rule.name,
      scope: rule.scope,
      active: rule.active,
      discountType: firstBand.discountType,
      discountPct: firstBand.discountPct,
      discountAmount: firstBand.discountAmount,
      discountFixedPrice: firstBand.discountFixedPrice,
      customerEligibility: rule.customerEligibility,
      marketEligibility: rule.marketEligibility,
      bandCount: rule.bandCount,
    },
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

  // id may be a Tier.id (legacy bookmark) or a groupId (new list links).
  const existing = await resolveTierOrGroup(id, shop.id);
  if (!existing)
    throw new Response("Wholesale pricing not found", { status: 404 });
  const groupId = existing.groupId ?? existing.id;

  const form = await request.formData();
  const intent = (form.get("intent") ?? "").toString();

  if (intent === "delete") {
    // Delete every band of the rule (legacy 1-band rules remove a single
    // row — unchanged behavior).
    await deleteRule(groupId, shop.id);
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
  const customerEligibility = (
    form.get("customerEligibility") ?? "wholesale_tagged"
  ).toString() as TierCustomerEligibility;
  const marketEligibility = (
    form.get("marketEligibility") ?? "all_markets"
  ).toString() as TierMarketEligibility;
  const active = form.get("active") === "on";

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
        active,
      },
    });
  }

  // A wholesale rule is 1 band; we update that band in place. Resolve
  // the first band of the group (legacy multi-band groups: we only edit
  // the first band's discount — the rest are untouched).
  const firstBand = await prisma.tier.findFirst({
    where: { shopId: shop.id, groupId },
    orderBy: { minQty: "asc" },
    select: { id: true },
  });
  if (!firstBand)
    throw new Response("Wholesale pricing not found", { status: 404 });

  await updateTier(firstBand.id, {
    name,
    scope,
    scopeIds: scope === "all" ? [] : scopeIds,
    discountType,
    discountPct,
    discountAmount,
    discountFixedPrice,
    customerEligibility,
    marketEligibility,
    active,
    // Wholesale Pricing has no quantity concept — keep the band always-on.
    minQty: 1,
    aggregation: "per_line",
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

export default function EditWholesalePricing() {
  const { rule, baselinePct, scopeItems: initialScopeItems } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "update";
  const shopify = useAppBridge();

  /* ----- form state (pre-populated from the rule's first band) ----- */
  const [name, setName] = useState<string>(actionData?.values?.name ?? rule.name);
  const [scope, setScope] = useState<TierScope>(
    (actionData?.values?.scope as TierScope) ?? (rule.scope as TierScope),
  );
  const [scopeItems, setScopeItems] = useState<ScopeItem[]>(
    actionData?.values?.scopeIds
      ? actionData.values.scopeIds.map((id) => ({ id, title: "" }))
      : initialScopeItems,
  );
  const [discountType, setDiscountType] = useState<TierDiscountType>(
    (actionData?.values?.discountType as TierDiscountType) ??
      (rule.discountType as TierDiscountType),
  );
  const [discountPct, setDiscountPct] = useState<string>(
    actionData?.values?.discountPctStr ??
      (rule.discountType === "percentage" ? String(rule.discountPct) : ""),
  );
  const [discountAmount, setDiscountAmount] = useState<string>(
    actionData?.values?.discountAmountStr ??
      (rule.discountType === "fixed_amount" && rule.discountAmount != null
        ? String(rule.discountAmount)
        : ""),
  );
  const [discountFixedPrice, setDiscountFixedPrice] = useState<string>(
    actionData?.values?.discountFixedPriceStr ??
      (rule.discountType === "fixed_price" && rule.discountFixedPrice != null
        ? String(rule.discountFixedPrice)
        : ""),
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
  const initial = {
    name: rule.name,
    scope: rule.scope as TierScope,
    scopeIds: initialScopeItems.map((s) => s.id),
    discountType: rule.discountType as TierDiscountType,
    discountPct:
      rule.discountType === "percentage" ? String(rule.discountPct) : "",
    discountAmount:
      rule.discountType === "fixed_amount" && rule.discountAmount != null
        ? String(rule.discountAmount)
        : "",
    discountFixedPrice:
      rule.discountType === "fixed_price" && rule.discountFixedPrice != null
        ? String(rule.discountFixedPrice)
        : "",
    customerEligibility:
      ((rule.customerEligibility as TierCustomerEligibility | null) ??
        "wholesale_tagged") as TierCustomerEligibility,
    marketEligibility:
      ((rule.marketEligibility as TierMarketEligibility | null) ??
        "all_markets") as TierMarketEligibility,
    active: rule.active,
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
    marketEligibility !== initial.marketEligibility ||
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
    setDiscountType(initial.discountType);
    setDiscountPct(initial.discountPct);
    setDiscountAmount(initial.discountAmount);
    setDiscountFixedPrice(initial.discountFixedPrice);
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
        `Permanently delete "${rule.name}"?\n\nThis cannot be undone. To keep history, toggle the rule to Draft instead.`,
      )
    )
      return;
    const fd = new FormData();
    fd.append("intent", "delete");
    deleteFetcher.submit(fd, { method: "POST" });
  };

  /* ----- preview math (single discount on a €100 retail unit) ----- */
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
      <TitleBar title={`Edit: ${rule.name}`} />
      <SaveBar id={SAVE_BAR_ID}>
        <button
          variant="primary"
          onClick={() => {
            // Dismiss the bar BEFORE the form's redirect navigation so
            // App Bridge's leave-confirmation doesn't fire and the bar
            // doesn't leak onto the list page. On a validation error the
            // action returns json (no redirect) and the isDirty effect
            // re-shows the bar. See plan: SaveBar persistence fix.
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
        <input type="hidden" name="intent" value="update" />
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
        {active && <input type="hidden" name="active" value="on" />}
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

              {rule.bandCount > 1 && (
                <Banner tone="warning" title="Legacy multi-band rule">
                  <p>
                    This rule was created with multiple quantity bands. Editing
                    it here updates only the first band as a flat wholesale
                    discount. To manage quantity breaks, use the Volume Pricing
                    area instead.
                  </p>
                </Banner>
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
                        Internal label for this rule + active/draft toggle.
                        Draft rules are kept for history but don&apos;t apply
                        at checkout.
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

              {/* ----- Danger zone ----- */}
              <Card>
                <BlockStack gap="300">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2" tone="critical">
                      Danger zone
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Deleting removes this rule permanently. To keep history
                      instead, toggle the rule to Draft using the Status switch
                      at the top of the form.
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
 * One target picked from the Resource Picker. Mirrors the type in
 * app.pricing.new.tsx — kept duplicated (not in a shared module) so
 * each route remains self-contained.
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
 * Status toggle styled as a Shopify-admin switch. Polaris doesn't ship
 * a first-class "switch" component in v12; we use a button with
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
