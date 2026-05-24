/**
 * Admin route: 3-step onboarding wizard (Sprint 4 P0 #5 — ADR-008).
 *
 * URL: /app/onboarding
 *
 * Auto-redirected from `/app` when `Shop.onboarded === false`. The merchant
 * can also re-open the wizard manually from the nav menu — useful after
 * changing pricing strategy or onboarding a second store.
 *
 * State machine (client-side only — no per-step routes, less round-trip):
 *   Step 1 — Segment: journey + businessModel (two ChoiceLists)
 *   Step 2 — Preset: pick + tweak a 4-preset config (writes Shop + Tier)
 *   Step 3 — White-glove CTA: book a call with Adspubli, or finish solo
 *
 * Skip is supported at any step via the page-level `secondaryActions`,
 * which writes a skip OnboardingResponse and marks the shop onboarded.
 *
 * Why one route (not three): we hold the partial Step-1 answers in
 * client state and only persist them on Continue. The wizard always
 * has the user's full prior responses in memory, so cross-step logic
 * (preset recommendation, Step-2 defaults) is trivial.
 */
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import {
  useFetcher,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "@remix-run/react";
import {
  Page,
  Card,
  ProgressBar,
  ChoiceList,
  RadioButton,
  FormLayout,
  TextField,
  Select,
  Banner,
  Button,
  ButtonGroup,
  BlockStack,
  InlineStack,
  Text,
  Box,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticateAdmin } from "../lib/auth.server";
import { syncTiersToFunction } from "../services/discount-function-sync.server";
import {
  PRESETS,
  applyPresetToShop,
  markShopOnboarded,
  saveStepResponse,
  type FpqCombinedLogic,
  type FpqMode,
  type OnboardingPreset,
  type PresetKey,
  type PresetOverrides,
} from "../services/onboarding.server";

/* -------------------------------------------------------------------------- */
/*                                  LOADER                                    */
/* -------------------------------------------------------------------------- */

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await authenticateAdmin(request);

  // If already onboarded, send them to the dashboard. They can still come
  // back via the nav link — that path skips this redirect by virtue of
  // an explicit click (we re-show the wizard regardless of onboarded
  // when the URL has ?force=1).
  const url = new URL(request.url);
  if (shop.onboarded && url.searchParams.get("force") !== "1") {
    throw redirect("/app");
  }

  return { shop, presets: PRESETS };
};

/* -------------------------------------------------------------------------- */
/*                                  ACTION                                    */
/* -------------------------------------------------------------------------- */

type ActionOk =
  | { ok: true; intent: "save_step" }
  | { ok: true; intent: "apply_preset"; createdTierId: string | null; syncWarning: string | null }
  | { ok: false; error: string };

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, shop } = await authenticateAdmin(request);
  const form = await request.formData();
  const intent = (form.get("intent") ?? "").toString();

  if (intent === "save_step") {
    const stepRaw = Number(form.get("step"));
    const step = (stepRaw === 1 || stepRaw === 2 || stepRaw === 3 ? stepRaw : null) as
      | 1
      | 2
      | 3
      | null;
    if (!step) {
      return { ok: false, error: "Invalid step number." } satisfies ActionOk;
    }
    const responses = safeParse(form.get("responses")?.toString() ?? "{}");
    await saveStepResponse({ shopId: shop.id, step, responses });
    return { ok: true, intent: "save_step" } satisfies ActionOk;
  }

  if (intent === "apply_preset") {
    const presetKey = (form.get("presetKey") ?? "").toString() as PresetKey;
    if (!(presetKey in PRESETS)) {
      return { ok: false, error: `Unknown preset: ${presetKey}` } satisfies ActionOk;
    }
    const overrides = parseOverrides(form.get("overrides")?.toString() ?? "{}");
    const { createdTier } = await applyPresetToShop(shop.id, presetKey, overrides);

    // Best-effort sync. If the Function isn't deployed yet (common in
    // a fresh install) we degrade gracefully — the merchant can re-sync
    // by saving a tier later.
    let syncWarning: string | null = null;
    try {
      await syncTiersToFunction(admin, shop.id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[Stockly] onboarding apply_preset: sync failed:", err);
      syncWarning =
        "Settings saved, but Shopify Discount Function sync did not run. " +
        "Save any tier from /app/tiers to retry the sync.";
    }

    await saveStepResponse({
      shopId: shop.id,
      step: 2,
      responses: { presetKey, overrides, createdTierId: createdTier?.id ?? null },
    });

    return {
      ok: true,
      intent: "apply_preset",
      createdTierId: createdTier?.id ?? null,
      syncWarning,
    } satisfies ActionOk;
  }

  if (intent === "complete") {
    const wantsWhiteGlove = form.get("wantsWhiteGlove") === "true";
    const contactPreference =
      (form.get("contactPreference") ?? "").toString() || null;
    const message = (form.get("message") ?? "").toString() || null;
    await saveStepResponse({
      shopId: shop.id,
      step: 3,
      responses: { wantsWhiteGlove, contactPreference, message },
    });
    await markShopOnboarded(shop.id);
    throw redirect("/app");
  }

  if (intent === "skip") {
    const stepRaw = Number(form.get("step"));
    const step = (stepRaw === 1 || stepRaw === 2 || stepRaw === 3 ? stepRaw : 1) as
      | 1
      | 2
      | 3;
    await saveStepResponse({ shopId: shop.id, step, responses: {}, skipped: true });
    await markShopOnboarded(shop.id);
    throw redirect("/app");
  }

  return { ok: false, error: `Unknown intent: ${intent}` } satisfies ActionOk;
};

