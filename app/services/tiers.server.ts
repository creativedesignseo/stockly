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
import prisma from "../db.server";
import type { Tier } from "@prisma/client";

export type TierScope = "product" | "variant" | "collection" | "all";
export type TierAggregation = "per_line" | "cart_total";

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
  const candidates = await prisma.tier.findMany({
    where: {
      shopId,
      active: true,
      OR: [
        { scope: "variant" },
        { scope: "product", scopeId: productGid },
        { scope: "collection", scopeId: { in: collectionGids } },
        { scope: "all", scopeId: null },
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

  const qualifying = candidates
    .filter((t) => t.minQty <= quantity)
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
  options: { activeOnly?: boolean } = {},
) {
  return prisma.tier.findMany({
    where: {
      shopId,
      ...(options.activeOnly ? { active: true } : {}),
    },
    orderBy: [{ position: "asc" }, { minQty: "asc" }],
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
 */
export type TierDiscountType = "percentage" | "fixed_amount";

export async function createTier(data: {
  shopId: string;
  name: string;
  scope: TierScope;
  scopeId?: string | null;
  minQty: number;
  discountPct: number;
  /** "percentage" (default) or "fixed_amount" (2026-05-27). */
  discountType?: TierDiscountType;
  /** Flat money off per unit when discountType is "fixed_amount". */
  discountAmount?: number | null;
  aggregation?: TierAggregation;
  position?: number;
}) {
  // Defensive: 'all' scope must not have a scopeId.
  const scopeId = data.scope === "all" ? null : (data.scopeId ?? null);
  const discountType: TierDiscountType = data.discountType ?? "percentage";
  return prisma.tier.create({
    data: {
      shopId: data.shopId,
      name: data.name,
      scope: data.scope,
      scopeId,
      minQty: data.minQty,
      discountPct: data.discountPct,
      discountType,
      discountAmount:
        discountType === "fixed_amount" ? (data.discountAmount ?? null) : null,
      aggregation: data.aggregation ?? "per_line",
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
    minQty: number;
    discountPct: number;
    aggregation: TierAggregation;
    active: boolean;
    position: number;
  }>,
) {
  return prisma.tier.update({ where: { id }, data });
}

/**
 * Delete a tier permanently. (Prefer setting `active = false` to keep history.)
 */
export async function deleteTier(id: string) {
  return prisma.tier.delete({ where: { id } });
}
