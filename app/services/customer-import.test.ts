/**
 * Tests for the wholesale customer backfill.
 *
 * ELIGIBILITY GUARD: importing writes the rows that decide whether a
 * buyer is subject to checkout order minimums. Two failure modes matter
 * more than the happy path and are asserted explicitly:
 *
 *   1. Re-importing must never touch an existing row. A customer who
 *      already cleared their opening order (`qualifiedAt` set) would
 *      otherwise be silently dropped back behind the gate.
 *   2. `mode` must be honoured exactly. Importing a merchant's
 *      established customers as "pending" would put a first-order
 *      minimum in front of buyers who earned their way past it years
 *      ago.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock, createManyMock, graphqlMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  createManyMock: vi.fn(),
  graphqlMock: vi.fn(),
}));

vi.mock("../db.server", () => ({
  default: {
    wholesaleCustomer: {
      findMany: findManyMock,
      createMany: createManyMock,
    },
  },
}));

// eslint-disable-next-line import/first
import {
  importWholesaleCustomers,
  previewWholesaleCustomerImport,
  type ImportableCustomer,
} from "./customer-import.server";

/** Build a Shopify customers-connection response page. */
function page(
  nodes: { id: string; email: string | null; displayName: string | null }[],
  hasNextPage = false,
  endCursor: string | null = null,
) {
  return {
    json: async () => ({
      data: {
        customers: {
          edges: nodes.map((node) => ({ node })),
          pageInfo: { hasNextPage, endCursor },
        },
      },
    }),
  };
}

const admin = { graphql: graphqlMock } as never;

beforeEach(() => {
  findManyMock.mockReset();
  createManyMock.mockReset();
  graphqlMock.mockReset();
});

describe("previewWholesaleCustomerImport", () => {
  it("flags which tagged customers Stockly already knows", async () => {
    graphqlMock.mockResolvedValue(
      page([
        { id: "gid://shopify/Customer/111", email: "a@x.com", displayName: "A" },
        { id: "gid://shopify/Customer/222", email: "b@x.com", displayName: "B" },
      ]),
    );
    findManyMock.mockResolvedValue([{ shopifyCustomerId: "111" }]);

    const preview = await previewWholesaleCustomerImport(
      admin,
      "shop-1",
      "wholesale",
    );

    expect(preview.customers).toEqual([
      {
        shopifyCustomerId: "111",
        email: "a@x.com",
        displayName: "A",
        alreadyImported: true,
      },
      {
        shopifyCustomerId: "222",
        email: "b@x.com",
        displayName: "B",
        alreadyImported: false,
      },
    ]);
    expect(preview.truncated).toBe(false);
  });

  it("searches on the shop's own tag, not a hardcoded one", async () => {
    graphqlMock.mockResolvedValue(page([]));
    findManyMock.mockResolvedValue([]);

    await previewWholesaleCustomerImport(admin, "shop-1", "mayorista");

    const variables = graphqlMock.mock.calls[0][1].variables;
    expect(variables.q).toContain("mayorista");
  });

  it("follows pagination and reports truncation past the page cap", async () => {
    // Always claims another page — the cap must stop the loop.
    graphqlMock.mockImplementation(async () =>
      page(
        [{ id: "gid://shopify/Customer/1", email: null, displayName: null }],
        true,
        "cursor",
      ),
    );
    findManyMock.mockResolvedValue([]);

    const preview = await previewWholesaleCustomerImport(
      admin,
      "shop-1",
      "wholesale",
    );

    expect(graphqlMock).toHaveBeenCalledTimes(10);
    expect(preview.truncated).toBe(true);
  });

  it("returns no customers rather than throwing when Shopify sends no data", async () => {
    graphqlMock.mockResolvedValue({ json: async () => ({}) });
    findManyMock.mockResolvedValue([]);

    const preview = await previewWholesaleCustomerImport(
      admin,
      "shop-1",
      "wholesale",
    );

    expect(preview.customers).toEqual([]);
  });
});

describe("importWholesaleCustomers", () => {
  const CUSTOMERS: ImportableCustomer[] = [
    {
      shopifyCustomerId: "111",
      email: "a@x.com",
      displayName: "A",
      alreadyImported: true,
    },
    {
      shopifyCustomerId: "222",
      email: "b@x.com",
      displayName: "B",
      alreadyImported: false,
    },
  ];

  it("never rewrites a customer Stockly already knows", async () => {
    createManyMock.mockResolvedValue({ count: 1 });

    const result = await importWholesaleCustomers("shop-1", CUSTOMERS, "qualified");

    const rows = createManyMock.mock.calls[0][0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0].shopifyCustomerId).toBe("222");
    expect(result).toEqual({ imported: 1, skipped: 1 });
  });

  it("imports established customers with no opening-order gate", async () => {
    createManyMock.mockResolvedValue({ count: 1 });

    await importWholesaleCustomers("shop-1", CUSTOMERS, "qualified");

    expect(createManyMock.mock.calls[0][0].data[0].qualifiedAt).toBeInstanceOf(
      Date,
    );
  });

  it("imports pending customers still owing an opening order", async () => {
    createManyMock.mockResolvedValue({ count: 1 });

    await importWholesaleCustomers("shop-1", CUSTOMERS, "pending");

    expect(createManyMock.mock.calls[0][0].data[0].qualifiedAt).toBeNull();
  });

  it("tolerates a row created between preview and submit", async () => {
    createManyMock.mockResolvedValue({ count: 1 });

    await importWholesaleCustomers("shop-1", CUSTOMERS, "qualified");

    // The customers/update webhook can fire on the same customer while
    // the merchant is looking at the preview — that must not abort.
    expect(createManyMock.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it("writes nothing when every customer is already imported", async () => {
    const result = await importWholesaleCustomers(
      "shop-1",
      [CUSTOMERS[0]],
      "qualified",
    );

    expect(createManyMock).not.toHaveBeenCalled();
    expect(result).toEqual({ imported: 0, skipped: 1 });
  });
});
