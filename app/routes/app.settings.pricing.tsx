/**
 * Admin route: shop-wide pricing settings — baseline + FPQ +
 * post-qualification minimums.
 *
 * URL: /app/settings/pricing
 *
 * Reached from /app/pricing → top-right "Settings" secondary action.
 * Edits the shop-wide knobs that affect every wholesale rule:
 *   1. Wholesale baseline % (ADR-006) — universal off-retail layer
 *      composed multiplicatively with every Tier's discount.
 *   2. First-Purchase Qualifier (ADR-004) — gate a wholesale-tagged
 *      customer must meet on their FIRST paid order before the
 *      Discount Function applies on subsequent visits.
 *   3. Post-qualification minimums — the mirror gate for EVERY order
 *      after the customer is qualified. Same four modes as the FPQ
 *      (none / amount / quantity / combined), backed by
 *      postQualificationMode + postQualificationMinAmount +
 *      postQualificationMOQ + postQualificationCombinedLogic.
 *
 * UI rewrite 2026-05-27 (Sami pattern, matching the rest of /app/pricing
 * forms): sections in Cards, sticky App-Bridge SaveBar at the top
 * (replaces the bottom Save button), live Settings summary sidebar
 * with the current setup mirrored on the right.
 *
 * Currency (2026-08-11): every money label used to be a hardcoded "€".
 * The stored value is a bare number and checkout compares it against
 * the cart's real currency, so the behaviour was right and only the
 * LABEL lied (the pilot shop is USD). The shop's currencyCode now comes
 * from the Admin API in the loader; if that query fails we render the
 * amounts with no symbol at all rather than guessing.
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
import { currencySymbolFor, moneyFormatterFor } from "../lib/currency";
import { fetchShopCurrencyCode } from "../lib/currency.server";
import prisma from "../db.server";
import { syncTiersToFunction } from "../services/discount-function-sync.server";
import { syncOpeningOrderValidation } from "../services/opening-order-sync.server";

/**
 * Both gates (first-purchase and post-qualification) share the same
 * shape, so they share the same types.
 */
type GateMode = "none" | "amount" | "quantity" | "combined";
type GateCombinedLogic = "and" | "or";

const GATE_MODES: readonly GateMode[] = [
  "none",
  "amount",
  "quantity",
  "combined",
];
const GATE_LOGICS: readonly GateCombinedLogic[] = ["and", "or"];

/* -------------------------------------------------------------------------- */
/*                                  LOADER                                    */
/* -------------------------------------------------------------------------- */

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, shop } = await authenticateAdmin(request);
  const currencyCode = await fetchShopCurrencyCode(admin, "settings.pricing");
  return json({ shop, currencyCode });
};

