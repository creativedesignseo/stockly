/**
 * Tier service — volume pricing tier resolution.
 *
 * Core business logic: given a shop + product/collection + quantity,
 * resolve which tier applies and compute the discounted price.
 *
 * Resolution precedence (highest to lowest specificity):
 *   1. Tier scoped to the specific product (scope = 'product', scopeId = product gid)
 *   2. Tier scoped to a collection that contains the product (scope = 'collection')
 *   3. Tier scoped to all products (scope = 'all', scopeId = null)
 *
 * Within the same scope, the tier with the highest minQty <= currentQty wins.
 */
import { randomUUID } from "node:crypto";
import prisma from "../db.server";
import type { Tier } from "@prisma/client";

export type TierScope = "product" | "variant" | "collection" | "all";
/**
 * Which admin area owns a rule (ADR-014). 'wholesale' = flat discount
 * (one value per rule, no quantity), managed under /app/pricing.
 * 'volume' = quantity-break bands, managed under /app/volume-pricing.
 * Organizational only — the Discount Function treats both identically.
 */
export type TierKind = "wholesale" | "volume";
/**
 * Aggregation modes (ADR-007 + ADR-012).
 *  - 'per_line': each line's qty individually evaluated.
 *  - 'cart_total': sum of all eligible-scope line quantities.
 *  - 'mix_variants' (2026-05-27): sum across variants of the same
 *    product within scope. Lets buyers mix sizes/colors to hit a
 *    minimum without inflating any single variant's qty.
 */
export type TierAggregation = "per_line" | "cart_total" | "mix_variants";
/**
 * Per-rule customer eligibility (ADR-011, Sami-parity).
 * Values must match the column default in prisma/schema.prisma.
 */
export type TierCustomerEligibility =
  | "wholesale_tagged"
  | "logged_in"
  | "all_customers"
  | "specific_customers";
/**
 * Per-rule market eligibility (Sami-parity, Sprint 5 will activate
 * 'specific_markets' once the Function input + picker land).
 */
export type TierMarketEligibility = "all_markets" | "specific_markets";

export interface ResolveTierInput {
  shopId: string;
  productGid: string;
  /** Collection GIDs the product belongs to (caller resolves via Shopify API). */
  collectionGids?: string[];
  quantity: number;
}

export interface ResolveTierResult {
  /** The matching tier, or null if no tier applies. */
  tier: Tier | null;
  /** Effective discount percent (0 if no tier matched). */
  discountPct: number;
  /** Hint for the next tier (UX: "add X more to unlock Y%"). */
  nextTier?: {
    minQty: number;
    discountPct: number;
    missingQty: number;
  };
}

/**
 * Resolve the applicable tier for a (shop, product, qty) combination.
 *
 * Performance: one query fetches all candidate tiers for the shop;
 * filtering and ranking happen in memory. Acceptable for tier counts
 * up to ~hundreds per shop. Re-evaluate at 1k+ tiers.
 */
