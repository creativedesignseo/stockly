/**
 * Tests for the generic Application service (Phase 1B + back-compat
 * smoke for Phase 1C). Prisma mocked — pure unit tests.
 *
 * The "back-compat smoke" asserts that a legacy snake_case payload
 * (the exact shape the existing storefront block POSTs) produces a
 * pending Application row with the correct denormalized email and
 * the responses Json preserved verbatim.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirstMock, createMock, updateMock } = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("../db.server", () => ({
  default: {
    application: {
      findFirst: findFirstMock,
      create: createMock,
      update: updateMock,
    },
  },
}));

// eslint-disable-next-line import/first
import { submitApplication } from "./applications.server";

beforeEach(() => {
  findFirstMock.mockReset();
  createMock.mockReset();
  updateMock.mockReset();
});

describe("submitApplication", () => {
  it("creates a new pending row + denormalizes email (back-compat smoke)", async () => {
    findFirstMock.mockResolvedValueOnce(null);
    createMock.mockResolvedValueOnce({ id: "app-1", status: "pending" });

    const legacyBody = {
      email: "Buyer@Acme.COM",
      first_name: "Ada",
      last_name: "Lovelace",
      phone: "+34 555 44 33 22",
      company_name: "Acme",
      tax_id: "B12345678",
      website: "https://acme.com",
      country: "ES",
      notes: "Volume estimate: 100/mo",
    };

    const row = await submitApplication({
      shopId: "shop-1",
      responses: legacyBody,
      shopifyCustomerId: "789",
    });

    expect(row.id).toBe("app-1");
    expect(createMock).toHaveBeenCalledTimes(1);
    const data = createMock.mock.calls[0][0].data;
    expect(data.shopId).toBe("shop-1");
    expect(data.status).toBe("pending");
    // Denormalized email: trimmed + lowercased.
    expect(data.email).toBe("buyer@acme.com");
    // Responses preserved verbatim (legacy snake_case keys intact).
    expect(data.responses).toEqual(legacyBody);
    expect(data.shopifyCustomerId).toBe("789");
  });

  it("coalesces into the existing pending row when one exists", async () => {
    findFirstMock.mockResolvedValueOnce({
      id: "app-1",
      shopId: "shop-1",
      email: "buyer@acme.com",
      responses: { email: "buyer@acme.com", company_name: "Old name" },
      shopifyCustomerId: null,
    });
    updateMock.mockResolvedValueOnce({ id: "app-1" });

    await submitApplication({
      shopId: "shop-1",
      responses: {
        email: "buyer@acme.com",
        company_name: "New name",
        notes: "Additional context",
      },
    });

    expect(createMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledTimes(1);
    const data = updateMock.mock.calls[0][0].data;
    // Merged: latest wins per key, existing keys retained.
    expect(data.responses).toEqual({
      email: "buyer@acme.com",
      company_name: "New name",
      notes: "Additional context",
    });
    expect(data.email).toBe("buyer@acme.com");
  });

  it("handles a payload with no email (still creates, blank denorm)", async () => {
    findFirstMock.mockResolvedValueOnce(null);
    createMock.mockResolvedValueOnce({ id: "app-2" });
    await submitApplication({
      shopId: "shop-1",
      responses: { company_name: "Acme" },
    });
    // No findFirst when email is empty — no coalesce key.
    expect(findFirstMock).not.toHaveBeenCalled();
    const data = createMock.mock.calls[0][0].data;
    expect(data.email).toBe("");
  });
});