/* -------------------------------------------------------------------------- */
/*                                  ACTION                                    */
/* -------------------------------------------------------------------------- */

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, shop } = await authenticateAdmin(request);
  const form = await request.formData();

  const baselineRaw = (form.get("wholesaleBaselinePct") ?? "").toString();
  const baseline = Number(baselineRaw);

  const fpqMode = (form.get("fpqMode") ?? "none").toString() as GateMode;
  const fpqAmountRaw = (form.get("fpqAmount") ?? "").toString();
  const fpqQuantityRaw = (form.get("fpqQuantity") ?? "").toString();
  const fpqCombinedLogic = (form.get("fpqCombinedLogic") ?? "and").toString() as GateCombinedLogic;

  const postQualificationMode = (
    form.get("postQualificationMode") ?? "none"
  ).toString() as GateMode;
  const postQualificationMinAmountRaw = (
    form.get("postQualificationMinAmount") ?? ""
  ).toString();
  const postQualificationMOQRaw = (form.get("postQualificationMOQ") ?? "1").toString();
  const postQualificationCombinedLogic = (
    form.get("postQualificationCombinedLogic") ?? "and"
  ).toString() as GateCombinedLogic;

  const errors: Record<string, string> = {};

  if (!Number.isInteger(baseline) || baseline < 0 || baseline > 100) {
    errors.wholesaleBaselinePct =
      "Baseline must be a whole number between 0 and 100";
  }
  if (!GATE_MODES.includes(fpqMode)) {
    errors.fpqMode = "Invalid FPQ mode";
  }
  if (!GATE_LOGICS.includes(fpqCombinedLogic)) {
    errors.fpqCombinedLogic = "Invalid combined logic";
  }
  if (!GATE_MODES.includes(postQualificationMode)) {
    errors.postQualificationMode = "Invalid post-qualification mode";
  }
  if (!GATE_LOGICS.includes(postQualificationCombinedLogic)) {
    errors.postQualificationCombinedLogic =
      "Invalid post-qualification combined logic";
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

  const postQualificationMinAmount =
    postQualificationMinAmountRaw === ""
      ? null
      : Number(postQualificationMinAmountRaw);
  if (
    (postQualificationMode === "amount" ||
      postQualificationMode === "combined") &&
    (postQualificationMinAmount === null ||
      Number.isNaN(postQualificationMinAmount) ||
      postQualificationMinAmount <= 0)
  ) {
    errors.postQualificationMinAmount =
      "Amount is required and must be positive when mode is amount or combined";
  }

  // `postQualificationMOQ` is a non-null Int column, so 1 is the "no
  // minimum" sentinel — opening-order-sync emits `quantity: null` for
  // anything <= 1. A quantity gate configured with 1 would therefore be
  // a silent no-op at checkout, so reject it when the leg is on.
  //
  // When the leg is OFF the value is inert and its field is hidden in
  // the UI, so we must NOT reject it — an error on an invisible field
  // is an unfixable dead-end for the merchant. Normalise to the "no
  // minimum" sentinel instead.
  const quantityLegOn =
    postQualificationMode === "quantity" ||
    postQualificationMode === "combined";
  const parsedMOQ = Number(postQualificationMOQRaw);
  let postQualificationMOQ = parsedMOQ;
  if (quantityLegOn) {
    if (!Number.isInteger(parsedMOQ) || parsedMOQ < 2) {
      errors.postQualificationMOQ =
        "Minimum units must be a whole number of at least 2 (1 would mean no minimum)";
    }
  } else if (!Number.isInteger(parsedMOQ) || parsedMOQ < 1) {
    postQualificationMOQ = 1;
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
        postQualificationMode,
        postQualificationMinAmount: postQualificationMinAmountRaw,
        postQualificationMOQ: postQualificationMOQRaw,
        postQualificationCombinedLogic,
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
      postQualificationMode,
      postQualificationMinAmount:
        postQualificationMode === "none" ||
        postQualificationMode === "quantity"
          ? null
          : postQualificationMinAmount,
      // Not reset to 1 when the mode drops the quantity leg: unlike the
      // nullable FPQ columns this one is non-null, so blanking it would
      // destroy the merchant's configured value on every mode toggle.
      // The mode already gates evaluation in the Function, so a stale
      // value here can never block a checkout on its own.
      postQualificationMOQ,
      postQualificationCombinedLogic,
    },
  });

  try {
    await syncTiersToFunction(admin, shop.id);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[settings.pricing] syncTiersToFunction failed:", err);
  }

  // Camino B: the FPQ fields ARE the opening-order minimum — refresh the
  // checkout Validation so the new min/mode takes effect. Internally
  // fail-safe (never throws).
  await syncOpeningOrderValidation(admin, shop.id);

  return json({ ok: true } as const);
};

/* -------------------------------------------------------------------------- */
/*                                    UI                                      */
/* -------------------------------------------------------------------------- */

type ModeOption = {
  value: GateMode;
  title: string;
  description: string;
};

