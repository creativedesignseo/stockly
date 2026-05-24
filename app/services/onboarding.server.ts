/**
 * Onboarding service — wizard state, presets, and Shop completion flag.
 *
 * Pure DB layer: no Shopify SDK imports here. The Discount Function sync
 * (which needs the authenticated `admin` context) is invoked from the
 * route action AFTER `applyPresetToShop` returns. Keeping this split
 * mirrors the rest of `app/services/*` (see ADR-008).
 *
 * The 4 presets encode opinionated defaults inferred from the merchant's
 * Step 1 answers (journey + businessModel). Numbers come from ADR-004
 * (FPQ ranges typical per segment) and ADR-006 (baseline ranges).
 */
import type { Tier } from "@prisma/client";

import prisma from "../db.server";
import { createTier, type TierAggregation, type TierScope } from "./tiers.server";
import { updateShopSettings } from "./shops.server";

/* -------------------------------------------------------------------------- */
/*                                  TYPES                                     */
/* -------------------------------------------------------------------------- */

export type FpqMode = "none" | "amount" | "quantity" | "combined";
export type FpqCombinedLogic = "and" | "or";

export type PresetKey =
  | "just_starting"
  | "retailer_b2b"
  | "manufacturer"
  | "distributor";

export interface PresetFirstTier {
  name: string;
  scope: TierScope;
  minQty: number;
  discountPct: number;
  aggregation: TierAggregation;
}

export interface OnboardingPreset {
  key: PresetKey;
  label: string;
  description: string;
  baselinePct: number;
  fpqMode: FpqMode;
  fpqAmount: number | null;
  fpqQuantity: number | null;
  fpqCombinedLogic: FpqCombinedLogic;
  postQualificationMOQ: number;
  /** Tier auto-created on apply. `null` means "no first tier". */
  firstTier: PresetFirstTier | null;
}

/**
 * Override shape accepted by `applyPresetToShop`. Any field omitted
 * falls back to the preset's value. A merchant who wants the preset
 * verbatim can pass `{}`.
 */
export interface PresetOverrides {
  baselinePct?: number;
  fpqMode?: FpqMode;
  fpqAmount?: number | null;
  fpqQuantity?: number | null;
  fpqCombinedLogic?: FpqCombinedLogic;
  postQualificationMOQ?: number;
}

/* -------------------------------------------------------------------------- */
/*                                 PRESETS                                    */
/* -------------------------------------------------------------------------- */

/**
 * Canonical preset table. Values were calibrated from the Piro Jewelry
 * baseline (luxury fragrance/jewelry brand) and BSS competitive review
 * (ADR-008). Used both server-side (apply) and client-side (preview
 * defaults in the wizard UI).
 */
