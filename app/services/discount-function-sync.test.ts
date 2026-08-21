/**
 * Tests for buildConfiguration — the function that serializes the
 * shop-wide pricing config into the metafield the Discount Function reads.
 *
 * REVENUE-PATH GUARD (Camino B / ADR supersede of ADR-004): every
 * approved wholesale customer must land in `qualifiedCustomers` so the
 * Function's price-side FPQ gate is skipped and they see wholesale
 * pricing from the first unit. The opening-order minimum is enforced at
 * CHECKOUT (a separate Validation Function), NOT by withholding the
 * discount. If this guard regresses we reintroduce bug C3 (approved
 * customers silently paying retail).
 *
 * Prisma + tiers.server are mocked — pure unit test. The findMany mock
 * SIMULATES Prisma's `where` filtering so the test actually catches a
 * `qualifiedAt: { not: null }` filter sneaking back in.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUniqueOrThrowMock, findManyMock, listTiersMock } = vi.hoisted(
  () => ({
    findUniqueOrThrowMock: vi.fn(),
    findManyMock: vi.fn(),
    listTiersMock: vi.fn(),
  }),
);

vi.mock("../db.server", () => ({
  default: {
    shop: { findUniqueOrThrow: findUniqueOrThrowMock },
    wholesaleCustomer: { findMany: findManyMock },
  },
}));

vi.mock("./tiers.server", () => ({ listTiers: listTiersMock }));

// eslint-disable-next-line import/first
import { buildConfiguration } from "./discount-function-sync.server";

const SHOP = {
  id: "shop-1",
  pricingSource: "stockly",
  wholesaleBaselinePct: 60,
  fpqMode: "amount",
  fpqAmount: 200,
  fpqQuantity: null,
  fpqCombinedLogic: "and",
  postQualificationMOQ: 1,
};

// Three approved customers: one has already cleared the opening order
// (qualifiedAt set), two are still pre-opening (qualifiedAt null).
const ROWS = [
  { shopifyCustomerId: "111", qualifiedAt: new Date("2026-01-01") },
  { shopifyCustomerId: "222", qualifiedAt: null },
  { shopifyCustomerId: "333", qualifiedAt: null },
];

beforeEach(() => {
  findUniqueOrThrowMock.mockReset();
  findManyMock.mockReset();
  listTiersMock.mockReset();

  findUniqueOrThrowMock.mockResolvedValue(SHOP);
  listTiersMock.mockResolvedValue([]);

  // Simulate Prisma's where filtering so a `qualifiedAt: { not: null }`
  // filter would actually drop the pre-opening rows (catching C3).
  findManyMock.mockImplementation((args: { where?: Record<string, unknown> }) => {
    const where = args?.where ?? {};
    let rows = ROWS;
    const q = where.qualifiedAt as { not?: unknown } | undefined;
    if (q && "not" in q && q.not === null) {
      rows = ROWS.filter((r) => r.qualifiedAt !== null);
    }
    return Promise.resolve(rows.map((r) => ({ shopifyCustomerId: r.shopifyCustomerId })));
  });
});

describe("buildConfiguration — qualifiedCustomers", () => {
  it("includes EVERY approved customer (pre-opening included) so they see wholesale pricing — guards bug C3", async () => {
    const json = JSON.parse(await buildConfiguration("shop-1"));

    expect(json.qualifiedCustomers).toEqual(
      expect.arrayContaining([
        "gid://shopify/Customer/111",
        "gid://shopify/Customer/222",
        "gid://shopify/Customer/333",
      ]),
    );
    expect(json.qualifiedCustomers).toHaveLength(3);
  });

  it("carries the shop's opening-order (FPQ) config and baseline through", async () => {
    const json = JSON.parse(await buildConfiguration("shop-1"));

    expect(json.wholesaleBaselinePct).toBe(60);
    expect(json.fpq).toEqual({
      mode: "amount",
      amount: 200,
      quantity: null,
      combinedLogic: "and",
    });
  });
});

/**
 * REVENUE-PATH GUARD. A shop that already prices wholesale through a
 * Shopify B2B catalog / Markets price list must get NOTHING price-shaped
 * from Stockly, or the two engines compound multiplicatively.
 *
 * Real incident (Piro, 2026-08-21): a −65% catalog price list, a 65%
 * Stockly baseline and an active 65% Stockly rule were all configured at
 * once. A $28 item would have reached checkout at $28 × 0.35³ = $1.20 —
 * 95.7% off — as soon as Stockly's discount applied. These tests exist so
 * that can never ship again.
 */
describe("buildConfiguration — pricingSource is the single source of pricing", () => {
  const TIERS = [
    {
      scope: "all",
      scopeId: null,
      scopeIds: [],
      minQty: 1,
      quantityTo: null,
      discountPct: 65,
      discountType: "percentage",
      discountAmount: null,
      discountFixedPrice: null,
      aggregation: "per_line",
      customerEligibility: "wholesale_tagged",
      groupId: "g1",
      startsAt: null,
      endsAt: null,
    },
  ];

  it("emits NO baseline and NO tiers when the catalog owns pricing", async () => {
    findUniqueOrThrowMock.mockResolvedValue({
      ...SHOP,
      pricingSource: "catalog",
      wholesaleBaselinePct: 65,
    });
    listTiersMock.mockResolvedValue(TIERS);

    const json = JSON.parse(await buildConfiguration("shop-1"));

    // Both pricing levers must be neutralised, not just one: a baseline
    // alone still discounts every line, and a tier alone still discounts
    // the lines it matches.
    expect(json.wholesaleBaselinePct).toBe(0);
    expect(json.tiers).toEqual([]);
  });

  it("keeps enforcing order minimums when the catalog owns pricing", async () => {
    findUniqueOrThrowMock.mockResolvedValue({
      ...SHOP,
      pricingSource: "catalog",
      wholesaleBaselinePct: 65,
    });
    listTiersMock.mockResolvedValue(TIERS);

    const json = JSON.parse(await buildConfiguration("shop-1"));

    // Switching the pricing source off must not disarm the FPQ gate or
    // drop the qualified-customer list — those drive the checkout
    // minimums, which stay Stockly's job in both modes.
    expect(json.fpq).toEqual({
      mode: "amount",
      amount: 200,
      quantity: null,
      combinedLogic: "and",
    });
    expect(json.qualifiedCustomers).toHaveLength(3);
  });

  it("emits baseline and tiers normally when Stockly owns pricing", async () => {
    findUniqueOrThrowMock.mockResolvedValue({
      ...SHOP,
      pricingSource: "stockly",
      wholesaleBaselinePct: 65,
    });
    listTiersMock.mockResolvedValue(TIERS);

    const json = JSON.parse(await buildConfiguration("shop-1"));

    expect(json.wholesaleBaselinePct).toBe(65);
    expect(json.tiers).toHaveLength(1);
  });

  it("defaults to Stockly owning pricing when the field is missing", async () => {
    // Rows written before the column existed deserialize with
    // pricingSource undefined. They must keep their pricing, not lose it.
    const { pricingSource: _omitted, ...legacyShop } = SHOP;
    findUniqueOrThrowMock.mockResolvedValue({
      ...legacyShop,
      wholesaleBaselinePct: 65,
    });
    listTiersMock.mockResolvedValue(TIERS);

    const json = JSON.parse(await buildConfiguration("shop-1"));

    expect(json.wholesaleBaselinePct).toBe(65);
    expect(json.tiers).toHaveLength(1);
  });
});
