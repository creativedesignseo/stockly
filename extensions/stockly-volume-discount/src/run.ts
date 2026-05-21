/**
 * Stockly Volume Discount — Shopify Function (Product Discount).
 *
 * Runs at cart evaluation and checkout. For wholesale-tagged customers,
 * applies per-line percentage discounts based on the merchant's tier
 * configuration, sourced from a metafield on the DiscountNode.
 *
 * Why: Sprint 1 shipped client-side tier calculation in the Quick Order
 * Form, but the discount was display-only — Shopify's cart used base
 * prices. This Function enforces the discount server-side at checkout.
 *
 * Config shape on `discountNode.metafield("$app:stockly-volume-discount",
 * "function-configuration")`:
 *
 *   {
 *     "tiers": [
 *       { "minQty": 10, "discountPct": 10 },
 *       { "minQty": 50, "discountPct": 15 },
 *       ...
 *     ]
 *   }
 *
 * v1 scope: shop-wide tiers only (no product/collection scoping). The
 * stockly admin syncs `Tier` rows with `scope='all'` into this metafield
 * via `app/services/discount-function-sync.server.ts`. Per-collection /
 * per-product tier enforcement at checkout lands in v2 (likely via
 * per-product metafields the Function reads via `merchandise.product.metafield`).
 */

import type { RunInput, FunctionRunResult, Target } from "../generated/api";
import { DiscountApplicationStrategy } from "../generated/api";

type Aggregation = "per_line" | "cart_total";

interface ConfiguredTier {
  /** Inclusive minimum quantity that activates this tier. */
  minQty: number;
  /** Percentage off the base price (0–100). */
  discountPct: number;
  /**
   * How minQty is evaluated against the cart (ADR-007).
   * 'per_line' (default): each line's qty individually checked.
   * 'cart_total': SUM of all eligible line quantities checked once.
   * Missing field treated as 'per_line' for back-compat with v1
   * configurations still in the wild.
   */
  aggregation?: Aggregation;
}

interface FunctionConfig {
  /**
   * Universal wholesale discount % applied to every line for any
   * eligible wholesale customer, before any tier composition (ADR-006).
   * 0 means no baseline (legacy behavior).
   */
  wholesaleBaselinePct?: number;
  tiers?: ConfiguredTier[];
}

/**
 * Compose baseline and tier discounts multiplicatively
 * (per memory/wholesale-pricing-composition).
 *
 *   factor = (1 - baseline/100) × (1 - tier/100)
 *   composedPct = (1 - factor) × 100
 *
 * Returns a number in [0, 100]. Inputs are clamped defensively.
 */
function composeDiscountPct(baseline: number, tier: number): number {
  const b = Math.min(100, Math.max(0, baseline));
  const t = Math.min(100, Math.max(0, tier));
  const factor = (1 - b / 100) * (1 - t / 100);
  const composed = (1 - factor) * 100;
  // Round to 4 decimals to avoid floating-point noise in the metafield
  // round-trip (Shopify accepts up to 4 decimal places on percentage).
  return Math.round(composed * 10000) / 10000;
}

// Strategy.All so every matching line gets its own discount applied.
// First was a bug: with `First`, Shopify applied the discount to only
// the FIRST cart line that matched and silently ignored the rest, so
// adding a second qualifying product to the cart "stole" the discount
// from the first one (or vice versa) instead of both getting it.
const NO_DISCOUNT: FunctionRunResult = {
  discountApplicationStrategy: DiscountApplicationStrategy.All,
  discounts: [],
};

export function run(input: RunInput): FunctionRunResult {
  // 1. Parse merchant config from the DiscountNode metafield.
  let config: FunctionConfig;
  try {
    config = JSON.parse(input.discountNode?.metafield?.value ?? "{}");
  } catch {
    return NO_DISCOUNT;
  }

  const baseline = Number.isFinite(config.wholesaleBaselinePct)
    ? Math.min(100, Math.max(0, config.wholesaleBaselinePct ?? 0))
    : 0;

  const tiers = (config.tiers ?? []).filter(
    (t) =>
      Number.isFinite(t.minQty) &&
      Number.isFinite(t.discountPct) &&
      t.minQty > 0 &&
      t.discountPct > 0 &&
      t.discountPct <= 100,
  );

  // No baseline AND no tiers → nothing to apply.
  if (baseline === 0 && tiers.length === 0) return NO_DISCOUNT;

  // 2. Eligibility gate. The Function's input.graphql hardcodes the
  //    default wholesale tag; per-shop custom tags will require either
  //    a metafield-driven tag check or a per-shop Function variant.
  const customerEligible =
    input.cart.buyerIdentity?.customer?.hasAnyTag === true;
  if (!customerEligible) return NO_DISCOUNT;

  // 3. Partition tiers by aggregation mode.
  //    - per_line tiers: each line evaluated independently
  //    - cart_total tiers: cart-wide qty sum evaluated once; if met,
  //      applies to every line (v1 shop-wide; per-scope filtering in
  //      a follow-up commit when product metafields are wired)
  const perLineTiers = tiers.filter(
    (t) => (t.aggregation ?? "per_line") === "per_line",
  );
  const cartTotalTiers = tiers.filter((t) => t.aggregation === "cart_total");

  // Cart-wide qty for the cart_total branch.
  const cartTotalQty = input.cart.lines.reduce(
    (sum, line) => sum + line.quantity,
    0,
  );
  const cartWinningTier = cartTotalTiers
    .filter((t) => t.minQty <= cartTotalQty)
    .sort((a, b) => b.minQty - a.minQty)[0];

  // 4. For each line, pick the best tier between its per-line match
  //    and any active cart-total tier, then compose with baseline.
  const discounts = input.cart.lines.flatMap((line) => {
    const qty = line.quantity;
    const perLineWinning = perLineTiers
      .filter((t) => t.minQty <= qty)
      .sort((a, b) => b.minQty - a.minQty)[0];

    // The "best" tier for THIS line is whichever gives the higher
    // discount %, combining the two aggregation modes cleanly.
    const candidates: ConfiguredTier[] = [];
    if (perLineWinning) candidates.push(perLineWinning);
    if (cartWinningTier) candidates.push(cartWinningTier);
    const winningTier = candidates.sort(
      (a, b) => b.discountPct - a.discountPct,
    )[0];

    const tierPct = winningTier?.discountPct ?? 0;
    const composedPct = composeDiscountPct(baseline, tierPct);
    if (composedPct <= 0) return [];

    let message = `Wholesale ${baseline}%`;
    if (winningTier) {
      const mode = winningTier.aggregation === "cart_total" ? "mixed" : "units";
      message = `Wholesale ${baseline}% + ${tierPct}% volume (${winningTier.minQty}+ ${mode})`;
    }

    const target: Target = { cartLine: { id: line.id } };
    return [
      {
        targets: [target],
        value: {
          percentage: {
            value: composedPct.toString(),
          },
        },
        message,
      },
    ];
  });

  if (discounts.length === 0) return NO_DISCOUNT;

  return {
    discountApplicationStrategy: DiscountApplicationStrategy.All,
    discounts,
  };
}
