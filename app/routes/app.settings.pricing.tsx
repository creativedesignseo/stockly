/**
 * Admin route: shop-wide pricing settings — baseline + FPQ + MOQ.
 *
 * URL: /app/settings/pricing
 *
 * Reached from /app/pricing → top-right "Settings" secondary action.
 * Edits the shop-wide knobs that affect every wholesale rule:
 *   1. Wholesale baseline % (ADR-006) — universal off-retail layer
 *      composed multiplicatively with every Tier's discount.
 *   2. First-Purchase Qualifier (ADR-004) — gate a wholesale-tagged
 *      customer must meet on their first paid order before the
 *      Discount Function applies on subsequent visits.
 *   3. Post-qualification MOQ — minimum units per order after the
 *      customer is qualified.
 *
 * UI rewrite 2026-05-27 (Sami pattern, matching the rest of /app/pricing
 * forms): sections in Cards, sticky App-Bridge SaveBar at the top
 * (replaces the bottom Save button), live Settings summary sidebar
 * with the current setup mirrored on the right.
 *
 * On save: persist to Shop + trigger syncTiersToFunction so the
 * checkout metafield reflects the new values immediately.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import {
  Page,
  Layout,
  Card,
  TextField,
  Banner,
  BlockStack,
  InlineStack,
  Text,
  RadioButton,
  Divider,
  Box,
  InlineGrid,
  Select,
} from "@shopify/polaris";
import { SaveBar, TitleBar, useAppBridge } from "@shopify/app-bridge-react";

import { authenticateAdmin } from "../lib/auth.server";
import prisma from "../db.server";
import { syncTiersToFunction } from "../services/discount-function-sync.server";

type FpqMode = "none" | "amount" | "quantity" | "combined";
type FpqCombinedLogic = "and" | "or";

/* -------------------------------------------------------------------------- */
/*                                  LOADER                                    */
/* -------------------------------------------------------------------------- */

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await authenticateAdmin(request);
  return json({ shop });
};

/* -------------------------------------------------------------------------- */
/*                                  ACTION                                    */
/* -------------------------------------------------------------------------- */

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

  const fpqAmount = fpqAmountRaw === "" ? null : Number(fpqAmountRaw);
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
    return json({
      errors,
      values: {
        wholesaleBaselinePct: baselineRaw,
        fpqMode,
        fpqAmount: fpqAmountRaw,
        fpqQuantity: fpqQuantityRaw,
        fpqCombinedLogic,
        postQualificationMOQ: postQualificationMOQRaw,
      },
    });
  }

  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      wholesaleBaselinePct: baseline,
      fpqMode,
      fpqAmount:
        fpqMode === "none" || fpqMode === "quantity" ? null : fpqAmount,
      fpqQuantity:
        fpqMode === "none" || fpqMode === "amount" ? null : fpqQuantity,
      fpqCombinedLogic,
      postQualificationMOQ,
    },
  });

  try {
    await syncTiersToFunction(admin, shop.id);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[settings.pricing] syncTiersToFunction failed:", err);
  }

  return json({ ok: true } as const);
};

/* -------------------------------------------------------------------------- */
/*                                    UI                                      */
/* -------------------------------------------------------------------------- */

const FPQ_MODES: Array<{
  value: FpqMode;
  title: string;
  description: string;
}> = [
  {
    value: "none",
    title: "Disabled",
    description:
      "Wholesale customers pay wholesale from order #1. No gate.",
  },
  {
    value: "amount",
    title: "Amount threshold",
    description:
      "First order subtotal must reach a € threshold to qualify.",
  },
  {
    value: "quantity",
    title: "Quantity threshold",
    description:
      "First order must include at least N units to qualify.",
  },
  {
    value: "combined",
    title: "Both (AND / OR)",
    description:
      "Combine amount + quantity with AND or OR. Most strict.",
  },
];