export async function resolveTier(
  input: ResolveTierInput,
): Promise<ResolveTierResult> {
  const { shopId, productGid, collectionGids = [], quantity } = input;

  // Pull all active tiers for the shop that could possibly match.
  // Variant scope is resolved by the caller against line.merchandise.id;
  // here we leave the OR open to any scope and let the precedence ranker
  // pick the most-specific qualifying tier.
  //
  // 2026-05-27: scopeIds[] is the new multi-target storage. We match
  // both `scopeIds has X` (new) and `scopeId == X` (legacy) so tiers
  // written before the migration keep working until the back-fill runs.
  const candidates = await prisma.tier.findMany({
    where: {
      shopId,
      active: true,
      OR: [
        { scope: "variant" },
        { scope: "product", scopeIds: { has: productGid } },
        { scope: "product", scopeId: productGid },
        { scope: "collection", scopeIds: { hasSome: collectionGids } },
        { scope: "collection", scopeId: { in: collectionGids } },
        { scope: "all" },
      ],
    },
    orderBy: [{ minQty: "desc" }],
  });

  // Rank by scope specificity, then by minQty (highest qualifying wins).
  // Variant beats product beats collection beats all — matches the
  // intuitive "more specific overrides less specific" rule.
  const scopeRank: Record<TierScope, number> = {
    variant: 4,
    product: 3,
    collection: 2,
    all: 1,
  };

  const now = new Date();
  const qualifying = candidates
    .filter((t) => t.minQty <= quantity)
    // ADR-012: enforce per-band upper bound. Null = open-ended.
    .filter((t) => t.quantityTo == null || quantity <= t.quantityTo)
    // ADR-012: enforce active-date window. Null = no gate.
    .filter(
      (t) =>
        (t.startsAt == null || now >= t.startsAt) &&
        (t.endsAt == null || now <= t.endsAt),
    )
    .sort((a, b) => {
      const rankDiff =
        scopeRank[b.scope as TierScope] - scopeRank[a.scope as TierScope];
      if (rankDiff !== 0) return rankDiff;
      return b.minQty - a.minQty;
    });

  const tier = qualifying[0] ?? null;

  // Find the next tier the customer could unlock (same product scope preferred).
  const nextCandidates = candidates
    .filter((t) => t.minQty > quantity)
    .sort((a, b) => a.minQty - b.minQty);
  const nextTier = nextCandidates[0];

  return {
    tier,
    discountPct: tier?.discountPct ?? 0,
    nextTier: nextTier
      ? {
          minQty: nextTier.minQty,
          discountPct: nextTier.discountPct,
          missingQty: nextTier.minQty - quantity,
        }
      : undefined,
  };
}

/**
 * Apply a discount percent to a base price.
 * Returns the discounted price rounded to 2 decimals.
 */
export function applyDiscount(basePrice: number, discountPct: number): number {
  if (discountPct <= 0) return basePrice;
  if (discountPct >= 100) return 0;
  const discounted = basePrice * (1 - discountPct / 100);
  return Math.round(discounted * 100) / 100;
}

/**
 * List tiers for a shop.
 *
 * Pass `activeOnly: true` for storefront-facing calls (App Proxy);
 * inactive tiers should never reach the customer. Admin lists pass
 * no options so merchants can see and manage inactive tiers too.
 */
export async function listTiers(
  shopId: string,
  options: { activeOnly?: boolean; kind?: TierKind } = {},
) {
  return prisma.tier.findMany({
    where: {
      shopId,
      ...(options.activeOnly ? { active: true } : {}),
      ...(options.kind ? { kind: options.kind } : {}),
    },
    // `position` and `minQty` collide on most freshly-created tiers
    // (default position=0, similar minQty). Without a stable tiebreaker
    // Postgres returns rows in arbitrary order on every query, which
    // makes the admin list reshuffle after each inline toggle (the
    // loader revalidates after a fetcher POST). `createdAt: desc` keeps
    // newer rules at the top and is stable across refetches.
    orderBy: [
      { position: "asc" },
      { minQty: "asc" },
      { createdAt: "desc" },
    ],
  });
}

/**
 * Fetch a tier by id, scoped to the shop.
 *
 * Returns null if the tier doesn't exist OR belongs to a different shop.
 * Always pass shopId so a user can't probe another tenant's IDs.
 */
export async function getTier(id: string, shopId: string) {
  return prisma.tier.findFirst({ where: { id, shopId } });
}

/**
 * Create a new tier.
 *
 * Discount types (ADR-012):
 *  - 'percentage' (default): use discountPct, multiplicative on baseline.
 *  - 'fixed_amount': use discountAmount, flat per-unit money off.
 *  - 'fixed_price' (2026-05-27): use discountFixedPrice as the FINAL
 *    per-unit price. Baseline is ignored. Function emits a fixedAmount
 *    discount equal to (retail - fixedPrice) × qty per line.
 */
export type TierDiscountType = "percentage" | "fixed_amount" | "fixed_price";