export const PRESETS: Record<PresetKey, OnboardingPreset> = {
  just_starting: {
    key: "just_starting",
    label: "Just starting with B2B",
    description:
      "Conservative defaults to test the water. Baseline discount only, no first-order gate, no tier. Easy to tweak later.",
    baselinePct: 30,
    fpqMode: "none",
    fpqAmount: null,
    fpqQuantity: null,
    fpqCombinedLogic: "and",
    postQualificationMOQ: 1,
    firstTier: null,
  },
  retailer_b2b: {
    key: "retailer_b2b",
    label: "Retailer with a B2B side",
    description:
      "You sell retail too and B2B is a side channel. Moderate baseline, amount-based FPQ to keep small shops qualified.",
    baselinePct: 40,
    fpqMode: "amount",
    fpqAmount: 300,
    fpqQuantity: null,
    fpqCombinedLogic: "and",
    postQualificationMOQ: 1,
    firstTier: {
      name: "Volume 12+",
      scope: "all",
      minQty: 12,
      discountPct: 5,
      aggregation: "per_line",
    },
  },
  manufacturer: {
    key: "manufacturer",
    label: "Manufacturer / Brand owner",
    description:
      "You own the brand and sell to retailers. Strong baseline plus combined FPQ (amount AND qty) to filter serious buyers. Cart-total tier rewards full assortment orders.",
    baselinePct: 55,
    fpqMode: "combined",
    fpqAmount: 500,
    fpqQuantity: 12,
    fpqCombinedLogic: "and",
    postQualificationMOQ: 6,
    firstTier: {
      name: "Bulk 24+",
      scope: "all",
      minQty: 24,
      discountPct: 10,
      aggregation: "cart_total",
    },
  },
  distributor: {
    key: "distributor",
    label: "Distributor / Wholesaler",
    description:
      "You move volume and want pallet-style orders. Aggressive baseline plus higher FPQ amount; cart-total tier rewards pallet quantities.",
    baselinePct: 65,
    fpqMode: "amount",
    fpqAmount: 1000,
    fpqQuantity: null,
    fpqCombinedLogic: "and",
    postQualificationMOQ: 12,
    firstTier: {
      name: "Pallet 50+",
      scope: "all",
      minQty: 50,
      discountPct: 15,
      aggregation: "cart_total",
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                                  STATE                                     */
/* -------------------------------------------------------------------------- */

export interface OnboardingState {
  onboarded: boolean;
  /** Highest step number with at least one (non-skipped) response. 0 if none. */
  lastStepCompleted: number;
}

/**
 * Read the onboarding state for a shop. Single round-trip.
 */
export async function getOnboardingState(shopId: string): Promise<OnboardingState> {
  const [shop, lastResponse] = await Promise.all([
    prisma.shop.findUnique({
      where: { id: shopId },
      select: { onboarded: true },
    }),
    prisma.onboardingResponse.findFirst({
      where: { shopId, skipped: false },
      orderBy: { step: "desc" },
      select: { step: true },
    }),
  ]);

  return {
    onboarded: shop?.onboarded ?? false,
    lastStepCompleted: lastResponse?.step ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/*                              STEP RESPONSES                                */
/* -------------------------------------------------------------------------- */

export interface SaveStepInput {
  shopId: string;
  step: 1 | 2 | 3;
  /** Arbitrary shape — see `OnboardingResponse.responsesJson` comment. */
  responses: unknown;
  /** True if the merchant skipped this step. Defaults to false. */
  skipped?: boolean;
}

/**
 * Persist a wizard step. Multiple rows per (shopId, step) are allowed
 * intentionally — a merchant who re-runs the wizard generates a new row
 * each time, which gives us a poor-man's audit trail.
 */
export async function saveStepResponse(input: SaveStepInput) {
  return prisma.onboardingResponse.create({
    data: {
      shopId: input.shopId,
      step: input.step,
      responsesJson: JSON.stringify(input.responses ?? {}),
      skipped: input.skipped ?? false,
    },
  });
}

/* -------------------------------------------------------------------------- */
/*                                APPLY PRESET                                */
/* -------------------------------------------------------------------------- */

export interface ApplyPresetResult {
  presetKey: PresetKey;
  /** The Tier row created from `preset.firstTier`, if any. */
  createdTier: Tier | null;
}

/**
 * Apply a preset to the shop: writes baseline + FPQ + postQual MOQ fields,
 * then optionally creates the first Tier row. The caller (route action)
 * is responsible for triggering `syncTiersToFunction` afterwards.
 *
 * Overrides win over preset values when defined (not undefined).
 */
export async function applyPresetToShop(
  shopId: string,
  presetKey: PresetKey,
  overrides: PresetOverrides = {},
): Promise<ApplyPresetResult> {
  const preset = PRESETS[presetKey];
  if (!preset) {
    throw new Error(`Unknown preset key: ${presetKey}`);
  }

  const baselinePct =
    overrides.baselinePct !== undefined ? overrides.baselinePct : preset.baselinePct;
  const fpqMode = overrides.fpqMode ?? preset.fpqMode;
  // For modes that don't use one of the inputs we normalize to null
  // even if the merchant passed a number — matches the validation rules
  // in /app/settings/pricing.
  const fpqAmount =
    fpqMode === "none" || fpqMode === "quantity"
      ? null
      : overrides.fpqAmount !== undefined
        ? overrides.fpqAmount
        : preset.fpqAmount;
  const fpqQuantity =
    fpqMode === "none" || fpqMode === "amount"
      ? null
      : overrides.fpqQuantity !== undefined
        ? overrides.fpqQuantity
        : preset.fpqQuantity;
  const fpqCombinedLogic = overrides.fpqCombinedLogic ?? preset.fpqCombinedLogic;
  const postQualificationMOQ =
    overrides.postQualificationMOQ !== undefined
      ? overrides.postQualificationMOQ
      : preset.postQualificationMOQ;

  await prisma.shop.update({
    where: { id: shopId },
    data: {
      wholesaleBaselinePct: baselinePct,
      fpqMode,
      fpqAmount,
      fpqQuantity,
      fpqCombinedLogic,
      postQualificationMOQ,
    },
  });

  let createdTier: Tier | null = null;
  if (preset.firstTier) {
    createdTier = await createTier({
      shopId,
      name: preset.firstTier.name,
      scope: preset.firstTier.scope,
      minQty: preset.firstTier.minQty,
      discountPct: preset.firstTier.discountPct,
      aggregation: preset.firstTier.aggregation,
    });
  }

  return { presetKey, createdTier };
}

/* -------------------------------------------------------------------------- */
/*                              COMPLETE / SKIP                               */
/* -------------------------------------------------------------------------- */

/**
 * Flip `Shop.onboarded` to true. Idempotent.
 */
export async function markShopOnboarded(shopId: string) {
  return updateShopSettings(shopId, { onboarded: true });
}