export default function PricingSettings() {
  const { shop } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const shopify = useAppBridge();

  const errors =
    actionData && "errors" in actionData ? actionData.errors : {};

  /* ----- form state ----- */
  const [baseline, setBaseline] = useState<string>(
    (actionData && "values" in actionData
      ? actionData.values.wholesaleBaselinePct
      : null) ?? String(shop.wholesaleBaselinePct),
  );
  const [fpqMode, setFpqMode] = useState<FpqMode>(
    ((actionData && "values" in actionData
      ? actionData.values.fpqMode
      : null) as FpqMode | null) ?? (shop.fpqMode as FpqMode),
  );
  const [fpqAmount, setFpqAmount] = useState<string>(
    (actionData && "values" in actionData
      ? actionData.values.fpqAmount
      : null) ??
      (shop.fpqAmount != null ? String(shop.fpqAmount) : ""),
  );
  const [fpqQuantity, setFpqQuantity] = useState<string>(
    (actionData && "values" in actionData
      ? actionData.values.fpqQuantity
      : null) ??
      (shop.fpqQuantity != null ? String(shop.fpqQuantity) : ""),
  );
  const [fpqCombinedLogic, setFpqCombinedLogic] =
    useState<FpqCombinedLogic>(
      ((actionData && "values" in actionData
        ? actionData.values.fpqCombinedLogic
        : null) as FpqCombinedLogic | null) ??
        (shop.fpqCombinedLogic as FpqCombinedLogic),
    );
  const [postQualificationMOQ, setPostQualificationMOQ] = useState<string>(
    (actionData && "values" in actionData
      ? actionData.values.postQualificationMOQ
      : null) ?? String(shop.postQualificationMOQ),
  );

  /* ----- SaveBar (sticky top via App Bridge) ----- */
  const initial = {
    baseline: String(shop.wholesaleBaselinePct),
    fpqMode: shop.fpqMode as FpqMode,
    fpqAmount: shop.fpqAmount != null ? String(shop.fpqAmount) : "",
    fpqQuantity: shop.fpqQuantity != null ? String(shop.fpqQuantity) : "",
    fpqCombinedLogic: shop.fpqCombinedLogic as FpqCombinedLogic,
    postQualificationMOQ: String(shop.postQualificationMOQ),
  };
  const isDirty =
    baseline !== initial.baseline ||
    fpqMode !== initial.fpqMode ||
    fpqAmount !== initial.fpqAmount ||
    fpqQuantity !== initial.fpqQuantity ||
    fpqCombinedLogic !== initial.fpqCombinedLogic ||
    postQualificationMOQ !== initial.postQualificationMOQ;

  const SAVE_BAR_ID = "settings-pricing-save-bar";
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
    setBaseline(initial.baseline);
    setFpqMode(initial.fpqMode);
    setFpqAmount(initial.fpqAmount);
    setFpqQuantity(initial.fpqQuantity);
    setFpqCombinedLogic(initial.fpqCombinedLogic);
    setPostQualificationMOQ(initial.postQualificationMOQ);
  };

  /* ----- summary strings ----- */
  const baselineSummary =
    Number(baseline) > 0 ? `${baseline}% off retail` : "Disabled";

  const fpqSummary = (() => {
    if (fpqMode === "none") return "Disabled";
    if (fpqMode === "amount")
      return `First order ≥ €${fpqAmount || "?"}`;
    if (fpqMode === "quantity")
      return `First order ≥ ${fpqQuantity || "?"} units`;
    return `€${fpqAmount || "?"} ${fpqCombinedLogic.toUpperCase()} ${fpqQuantity || "?"} units`;
  })();

  const moqSummary =
    Number(postQualificationMOQ) > 1
      ? `${postQualificationMOQ} units/order`
      : "No minimum";

  return (
    <Page
      backAction={{ content: "Wholesale pricing", url: "/app/pricing" }}
    >
      <TitleBar title="Pricing settings" />
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
        {/* Hidden inputs for state-driven (non-input) fields */}
        <input type="hidden" name="fpqMode" value={fpqMode} />
        <input type="hidden" name="fpqCombinedLogic" value={fpqCombinedLogic} />

        <Layout>
          {/* ===================== Main column ===================== */}
          <Layout.Section>
            <BlockStack gap="400">
              {Object.keys(errors).length > 0 && (
                <Banner tone="critical" title="Please fix the errors below" />
              )}
              {actionData && "ok" in actionData && actionData.ok && (
                <Banner tone="success" title="Settings saved">
                  <p>
                    Discount Function metafield re-synced. Checkout will
                    apply the new values on the next cart.
                  </p>
                </Banner>
              )}

              {/* ----- Wholesale baseline ----- */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">
                      Wholesale baseline
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Universal % off retail applied to every customer with
                      the &quot;{shop.wholesaleTag}&quot; tag. Volume pricing
                      rules stack on top multiplicatively (e.g. baseline 60%
                      + rule 10% off = customer pays 36% of retail).
                    </Text>
                  </BlockStack>
                  <TextField
                    label="Baseline percent off retail"
                    name="wholesaleBaselinePct"
                    type="number"
                    min={0}
                    max={100}
                    autoComplete="off"
                    value={baseline}
                    onChange={setBaseline}
                    error={errors.wholesaleBaselinePct}
                    suffix="%"
                    helpText="0 = no baseline (only volume rules apply). 60 = wholesale customers see 60% off retail."
                    requiredIndicator
                  />
                </BlockStack>
              </Card>

              {/* ----- First-Purchase Qualifier (FPQ) ----- */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">
                      First-Purchase Qualifier (FPQ)
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Optional gate on a wholesale customer&apos;s FIRST paid
                      order. Until they clear it, the Discount Function does
                      not apply. After their first qualifying order they buy
                      freely.
                    </Text>
                  </BlockStack>

                  <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                    {FPQ_MODES.map((opt) => (
                      <ChoiceCard
                        key={opt.value}
                        selected={fpqMode === opt.value}
                        onSelect={() => setFpqMode(opt.value)}
                        title={opt.title}
                        description={opt.description}
                      />
                    ))}
                  </InlineGrid>

                  {(fpqMode === "amount" || fpqMode === "combined") && (
                    <TextField
                      label="Minimum amount (first order subtotal)"
                      name="fpqAmount"
                      type="number"
                      min={0}
                      step={0.01}
                      autoComplete="off"
                      value={fpqAmount}
                      onChange={setFpqAmount}
                      error={errors.fpqAmount}
                      prefix="€"
                      helpText="First order's subtotal must be at least this much."
                      requiredIndicator
                    />
                  )}

                  {(fpqMode === "quantity" || fpqMode === "combined") && (
                    <TextField
                      label="Minimum quantity (first order units)"
                      name="fpqQuantity"
                      type="number"
                      min={1}
                      autoComplete="off"
                      value={fpqQuantity}
                      onChange={setFpqQuantity}
                      error={errors.fpqQuantity}
                      suffix="units"
                      helpText="First order must include at least this many units."
                      requiredIndicator
                    />
                  )}

                  {fpqMode === "combined" && (
                    <Select
                      label="How amount and quantity combine"
                      options={[
                        { label: "AND — both must be met", value: "and" },
                        { label: "OR — either is enough", value: "or" },
                      ]}
                      value={fpqCombinedLogic}
                      onChange={(v) =>
                        setFpqCombinedLogic(v as FpqCombinedLogic)
                      }
                    />
                  )}
                </BlockStack>
              </Card>

              {/* ----- Post-qualification MOQ ----- */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">
                      Post-qualification MOQ
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Minimum units per order AFTER the customer is
                      qualified. Use 1 to let qualified customers buy any
                      quantity.
                    </Text>
                  </BlockStack>
                  <TextField
                    label="Minimum units per order"
                    name="postQualificationMOQ"
                    type="number"
                    min={1}
                    autoComplete="off"
                    value={postQualificationMOQ}
                    onChange={setPostQualificationMOQ}
                    error={errors.postQualificationMOQ}
                    suffix="units"
                    helpText="1 = no minimum (default)."
                    requiredIndicator
                  />
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
                      Settings summary
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Current setup
                    </Text>
                  </BlockStack>
                  <Divider />
                  <SummaryRow label="Baseline" value={baselineSummary} />
                  <SummaryRow label="FPQ" value={fpqSummary} />
                  <SummaryRow label="MOQ" value={moqSummary} />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <BlockStack gap="050">
                    <Text variant="headingMd" as="h3">
                      Customer journey
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      What a new wholesale customer experiences:
                    </Text>
                  </BlockStack>
                  <Divider />
                  <JourneyStep
                    n={1}
                    title="Registers + gets approved"
                    body={`Tagged "${shop.wholesaleTag}" in Shopify, added to the eligibility list.`}
                  />
                  <JourneyStep
                    n={2}
                    title={
                      fpqMode === "none"
                        ? "Sees wholesale from order #1"
                        : "Pays retail on first order"
                    }
                    body={
                      fpqMode === "none"
                        ? "Discount Function applies the baseline + any matching pricing rule immediately."
                        : `Until they clear the FPQ gate (${fpqSummary.toLowerCase()}), the cart shows retail prices.`
                    }
                  />
                  {fpqMode !== "none" && (
                    <JourneyStep
                      n={3}
                      title="After first qualifying order"
                      body="Stockly marks them qualified. From here on, every cart pays wholesale + rules apply."
                    />
                  )}
                  {Number(postQualificationMOQ) > 1 && (
                    <JourneyStep
                      n={fpqMode === "none" ? 3 : 4}
                      title="MOQ enforced"
                      body={`Every subsequent order must include at least ${postQualificationMOQ} units.`}
                    />
                  )}
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
}: {
  label: string;
  value: string;
}) {
  return (
    <InlineStack align="space-between" blockAlign="start" wrap={false}>
      <Text variant="bodySm" as="span" tone="subdued">
        {label}
      </Text>
      <Box maxWidth="60%">
        <Text variant="bodySm" as="span" fontWeight="semibold">
          {value}
        </Text>
      </Box>
    </InlineStack>
  );
}

function JourneyStep({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: string;
}) {
  return (
    <InlineStack gap="200" align="start" blockAlign="start" wrap={false}>
      <Box
        background="bg-fill-emphasis"
        padding="100"
        borderRadius="full"
        minWidth="28px"
      >
        <Box minHeight="20px" minWidth="20px">
          <Text
            as="span"
            variant="bodySm"
            fontWeight="bold"
            tone="text-inverse"
            alignment="center"
          >
            {n}
          </Text>
        </Box>
      </Box>
      <BlockStack gap="050">
        <Text as="span" variant="bodyMd" fontWeight="semibold">
          {title}
        </Text>
        <Text as="span" variant="bodySm" tone="subdued">
          {body}
        </Text>
      </BlockStack>
    </InlineStack>
  );
}
