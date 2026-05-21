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
type Scope = "all" | "product" | "variant";

interface ConfiguredTier {
  /**
   * Which lines this tier can apply to (ADR-008 P0 #3).
   *  - 'all': every line
   *  - 'product': only lines whose product GID matches scopeId
   *  - 'variant': only lines whose variant GID matches scopeId
   *
   * Missing field treated as 'all' for back-compat with v2
   * configurations (pre-variant-pricing).
   *
   * Collection-scoped tiers are NOT in this payload — see comment
   * in discount-function-sync.server.ts/buildConfiguration.
   */
  scope?: Scope;
  scopeId?: string | null;
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

/**
 * Specificity ranking — variant beats product beats all. When multiple
 * scopes qualify on a line, the more-specific scope's tier wins
 * (highest discountPct within scope is the tiebreaker).
 */
const SCOPE_RANK: Record<Scope, number> = {
  variant: 3,
  product: 2,
  all: 1,
};

/**
 * Does this tier apply to this cart line? Compares the tier's scope
 * against the line's variant + product GIDs.
 */
function tierAppliesToLine(
  tier: ConfiguredTier,
  variantGid: string,
  productGid: string,
): boolean {
  const scope = tier.scope ?? "all";
  if (scope === "all") return true;
  if (scope === "variant") return tier.scopeId === variantGid;
  if (scope === "product") return tier.scopeId === productGid;
  return false;
}

interface FpqConfig {
  /** 'none' | 'amount' | 'quantity' | 'combined' */
  mode?: string;
  amount?: number | null;
  quantity?: number | null;
  /** 'and' | 'or' — only used when mode === 'combined' */
  combinedLogic?: string;
}

interface FunctionConfig {
  /**
   * Universal wholesale discount % applied to every line for any
   * eligible wholesale customer, before any tier composition (ADR-006).
   * 0 means no baseline (legacy behavior).
   */
  wholesaleBaselinePct?: number;
  /**
   * First-Purchase Qualifier (ADR-004). If the customer's id is NOT
   * in `qualifiedCustomers` (still in approved_pre_fpq state), the
   * Function evaluates their cart against this gate before applying
   * any discount. Once qualified, the gate is skipped — wholesale
   * pricing applies on every subsequent cart.
   */
  fpq?: FpqConfig;
  postQualificationMOQ?: number;
  /**
   * GIDs of customers who have already cleared the FPQ. Sourced from
   * Stockly's WholesaleCustomer table. Stored in the shop-level
   * function-configuration metafield (NOT a per-customer metafield)
   * because Shopify treats per-customer metafields as protected data
   * — apps cannot write them without an explicit approval flow that
   * requires a Privacy Policy and a production-quality data use case.
   * The shop-level list keeps the data the Function needs without
   * crossing that line.
   */
  qualifiedCustomers?: string[];
  tiers?: ConfiguredTier[];
}

/**
 * Evaluate whether the cart meets the merchant's FPQ rules.
 * Returns true iff the gate allows the wholesale discount to apply.
 */
function fpqMet(
  fpq: FpqConfig | undefined,
  cartSubtotal: number,
  cartQty: number,
): boolean {
  const mode = fpq?.mode ?? "none";
  if (mode === "none") return true;

  const amountOk =
    typeof fpq?.amount === "number" && fpq.amount > 0
      ? cartSubtotal >= fpq.amount
      : true;
  const quantityOk =
    typeof fpq?.quantity === "number" && fpq.quantity > 0
      ? cartQty >= fpq.quantity
      : true;

  if (mode === "amount") return amountOk;
  if (mode === "quantity") return quantityOk;
  if (mode === "combined") {
    const logic = fpq?.combinedLogic ?? "and";
    return logic === "or" ? amountOk || quantityOk : amountOk && quantityOk;
  }
  return true;
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
  const customer = input.cart.buyerIdentity?.customer;
  const customerEligible = customer?.hasAnyTag === true;
  if (!customerEligible) return NO_DISCOUNT;

  // 2.5 Partition tiers by aggregation mode.
  //    - per_line tiers: each line evaluated independently against
  //      its own qty; also filtered by scope (variant/product/all).
  //    - cart_total tiers: cart-wide qty sum evaluated once; if met,
  //      applies to every line whose scope it matches.
  const perLineTiers = tiers.filter(
    (t) => (t.aggregation ?? "per_line") === "per_line",
  );
  const cartTotalTiers = tiers.filter((t) => t.aggregation === "cart_total");

  // Cart-wide qty for the cart_total branch + FPQ quantity check.
  const cartTotalQty = input.cart.lines.reduce(
    (sum, line) => sum + line.quantity,
    0,
  );

  // 3. Pre-compute per-line discount calculations.
  //    We need the would-be wholesale subtotals BEFORE the FPQ
  //    check, because the FPQ is evaluated on the customer's
  //    final wholesale spend, not the retail cart subtotal
  //    (the customer's "minimum order €500" rule is about how
  //    much they actually pay at wholesale).
  const lineCalcs = input.cart.lines.map((line) => {
    const qty = line.quantity;

    // Resolve this line's variant + product GIDs once for scope checks.
    const merchandise = line.merchandise;
    const variantGid =
      merchandise?.__typename === "ProductVariant" ? merchandise.id : "";
    const productGid =
      merchandise?.__typename === "ProductVariant"
        ? merchandise.product.id
        : "";

    // Per-line winner: best discount among tiers that (a) match this
    // line's scope, (b) meet the per-line qty threshold. Specificity
    // (variant > product > all) is the tiebreaker when discountPct ties.
    const perLineWinning = perLineTiers
      .filter((t) => tierAppliesToLine(t, variantGid, productGid))
      .filter((t) => t.minQty <= qty)
      .sort((a, b) => {
        const dDiff = b.discountPct - a.discountPct;
        if (dDiff !== 0) return dDiff;
        const sa = SCOPE_RANK[(a.scope ?? "all") as Scope];
        const sb = SCOPE_RANK[(b.scope ?? "all") as Scope];
        return sb - sa;
      })[0];

    // Cart-total winner for this line: of all cart_total tiers that
    // match this line's scope, pick the highest discountPct whose
    // minQty is met by the cart-wide qty sum.
    const cartTotalWinning = cartTotalTiers
      .filter((t) => tierAppliesToLine(t, variantGid, productGid))
      .filter((t) => t.minQty <= cartTotalQty)
      .sort((a, b) => b.discountPct - a.discountPct)[0];

    const candidates: ConfiguredTier[] = [];
    if (perLineWinning) candidates.push(perLineWinning);
    if (cartTotalWinning) candidates.push(cartTotalWinning);
    const winningTier = candidates.sort(
      (a, b) => b.discountPct - a.discountPct,
    )[0];

    const tierPct = winningTier?.discountPct ?? 0;
    const composedPct = composeDiscountPct(baseline, tierPct);
    const lineRetail =
      Number(line.cost?.amountPerQuantity?.amount ?? 0) * qty;
    const lineWholesale = lineRetail * (1 - composedPct / 100);

    return {
      line,
      qty,
      winningTier,
      tierPct,
      composedPct,
      lineRetail,
      lineWholesale,
    };
  });

  // Cart subtotal AT WHOLESALE (what the customer would pay if
  // discount were applied) — this is what the FPQ amount is
  // compared to, per ADR-004 clarified semantics: "the customer
  // must spend at least €X on their first wholesale order", not
  // "the customer's retail cart must equal €X".
  const cartWholesaleSubtotal = lineCalcs.reduce(
    (sum, c) => sum + c.lineWholesale,
    0,
  );

  // 4. First-Purchase Qualifier gate. The customer is "qualified" if
  //    Stockly has recorded their qualifying purchase — we store the
  //    list of qualified customer GIDs in the shop-level config
  //    metafield (see comment on FunctionConfig.qualifiedCustomers).
  const customerGid = customer?.id ?? "";
  const qualifiedList = config.qualifiedCustomers ?? [];
  const alreadyQualified =
    customerGid.length > 0 && qualifiedList.includes(customerGid);

  if (!alreadyQualified) {
    if (!fpqMet(config.fpq, cartWholesaleSubtotal, cartTotalQty)) {
      return NO_DISCOUNT;
    }
  }

  // 5. Build discount entries from the pre-computed calculations.
  const discounts = lineCalcs.flatMap((calc) => {
    if (calc.composedPct <= 0) return [];

    let message = `Wholesale ${baseline}%`;
    if (calc.winningTier) {
      const mode =
        calc.winningTier.aggregation === "cart_total" ? "mixed" : "units";
      message = `Wholesale ${baseline}% + ${calc.tierPct}% volume (${calc.winningTier.minQty}+ ${mode})`;
    }

    const target: Target = { cartLine: { id: calc.line.id } };
    return [
      {
        targets: [target],
        value: {
          percentage: {
            value: calc.composedPct.toString(),
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
