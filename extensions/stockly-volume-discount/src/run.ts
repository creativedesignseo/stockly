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

interface ConfiguredTier {
  /** Inclusive minimum line quantity that activates this tier. */
  minQty: number;
  /** Percentage off the base price (0–100). */
  discountPct: number;
}

interface FunctionConfig {
  tiers?: ConfiguredTier[];
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

  const tiers = (config.tiers ?? []).filter(
    (t) =>
      Number.isFinite(t.minQty) &&
      Number.isFinite(t.discountPct) &&
      t.minQty > 0 &&
      t.discountPct > 0 &&
      t.discountPct <= 100,
  );
  if (tiers.length === 0) return NO_DISCOUNT;

  // 2. Eligibility gate. The Function's input.graphql hardcodes the
  //    default wholesale tag; per-shop custom tags will require either
  //    a metafield-driven tag check or a per-shop Function variant.
  const customerEligible =
    input.cart.buyerIdentity?.customer?.hasAnyTag === true;
  if (!customerEligible) return NO_DISCOUNT;

  // 3. For each line, find the highest-minQty tier the qty satisfies.
  const discounts = input.cart.lines.flatMap((line) => {
    const qty = line.quantity;
    const winning = tiers
      .filter((t) => t.minQty <= qty)
      .sort((a, b) => b.minQty - a.minQty)[0];
    if (!winning) return [];

    const target: Target = { cartLine: { id: line.id } };
    return [
      {
        targets: [target],
        value: {
          percentage: {
            value: winning.discountPct.toString(),
          },
        },
        message: `Wholesale ${winning.discountPct}% off (${winning.minQty}+ units)`,
      },
    ];
  });

  if (discounts.length === 0) return NO_DISCOUNT;

  return {
    discountApplicationStrategy: DiscountApplicationStrategy.All,
    discounts,
  };
}