/* --------------------------- action helpers ------------------------------- */

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function parseOverrides(raw: string): PresetOverrides {
  const obj = safeParse(raw) as Record<string, unknown>;
  if (!obj || typeof obj !== "object") return {};
  const out: PresetOverrides = {};
  if (typeof obj.baselinePct === "number") out.baselinePct = obj.baselinePct;
  if (typeof obj.fpqMode === "string") out.fpqMode = obj.fpqMode as FpqMode;
  if (typeof obj.fpqAmount === "number" || obj.fpqAmount === null)
    out.fpqAmount = obj.fpqAmount as number | null;
  if (typeof obj.fpqQuantity === "number" || obj.fpqQuantity === null)
    out.fpqQuantity = obj.fpqQuantity as number | null;
  if (typeof obj.fpqCombinedLogic === "string")
    out.fpqCombinedLogic = obj.fpqCombinedLogic as FpqCombinedLogic;
  if (typeof obj.postQualificationMOQ === "number")
    out.postQualificationMOQ = obj.postQualificationMOQ;
  return out;
}

/* -------------------------------------------------------------------------- */
/*                                    UI                                      */
/* -------------------------------------------------------------------------- */

type Journey = "just_starting" | "running_b2b" | "migrating";
type BusinessModel = "manufacturer" | "distributor" | "retailer";

interface Step1Answers {
  journey: Journey | null;
  businessModel: BusinessModel | null;
}

interface Step3Answers {
  wantsWhiteGlove: "yes" | "no" | "maybe" | null;
  contactPreference: string;
  message: string;
}

