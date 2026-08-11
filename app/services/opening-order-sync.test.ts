/**
 * Tests for buildOpeningOrderConfig — the function that serializes the
 * opening-order + post-qualification config into the metafield the
 * Cart & Checkout Validation Function reads.
 *
 * REVENUE-PATH GUARD: this config drives a CHECKOUT BLOCK on a live
 * store. Two invariants matter more than anything else here.
 *
 *   1. BACKWARD COMPATIBILITY. The flat FPQ keys (`mode` / `amount` /
 *      `quantity` / `combinedLogic` / `pendingCustomers`) must stay
 *      exactly where they are. An already-deployed Function reading a
 *      newer config must keep working; renaming or nesting one of those
 *      keys silently turns the opening-order gate off (or, worse, makes
 *      it misfire) on every installed shop until the Function catches up.
 *   2. DISJOINT LISTS. `pendingCustomers` (qualifiedAt = null) and
 *      `qualifiedCustomers` (qualifiedAt != null) must never overlap —
 *      a buyer in both lists could be evaluated against both gates.
 *
 * Prisma is mocked — pure unit test. The findMany mock SIMULATES
 * Prisma's `where` filtering (both the `qualifiedAt: null` and the
 * `qualifiedAt: { not: null }` shapes) so a dropped or inverted filter
 * actually fails the test instead of passing on a stubbed array.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUniqueOrThrowMock, findManyMock } = vi.hoisted(() => ({
  findUniqueOrThrowMock: vi.fn(),
  findManyMock: vi.fn(),
}));

vi.mock("../db.server", () => ({
  default: {
    shop: { findUniqueOrThrow: findUniqueOrThrowMock },
    wholesaleCustomer: { findMany: findManyMock },
  },
}));

// eslint-disable-next-line import/first
import { buildOpeningOrderConfig } from "./opening-order-sync.server";

const SHOP = {
  id: "shop-1",
  fpqMode: "amount",
  fpqAmount: 200,
  fpqQuantity: null,
  fpqCombinedLogic: "and",
  postQualificationMode: "combined",
  postQualificationMinAmount: 80,
  postQualificationCombinedLogic: "or",
  postQualificationMOQ: 12,
};

// Two customers have cleared the opening order (qualifiedAt set), two
// still owe it (qualifiedAt null).
const ROWS = [
  { shopifyCustomerId: "111", qualifiedAt: new Date("2026-01-01") },
  { shopifyCustomerId: "222", qualifiedAt: null },
  { shopifyCustomerId: "333", qualifiedAt: null },
  { shopifyCustomerId: "444", qualifiedAt: new Date("2026-02-02") },
];

beforeEach(() => {
  findUniqueOrThrowMock.mockReset();
  findManyMock.mockReset();

  findUniqueOrThrowMock.mockResolvedValue(SHOP);

  // Simulate Prisma's `where` filtering on qualifiedAt so an inverted or
  // missing filter changes the result the test sees.
  findManyMock.mockImplementation((args: { where?: Record<string, unknown> }) => {
    const where = args?.where ?? {};
    let rows = ROWS;
    if ("qualifiedAt" in where) {
      const q = where.qualifiedAt as { not?: unknown } | null;
      if (q === null) {
        rows = ROWS.filter((r) => r.qualifiedAt === null);
      } else if (q && "not" in q && q.not === null) {
        rows = ROWS.filter((r) => r.qualifiedAt !== null);
      }
    }
    return Promise.resolve(
      rows.map((r) => ({ shopifyCustomerId: r.shopifyCustomerId })),
    );
  });
});

describe("buildOpeningOrderConfig — flat FPQ keys (backward compatibility)", () => {
  it("keeps the opening-order config on the flat top-level keys", async () => {
    const json = JSON.parse(await buildOpeningOrderConfig("shop-1"));

    expect(json.mode).toBe("amount");
    expect(json.amount).toBe(200);
    expect(json.quantity).toBeNull();
    expect(json.combinedLogic).toBe("and");
  });

  it("lists only customers who still owe their opening order in pendingCustomers", async () => {
    const json = JSON.parse(await buildOpeningOrderConfig("shop-1"));

    expect(json.pendingCustomers).toEqual([
      "gid://shopify/Customer/222",
      "gid://shopify/Customer/333",
    ]);
  });
});

describe("buildOpeningOrderConfig — postQualification block", () => {
  it("emits the shop's post-qualification config as a nested block", async () => {
    const json = JSON.parse(await buildOpeningOrderConfig("shop-1"));

    expect(json.postQualification).toEqual({
      mode: "combined",
      amount: 80,
      quantity: 12,
      combinedLogic: "or",
    });
  });

  it("defaults to a gate that fails open when the shop never configured one", async () => {
    findUniqueOrThrowMock.mockResolvedValue({
      ...SHOP,
      postQualificationMode: "none",
      postQualificationMinAmount: null,
      postQualificationCombinedLogic: "and",
      postQualificationMOQ: 1,
    });

    const json = JSON.parse(await buildOpeningOrderConfig("shop-1"));

    // MOQ 1 is the "no minimum" sentinel and must not reach the Function
    // as a real quantity threshold.
    expect(json.postQualification).toEqual({
      mode: "none",
      amount: null,
      quantity: null,
      combinedLogic: "and",
    });
  });

  it("lists only already-qualified customers in qualifiedCustomers", async () => {
    const json = JSON.parse(await buildOpeningOrderConfig("shop-1"));

    expect(json.qualifiedCustomers).toEqual([
      "gid://shopify/Customer/111",
      "gid://shopify/Customer/444",
    ]);
  });

  it("queries qualified customers with a qualifiedAt: { not: null } filter", async () => {
    await buildOpeningOrderConfig("shop-1");

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: "shop-1", qualifiedAt: { not: null } },
      }),
    );
  });
});

describe("buildOpeningOrderConfig — contract shape", () => {
  it("never puts the same buyer in both lists", async () => {
    const json = JSON.parse(await buildOpeningOrderConfig("shop-1"));

    const overlap = json.pendingCustomers.filter((gid: string) =>
      json.qualifiedCustomers.includes(gid),
    );
    expect(overlap).toEqual([]);
    expect(
      json.pendingCustomers.length + json.qualifiedCustomers.length,
    ).toBe(ROWS.length);
  });

  it("emits every key of the config contract and nothing else", async () => {
    const json = JSON.parse(await buildOpeningOrderConfig("shop-1"));

    expect(Object.keys(json).sort()).toEqual([
      "amount",
      "combinedLogic",
      "mode",
      "pendingCustomers",
      "postQualification",
      "qualifiedCustomers",
      "quantity",
    ]);
  });
});
