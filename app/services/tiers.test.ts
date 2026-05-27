/**
 * Tests for tier resolution — the core B2B pricing logic.
 *
 * Prisma is mocked so these are pure unit tests, no DB required.
 * The findMany mock returns whatever candidate tiers the DB would
 * have returned for a given query; the assertions check that
 * resolveTier ranks them correctly and computes the right hints.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tier } from "@prisma/client";

const { findManyMock } = vi.hoisted(() => ({ findManyMock: vi.fn() }));

vi.mock("../db.server", () => ({
  default: { tier: { findMany: findManyMock } },
}));

// eslint-disable-next-line import/first
import { applyDiscount, resolveTier } from "./tiers.server";

function tier(overrides: Partial<Tier> = {}): Tier {
  return {
    id: "tier-1",
    shopId: "shop-1",
    name: "Default",
    scope: "all",
    scopeId: null,
    scopeIds: [],
    minQty: 10,
    discountPct: 5,
    discountType: "percentage",
    discountAmount: null,
    aggregation: "per_line",
    customerEligibility: "wholesale_tagged",
    marketEligibility: "all_markets",
    marketIds: [],
    active: true,
    position: 0,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

const PRODUCT_GID = "gid://shopify/Product/123";
const COLLECTION_GID = "gid://shopify/Collection/9";

beforeEach(() => findManyMock.mockReset());

describe("resolveTier", () => {
  it("returns null + 0% when no tiers exist", async () => {
    findManyMock.mockResolvedValue([]);

    const result = await resolveTier({
      shopId: "shop-1",
      productGid: PRODUCT_GID,
      quantity: 10,
    });

    expect(result.tier).toBeNull();
    expect(result.discountPct).toBe(0);
    expect(result.nextTier).toBeUndefined();
  });

  it("matches an 'all' tier when quantity qualifies", async () => {
    findManyMock.mockResolvedValue([
      tier({ id: "t-all", scope: "all", scopeId: null, minQty: 10, discountPct: 5 }),
    ]);

    const result = await resolveTier({
      shopId: "shop-1",
      productGid: PRODUCT_GID,
      quantity: 10,
    });

    expect(result.tier?.id).toBe("t-all");
    expect(result.discountPct).toBe(5);
    expect(result.nextTier).toBeUndefined();
  });

  it("returns no tier but provides nextTier hint when quantity is below threshold", async () => {
    findManyMock.mockResolvedValue([
      tier({ id: "t-all", minQty: 10, discountPct: 5 }),
    ]);

    const result = await resolveTier({
      shopId: "shop-1",
      productGid: PRODUCT_GID,
      quantity: 3,
    });

    expect(result.tier).toBeNull();
    expect(result.discountPct).toBe(0);
    expect(result.nextTier).toEqual({
      minQty: 10,
      discountPct: 5,
      missingQty: 7,
    });
  });

  it("picks the highest qualifying minQty within the same scope", async () => {
    findManyMock.mockResolvedValue([
      tier({ id: "t-low", minQty: 10, discountPct: 5 }),
      tier({ id: "t-mid", minQty: 50, discountPct: 10 }),
      tier({ id: "t-high", minQty: 100, discountPct: 15 }),
    ]);

    const result = await resolveTier({
      shopId: "shop-1",
      productGid: PRODUCT_GID,
      quantity: 60,
    });

    expect(result.tier?.id).toBe("t-mid");
    expect(result.discountPct).toBe(10);
    expect(result.nextTier).toEqual({
      minQty: 100,
      discountPct: 15,
      missingQty: 40,
    });
  });

  it("prefers product scope over all scope when both qualify", async () => {
    findManyMock.mockResolvedValue([
      tier({ id: "t-all", scope: "all", scopeId: null, minQty: 10, discountPct: 5 }),
      tier({
        id: "t-product",
        scope: "product",
        scopeId: PRODUCT_GID,
        minQty: 10,
        discountPct: 3,
      }),
    ]);

    const result = await resolveTier({
      shopId: "shop-1",
      productGid: PRODUCT_GID,
      quantity: 20,
    });

    // Product scope wins on specificity even with a smaller discount.
    expect(result.tier?.id).toBe("t-product");
    expect(result.discountPct).toBe(3);
  });

  it("prefers collection scope over all scope when both qualify", async () => {
    findManyMock.mockResolvedValue([
      tier({ id: "t-all", scope: "all", scopeId: null, minQty: 10, discountPct: 5 }),
      tier({
        id: "t-collection",
        scope: "collection",
        scopeId: COLLECTION_GID,
        minQty: 10,
        discountPct: 7,
      }),
    ]);

    const result = await resolveTier({
      shopId: "shop-1",
      productGid: PRODUCT_GID,
      collectionGids: [COLLECTION_GID],
      quantity: 12,
    });

    expect(result.tier?.id).toBe("t-collection");
    expect(result.discountPct).toBe(7);
  });

  it("prefers product scope over collection scope", async () => {
    findManyMock.mockResolvedValue([
      tier({
        id: "t-collection",
        scope: "collection",
        scopeId: COLLECTION_GID,
        minQty: 10,
        discountPct: 12,
      }),
      tier({
        id: "t-product",
        scope: "product",
        scopeId: PRODUCT_GID,
        minQty: 10,
        discountPct: 6,
      }),
    ]);

    const result = await resolveTier({
      shopId: "shop-1",
      productGid: PRODUCT_GID,
      collectionGids: [COLLECTION_GID],
      quantity: 50,
    });

    expect(result.tier?.id).toBe("t-product");
    expect(result.discountPct).toBe(6);
  });

  it("picks the lowest minQty above current qty as the next tier hint", async () => {
    findManyMock.mockResolvedValue([
      tier({ id: "t-25", minQty: 25, discountPct: 8 }),
      tier({ id: "t-50", minQty: 50, discountPct: 12 }),
      tier({ id: "t-100", minQty: 100, discountPct: 18 }),
    ]);

    const result = await resolveTier({
      shopId: "shop-1",
      productGid: PRODUCT_GID,
      quantity: 10,
    });

    expect(result.tier).toBeNull();
    expect(result.nextTier).toEqual({
      minQty: 25,
      discountPct: 8,
      missingQty: 15,
    });
  });

  it("scopes the query to the shop and active tiers only", async () => {
    findManyMock.mockResolvedValue([]);

    await resolveTier({
      shopId: "shop-42",
      productGid: PRODUCT_GID,
      collectionGids: [COLLECTION_GID, "gid://shopify/Collection/777"],
      quantity: 5,
    });

    expect(findManyMock).toHaveBeenCalledTimes(1);
    const arg = findManyMock.mock.calls[0][0];
    expect(arg.where.shopId).toBe("shop-42");
    expect(arg.where.active).toBe(true);
    // After the 2026-05-27 multi-target migration the OR includes BOTH
    // the new scopeIds[] form and the legacy scopeId form for each
    // scope — so tiers written before the migration still match.
    expect(arg.where.OR).toContainEqual({
      scope: "collection",
      scopeIds: { hasSome: [COLLECTION_GID, "gid://shopify/Collection/777"] },
    });
    expect(arg.where.OR).toContainEqual({
      scope: "collection",
      scopeId: { in: [COLLECTION_GID, "gid://shopify/Collection/777"] },
    });
    expect(arg.where.OR).toContainEqual({
      scope: "product",
      scopeIds: { has: PRODUCT_GID },
    });
    expect(arg.where.OR).toContainEqual({
      scope: "product",
      scopeId: PRODUCT_GID,
    });
    expect(arg.where.OR).toContainEqual({ scope: "all" });
    // Variant-scoped tiers must also be candidates — variantId filter
    // is applied by the caller against line.merchandise.id, not at the
    // DB level (we want all variant tiers to enter the ranker so we
    // can compare specificity).
    expect(arg.where.OR).toContainEqual({ scope: "variant" });
  });

  it("prefers variant scope over product, collection, and all", async () => {
    // All four scopes qualify on minQty; the variant-scoped one wins
    // by specificity even though it has the LOWEST discountPct.
    findManyMock.mockResolvedValue([
      tier({ id: "t-all", scope: "all", scopeId: null, minQty: 5, discountPct: 20 }),
      tier({
        id: "t-collection",
        scope: "collection",
        scopeId: COLLECTION_GID,
        minQty: 5,
        discountPct: 15,
      }),
      tier({
        id: "t-product",
        scope: "product",
        scopeId: PRODUCT_GID,
        minQty: 5,
        discountPct: 10,
      }),
      tier({
        id: "t-variant",
        scope: "variant",
        scopeId: "gid://shopify/ProductVariant/777",
        minQty: 5,
        discountPct: 5,
      }),
    ]);

    const result = await resolveTier({
      shopId: "shop-1",
      productGid: PRODUCT_GID,
      collectionGids: [COLLECTION_GID],
      quantity: 10,
    });

    expect(result.tier?.id).toBe("t-variant");
    expect(result.discountPct).toBe(5);
  });
});

describe("applyDiscount", () => {
  it("returns the base price when discount is 0", () => {
    expect(applyDiscount(99.99, 0)).toBe(99.99);
  });

  it("returns the base price when discount is negative", () => {
    expect(applyDiscount(50, -10)).toBe(50);
  });

  it("returns 0 when discount is 100", () => {
    expect(applyDiscount(123.45, 100)).toBe(0);
  });

  it("caps discount at 100 (anything above returns 0)", () => {
    expect(applyDiscount(50, 150)).toBe(0);
  });

  it("applies a 50% discount correctly", () => {
    expect(applyDiscount(100, 50)).toBe(50);
  });

  it("rounds to 2 decimal places", () => {
    // 99.99 * 0.9 = 89.991 → 89.99
    expect(applyDiscount(99.99, 10)).toBe(89.99);
    // 33.33 * 0.6667 = 22.221111… → 22.22
    expect(applyDiscount(33.33, 33.33)).toBe(22.22);
  });
});
