/**
 * Admin route: edit or delete a single tier.
 *
 * URL: /app/tiers/:id
 *
 * Action intents:
 *   - intent=update  → validate + updateTier
 *   - intent=delete  → deleteTier (hard delete; soft-delete via active=false
 *                      is available through the "Active" toggle on update)
 *
 * Tier ownership is enforced via getTier(id, shopId) — a customer of shop A
 * can never read or mutate shop B's tiers, even with a crafted URL.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
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
  Checkbox,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState } from "react";

import { authenticateAdmin } from "../lib/auth.server";
import { syncTiersToFunction } from "../services/discount-function-sync.server";
import {
  deleteTier,
  getTier,
  updateTier,
  type TierScope,
} from "../services/tiers.server";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { shop } = await authenticateAdmin(request);
  const id = params.id;
  if (!id) throw new Response("Tier id is required", { status: 400 });

  const tier = await getTier(id, shop.id);
  if (!tier) throw new Response("Tier not found", { status: 404 });

  return { tier };
};

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const { admin, shop } = await authenticateAdmin(request);
  const id = params.id;
  if (!id) throw new Response("Tier id is required", { status: 400 });

  // Re-verify ownership before any mutation — the action runs independently
  // of the loader and can be hit directly via fetch.
  const existing = await getTier(id, shop.id);
  if (!existing) throw new Response("Tier not found", { status: 404 });

  const form = await request.formData();
  const intent = (form.get("intent") ?? "").toString();

  if (intent === "delete") {
    await deleteTier(id);
    await syncTiersToFunction(admin, shop.id);
    return redirect("/app/tiers");
  }

  if (intent !== "update") {
    throw new Response(`Unknown form intent: ${intent}`, { status: 400 });
  }

  const name = (form.get("name") ?? "").toString().trim();
  const scope = (form.get("scope") ?? "all").toString() as TierScope;
  const scopeId = (form.get("scopeId") ?? "").toString().trim() || null;
  const minQtyStr = (form.get("minQty") ?? "").toString();
  const discountPctStr = (form.get("discountPct") ?? "").toString();
  const active = form.get("active") === "on";

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
    return {
      errors,
      values: { name, scope, scopeId, minQtyStr, discountPctStr, active },
    };
  }

  await updateTier(id, {
    name,
    scope,
    scopeId: scope === "all" ? null : scopeId,
    minQty,
    discountPct,
    active,
  });

  await syncTiersToFunction(admin, shop.id);

  return redirect("/app/tiers");
};

export default function EditTier() {
  const { tier } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const intent = navigation.formData?.get("intent");
  const updating = navigation.state === "submitting" && intent === "update";
  const deleting = navigation.state === "submitting" && intent === "delete";

  const [name, setName] = useState<string>(
    actionData?.values?.name ?? tier.name,
  );
  const [scope, setScope] = useState<TierScope>(
    (actionData?.values?.scope as TierScope) ?? (tier.scope as TierScope),
  );
  const [scopeId, setScopeId] = useState<string>(
    actionData?.values?.scopeId ?? tier.scopeId ?? "",
  );
  const [minQty, setMinQty] = useState<string>(
    actionData?.values?.minQtyStr ?? String(tier.minQty),
  );
  const [discountPct, setDiscountPct] = useState<string>(
    actionData?.values?.discountPctStr ?? String(tier.discountPct),
  );
  const [active, setActive] = useState<boolean>(
    actionData?.values?.active ?? tier.active,
  );

  const errors = actionData?.errors ?? {};

  const onDelete = (e: React.FormEvent<HTMLFormElement>) => {
    if (
      !window.confirm(
        `Delete tier "${tier.name}"? This cannot be undone. To keep history, uncheck "Active" instead.`,
      )
    ) {
      e.preventDefault();
    }
  };

  return (
    <Page backAction={{ content: "Tiers", url: "/app/tiers" }}>
      <TitleBar title={`Edit: ${tier.name}`} />
      <BlockStack gap="400">
        <Card>
          <Form method="post">
            <input type="hidden" name="intent" value="update" />
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
                  {
                    label: "All products in a collection",
                    value: "collection",
                  },
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

              {/*
                Polaris Checkbox is a controlled React component that does
                not always include its underlying input in the submitted
                form data (the `name` prop is for accessibility, not form
                serialization). We mirror its state into a hidden input
                with the canonical "on" / "" value so the action's
                `form.get("active") === "on"` check is reliable.
              */}
              <Checkbox
                label="Active"
                checked={active}
                onChange={setActive}
                helpText="Inactive tiers are kept for history but no longer apply at checkout."
              />
              <input type="hidden" name="active" value={active ? "on" : ""} />

              <InlineStack align="end">
                <Button submit variant="primary" loading={updating}>
                  Save changes
                </Button>
              </InlineStack>
            </FormLayout>
          </Form>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Danger zone
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              Deleting a tier removes it permanently. If you might want it
              back later, uncheck &quot;Active&quot; on the form above
              instead — that keeps the tier on record without applying it.
            </Text>
            <Form method="post" onSubmit={onDelete}>
              <input type="hidden" name="intent" value="delete" />
              <InlineStack align="start">
                <Button submit tone="critical" loading={deleting}>
                  Delete tier
                </Button>
              </InlineStack>
            </Form>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
