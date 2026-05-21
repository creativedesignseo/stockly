/**
 * Admin route: configure wholesale pricing settings.
 *
 * URL: /app/settings/pricing
 *
 * v1 manages the wholesale baseline % (ADR-006). Future: per-collection
 * baseline overrides, multi-currency baselines, etc.
 *
 * On save we trigger the Discount Function sync so the new baseline
 * propagates to the metafield the Function reads at checkout.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Page,
  Card,
  FormLayout,
  TextField,
  Button,
  Banner,
  BlockStack,
  Text,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState } from "react";

import { authenticateAdmin } from "../lib/auth.server";
import prisma from "../db.server";
import { syncTiersToFunction } from "../services/discount-function-sync.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await authenticateAdmin(request);
  return { shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, shop } = await authenticateAdmin(request);
  const form = await request.formData();

  const baselineRaw = (form.get("wholesaleBaselinePct") ?? "").toString();
  const baseline = Number(baselineRaw);

  const errors: Record<string, string> = {};
  if (
    !Number.isInteger(baseline) ||
    baseline < 0 ||
    baseline > 100
  ) {
    errors.wholesaleBaselinePct =
      "Baseline must be a whole number between 0 and 100";
  }

  if (Object.keys(errors).length > 0) {
    return { errors, values: { wholesaleBaselinePct: baselineRaw } };
  }

  await prisma.shop.update({
    where: { id: shop.id },
    data: { wholesaleBaselinePct: baseline },
  });

  // Propagate to the Discount Function metafield so cart and checkout
  // immediately reflect the new baseline.
  await syncTiersToFunction(admin, shop.id);

  return { ok: true, savedValue: baseline };
};

export default function PricingSettings() {
  const { shop } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  // Narrow the discriminated union returned by the action: either
  // { errors, values } (validation failed) or { ok, savedValue }.
  const errors =
    actionData && "errors" in actionData ? actionData.errors : {};
  const savedValue =
    actionData && "ok" in actionData ? actionData.savedValue : null;
  const previousInputValue =
    actionData && "values" in actionData
      ? actionData.values.wholesaleBaselinePct
      : null;

  const [baseline, setBaseline] = useState<string>(
    previousInputValue ?? String(shop.wholesaleBaselinePct ?? 0),
  );

  return (
    <Page backAction={{ content: "App", url: "/app" }}>
      <TitleBar title="Pricing settings" />
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Wholesale baseline (universal B2B discount)
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              The universal discount % applied to retail prices for any
              wholesale-approved customer. Volume tiers (qty-based extra
              discounts) stack on top of this baseline multiplicatively.
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              Example: with baseline 65 and a 10% tier at qty 10+, a €100
              retail product sells for €31.50 to a wholesale customer at
              qty 10 (100 × 0.35 × 0.90).
            </Text>
          </BlockStack>
        </Card>

        <Card>
          <Form method="post">
            <FormLayout>
              {savedValue !== null && (
                <Banner tone="success">
                  Pricing saved. Wholesale baseline is now {savedValue}%.
                </Banner>
              )}
              {Object.keys(errors).length > 0 && (
                <Banner tone="critical" title="Please fix the errors below" />
              )}

              <TextField
                label="Wholesale baseline % (off retail for any approved B2B customer)"
                name="wholesaleBaselinePct"
                type="number"
                min={0}
                max={100}
                step={1}
                autoComplete="off"
                value={baseline}
                onChange={setBaseline}
                error={errors.wholesaleBaselinePct}
                helpText="0 = no baseline (wholesale customers see retail; only tiers apply). 65 = wholesale customers see 65% off retail."
                requiredIndicator
              />

              <InlineStack align="end">
                <Button submit variant="primary" loading={submitting}>
                  Save changes
                </Button>
              </InlineStack>
            </FormLayout>
          </Form>
        </Card>
      </BlockStack>
    </Page>
  );
}
