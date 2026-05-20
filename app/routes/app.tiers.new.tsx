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
import { TitleBar } from "@shopify/app-bridge-react";
import { useState } from "react";

import { authenticateAdmin } from "../lib/auth.server";
import { createTier, type TierScope } from "../services/tiers.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticateAdmin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticateAdmin(request);
  const form = await request.formData();

  const name = (form.get("name") ?? "").toString().trim();
  const scope = (form.get("scope") ?? "all").toString() as TierScope;
  const scopeId = (form.get("scopeId") ?? "").toString().trim() || null;
  const minQtyStr = (form.get("minQty") ?? "").toString();
  const discountPctStr = (form.get("discountPct") ?? "").toString();

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Name is required";
  if (!["product", "collection", "all"].includes(scope))
    errors.scope = "Invalid scope";
  if (scope !== "all" && !scopeId)
    errors.scopeId = "Scope ID is required for product/collection tiers";

  const minQty = Number(minQtyStr);
  if (!Number.isInteger(minQty) || minQty < 1)
    errors.minQty = "Minimum quantity must be a positive integer";

  const discountPct = Number(discountPctStr);
  if (Number.isNaN(discountPct) || discountPct < 0 || discountPct > 100)
    errors.discountPct = "Discount must be between 0 and 100";

  if (Object.keys(errors).length > 0) {
    return { errors, values: { name, scope, scopeId, minQtyStr, discountPctStr } };
  }

  await createTier({
    shopId: shop.id,
    name,
    scope,
    scopeId,
    minQty,
    discountPct,
  });

  return redirect("/app/tiers");
};

export default function NewTier() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  const [name, setName] = useState<string>(actionData?.values?.name ?? "");
  const [scope, setScope] = useState<TierScope>(
    (actionData?.values?.scope as TierScope) ?? "all",
  );
  const [scopeId, setScopeId] = useState<string>(
    actionData?.values?.scopeId ?? "",
  );
  const [minQty, setMinQty] = useState<string>(
    actionData?.values?.minQtyStr ?? "",
  );
  const [discountPct, setDiscountPct] = useState<string>(
    actionData?.values?.discountPctStr ?? "",
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
              label="Name"
              name="name"
              autoComplete="off"
              value={name}
              onChange={setName}
              error={errors.name}
              helpText="Internal label for this tier (e.g. 'Wholesale tier 1')."
              requiredIndicator
            />

            <Select
              label="Applies to"
              name="scope"
              value={scope}
              onChange={(v) => setScope(v as TierScope)}
              options={[
                { label: "All products in the shop", value: "all" },
                { label: "A specific product", value: "product" },
                { label: "All products in a collection", value: "collection" },
              ]}
            />

            {scope !== "all" && (
              <TextField
                label={
                  scope === "product"
                    ? "Product ID (Shopify GID)"
                    : "Collection ID (Shopify GID)"
                }
                name="scopeId"
                autoComplete="off"
                value={scopeId}
                onChange={setScopeId}
                error={errors.scopeId}
                helpText={
                  scope === "product"
                    ? "e.g. gid://shopify/Product/123456789"
                    : "e.g. gid://shopify/Collection/987654321"
                }
                requiredIndicator
              />
            )}

            <FormLayout.Group>
              <TextField
                label="Minimum quantity"
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
                label="Discount %"
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