export async function createTier(data: {
  shopId: string;
  name: string;
  /** ADR-014: 'wholesale' (default) or 'volume'. */
  kind?: TierKind;
  scope: TierScope;
  /** DEPRECATED: legacy single-target GID. Prefer scopeIds. */
  scopeId?: string | null;
  /** NEW 2026-05-27: multiple target GIDs for one rule. */
  scopeIds?: string[];
  minQty: number;
  /** ADR-012 (2026-05-27): upper bound for this band. null = open-ended. */
  quantityTo?: number | null;
  discountPct: number;
  /** "percentage" (default), "fixed_amount", or "fixed_price" (2026-05-27). */
  discountType?: TierDiscountType;
  /** Flat money off per unit when discountType is "fixed_amount". */
  discountAmount?: number | null;
  /** ADR-012: final per-unit price when discountType = 'fixed_price'. */
  discountFixedPrice?: number | null;
  aggregation?: TierAggregation;
  /** Per-rule customer eligibility (default 'wholesale_tagged'). */
  customerEligibility?: TierCustomerEligibility;
  /** Per-rule market eligibility (default 'all_markets'). */
  marketEligibility?: TierMarketEligibility;
  /** GIDs of Markets restricting this rule when marketEligibility = 'specific_markets'. */
  marketIds?: string[];
  /** ADR-012: identifies the Volume Pricing rule this band belongs to.
   * Auto-generated when omitted so legacy single-call sites still produce
   * a 1-band group matching the today UX. */
  groupId?: string | null;
  /** ADR-012: active-date window read by the WASM Function at run time. */
  startsAt?: Date | null;
  endsAt?: Date | null;
  /** ADR-012 Phase-1 storage. Theme block ships Phase 2. */
  showTableOnPdp?: boolean;
  tableTemplateId?: string | null;
  position?: number;
}) {
  // Normalize targets. 'all' scope must not carry any target ids.
  // Otherwise accept either scopeIds[] (preferred) or legacy scopeId
  // and mirror them: scopeIds is the source of truth, scopeId mirrors
  // scopeIds[0] for back-compat reads.
  const isAll = data.scope === "all";
  const scopeIds = isAll
    ? []
    : ((data.scopeIds && data.scopeIds.length > 0
        ? data.scopeIds
        : data.scopeId
          ? [data.scopeId]
          : []) as string[]);
  const scopeId = isAll ? null : (scopeIds[0] ?? null);
  const discountType: TierDiscountType = data.discountType ?? "percentage";
  // ADR-012: every band must carry a groupId. Auto-generate one for
  // legacy single-call sites so they keep producing 1-band groups.
  const groupId = data.groupId ?? randomUUID();
  // showTableOnPdp only meaningful on product/variant scopes (§4.8).
  const showTableOnPdp =
    data.showTableOnPdp && (data.scope === "product" || data.scope === "variant")
      ? true
      : false;
  return prisma.tier.create({
    data: {
      shopId: data.shopId,
      name: data.name,
      kind: data.kind ?? "wholesale",
      scope: data.scope,
      scopeId,
      scopeIds,
      minQty: data.minQty,
      quantityTo: data.quantityTo ?? null,
      discountPct: data.discountPct,
      discountType,
      discountAmount:
        discountType === "fixed_amount" ? (data.discountAmount ?? null) : null,
      discountFixedPrice:
        discountType === "fixed_price" ? (data.discountFixedPrice ?? null) : null,
      aggregation: data.aggregation ?? "per_line",
      customerEligibility: data.customerEligibility ?? "wholesale_tagged",
      marketEligibility: data.marketEligibility ?? "all_markets",
      marketIds:
        data.marketEligibility === "specific_markets"
          ? (data.marketIds ?? [])
          : [],
      groupId,
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
      showTableOnPdp,
      tableTemplateId: data.tableTemplateId ?? null,
      position: data.position ?? 0,
    },
  });
}

/**
 * Update an existing tier.
 */
