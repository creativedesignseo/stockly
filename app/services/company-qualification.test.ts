/**
 * Tests for company qualification + the validation apiType pin.
 *
 * REVENUE-PATH GUARD, twice over:
 *
 *   1. `matchesValidationApiType` pins the string Shopify's API really
 *      returns. The original code shipped "cart_and_checkout_validation"
 *      (with "and") and, because the filter never matched, the checkout
 *      Validation was NEVER created on any shop for the feature's entire
 *      life — every configured minimum silently did nothing. These tests
 *      make that class of bug loud.
 *
 *   2. The backfill decides which existing companies skip the
 *      opening-order gate. Wrong writes here either gate a merchant's
 *      established buyers or waive a gate for genuinely new companies.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUniqueMock, updateMock, graphqlMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  updateMock: vi.fn(),
  graphqlMock: vi.fn(),
}));

vi.mock("../db.server", () => ({
  default: {
    shop: { findUnique: findUniqueMock, update: updateMock },
  },
}));

// eslint-disable-next-line import/first
import {
  backfillEstablishedCompanies,
  markCompanyQualified,
} from "./company-qualification.server";
// eslint-disable-next-line import/first
import { matchesValidationApiType } from "./opening-order-sync.server";

const admin = { graphql: graphqlMock } as never;

function gqlResponse(data: unknown) {
  return { json: async () => ({ data }) };
}

beforeEach(() => {
  findUniqueMock.mockReset();
  updateMock.mockReset();
  graphqlMock.mockReset();
});

describe("matchesValidationApiType", () => {
  it("matches the string Shopify's API actually returns", () => {
    expect(matchesValidationApiType("cart_checkout_validation")).toBe(true);
  });

  it("still matches the doc-style spelling, so a Shopify rename degrades gracefully", () => {
    expect(matchesValidationApiType("cart_and_checkout_validation")).toBe(true);
  });

  it("never matches the discount function's apiType", () => {
    expect(matchesValidationApiType("product_discounts")).toBe(false);
  });
});

describe("markCompanyQualified", () => {
  it("writes the app-owned qualified metafield on the company", async () => {
    graphqlMock.mockResolvedValue(
      gqlResponse({ metafieldsSet: { metafields: [{ id: "m1" }], userErrors: [] } }),
    );

    await markCompanyQualified(admin, "gid://shopify/Company/9");

    const vars = graphqlMock.mock.calls[0][1].variables.metafields[0];
    expect(vars.ownerId).toBe("gid://shopify/Company/9");
    expect(vars.namespace).toBe("$app:stockly");
    expect(vars.key).toBe("qualified");
    // ISO timestamp — the Functions only test presence, but a
    // timestamp gives the merchant an audit trail for free.
    expect(new Date(vars.value).toString()).not.toBe("Invalid Date");
  });

  it("throws on userErrors so callers can log the real failure", async () => {
    graphqlMock.mockResolvedValue(
      gqlResponse({
        metafieldsSet: { metafields: [], userErrors: [{ message: "nope" }] },
      }),
    );

    await expect(
      markCompanyQualified(admin, "gid://shopify/Company/9"),
    ).rejects.toThrow(/nope/);
  });
});

describe("backfillEstablishedCompanies", () => {
  const companiesPage = (
    nodes: { id: string; name: string; orders: number }[],
  ) =>
    gqlResponse({
      companies: {
        nodes: nodes.map((n) => ({
          id: n.id,
          name: n.name,
          ordersCount: { count: n.orders },
        })),
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

  it("qualifies only companies that have already ordered", async () => {
    findUniqueMock.mockResolvedValue({ id: "shop-1", companiesBackfilledAt: null });
    graphqlMock
      .mockResolvedValueOnce(
        companiesPage([
          { id: "gid://shopify/Company/1", name: "Established", orders: 12 },
          { id: "gid://shopify/Company/2", name: "Brand new", orders: 0 },
        ]),
      )
      // markCompanyQualified call for Company/1
      .mockResolvedValueOnce(
        gqlResponse({ metafieldsSet: { metafields: [{ id: "m" }], userErrors: [] } }),
      );
    updateMock.mockResolvedValue({});

    const result = await backfillEstablishedCompanies(admin, "shop-1");

    expect(result).toEqual({ scanned: 2, qualified: 1, skipped: 1, errors: 0 });
    // The metafield write targeted the established company, not the new one.
    const writeCall = graphqlMock.mock.calls[1];
    expect(writeCall[1].variables.metafields[0].ownerId).toBe(
      "gid://shopify/Company/1",
    );
  });

  it("runs once per shop — the companiesBackfilledAt gate", async () => {
    findUniqueMock.mockResolvedValue({
      id: "shop-1",
      companiesBackfilledAt: new Date("2026-08-22"),
    });

    const result = await backfillEstablishedCompanies(admin, "shop-1");

    expect(result).toBeNull();
    expect(graphqlMock).not.toHaveBeenCalled();
  });

  it("does NOT stamp when writes failed — the next trigger must retry", async () => {
    // A permanent "backfill done" over a transient failure would leave
    // established buyers facing the opening-order gate forever.
    findUniqueMock.mockResolvedValue({ id: "shop-1", companiesBackfilledAt: null });
    graphqlMock
      .mockResolvedValueOnce(
        companiesPage([{ id: "gid://shopify/Company/1", name: "A", orders: 3 }]),
      )
      .mockResolvedValueOnce(
        gqlResponse({
          metafieldsSet: { metafields: [], userErrors: [{ message: "boom" }] },
        }),
      );
    updateMock.mockResolvedValue({});

    const result = await backfillEstablishedCompanies(admin, "shop-1");

    expect(result).toEqual({ scanned: 1, qualified: 0, skipped: 0, errors: 1 });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("stamps only after a clean, complete run", async () => {
    findUniqueMock.mockResolvedValue({ id: "shop-1", companiesBackfilledAt: null });
    graphqlMock
      .mockResolvedValueOnce(
        companiesPage([{ id: "gid://shopify/Company/1", name: "A", orders: 3 }]),
      )
      .mockResolvedValueOnce(
        gqlResponse({ metafieldsSet: { metafields: [{ id: "m" }], userErrors: [] } }),
      );
    updateMock.mockResolvedValue({});

    await backfillEstablishedCompanies(admin, "shop-1");

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "shop-1" } }),
    );
  });

  it("does NOT stamp when the companies query fails outright (page 0)", async () => {
    findUniqueMock.mockResolvedValue({ id: "shop-1", companiesBackfilledAt: null });
    // The real SDK client THROWS on GraphQL errors; body-level errors
    // (our ops runner) are also covered by the conn-falsy branch.
    graphqlMock.mockRejectedValueOnce(new Error("THROTTLED"));
    updateMock.mockResolvedValue({});

    const result = await backfillEstablishedCompanies(admin, "shop-1");

    expect(result).toEqual({ scanned: 0, qualified: 0, skipped: 0, errors: 0 });
    expect(updateMock).not.toHaveBeenCalled();
  });
});
