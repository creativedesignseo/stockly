/**
 * Stockly Volume Discount — Shopify Function (Product Discount).
 *
 * THIS IS STOCKLY'S CORE PRICING ENGINE.
 *
 * It is the mechanism by which Stockly delivers automated, per-customer,
 * tier-based wholesale pricing on Shopify Basic/Grow plans — features
 * normally locked to Shopify Plus B2B at $2,300/mo. Discount Functions
 * are an official, plan-agnostic Shopify API (not a workaround). See
 * `docs/decisions/ADR-010-b2b-pricing-engine-on-basic-plan.md` for the
 * full architectural rationale and `docs/architecture/b2b-pricing-deep-
 * dive.md` for the implementation map (including the companion Markets
 * `applicationLevel: ALL` technique for catalog-level segmentation when
 * Shopify B2B Companies are enabled).
 *
 * Runs at cart evaluation and checkout. For wholesale-eligible customers
 * (tag-based or qualified-customer-GID-based), applies per-line
 * percentage discounts based on the merchant's tier configuration,
 * sourced from a metafield on the DiscountNode.
 *
 * Why: Sprint 1 shipped client-side tier calculation in the Quick Order
 * Form, but the discount was display-only — Shopify's cart used base
 * prices. This Function enforces the discount server-side at checkout,
 * so what the customer sees in the storefront matches what they pay.
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

type Aggregation = "per_line" | "cart_total" | "mix_variants";
type Scope = "all" | "product" | "variant";
type CustomerEligibility =
  | "wholesale_tagged"
  | "logged_in"
  | "all_customers"
  | "specific_customers";

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
  /**
   * DEPRECATED 2026-05-27: legacy single-target GID. Kept so older
   * metafields written before the multi-target migration still match.
   * New writes also populate scopeIds.
   */
  scopeId?: string | null;
  /**
   * NEW 2026-05-27: list of target GIDs the rule applies to. When
   * present, the Function matches a line if its variant/product GID
   * is ANY of these. Empty/missing falls back to scopeId.
   */
  scopeIds?: string[];
  /** Inclusive minimum quantity that activates this tier. */
  minQty: number;
  /**
   * ADR-012: inclusive upper bound for this band. null/missing =
   * open-ended ("and above"). Back-compat: legacy metafields without
   * the field behave exactly like today.
   */
  quantityTo?: number | null;
  /** Percentage off the base price (0–100). Used when
   * discountType is "percentage" (or missing — back-compat). */
  discountPct: number;
  /** "percentage" (default), "fixed_amount", or "fixed_price"
   * (ADR-012). */
  discountType?: "percentage" | "fixed_amount" | "fixed_price";
  /** Flat money amount off PER UNIT, in shop currency. Only
   * meaningful when discountType = "fixed_amount". */
  discountAmount?: number;
  /** ADR-012: final per-unit price (overrides retail) when
   * discountType = "fixed_price". Baseline composition is skipped. */
  discountFixedPrice?: number;
  /**
   * How minQty is evaluated against the cart (ADR-007 + ADR-012).
   * 'per_line' (default): each line's qty individually checked.
   * 'cart_total': SUM of all eligible line quantities checked once.
   * 'mix_variants' (ADR-012): SUM across variants of the same
   *   product within scope; lets buyers mix sizes to hit the minimum.
   * Missing field treated as 'per_line' for back-compat.
   */
  aggregation?: Aggregation;
  /**
   * Per-tier customer eligibility (ADR-011, 2026-05-27).
   * Missing field treated as 'wholesale_tagged' (the pre-migration
   * default — only customers with the shop's wholesale tag qualify).
   */
  customerEligibility?: CustomerEligibility;
  /**
   * ADR-012: active-date window. ISO-8601 strings. Compared at DATE
   * granularity (see nowIso derivation below) against `shop.localTime.date`.
   * null / missing = no gate on that side.
   */
  startsAt?: string | null;
  endsAt?: string | null;
  /** ADR-012: rule grouping key. Diagnostics only today. */
  groupId?: string;
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
  // Build the target id list: scopeIds (new, multi-target) takes
  // priority. Fallback to single scopeId for back-compat with
  // metafields written before 2026-05-27.
  const ids =
    tier.scopeIds && tier.scopeIds.length > 0
      ? tier.scopeIds
      : tier.scopeId
        ? [tier.scopeId]
        : [];
  if (ids.length === 0) return false;
  if (scope === "variant") return ids.includes(variantGid);
  if (scope === "product") return ids.includes(productGid);
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

  // ADR-012: a fixed_price tier legitimately carries discountPct = 0
  // because the discount value is in `discountFixedPrice` instead.
  // The legacy `discountPct > 0` filter would silently drop those —
  // accept them when the per-type value is present and > 0.
  const tiers = (config.tiers ?? []).filter((t) => {
    if (!Number.isFinite(t.minQty) || t.minQty <= 0) return false;
    const type = t.discountType ?? "percentage";
    if (type === "fixed_price") {
      return (
        typeof t.discountFixedPrice === "number" && t.discountFixedPrice > 0
      );
    }
    if (type === "fixed_amount") {
      return typeof t.discountAmount === "number" && t.discountAmount > 0;
    }
    // percentage (default)
    return (
      Number.isFinite(t.discountPct) &&
      t.discountPct > 0 &&
      t.discountPct <= 100
    );
  });

  // ADR-012: active-date filter. Shopify Functions execute in a
  // deterministic sandbox with NO real wall clock — `new Date()` /
  // `Date.now()` inside the JS runtime returns a fixed epoch (1970),
  // not the real time. `shop.localTime.date` is Shopify's sanctioned
  // way to read the store's actual current date from OUTSIDE the
  // sandbox; it's day-granularity only (no `dateTime` scalar exists
  // on LocalTime), so the comparison below is date-level, not
  // instant-level, even though startsAt/endsAt are stored as full
  // ISO timestamps upstream — we compare only their date portion.
  const today = input.shop.localTime.date;
  const activeTiers = tiers.filter((t) => {
    if (t.startsAt && today < t.startsAt.slice(0, 10)) return false;
    if (t.endsAt && today > t.endsAt.slice(0, 10)) return false;
    return true;
  });

  // No baseline AND no currently-active tiers → nothing to apply.
  if (baseline === 0 && activeTiers.length === 0) return NO_DISCOUNT;

  // 2. Per-tier customer eligibility (ADR-011, 2026-05-27).
  //    Replaces the previous global "customer must be wholesale-tagged"
  //    gate. Each tier now declares its own eligibility mode; tiers
  //    that don't match the current customer are dropped from the
  //    candidate set before the per-line winner selection runs.
  //
  //    Back-compat: tiers written before this migration are missing
  //    the field; we treat them as 'wholesale_tagged', so a customer
  //    without the wholesale tag still gets no discount on legacy
  //    metafields. New tiers can opt into 'logged_in' or
  //    'all_customers' to broaden eligibility.
  //
  //    Baseline gate: baseline is shop-wide and was historically tied
  //    to the wholesale tag. We preserve that — `effectiveBaseline`
  //    becomes 0 for customers without the tag, so they only get the
  //    tier's discountPct/discountAmount (no baseline composition).
  const customer = input.cart.buyerIdentity?.customer;
  const customerHasWholesaleTag = customer?.hasAnyTag === true;
  const customerLoggedIn = !!customer?.id;

  function tierMatchesCustomer(tier: ConfiguredTier): boolean {
    const elig = tier.customerEligibility ?? "wholesale_tagged";
    if (elig === "all_customers") return true;
    if (elig === "logged_in") return customerLoggedIn;
    if (elig === "wholesale_tagged") return customerHasWholesaleTag;
    // 'specific_customers' is reserved (Sprint 5) — the GID-list
    // field doesn't ship yet, so this mode currently disables the
    // tier. Safer than matching everyone.
    return false;
  }

  // Pre-filter the candidate set by customer eligibility once, before
  // splitting by aggregation. Saves work in the per-line loop below.
  // Note: pre-active-date filter (activeTiers) ran above — we further
  // restrict by customer eligibility here.
  const eligibleTiers = activeTiers.filter(tierMatchesCustomer);
  if (eligibleTiers.length === 0 && !customerHasWholesaleTag) {
    // No tier matches this customer AND baseline doesn't apply
    // (baseline is gated on the wholesale tag). Nothing to do.
    return NO_DISCOUNT;
  }
  const effectiveBaseline = customerHasWholesaleTag ? baseline : 0;

  // 2.5 Partition tiers by aggregation mode (ADR-007 + ADR-012).
  //    - per_line tiers: each line evaluated independently against
  //      its own qty; also filtered by scope (variant/product/all).
  //    - cart_total tiers: cart-wide qty sum evaluated once; if met,
  //      applies to every line whose scope it matches.
  //    - mix_variants tiers: sum across variants of the same product
  //      within scope; lets buyers mix sizes/colors to clear minQty.
  const perLineTiers = eligibleTiers.filter(
    (t) => (t.aggregation ?? "per_line") === "per_line",
  );
  const cartTotalTiers = eligibleTiers.filter(
    (t) => t.aggregation === "cart_total",
  );
  const mixVariantTiers = eligibleTiers.filter(
    (t) => t.aggregation === "mix_variants",
  );

  // Cart-wide qty for the cart_total branch + FPQ quantity check.
  const cartTotalQty = input.cart.lines.reduce(
    (sum, line) => sum + line.quantity,
    0,
  );

  // ADR-012: per-product qty Map used by the mix_variants branch.
  // Built once before the per-line loop to avoid O(N²). The Map keys
  // are product GIDs; the value is the sum of cart line quantities
  // across all variants of that product. Out-of-scope products are
  // included — but the `tierAppliesToLine` filter inside the per-line
  // loop drops them, so they don't affect any tier.
  const qtyByProduct = new Map<string, number>();
  for (const line of input.cart.lines) {
    const m = line.merchandise;
    if (m?.__typename !== "ProductVariant") continue;
    const pid = m.product.id;
    qtyByProduct.set(pid, (qtyByProduct.get(pid) ?? 0) + line.quantity);
  }

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

    // ADR-012: a tier's qty signal must satisfy its quantityTo upper
    // bound (when present). Helper below applied to all three branches.
    const qtyInRange = (t: ConfiguredTier, signalQty: number): boolean =>
      t.minQty <= signalQty && (t.quantityTo == null || signalQty <= t.quantityTo);

    // Per-line winner: best discount among tiers that (a) match this
    // line's scope, (b) meet the per-line qty band. Specificity
    // (variant > product > all) is the tiebreaker when discountPct ties.
    const perLineWinning = perLineTiers
      .filter((t) => tierAppliesToLine(t, variantGid, productGid))
      .filter((t) => qtyInRange(t, qty))
      .sort((a, b) => {
        const dDiff = b.discountPct - a.discountPct;
        if (dDiff !== 0) return dDiff;
        const sa = SCOPE_RANK[(a.scope ?? "all") as Scope];
        const sb = SCOPE_RANK[(b.scope ?? "all") as Scope];
        return sb - sa;
      })[0];

    // Cart-total winner for this line: of all cart_total tiers that
    // match this line's scope, pick the highest discountPct whose
    // band contains the cart-wide qty sum.
    const cartTotalWinning = cartTotalTiers
      .filter((t) => tierAppliesToLine(t, variantGid, productGid))
      .filter((t) => qtyInRange(t, cartTotalQty))
      .sort((a, b) => b.discountPct - a.discountPct)[0];

    // ADR-012: mix_variants winner — qty signal is the sum across this
    // line's product's variants. Falls back to 0 when the line isn't
    // a ProductVariant (in which case qtyInRange returns false).
    const mixQty = qtyByProduct.get(productGid) ?? 0;
    const mixVariantWinning = mixVariantTiers
      .filter((t) => tierAppliesToLine(t, variantGid, productGid))
      .filter((t) => qtyInRange(t, mixQty))
      .sort((a, b) => b.discountPct - a.discountPct)[0];

    const candidates: ConfiguredTier[] = [];
    if (perLineWinning) candidates.push(perLineWinning);
    if (cartTotalWinning) candidates.push(cartTotalWinning);
    if (mixVariantWinning) candidates.push(mixVariantWinning);
    const winningTier = candidates.sort(
      (a, b) => b.discountPct - a.discountPct,
    )[0];

    // Tier type semantics:
    //   - "percentage" (or missing for back-compat): tierPct applies
    //     multiplicatively with baseline (current behavior).
    //   - "fixed_amount": discountAmount is subtracted per unit AFTER
    //     the baseline applies. tierPct = 0 for the % composition step.
    //   - "fixed_price" (ADR-012): discountFixedPrice is the FINAL
    //     per-unit price; baseline is ignored entirely for this line.
    const tierType = winningTier?.discountType ?? "percentage";
    const tierPct =
      tierType === "percentage" ? (winningTier?.discountPct ?? 0) : 0;
    const tierFixedPerUnit =
      tierType === "fixed_amount" ? (winningTier?.discountAmount ?? 0) : 0;
    const tierFinalPerUnit =
      tierType === "fixed_price" ? (winningTier?.discountFixedPrice ?? 0) : 0;
    // effectiveBaseline (0 when customer isn't wholesale-tagged) keeps
    // baseline composition private to customers with the shop tag,
    // while still letting "all_customers" / "logged_in" tiers apply
    // their tierPct/fixedAmount to everyone they're scoped to.
    const composedPct = composeDiscountPct(effectiveBaseline, tierPct);
    const perUnitRetail = Number(line.cost?.amountPerQuantity?.amount ?? 0);
    const lineRetail = perUnitRetail * qty;
    // Apply baseline as a multiplier, then subtract the fixed amount
    // per unit × qty. Clamp at 0 to never go negative (Shopify would
    // reject a discount that makes the line cost less than 0).
    let lineWholesale: number;
    if (tierType === "fixed_price") {
      // ADR-012: if the final per-unit price isn't strictly less than
      // retail, the tier is a no-op for this line — Shopify rejects
      // negative discounts (no markups).
      if (tierFinalPerUnit >= perUnitRetail || tierFinalPerUnit <= 0) {
        lineWholesale = lineRetail;
      } else {
        lineWholesale = tierFinalPerUnit * qty;
      }
    } else {
      lineWholesale = Math.max(
        0,
        lineRetail * (1 - composedPct / 100) - tierFixedPerUnit * qty,
      );
    }

    return {
      line,
      qty,
      winningTier,
      tierType,
      tierPct,
      tierFixedPerUnit,
      tierFinalPerUnit,
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
  //    Emit shape depends on whether the winning tier is percentage
  //    (multiplicative composition via `percentage` value) or
  //    fixed_amount (flat per-line money off via `fixedAmount` value).
  //    For fixed_amount tiers we collapse baseline + tier into ONE
  //    `fixedAmount` entry whose value is the total money discount
  //    on the line — guarantees Shopify computes the same wholesale
  //    price we precomputed in lineWholesale.
  type DiscountEntry = FunctionRunResult["discounts"][number];
  const discounts: DiscountEntry[] = lineCalcs.flatMap<DiscountEntry>((calc) => {
    if (calc.lineRetail <= 0) return [];
    // Nothing to discount (no baseline, no tier of any type).
    if (
      calc.composedPct <= 0 &&
      calc.tierFixedPerUnit <= 0 &&
      calc.tierFinalPerUnit <= 0
    )
      return [];
    // ADR-012: a fixed_price tier where final >= retail is a no-op
    // (lineWholesale == lineRetail). Skip emission to avoid a 0
    // discount entry that confuses Shopify's checkout label.
    if (calc.lineWholesale >= calc.lineRetail) return [];

    const target: Target = { cartLine: { id: calc.line.id } };
    // Display effectiveBaseline (what we actually composed) instead of
    // the raw shop baseline — a non-wholesale-tagged customer with an
    // "all_customers" tier would otherwise see "Wholesale 60%" in the
    // checkout label even though we only applied the tier's % share.
    let message = `Wholesale ${effectiveBaseline}%`;
    if (calc.winningTier) {
      const agg = calc.winningTier.aggregation;
      const mode =
        agg === "cart_total"
          ? "mixed"
          : agg === "mix_variants"
            ? "mix"
            : "units";
      if (calc.tierType === "fixed_amount") {
        message = `Wholesale ${effectiveBaseline}% + €${calc.tierFixedPerUnit} off/unit (${calc.winningTier.minQty}+ ${mode})`;
      } else if (calc.tierType === "fixed_price") {
        message = `Wholesale ${effectiveBaseline}% + €${calc.tierFinalPerUnit}/unit fixed (${calc.winningTier.minQty}+ ${mode})`;
      } else {
        message = `Wholesale ${effectiveBaseline}% + ${calc.tierPct}% volume (${calc.winningTier.minQty}+ ${mode})`;
      }
    }

    if (calc.tierType === "fixed_amount" || calc.tierType === "fixed_price") {
      // Both money-typed paths emit one fixedAmount entry whose value
      // is the total off-line money so Shopify's checkout math matches
      // our precomputed wholesale exactly. .toFixed(2) keeps things in
      // cents, avoiding floating-point surprises at checkout.
      const lineDiscountMoney = (calc.lineRetail - calc.lineWholesale).toFixed(
        2,
      );
      return [
        {
          targets: [target],
          value: { fixedAmount: { amount: lineDiscountMoney } },
          message,
        },
      ];
    }

    // Percentage path (current behavior).
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