export async function updateTier(
  id: string,
  data: Partial<{
    name: string;
    scope: TierScope;
    scopeId: string | null;
    scopeIds: string[];
    minQty: number;
    quantityTo: number | null;
    discountPct: number;
    discountType: TierDiscountType;
    discountAmount: number | null;
    discountFixedPrice: number | null;
    aggregation: TierAggregation;
    customerEligibility: TierCustomerEligibility;
    marketEligibility: TierMarketEligibility;
    marketIds: string[];
    groupId: string | null;
    startsAt: Date | null;
    endsAt: Date | null;
    showTableOnPdp: boolean;
    tableTemplateId: string | null;
    active: boolean;
    position: number;
  }>,
) {
  // Match createTier's invariant: when switching to percentage type,
  // null out the fixed-amount field so the DB never carries stale
  // mixed-type data that the Function could misinterpret.
  const cleaned: typeof data = { ...data };
  if (cleaned.discountType === "percentage") {
    cleaned.discountAmount = null;
    cleaned.discountFixedPrice = null;
  } else if (cleaned.discountType === "fixed_amount") {
    cleaned.discountFixedPrice = null;
  } else if (cleaned.discountType === "fixed_price") {
    cleaned.discountAmount = null;
  }
  // Keep scopeId and scopeIds in sync. If the caller passed scopeIds
  // (or set scope='all'), authoritatively re-derive scopeId from it.
  // If they only passed scopeId (legacy callers), mirror it into
  // scopeIds so new reads find the rule too.
  if (cleaned.scope === "all") {
    cleaned.scopeIds = [];
    cleaned.scopeId = null;
  } else if (Array.isArray(cleaned.scopeIds)) {
    cleaned.scopeId = cleaned.scopeIds[0] ?? null;
  } else if (cleaned.scopeId !== undefined) {
    cleaned.scopeIds = cleaned.scopeId ? [cleaned.scopeId] : [];
  }
  // Market eligibility invariants. If switching back to 'all_markets'
  // (or any non-specific mode), null out the marketIds so the DB never
  // carries a stale list that future Function code could misread.
  if (cleaned.marketEligibility && cleaned.marketEligibility !== "specific_markets") {
    cleaned.marketIds = [];
  }
  return prisma.tier.update({ where: { id }, data: cleaned });
}

/**
 * Delete a tier permanently. (Prefer setting `active = false` to keep history.)
 */
