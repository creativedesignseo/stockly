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