export default function OnboardingWizard() {
  const { shop, presets } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const fetcher = useFetcher<typeof action>();
  const submitting = navigation.state === "submitting";

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Accumulated answers — kept in memory across step transitions.
  const [step1, setStep1] = useState<Step1Answers>({
    journey: null,
    businessModel: null,
  });
  const [step3, setStep3] = useState<Step3Answers>({
    wantsWhiteGlove: null,
    contactPreference: "email",
    message: "",
  });

  // Recommend a preset based on the Step-1 answers.
  const recommendedPreset: PresetKey = (() => {
    if (step1.journey === "just_starting") return "just_starting";
    if (step1.businessModel === "manufacturer") return "manufacturer";
    if (step1.businessModel === "distributor") return "distributor";
    if (step1.businessModel === "retailer") return "retailer_b2b";
    return "just_starting";
  })();

  // Step-2 editable preset state. Initialized from `recommendedPreset`
  // when we enter Step 2 the first time, but the merchant can still
  // tweak any value before applying.
  const [selectedPresetKey, setSelectedPresetKey] = useState<PresetKey | null>(
    null,
  );
  const activePresetKey: PresetKey = selectedPresetKey ?? recommendedPreset;
  const activePreset = presets[activePresetKey];

  const [overrideBaseline, setOverrideBaseline] = useState<string>("");
  const [overrideFpqMode, setOverrideFpqMode] = useState<FpqMode | "">("");
  const [overrideFpqAmount, setOverrideFpqAmount] = useState<string>("");
  const [overrideFpqQuantity, setOverrideFpqQuantity] = useState<string>("");
  const [overridePostQualMOQ, setOverridePostQualMOQ] = useState<string>("");

  // Reset override inputs when the user picks a different preset.
  function pickPreset(key: PresetKey) {
    setSelectedPresetKey(key);
    setOverrideBaseline("");
    setOverrideFpqMode("");
    setOverrideFpqAmount("");
    setOverrideFpqQuantity("");
    setOverridePostQualMOQ("");
  }

  /* ----- handlers ----- */

  function handleSaveStepAsync(stepN: 1 | 2 | 3, responses: unknown) {
    const fd = new FormData();
    fd.append("intent", "save_step");
    fd.append("step", String(stepN));
    fd.append("responses", JSON.stringify(responses));
    fetcher.submit(fd, { method: "post" });
  }

  function handleContinueStep1() {
    if (!step1.journey || !step1.businessModel) return;
    handleSaveStepAsync(1, step1);
    setStep(2);
  }

  function handleApplyPreset() {
    const effectiveFpqMode = (overrideFpqMode || activePreset.fpqMode) as FpqMode;
    const overrides: PresetOverrides = {};
    if (overrideBaseline !== "" && !Number.isNaN(Number(overrideBaseline))) {
      overrides.baselinePct = Number(overrideBaseline);
    }
    if (overrideFpqMode !== "") {
      overrides.fpqMode = overrideFpqMode as FpqMode;
    }
    if (
      (effectiveFpqMode === "amount" || effectiveFpqMode === "combined") &&
      overrideFpqAmount !== "" &&
      !Number.isNaN(Number(overrideFpqAmount))
    ) {
      overrides.fpqAmount = Number(overrideFpqAmount);
    }
    if (
      (effectiveFpqMode === "quantity" || effectiveFpqMode === "combined") &&
      overrideFpqQuantity !== "" &&
      !Number.isNaN(Number(overrideFpqQuantity))
    ) {
      overrides.fpqQuantity = Number(overrideFpqQuantity);
    }
    if (
      overridePostQualMOQ !== "" &&
      Number.isInteger(Number(overridePostQualMOQ))
    ) {
      overrides.postQualificationMOQ = Number(overridePostQualMOQ);
    }

    const fd = new FormData();
    fd.append("intent", "apply_preset");
    fd.append("presetKey", activePresetKey);
    fd.append("overrides", JSON.stringify(overrides));
    fetcher.submit(fd, { method: "post" });
  }

  function handleFinish() {
    const fd = new FormData();
    fd.append("intent", "complete");
    fd.append("wantsWhiteGlove", String(step3.wantsWhiteGlove === "yes"));
    fd.append("contactPreference", step3.contactPreference);
    fd.append("message", step3.message);
    submit(fd, { method: "post" });
  }

  function handleSkip() {
    const fd = new FormData();
    fd.append("intent", "skip");
    fd.append("step", String(step));
    submit(fd, { method: "post" });
  }

  /* ----- derived state for banners ----- */

  const presetApplied = Boolean(
    fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok &&
      "intent" in fetcher.data &&
      fetcher.data.intent === "apply_preset",
  );

  const presetSyncWarning =
    presetApplied && "syncWarning" in fetcher.data!
      ? (fetcher.data as { syncWarning: string | null }).syncWarning
      : null;

  /* ----- render ----- */

  return (
    <Page
      title="Welcome to Stockly"
      subtitle={`Let's get ${shop.id} set up for wholesale in three short steps.`}
      secondaryActions={[
        {
          content: "I'll do this later",
          onAction: handleSkip,
          disabled: submitting,
        },
      ]}
    >
      <TitleBar title="Onboarding" />
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="200">
            <InlineStack align="space-between">
              <Text as="span" variant="bodyMd" fontWeight="semibold">
                Step {step} of 3
              </Text>
              <Text as="span" variant="bodySm" tone="subdued">
                {step === 1 && "Tell us about your business"}
                {step === 2 && "Pick a starting configuration"}
                {step === 3 && "Optional — book a setup call"}
              </Text>
            </InlineStack>
            <ProgressBar progress={(step / 3) * 100} size="small" />
          </BlockStack>
        </Card>

        {step === 1 && (
          <StepSegment
            value={step1}
            onChange={setStep1}
            onContinue={handleContinueStep1}
            disabled={submitting}
          />
        )}

        {step === 2 && (
          <StepPreset
            recommendedKey={recommendedPreset}
            activeKey={activePresetKey}
            activePreset={activePreset}
            allPresets={presets}
            pickPreset={pickPreset}
            applied={presetApplied}
            syncWarning={presetSyncWarning}
            applying={fetcher.state !== "idle"}
            overrideBaseline={overrideBaseline}
            setOverrideBaseline={setOverrideBaseline}
            overrideFpqMode={overrideFpqMode}
            setOverrideFpqMode={setOverrideFpqMode}
            overrideFpqAmount={overrideFpqAmount}
            setOverrideFpqAmount={setOverrideFpqAmount}
            overrideFpqQuantity={overrideFpqQuantity}
            setOverrideFpqQuantity={setOverrideFpqQuantity}
            overridePostQualMOQ={overridePostQualMOQ}
            setOverridePostQualMOQ={setOverridePostQualMOQ}
            onApply={handleApplyPreset}
            onBack={() => setStep(1)}
            onContinue={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <StepFirstAction
            value={step3}
            onChange={setStep3}
            onBack={() => setStep(2)}
            onFinish={handleFinish}
            disabled={submitting}
          />
        )}
      </BlockStack>
    </Page>
  );
}

/* -------------------------------------------------------------------------- */
/*                              STEP 1 — SEGMENT                              */
/* -------------------------------------------------------------------------- */

function StepSegment({
  value,
  onChange,
  onContinue,
  disabled,
}: {
  value: Step1Answers;
  onChange: (v: Step1Answers) => void;
  onContinue: () => void;
  disabled: boolean;
}) {
  const canContinue = !!value.journey && !!value.businessModel;
  return (
    <Card>
      <BlockStack gap="500">
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            Where are you in your B2B journey?
          </Text>
          <ChoiceList
            title=""
            titleHidden
            choices={[
              { label: "Just starting — never sold B2B before", value: "just_starting" },
              { label: "Already running B2B — looking for a better tool", value: "running_b2b" },
              { label: "Migrating from another B2B app", value: "migrating" },
            ]}
            selected={value.journey ? [value.journey] : []}
            onChange={(selected) =>
              onChange({ ...value, journey: (selected[0] as Journey) ?? null })
            }
          />
        </BlockStack>

        <Divider />

        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            What's your business model?
          </Text>
          <ChoiceList
            title=""
            titleHidden
            choices={[
              { label: "Manufacturer / Brand owner — you make the product", value: "manufacturer" },
              { label: "Distributor / Wholesaler — you move other brands' products in volume", value: "distributor" },
              { label: "Retailer with a B2B side — DTC is your main channel, B2B is secondary", value: "retailer" },
            ]}
            selected={value.businessModel ? [value.businessModel] : []}
            onChange={(selected) =>
              onChange({
                ...value,
                businessModel: (selected[0] as BusinessModel) ?? null,
              })
            }
          />
        </BlockStack>

        <InlineStack align="end">
          <Button
            variant="primary"
            disabled={!canContinue || disabled}
            onClick={onContinue}
          >
            Continue
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*                              STEP 2 — PRESET                               */
/* -------------------------------------------------------------------------- */

function StepPreset({
  recommendedKey,
  activeKey,
  activePreset,
  allPresets,
  pickPreset,
  applied,
  syncWarning,
  applying,
  overrideBaseline,
  setOverrideBaseline,
  overrideFpqMode,
  setOverrideFpqMode,
  overrideFpqAmount,
  setOverrideFpqAmount,
  overrideFpqQuantity,
  setOverrideFpqQuantity,
  overridePostQualMOQ,
  setOverridePostQualMOQ,
  onApply,
  onBack,
  onContinue,
}: {
  recommendedKey: PresetKey;
  activeKey: PresetKey;
  activePreset: OnboardingPreset;
  allPresets: Record<PresetKey, OnboardingPreset>;
  pickPreset: (key: PresetKey) => void;
  applied: boolean;
  syncWarning: string | null;
  applying: boolean;
  overrideBaseline: string;
  setOverrideBaseline: (v: string) => void;
  overrideFpqMode: FpqMode | "";
  setOverrideFpqMode: (v: FpqMode | "") => void;
  overrideFpqAmount: string;
  setOverrideFpqAmount: (v: string) => void;
  overrideFpqQuantity: string;
  setOverrideFpqQuantity: (v: string) => void;
  overridePostQualMOQ: string;
  setOverridePostQualMOQ: (v: string) => void;
  onApply: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const effectiveFpqMode = (overrideFpqMode || activePreset.fpqMode) as FpqMode;
  const showAmount = effectiveFpqMode === "amount" || effectiveFpqMode === "combined";
  const showQuantity = effectiveFpqMode === "quantity" || effectiveFpqMode === "combined";

  const presetKeys: PresetKey[] = [
    "just_starting",
    "retailer_b2b",
    "manufacturer",
    "distributor",
  ];

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            Recommended for you: {allPresets[recommendedKey].label}
          </Text>
          <Text as="p" variant="bodyMd" tone="subdued">
            Based on your Step 1 answers we picked the preset below. Feel
            free to adjust any value before applying, or switch to a
            different preset entirely.
          </Text>

          <InlineStack gap="200" wrap>
            {presetKeys.map((k) => (
              <Button
                key={k}
                pressed={k === activeKey}
                onClick={() => pickPreset(k)}
              >
                {allPresets[k].label}
                {k === recommendedKey ? " (recommended)" : ""}
              </Button>
            ))}
          </InlineStack>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="400">
          <BlockStack gap="100">
            <Text as="h3" variant="headingSm">
              {activePreset.label}
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              {activePreset.description}
            </Text>
          </BlockStack>

          <Box
            padding="300"
            background="bg-surface-secondary"
            borderRadius="200"
          >
            <BlockStack gap="100">
              <PresetSummaryRow label="Wholesale baseline" value={`${activePreset.baselinePct}% off retail`} />
              <PresetSummaryRow
                label="First-Purchase Qualifier"
                value={describeFpq(activePreset)}
              />
              <PresetSummaryRow
                label="Post-qualification MOQ"
                value={
                  activePreset.postQualificationMOQ <= 1
                    ? "None (customers buy freely after qualifying)"
                    : `${activePreset.postQualificationMOQ} units/order`
                }
              />
              <PresetSummaryRow
                label="First tier"
                value={
                  activePreset.firstTier
                    ? `${activePreset.firstTier.name} — ${activePreset.firstTier.discountPct}% at ${activePreset.firstTier.minQty}+ (${activePreset.firstTier.aggregation === "cart_total" ? "cart total" : "per line"})`
                    : "None — set up tiers later"
                }
              />
            </BlockStack>
          </Box>

          <Text as="h3" variant="headingSm">
            Tweak the defaults (optional)
          </Text>

          <FormLayout>
            <TextField
              label={`Baseline % (preset: ${activePreset.baselinePct})`}
              type="number"
              min={0}
              max={100}
              step={1}
              autoComplete="off"
              value={overrideBaseline}
              onChange={setOverrideBaseline}
              placeholder={String(activePreset.baselinePct)}
              helpText="Leave empty to use the preset value."
            />

            <Select
              label={`FPQ mode (preset: ${activePreset.fpqMode})`}
              value={overrideFpqMode}
              onChange={(v) => setOverrideFpqMode(v as FpqMode | "")}
              options={[
                { label: `Use preset (${activePreset.fpqMode})`, value: "" },
                { label: "None — no first-order gate", value: "none" },
                { label: "Amount — first order must reach a € threshold", value: "amount" },
                { label: "Quantity — first order must reach a unit count", value: "quantity" },
                { label: "Combined — amount AND/OR quantity", value: "combined" },
              ]}
            />

            {showAmount && (
              <TextField
                label={`FPQ amount (preset: ${activePreset.fpqAmount ?? "—"})`}
                type="number"
                min={0}
                step={0.01}
                autoComplete="off"
                value={overrideFpqAmount}
                onChange={setOverrideFpqAmount}
                placeholder={activePreset.fpqAmount ? String(activePreset.fpqAmount) : ""}
                helpText="Leave empty to use the preset value."
              />
            )}

            {showQuantity && (
              <TextField
                label={`FPQ quantity (preset: ${activePreset.fpqQuantity ?? "—"})`}
                type="number"
                min={1}
                step={1}
                autoComplete="off"
                value={overrideFpqQuantity}
                onChange={setOverrideFpqQuantity}
                placeholder={activePreset.fpqQuantity ? String(activePreset.fpqQuantity) : ""}
                helpText="Leave empty to use the preset value."
              />
            )}

            <TextField
              label={`Post-qualification MOQ (preset: ${activePreset.postQualificationMOQ})`}
              type="number"
              min={1}
              step={1}
              autoComplete="off"
              value={overridePostQualMOQ}
              onChange={setOverridePostQualMOQ}
              placeholder={String(activePreset.postQualificationMOQ)}
              helpText="Leave empty to use the preset value."
            />
          </FormLayout>

          {applied && !syncWarning && (
            <Banner tone="success" title="Preset applied">
              <p>
                Your shop settings and{" "}
                {activePreset.firstTier ? "first tier are " : "are "}
                live. You can continue to the last step or tweak details
                later from /app/tiers and /app/settings/pricing.
              </p>
            </Banner>
          )}
          {applied && syncWarning && (
            <Banner tone="warning" title="Preset applied (with warning)">
              <p>{syncWarning}</p>
            </Banner>
          )}

          <InlineStack align="space-between">
            <Button onClick={onBack} disabled={applying}>
              Back
            </Button>
            <ButtonGroup>
              <Button onClick={onApply} loading={applying} disabled={applied}>
                {applied ? "Applied" : "Apply preset"}
              </Button>
              <Button variant="primary" onClick={onContinue} disabled={!applied}>
                Continue
              </Button>
            </ButtonGroup>
          </InlineStack>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

function PresetSummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <InlineStack align="space-between" gap="200">
      <Text as="span" variant="bodySm" tone="subdued">
        {label}
      </Text>
      <Text as="span" variant="bodySm" fontWeight="medium">
        {value}
      </Text>
    </InlineStack>
  );
}

function describeFpq(preset: OnboardingPreset): string {
  switch (preset.fpqMode) {
    case "none":
      return "None — every order gets wholesale pricing immediately";
    case "amount":
      return `First order ≥ ${preset.fpqAmount} (shop currency)`;
    case "quantity":
      return `First order ≥ ${preset.fpqQuantity} units`;
    case "combined":
      return `First order ≥ ${preset.fpqAmount} AND ≥ ${preset.fpqQuantity} units`;
  }
}

/* -------------------------------------------------------------------------- */
/*                        STEP 3 — WHITE-GLOVE CTA                            */
/* -------------------------------------------------------------------------- */

function StepFirstAction({
  value,
  onChange,
  onBack,
  onFinish,
  disabled,
}: {
  value: Step3Answers;
  onChange: (v: Step3Answers) => void;
  onBack: () => void;
  onFinish: () => void;
  disabled: boolean;
}) {
  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            Want a hand from the team?
          </Text>
          <Text as="p" variant="bodyMd" tone="subdued">
            Adspubli is Barcelona-based. We can do a 30-min onboarding
            call to walk you through your Stockly setup — review your
            preset choice, sanity-check your tiers, and help you wire up
            the storefront block on your theme. No upsell, no obligation.
          </Text>
        </BlockStack>

        <Divider />

        <BlockStack gap="200">
          <RadioButton
            label="Yes, I'd like a 30-min onboarding call"
            checked={value.wantsWhiteGlove === "yes"}
            id="wg-yes"
            name="wg"
            onChange={() => onChange({ ...value, wantsWhiteGlove: "yes" })}
          />
          <RadioButton
            label="Maybe later — show me the dashboard for now"
            checked={value.wantsWhiteGlove === "maybe"}
            id="wg-maybe"
            name="wg"
            onChange={() => onChange({ ...value, wantsWhiteGlove: "maybe" })}
          />
          <RadioButton
            label="No, I'll figure it out myself"
            checked={value.wantsWhiteGlove === "no"}
            id="wg-no"
            name="wg"
            onChange={() => onChange({ ...value, wantsWhiteGlove: "no" })}
          />
        </BlockStack>

        {value.wantsWhiteGlove === "yes" && (
          <FormLayout>
            <Select
              label="How should we reach you?"
              value={value.contactPreference}
              onChange={(v) => onChange({ ...value, contactPreference: v })}
              options={[
                { label: "Email", value: "email" },
                { label: "Phone / WhatsApp", value: "phone" },
                { label: "Either is fine", value: "either" },
              ]}
            />
            <TextField
              label="Anything we should know before the call? (optional)"
              autoComplete="off"
              multiline={3}
              value={value.message}
              onChange={(v) => onChange({ ...value, message: v })}
              placeholder="e.g. We sell statement pieces with variant-level pricing — want to make sure that's supported."
            />
          </FormLayout>
        )}

        <InlineStack align="space-between">
          <Button onClick={onBack} disabled={disabled}>
            Back
          </Button>
          <Button
            variant="primary"
            onClick={onFinish}
            disabled={!value.wantsWhiteGlove || disabled}
            loading={disabled}
          >
            Finish setup
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
