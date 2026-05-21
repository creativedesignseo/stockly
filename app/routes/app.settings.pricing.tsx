/**
 * Admin route: configure wholesale pricing + FPQ.
 *
 * URL: /app/settings/pricing
 *
 * Two configuration blocks:
 *   1. Wholesale baseline % (ADR-006) — universal off-retail layer
 *   2. First-Purchase Qualifier (ADR-004) — the gate a wholesale
 *      customer must meet on their first paid order before they buy
 *      freely from then on
 *
 * On save we trigger the Discount Function sync so the new config
 * propagates to the metafield the Function reads at checkout.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
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
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState } from "react";

import { authenticateAdmin } from "../lib/auth.server";
import prisma from "../db.server";
import { syncTiersToFunction } from "../services/discount-function-sync.server";

type FpqMode = "none" | "amount" | "quantity" | "combined";
type FpqCombinedLogic = "and" | "or";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await authenticateAdmin(request);
  return { shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, shop } = await authenticateAdmin(request);
  const form = await request.formData();

  const baselineRaw = (form.get("wholesaleBaselinePct") ?? "").toString();
  const baseline = Number(baselineRaw);

  const fpqMode = (form.get("fpqMode") ?? "none").toString() as FpqMode;
  const fpqAmountRaw = (form.get("fpqAmount") ?? "").toString();
  const fpqQuantityRaw = (form.get("fpqQuantity") ?? "").toString();
  const fpqCombinedLogic = (form.get("fpqCombinedLogic") ?? "and").toString() as FpqCombinedLogic;
  const postQualificationMOQRaw = (form.get("postQualificationMOQ") ?? "1").toString();

  const errors: Record<string, string> = {};

  if (!Number.isInteger(baseline) || baseline < 0 || baseline > 100) {
    errors.wholesaleBaselinePct =
      "Baseline must be a whole number between 0 and 100";
  }
  if (!["none", "amount", "quantity", "combined"].includes(fpqMode)) {
    errors.fpqMode = "Invalid FPQ mode";
  }
  if (!["and", "or"].includes(fpqCombinedLogic)) {
    errors.fpqCombinedLogic = "Invalid combined logic";
  }

  const fpqAmount =
    fpqAmountRaw === "" ? null : Number(fpqAmountRaw);
  if (
    (fpqMode === "amount" || fpqMode === "combined") &&
    (fpqAmount === null || Number.isNaN(fpqAmount) || fpqAmount <= 0)
  ) {
    errors.fpqAmount =
      "Amount is required and must be positive when mode is amount or combined";
  }

  const fpqQuantity =
    fpqQuantityRaw === "" ? null : Number(fpqQuantityRaw);
  if (
    (fpqMode === "quantity" || fpqMode === "combined") &&
    (fpqQuantity === null ||
      !Number.isInteger(fpqQuantity) ||
      fpqQuantity <= 0)
  ) {
    errors.fpqQuantity =
      "Quantity is required and must be a positive integer when mode is quantity or combined";
  }

  const postQualificationMOQ = Number(postQualificationMOQRaw);
  if (
    !Number.isInteger(postQualificationMOQ) ||
    postQualificationMOQ < 1
  ) {
    errors.postQualificationMOQ =
      "Post-qualification minimum must be a positive integer";
  }

  if (Object.keys(errors).length > 0) {
    return {
      errors,
      values: {
        wholesaleBaselinePct: baselineRaw,
        fpqMode,
        fpqAmount: fpqAmountRaw,
        fpqQuantity: fpqQuantityRaw,
        fpqCombinedLogic,
        postQualificationMOQ: postQualificationMOQRaw,
      },
    };
  }

  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      wholesaleBaselinePct: baseline,
      fpqMode,
      fpqAmount: fpqMode === "none" || fpqMode === "quantity" ? null : fpqAmount,
      fpqQuantity: fpqMode === "none" || fpqMode === "amount" ? null : fpqQuantity,
      fpqCombinedLogic,
      postQualificationMOQ,
    },
  });

  await syncTiersToFunction(admin, shop.id);

  return { ok: true };
};

export default function PricingSettings() {
  const { shop } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  const errors =
    actionData && "errors" in actionData ? actionData.errors : {};
  const saved = actionData && "ok" in actionData ? actionData.ok : false;
  const previousValues =
    actionData && "values" in actionData ? actionData.values : null;

  const [baseline, setBaseline] = useState<string>(
    previousValues?.wholesaleBaselinePct ??
      String(shop.wholesaleBaselinePct ?? 0),
  );
  const [fpqMode, setFpqMode] = useState<FpqMode>(
    (previousValues?.fpqMode as FpqMode) ??
      (shop.fpqMode as FpqMode) ??
      "none",
  );
  const [fpqAmount, setFpqAmount] = useState<string>(
    previousValues?.fpqAmount ??
      (shop.fpqAmount !== null && shop.fpqAmount !== undefined
        ? String(shop.fpqAmount)
        : ""),
  );
  const [fpqQuantity, setFpqQuantity] = useState<string>(
    previousValues?.fpqQuantity ??
      (shop.fpqQuantity !== null && shop.fpqQuantity !== undefined
        ? String(shop.fpqQuantity)
        : ""),
  );
  const [fpqCombinedLogic, setFpqCombinedLogic] = useState<FpqCombinedLogic>(
    (previousValues?.fpqCombinedLogic as FpqCombinedLogic) ??
      (shop.fpqCombinedLogic as FpqCombinedLogic) ??
      "and",
  );
  const [postQualificationMOQ, setPostQualificationMOQ] = useState<string>(
    previousValues?.postQualificationMOQ ??
      String(shop.postQualificationMOQ ?? 1),
  );

  const showAmount = fpqMode === "amount" || fpqMode === "combined";
  const showQuantity = fpqMode === "quantity" || fpqMode === "combined";
  const showCombinedLogic = fpqMode === "combined";

  return (
    <Page backAction={{ content: "App", url: "/app" }}>
      <TitleBar title="Pricing settings" />
      <BlockStack gap="400">
        {/* ----- Wholesale baseline (ADR-006) ----- */}
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

        <Form method="post">
          <BlockStack gap="400">
            <Card>
              <FormLayout>
                {saved && (
                  <Banner tone="success">
                    Pricing saved. Changes propagated to the Discount
                    Function (cart and checkout reflect them now).
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
              </FormLayout>
            </Card>

            {/* ----- FPQ (ADR-004) ----- */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  First-Purchase Qualifier (gate before wholesale access)
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Require approved wholesale customers to meet a minimum
                  on their FIRST paid order before they get unrestricted
                  wholesale pricing on every subsequent cart.
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Example: with mode &quot;amount&quot; and €500, a new
                  wholesale-tagged customer must spend ≥ €500 in their
                  first order to qualify. After that order, they buy
                  freely — no minimum on subsequent orders.
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <FormLayout>
                <Select
                  label="FPQ mode (how the first-order gate is evaluated)"
                  name="fpqMode"
                  value={fpqMode}
                  onChange={(v) => setFpqMode(v as FpqMode)}
                  options={[
                    {
                      label: "None — no first-order gate (every order gets wholesale pricing)",
                      value: "none",
                    },
                    {
                      label: "Amount — first order must reach a € threshold",
                      value: "amount",
                    },
                    {
                      label: "Quantity — first order must reach a unit count",
                      value: "quantity",
                    },
                    {
                      label: "Combined — first order must meet both amount AND/OR quantity",
                      value: "combined",
                    },
                  ]}
                  error={errors.fpqMode}
                  helpText="Once a customer's first paid order meets the rule, they are marked qualified and the gate doesn't apply again."
                />

                {showAmount && (
                  <TextField
                    label="Minimum amount (in shop currency, for first order)"
                    name="fpqAmount"
                    type="number"
                    min={0}
                    step={0.01}
                    autoComplete="off"
                    value={fpqAmount}
                    onChange={setFpqAmount}
                    error={errors.fpqAmount}
                    helpText="The first order's subtotal must be at least this much."
                    requiredIndicator
                  />
                )}

                {showQuantity && (
                  <TextField
                    label="Minimum quantity (units, for first order)"
                    name="fpqQuantity"
                    type="number"
                    min={1}
                    step={1}
                    autoComplete="off"
                    value={fpqQuantity}
                    onChange={setFpqQuantity}
                    error={errors.fpqQuantity}
                    helpText="The first order's total unit count must be at least this much."
                    requiredIndicator
                  />
                )}

                {showCombinedLogic && (
                  <Select
                    label="Combined logic (how amount and quantity combine)"
                    name="fpqCombinedLogic"
                    value={fpqCombinedLogic}
                    onChange={(v) => setFpqCombinedLogic(v as FpqCombinedLogic)}
                    options={[
                      { label: "AND — first order must meet BOTH amount and quantity", value: "and" },
                      { label: "OR — first order must meet EITHER amount or quantity", value: "or" },
                    ]}
                    error={errors.fpqCombinedLogic}
                  />
                )}

                <TextField
                  label="Post-qualification MOQ (minimum units per order after qualifying)"
                  name="postQualificationMOQ"
                  type="number"
                  min={1}
                  step={1}
                  autoComplete="off"
                  value={postQualificationMOQ}
                  onChange={setPostQualificationMOQ}
                  error={errors.postQualificationMOQ}
                  helpText="1 = no minimum after qualifying (customer buys freely)."
                  requiredIndicator
                />
              </FormLayout>
            </Card>

            <Card>
              <InlineStack align="end">
                <Button submit variant="primary" loading={submitting}>
                  Save changes
                </Button>
              </InlineStack>
            </Card>
          </BlockStack>
        </Form>
      </BlockStack>
    </Page>
  );
}