export async function deleteTier(id: string) {
  return prisma.tier.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// ADR-012 — Volume Pricing multi-band helpers.
//
// A "rule" is a set of one or more Tier rows that share the same `groupId`.
// All bands in a rule share rule-level fields (scope/scopeIds,
// customer/market eligibility, aggregation, active dates,
// showTableOnPdp, name, active); they differ only by per-band quantity
// + discount fields. Legacy single-band tiers are also "rules" — they
// just have N=1.
// ---------------------------------------------------------------------------

/**
 * One row of the multi-band editor table. The rule-level fields live on
 * the parent `createRule` / `updateRule` call; the band only carries the
 * fields that differ across bands.
 */
export interface BandInput {
  minQty: number;
  /** Null = open-ended ("and above"). Only the last band may be null. */
  quantityTo: number | null;
  discountType: TierDiscountType;
  /** Required when type='percentage'. Use 0 otherwise. */
  discountPct: number;
  /** Required when type='fixed_amount'. */
  discountAmount?: number | null;
  /** Required when type='fixed_price'. */
  discountFixedPrice?: number | null;
}

export interface RuleInput {
  shopId: string;
  name: string;
  /** ADR-014: 'wholesale' (default) or 'volume'. */
  kind?: TierKind;
  scope: TierScope;
  scopeIds?: string[];
  aggregation?: TierAggregation;
  customerEligibility?: TierCustomerEligibility;
  marketEligibility?: TierMarketEligibility;
  marketIds?: string[];
  startsAt?: Date | null;
  endsAt?: Date | null;
  showTableOnPdp?: boolean;
  tableTemplateId?: string | null;
  active?: boolean;
  position?: number;
  bands: BandInput[];
}

/**
 * Summary view of a rule for the admin list — one row per `groupId`.
 * Aggregates band-level data so the list view never has to flatten N
 * tiers per rule in the renderer.
 */
export interface RuleSummary {
  groupId: string;
  name: string;
  kind: string;
  scope: string;
  scopeIds: string[];
  customerEligibility: string;
  marketEligibility: string;
  marketIds: string[];
  aggregation: string;
  /** Logical AND across bands: any draft band drafts the rule. */
  active: boolean;
  showTableOnPdp: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  bandCount: number;
  minQty: number;
  /** Open-ended last band → null. */
  maxQty: number | null;
  createdAt: Date;
  /** Underlying band rows (sorted asc by minQty). Useful for the
   * edit form and any downstream computation. */
  bands: Tier[];
}

/**
 * Validate band invariants in JS before any DB write.
 * Throws an Error with a human-readable message on the first violation.
 */
function validateBands(bands: BandInput[]): void {
  if (!Array.isArray(bands) || bands.length < 1) {
    throw new Error("A rule must have at least one band");
  }
  const sorted = [...bands].sort((a, b) => a.minQty - b.minQty);
  for (let i = 0; i < sorted.length; i++) {
    const band = sorted[i];
    const isLast = i === sorted.length - 1;
    if (!Number.isFinite(band.minQty) || band.minQty < 1) {
      throw new Error(`Band ${i + 1}: minQty must be >= 1`);
    }
    if (band.quantityTo != null) {
      if (band.quantityTo < band.minQty) {
        throw new Error(
          `Band ${i + 1}: quantityTo (${band.quantityTo}) must be >= minQty (${band.minQty})`,
        );
      }
    } else if (!isLast) {
      throw new Error(
        `Band ${i + 1}: only the last band may have an open-ended quantityTo`,
      );
    }
    if (i > 0) {
      const prev = sorted[i - 1];
      if (prev.quantityTo == null) {
        // Already caught above (only last band may be open-ended).
        throw new Error(`Band ${i}: open-ended band must be the last`);
      }
      if (band.minQty !== prev.quantityTo + 1) {
        throw new Error(
          `Band ${i + 1}: minQty must equal previous quantityTo + 1 (got ${band.minQty}, expected ${prev.quantityTo + 1})`,
        );
      }
    }
    // Per-type discount-value invariant.
    if (band.discountType === "percentage") {
      if (!(band.discountPct > 0 && band.discountPct <= 100)) {
        throw new Error(`Band ${i + 1}: discountPct must be in (0, 100]`);
      }
    } else if (band.discountType === "fixed_amount") {
      if (!(typeof band.discountAmount === "number" && band.discountAmount > 0)) {
        throw new Error(`Band ${i + 1}: discountAmount must be > 0 for fixed_amount`);
      }
    } else if (band.discountType === "fixed_price") {
      if (
        !(
          typeof band.discountFixedPrice === "number" &&
          band.discountFixedPrice > 0
        )
      ) {
        throw new Error(`Band ${i + 1}: discountFixedPrice must be > 0 for fixed_price`);
      }
    } else {
      throw new Error(`Band ${i + 1}: unknown discountType '${band.discountType}'`);
    }
  }
}

/**
 * Rule-level invariants (§4.8 of the plan).
 */
function validateRuleInvariants(input: RuleInput): void {
  if (input.aggregation === "mix_variants" && input.scope === "variant") {
    throw new Error(
      "mix_variants aggregation is incompatible with variant scope",
    );
  }
  if (input.startsAt && input.endsAt && input.startsAt >= input.endsAt) {
    throw new Error("startsAt must be before endsAt");
  }
}

/**
 * Coerce rule-level fields for DB write. Mirrors createTier's logic but
 * applied once for the whole rule (every band gets the same values).
 */
function normalizeRuleScope(input: RuleInput): {
  scopeIds: string[];
  scopeId: string | null;
} {
  const isAll = input.scope === "all";
  const scopeIds = isAll ? [] : (input.scopeIds ?? []);
  const scopeId = isAll ? null : (scopeIds[0] ?? null);
  return { scopeIds, scopeId };
}

/**
 * Create a new Volume Pricing rule (N >= 1 bands). Used by the
 * `/app/pricing/new` route action.
 */
export async function createRule(input: RuleInput): Promise<{
  groupId: string;
  count: number;
}> {
  validateBands(input.bands);
  validateRuleInvariants(input);
  const groupId = randomUUID();
  const { scopeIds, scopeId } = normalizeRuleScope(input);
  const showTableOnPdp =
    input.showTableOnPdp &&
    (input.scope === "product" || input.scope === "variant")
      ? true
      : false;

  const sortedBands = [...input.bands].sort((a, b) => a.minQty - b.minQty);

  await prisma.$transaction(
    sortedBands.map((band) =>
      prisma.tier.create({
        data: {
          shopId: input.shopId,
          name: input.name,
          kind: input.kind ?? "wholesale",
          scope: input.scope,
          scopeId,
          scopeIds,
          minQty: band.minQty,
          quantityTo: band.quantityTo ?? null,
          discountPct: band.discountType === "percentage" ? band.discountPct : 0,
          discountType: band.discountType,
          discountAmount:
            band.discountType === "fixed_amount" ? (band.discountAmount ?? null) : null,
          discountFixedPrice:
            band.discountType === "fixed_price" ? (band.discountFixedPrice ?? null) : null,
          aggregation: input.aggregation ?? "per_line",
          customerEligibility: input.customerEligibility ?? "wholesale_tagged",
          marketEligibility: input.marketEligibility ?? "all_markets",
          marketIds:
            input.marketEligibility === "specific_markets" ? (input.marketIds ?? []) : [],
          groupId,
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          showTableOnPdp,
          tableTemplateId: input.tableTemplateId ?? null,
          active: input.active ?? true,
          position: input.position ?? 0,
        },
      }),
    ),
  );

  return { groupId, count: sortedBands.length };
}

/**
 * Replace-all band update. Deletes the existing bands in the group and
 * re-creates them in a single transaction. Rule-level fields come from
 * the form once and are written identically to every new band.
 *
 * Trade-off: simpler than per-band diff; cost is one extra round trip.
 * Atomic from the DB's perspective; the Function reads the metafield,
 * not the DB, so the brief mid-txn "no rule" window is invisible.
 */
export async function updateRule(
  groupId: string,
  shopId: string,
  input: Omit<RuleInput, "shopId">,
): Promise<{ groupId: string; count: number }> {
  validateBands(input.bands);
  validateRuleInvariants({ ...input, shopId });
  const { scopeIds, scopeId } = normalizeRuleScope({ ...input, shopId });
  const showTableOnPdp =
    input.showTableOnPdp &&
    (input.scope === "product" || input.scope === "variant")
      ? true
      : false;

  const sortedBands = [...input.bands].sort((a, b) => a.minQty - b.minQty);

  await prisma.$transaction([
    prisma.tier.deleteMany({ where: { shopId, groupId } }),
    ...sortedBands.map((band) =>
      prisma.tier.create({
        data: {
          shopId,
          name: input.name,
          kind: input.kind ?? "wholesale",
          scope: input.scope,
          scopeId,
          scopeIds,
          minQty: band.minQty,
          quantityTo: band.quantityTo ?? null,
          discountPct: band.discountType === "percentage" ? band.discountPct : 0,
          discountType: band.discountType,
          discountAmount:
            band.discountType === "fixed_amount" ? (band.discountAmount ?? null) : null,
          discountFixedPrice:
            band.discountType === "fixed_price" ? (band.discountFixedPrice ?? null) : null,
          aggregation: input.aggregation ?? "per_line",
          customerEligibility: input.customerEligibility ?? "wholesale_tagged",
          marketEligibility: input.marketEligibility ?? "all_markets",
          marketIds:
            input.marketEligibility === "specific_markets" ? (input.marketIds ?? []) : [],
          groupId,
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          showTableOnPdp,
          tableTemplateId: input.tableTemplateId ?? null,
          active: input.active ?? true,
          position: input.position ?? 0,
        },
      }),
    ),
  ]);

  return { groupId, count: sortedBands.length };
}

/**
 * Delete every band of a rule. Replaces the per-tier `deleteTier` call
 * for groups; legacy single-row groups still work (1 row deleted).
 */
export async function deleteRule(groupId: string, shopId: string) {
  return prisma.tier.deleteMany({ where: { shopId, groupId } });
}

/**
 * List rules — one entry per `groupId`. Aggregates band fields so the
 * admin list view can render multi-band rules in a single row.
 */
export async function listRules(
  shopId: string,
  options: { activeOnly?: boolean; kind?: TierKind } = {},
): Promise<RuleSummary[]> {
  const tiers = await listTiers(shopId, options);
  // Group by groupId. Legacy back-fill guarantees no NULLs in prod;
  // defensively, any row with a null groupId is its own pseudo-group.
  const groups = new Map<string, Tier[]>();
  let orphanCount = 0;
  for (const tier of tiers) {
    const key = tier.groupId ?? `_orphan:${tier.id}`;
    if (!tier.groupId) orphanCount++;
    const arr = groups.get(key);
    if (arr) {
      arr.push(tier);
    } else {
      groups.set(key, [tier]);
    }
  }
  // Reviewer S2: if back-fill was skipped or partial, surface it loudly
  // in server logs so the deploy-order error is visible from the admin
  // request path. Each orphan still renders correctly (1-band pseudo-
  // group), but the merchant may see what looks like duplicate rules.
  if (orphanCount > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[listRules] shop ${shopId}: ${orphanCount} tier(s) have NULL groupId — run scripts/backfill-tier-groupids.ts on this DB`,
    );
  }

  const summaries: RuleSummary[] = [];
  for (const [key, bands] of groups.entries()) {
    const sorted = bands.sort((a, b) => a.minQty - b.minQty);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    summaries.push({
      groupId: key,
      name: first.name,
      kind: first.kind,
      scope: first.scope,
      scopeIds: first.scopeIds,
      customerEligibility: first.customerEligibility,
      marketEligibility: first.marketEligibility,
      marketIds: first.marketIds,
      aggregation: first.aggregation,
      active: sorted.every((t) => t.active),
      showTableOnPdp: first.showTableOnPdp,
      startsAt: first.startsAt,
      endsAt: first.endsAt,
      bandCount: sorted.length,
      minQty: first.minQty,
      maxQty: last.quantityTo,
      createdAt: first.createdAt,
      bands: sorted,
    });
  }

  // Stable sort: newest rule first (mirrors listTiers' createdAt:desc).
  summaries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return summaries;
}

/**
 * Fetch one rule by groupId, scoped to the shop. Returns null if no
 * bands exist in the group.
 */
export async function getRule(
  groupId: string,
  shopId: string,
): Promise<RuleSummary | null> {
  const bands = await prisma.tier.findMany({
    where: { shopId, groupId },
    orderBy: [{ minQty: "asc" }],
  });
  if (bands.length === 0) return null;
  const first = bands[0];
  const last = bands[bands.length - 1];
  return {
    groupId,
    name: first.name,
    kind: first.kind,
    scope: first.scope,
    scopeIds: first.scopeIds,
    customerEligibility: first.customerEligibility,
    marketEligibility: first.marketEligibility,
    marketIds: first.marketIds,
    aggregation: first.aggregation,
    active: bands.every((t) => t.active),
    showTableOnPdp: first.showTableOnPdp,
    startsAt: first.startsAt,
    endsAt: first.endsAt,
    bandCount: bands.length,
    minQty: first.minQty,
    maxQty: last.quantityTo,
    createdAt: first.createdAt,
    bands,
  };
}