/** First-Purchase Qualifier — gate on the customer's FIRST order only. */
const FPQ_MODES: ModeOption[] = [
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
      "First order subtotal must reach a minimum amount to qualify.",
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

/** Post-qualification — gate on EVERY order after the first one. */
const POST_QUALIFICATION_MODES: ModeOption[] = [
  {
    value: "none",
    title: "Disabled",
    description:
      "Qualified customers order any amount, any quantity. No gate.",
  },
  {
    value: "amount",
    title: "Amount threshold",
    description:
      "Every later order's subtotal must reach a minimum amount.",
  },
  {
    value: "quantity",
    title: "Quantity threshold",
    description:
      "Every later order must include at least N units.",
  },
  {
    value: "combined",
    title: "Both (AND / OR)",
    description:
      "Combine amount + quantity with AND or OR. Most strict.",
  },
];

const COMBINED_LOGIC_OPTIONS = [
  { label: "AND — both must be met", value: "and" },
  { label: "OR — either is enough", value: "or" },
];

export default function PricingSettings() {
  const { shop, currencyCode } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const shopify = useAppBridge();

  const errors =
    actionData && "errors" in actionData ? actionData.errors : {};

  /* ----- currency labelling -----
   * `symbol` is null when the Admin API lookup failed. Every money
   * label below degrades to a bare number in that case — never a
   * hardcoded currency.
   */
  const symbol = currencySymbolFor(currencyCode);
  const money = moneyFormatterFor(symbol);
  const currencyHelp = currencyCode
    ? `Amount is in your store's currency (${currencyCode}).`
    : "Amount is in your store's currency.";

  /* ----- form state ----- */
  const [baseline, setBaseline] = useState<string>(
    (actionData && "values" in actionData
      ? actionData.values.wholesaleBaselinePct
      : null) ?? String(shop.wholesaleBaselinePct),
  );
  const [fpqMode, setFpqMode] = useState<GateMode>(
    ((actionData && "values" in actionData
      ? actionData.values.fpqMode
      : null) as GateMode | null) ?? (shop.fpqMode as GateMode),
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
    useState<GateCombinedLogic>(
      ((actionData && "values" in actionData
        ? actionData.values.fpqCombinedLogic
        : null) as GateCombinedLogic | null) ??
        (shop.fpqCombinedLogic as GateCombinedLogic),
    );
  const [postQualificationMode, setPostQualificationMode] =
    useState<GateMode>(
      ((actionData && "values" in actionData
        ? actionData.values.postQualificationMode
        : null) as GateMode | null) ??
        (shop.postQualificationMode as GateMode),
    );
  const [postQualificationMinAmount, setPostQualificationMinAmount] =
    useState<string>(
      (actionData && "values" in actionData
        ? actionData.values.postQualificationMinAmount
        : null) ??
        (shop.postQualificationMinAmount != null
          ? String(shop.postQualificationMinAmount)
          : ""),
    );
  const [postQualificationMOQ, setPostQualificationMOQ] = useState<string>(
    (actionData && "values" in actionData
      ? actionData.values.postQualificationMOQ
      : null) ?? String(shop.postQualificationMOQ),
  );
  const [
    postQualificationCombinedLogic,
    setPostQualificationCombinedLogic,
  ] = useState<GateCombinedLogic>(
    ((actionData && "values" in actionData
      ? actionData.values.postQualificationCombinedLogic
      : null) as GateCombinedLogic | null) ??
      (shop.postQualificationCombinedLogic as GateCombinedLogic),
  );

  /* ----- SaveBar (sticky top via App Bridge) ----- */
  const initial = {
    baseline: String(shop.wholesaleBaselinePct),
    fpqMode: shop.fpqMode as GateMode,
    fpqAmount: shop.fpqAmount != null ? String(shop.fpqAmount) : "",
    fpqQuantity: shop.fpqQuantity != null ? String(shop.fpqQuantity) : "",
    fpqCombinedLogic: shop.fpqCombinedLogic as GateCombinedLogic,
    postQualificationMode: shop.postQualificationMode as GateMode,
    postQualificationMinAmount:
      shop.postQualificationMinAmount != null
        ? String(shop.postQualificationMinAmount)
        : "",
    postQualificationMOQ: String(shop.postQualificationMOQ),
    postQualificationCombinedLogic:
      shop.postQualificationCombinedLogic as GateCombinedLogic,
  };
  const isDirty =
    baseline !== initial.baseline ||
    fpqMode !== initial.fpqMode ||
    fpqAmount !== initial.fpqAmount ||
    fpqQuantity !== initial.fpqQuantity ||
    fpqCombinedLogic !== initial.fpqCombinedLogic ||
    postQualificationMode !== initial.postQualificationMode ||
    postQualificationMinAmount !== initial.postQualificationMinAmount ||
    postQualificationMOQ !== initial.postQualificationMOQ ||
    postQualificationCombinedLogic !==
      initial.postQualificationCombinedLogic;

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
    setPostQualificationMode(initial.postQualificationMode);
    setPostQualificationMinAmount(initial.postQualificationMinAmount);
    setPostQualificationMOQ(initial.postQualificationMOQ);
    setPostQualificationCombinedLogic(
      initial.postQualificationCombinedLogic,
    );
  };

  /* ----- summary strings ----- */
  const baselineSummary =
    Number(baseline) > 0 ? `${baseline}% off retail` : "Disabled";

  const fpqSummary = (() => {
    if (fpqMode === "none") return "Disabled";
    if (fpqMode === "amount")
      return `First order ≥ ${money(fpqAmount || "?")}`;
    if (fpqMode === "quantity")
      return `First order ≥ ${fpqQuantity || "?"} units`;
    return `${money(fpqAmount || "?")} ${fpqCombinedLogic.toUpperCase()} ${fpqQuantity || "?"} units`;
  })();

  const postQualificationSummary = (() => {
    if (postQualificationMode === "none") return "Disabled";
    if (postQualificationMode === "amount")
      return `Every order ≥ ${money(postQualificationMinAmount || "?")}`;
    if (postQualificationMode === "quantity")
      return `Every order ≥ ${postQualificationMOQ || "?"} units`;
    return `${money(postQualificationMinAmount || "?")} ${postQualificationCombinedLogic.toUpperCase()} ${postQualificationMOQ || "?"} units`;
  })();

  // Noun phrase of the same gate, for prose ("must reach X per order").
  const postQualificationRequirement = (() => {
    if (postQualificationMode === "amount")
      return `${money(postQualificationMinAmount || "?")} per order`;
    if (postQualificationMode === "quantity")
      return `${postQualificationMOQ || "?"} units per order`;
    return `${money(postQualificationMinAmount || "?")} ${postQualificationCombinedLogic.toUpperCase()} ${postQualificationMOQ || "?"} units per order`;
  })();

  // A saved MOQ > 1 does nothing at checkout while the mode is "none".
  // Surface that instead of letting the merchant assume it's enforced.
  const showDormantMoqNotice =
    postQualificationMode === "none" && Number(postQualificationMOQ) > 1;

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
        <input
          type="hidden"
          name="postQualificationMode"
          value={postQualificationMode}
        />
        <input
          type="hidden"
          name="postQualificationCombinedLogic"
          value={postQualificationCombinedLogic}
        />

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
                      order only. Until they clear it, the Discount Function
                      does not apply. Once they clear it they are qualified,
                      and this gate never applies to them again — use
                      &quot;Post-qualification minimums&quot; below to set a
                      floor on their later orders.
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
                      prefix={symbol ?? undefined}
                      helpText={`First order's subtotal must be at least this much. ${currencyHelp}`}
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
                      options={COMBINED_LOGIC_OPTIONS}
                      value={fpqCombinedLogic}
                      onChange={(v) =>
                        setFpqCombinedLogic(v as GateCombinedLogic)
                      }
                    />
                  )}
                </BlockStack>
              </Card>

              {/* ----- Post-qualification minimums -----
               * Mirror of the FPQ card, for every order AFTER the
               * customer is qualified. Same four modes, different
               * columns. The old standalone "Post-qualification MOQ"
               * card was folded in here (2026-08-11) so there is exactly
               * one place that edits postQualificationMOQ.
               */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">
                      Post-qualification minimums
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Optional minimum on EVERY order a customer places
                      after they are qualified — order #2 onward. This is
                      the ongoing wholesale floor, separate from the
                      First-Purchase Qualifier above, which only ever
                      applies to order #1. A customer is never checked
                      against both gates at the same time.
                    </Text>
                  </BlockStack>

                  <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                    {POST_QUALIFICATION_MODES.map((opt) => (
                      <ChoiceCard
                        key={opt.value}
                        selected={postQualificationMode === opt.value}
                        onSelect={() => setPostQualificationMode(opt.value)}
                        title={opt.title}
                        description={opt.description}
                      />
                    ))}
                  </InlineGrid>

                  {showDormantMoqNotice && (
                    <Banner tone="warning" title="Minimum saved but not enforced">
                      <p>
                        This shop has {postQualificationMOQ} units/order
                        saved, but the gate is disabled so checkout never
                        applies it. Pick &quot;Quantity threshold&quot; (or
                        &quot;Both&quot;) to turn it on.
                      </p>
                    </Banner>
                  )}

                  {(postQualificationMode === "amount" ||
                    postQualificationMode === "combined") && (
                    <TextField
                      label="Minimum amount (per order subtotal)"
                      name="postQualificationMinAmount"
                      type="number"
                      min={0}
                      step={0.01}
                      autoComplete="off"
                      value={postQualificationMinAmount}
                      onChange={setPostQualificationMinAmount}
                      error={errors.postQualificationMinAmount}
                      prefix={symbol ?? undefined}
                      helpText={`Every order after qualification must reach this subtotal. ${currencyHelp}`}
                      requiredIndicator
                    />
                  )}

                  {(postQualificationMode === "quantity" ||
                    postQualificationMode === "combined") && (
                    <TextField
                      label="Minimum units per order"
                      name="postQualificationMOQ"
                      type="number"
                      min={2}
                      autoComplete="off"
                      value={postQualificationMOQ}
                      onChange={setPostQualificationMOQ}
                      error={errors.postQualificationMOQ}
                      suffix="units"
                      helpText="Every order after qualification must include at least this many units. Minimum 2 — 1 would mean no minimum."
                      requiredIndicator
                    />
                  )}

                  {postQualificationMode === "combined" && (
                    <Select
                      label="How amount and quantity combine"
                      options={COMBINED_LOGIC_OPTIONS}
                      value={postQualificationCombinedLogic}
                      onChange={(v) =>
                        setPostQualificationCombinedLogic(
                          v as GateCombinedLogic,
                        )
                      }
                    />
                  )}

                  {/* The MOQ column is non-null, so it must always be
                      submitted even while the quantity field is hidden —
                      otherwise the action would fall back to "1" and
                      silently wipe the merchant's saved value. */}
                  {postQualificationMode !== "quantity" &&
                    postQualificationMode !== "combined" && (
                      <input
                        type="hidden"
                        name="postQualificationMOQ"
                        value={postQualificationMOQ}
                      />
                    )}
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
                  <SummaryRow label="FPQ (first order)" value={fpqSummary} />
                  <SummaryRow
                    label="Post-qualification (later orders)"
                    value={postQualificationSummary}
                  />
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
                  {postQualificationMode !== "none" && (
                    <JourneyStep
                      n={fpqMode === "none" ? 3 : 4}
                      title="Every later order must clear the minimum"
                      body={`From order #2 onward, checkout blocks any cart under ${postQualificationRequirement}.`}
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
