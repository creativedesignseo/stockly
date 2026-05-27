/**
 * Admin route: create a new tier.
 *
 * URL: /app/tiers/new
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import {
  Page,
  Card,
  FormLayout,
  TextField,
  Select,
  Button,
  Banner,
  BlockStack,
  Text,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { useState } from "react";

import { authenticateAdmin } from "../lib/auth.server";
import { syncTiersToFunction } from "../services/discount-function-sync.server";
import {
  createTier,
  type TierAggregation,
  type TierScope,
} from "../services/tiers.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticateAdmin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, shop } = await authenticateAdmin(request);
  const form = await request.formData();

  const name = (form.get("name") ?? "").toString().trim();
  const scope = (form.get("scope") ?? "all").toString() as TierScope;
  const scopeId = (form.get("scopeId") ?? "").toString().trim() || null;
  const minQtyStr = (form.get("minQty") ?? "").toString();
  const discountPctStr = (form.get("discountPct") ?? "").toString();
  const aggregation = (form.get("aggregation") ?? "per_line").toString() as TierAggregation;

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Name is required";
  if (!["product", "variant", "collection", "all"].includes(scope))
    errors.scope = "Invalid scope";
  if (scope !== "all" && !scopeId)
    errors.scopeId = "Scope ID is required for product/variant/collection tiers";
  if (!["per_line", "cart_total"].includes(aggregation))
    errors.aggregation = "Invalid aggregation mode";

  // Variant tiers require cart_total to be 'per_line' — cart-total
  // aggregation on a single-variant scope makes no business sense
  // (it'd mean "match this exact variant 10+ times in cart" which
  // is identical to per_line anyway).
  if (scope === "variant" && aggregation === "cart_total") {
    errors.aggregation = "Variant tiers must use per-line aggregation.";
  }

  const minQty = Number(minQtyStr);
  if (!Number.isInteger(minQty) || minQty < 1)
    errors.minQty = "Minimum quantity must be a positive integer";

  const discountPct = Number(discountPctStr);
  if (Number.isNaN(discountPct) || discountPct < 0 || discountPct > 100)
    errors.discountPct = "Discount must be between 0 and 100";

  if (Object.keys(errors).length > 0) {
    return {
      errors,
      values: { name, scope, scopeId, minQtyStr, discountPctStr, aggregation },
    };
  }

  await createTier({
    shopId: shop.id,
    name,
    scope,
    scopeId,
    minQty,
    discountPct,
    aggregation,
  });

  // Sync to the Shopify Discount Function so checkout enforces it.
  // Best-effort: errors are logged, not thrown — DB save is canonical.
  await syncTiersToFunction(admin, shop.id);

  return redirect("/app/tiers");
};

export default function NewTier() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const shopify = useAppBridge();

  const [name, setName] = useState<string>(actionData?.values?.name ?? "");
  const [scope, setScope] = useState<TierScope>(
    (actionData?.values?.scope as TierScope) ?? "all",
  );
  const [scopeId, setScopeId] = useState<string>(
    actionData?.values?.scopeId ?? "",
  );
  // Cached human-readable label for the picked resource, shown as
  // helpText next to the (machine-readable) GID. Resets when scope
  // changes — a Product GID is meaningless if the merchant switches
  // to Collection scope.
  const [scopeLabel, setScopeLabel] = useState<string>("");

  // Resource Picker (P1-1). Replaces the awkward "paste a GID
  // manually" UX with Shopify's native picker modal: search,
  // browse, click. Returns the canonical GID. Cancel = no-op.
  const openResourcePicker = async () => {
    if (scope === "all") return;
    const result = await shopify.resourcePicker({
      type: scope, // 'product' | 'variant' | 'collection' all map 1:1
      multiple: false,
      filter: { archived: false, draft: false },
    });
    if (!result || result.length === 0) return;
    const picked = result[0] as { id: string; title?: string };
    setScopeId(picked.id);
    setScopeLabel(picked.title ?? "");
  };
  const [minQty, setMinQty] = useState<string>(
    actionData?.values?.minQtyStr ?? "",
  );
  const [discountPct, setDiscountPct] = useState<string>(
    actionData?.values?.discountPctStr ?? "",
  );
  const [aggregation, setAggregation] = useState<TierAggregation>(
    (actionData?.values?.aggregation as TierAggregation) ?? "per_line",
  );

  const errors = actionData?.errors ?? {};

  return (
    <Page backAction={{ content: "Tiers", url: "/app/tiers" }}>
      <TitleBar title="New tier" />
      <Card>
        <Form method="post">
          <FormLayout>
            {Object.keys(errors).length > 0 && (
              <Banner tone="critical" title="Please fix the errors below" />
            )}

            <TextField
              label="Name (internal label for this tier)"
              name="name"
              autoComplete="off"
              value={name}
              onChange={setName}
              error={errors.name}
              helpText="Internal label for this tier (e.g. 'Wholesale tier 1')."
              requiredIndicator
            />

            <Select
              label="Applies to (which products this tier discounts)"
              name="scope"
              value={scope}
              onChange={(v) => setScope(v as TierScope)}
              options={[
                { label: "All products in the shop", value: "all" },
                { label: "A specific product", value: "product" },
                {
                  label: "A specific variant (e.g. size XL, color blue)",
                  value: "variant",
                },
                { label: "All products in a collection", value: "collection" },
              ]}
              helpText={
                scope === "variant"
                  ? "Use this for statement pieces or oversized items that have their own wholesale pricing distinct from the parent product."
                  : scope === "collection"
                    ? "Note: collection-scoped tiers display in the storefront and apply at the storefront calculator, but at checkout the Discount Function falls back to baseline only. Use product or variant scope for checkout-enforced tiers."
                    : undefined
              }
            />

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
                  // If the merchant manually edits the GID, clear the
                  // cached picker label so we don't show stale info.
                  if (v !== scopeId) setScopeLabel("");
                }}
                error={errors.scopeId}
                helpText={
                  scopeLabel
                    ? `Selected: ${scopeLabel}`
                    : scope === "product"
                      ? "Click Browse to pick a product, or paste a GID like gid://shopify/Product/123"
                      : scope === "variant"
                        ? "Click Browse to pick a variant, or paste a GID like gid://shopify/ProductVariant/987"
                        : "Click Browse to pick a collection, or paste a GID like gid://shopify/Collection/987"
                }
                connectedRight={
                  <Button onClick={openResourcePicker}>Browse…</Button>
                }
                requiredIndicator
              />
            )}

            <Select
              label="Aggregation (how minimum is counted)"
              name="aggregation"
              value={aggregation}
              onChange={(v) => setAggregation(v as TierAggregation)}
              options={[
                {
                  label: "Per line — each product must meet the minimum on its own",
                  value: "per_line",
                },
                {
                  label: "Cart total — sum across all cart products (assortment OK)",
                  value: "cart_total",
                },
              ]}
              helpText="Per line: customer must buy 10 of THIS product to trigger the tier. Cart total: customer can mix 1 of each product, as long as the order totals 10 pieces."
            />

            <FormLayout.Group>
              <TextField
                label="Minimum quantity (threshold to activate tier)"
                name="minQty"
                type="number"
                min={1}
                autoComplete="off"
                value={minQty}
                onChange={setMinQty}
                error={errors.minQty}
                helpText="Buyer must order at least this many units."
                requiredIndicator
              />
              <TextField
                label="Discount % (off the base price, in addition to baseline)"
                name="discountPct"
                type="number"
                min={0}
                max={100}
                step={0.1}
                autoComplete="off"
                value={discountPct}
                onChange={setDiscountPct}
                error={errors.discountPct}
                helpText="0–100. Applied to the base price."
                requiredIndicator
              />
            </FormLayout.Group>

            <BlockStack inlineAlign="end">
              <Button submit variant="primary" loading={submitting}>
                Create tier
              </Button>
            </BlockStack>

            <Text as="p" variant="bodySm" tone="subdued">
              Sprint 1 note: scope IDs are entered manually. A product/collection
              picker will land in Sprint 2.
            </Text>
          </FormLayout>
        </Form>
      </Card>
    </Page>
  );
}
