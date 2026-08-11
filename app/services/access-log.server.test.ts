/**
 * Tests for logProtectedDataAccess — the protected-customer-data access
 * log that closes Shopify's Level 2 requirement "Keep an access log to
 * protected customer data".
 *
 * COMPLIANCE + SAFETY GUARD. Two invariants are load-bearing here:
 *
 *   1. FAIL-SAFE. The write is best-effort. If Prisma throws, the caller
 *      must NOT see it — an audit-log outage can never block a merchant
 *      approving a customer or a storefront submission returning 201.
 *      This is the single most important test in the file.
 *   2. NO PERSONAL DATA IN THE LOG. `fields` carries field CATEGORIES
 *      ("email"), never values ("ana@example.com"), and `subjectRef`
 *      carries an opaque record id, never a name or address. This is what
 *      makes the log safe to retain after a customers/redact request; if
 *      values leak in, the log itself becomes personal data and the
 *      redaction webhooks stop being compliant.
 *
 * Prisma is mocked — pure unit test.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
}));

vi.mock("../db.server", () => ({
  default: {
    protectedDataAccessLog: { create: createMock },
  },
}));

// eslint-disable-next-line import/first
import { logProtectedDataAccess } from "./access-log.server";

/** The `data` payload handed to Prisma on the most recent call. */
function lastCreateData(): Record<string, unknown> {
  const call = createMock.mock.calls.at(-1) as
    | [{ data: Record<string, unknown> }]
    | undefined;
  if (!call) throw new Error("prisma.protectedDataAccessLog.create not called");
  return call[0].data;
}

/**
 * Console spy. `vi.spyOn` on an already-spied method returns the SAME spy,
 * so its call history survives across tests unless explicitly cleared —
 * hence the mockClear() rather than a bare re-spy.
 */
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  createMock.mockReset();
  createMock.mockResolvedValue({ id: "log-1" });
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleError.mockClear();
});

describe("logProtectedDataAccess — well-formed entry", () => {
  it("writes the entry to Prisma with the expected shape", async () => {
    await logProtectedDataAccess({
      shopId: "shop-1.myshopify.com",
      actor: "merchant",
      action: "update",
      subjectRef: "8123456789",
      fields: ["name", "email"],
      context: "application.approve",
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(lastCreateData()).toEqual({
      shopId: "shop-1.myshopify.com",
      actor: "merchant",
      action: "update",
      subjectRef: "8123456789",
      fields: "name,email",
      context: "application.approve",
    });
  });

  it("normalises omitted optional fields to null instead of undefined", async () => {
    await logProtectedDataAccess({
      shopId: "shop-1.myshopify.com",
      actor: "webhook",
      action: "delete",
    });

    expect(lastCreateData()).toMatchObject({
      subjectRef: null,
      fields: null,
      context: null,
    });
  });

  it("collapses an empty fields array to null, not an empty string", async () => {
    await logProtectedDataAccess({
      shopId: "shop-1.myshopify.com",
      actor: "system",
      action: "read",
      fields: [],
    });

    expect(lastCreateData().fields).toBeNull();
  });
});

describe("logProtectedDataAccess — fields serialisation", () => {
  it("serialises the fields array to a comma-separated string", async () => {
    await logProtectedDataAccess({
      shopId: "shop-1.myshopify.com",
      actor: "storefront",
      action: "create",
      fields: ["name", "email", "phone", "company", "tax_id", "address"],
      context: "application.submit",
    });

    expect(lastCreateData().fields).toBe(
      "name,email,phone,company,tax_id,address",
    );
  });

  it("serialises a single-element array without a trailing separator", async () => {
    await logProtectedDataAccess({
      shopId: "shop-1.myshopify.com",
      actor: "merchant",
      action: "update",
      fields: ["email"],
    });

    expect(lastCreateData().fields).toBe("email");
  });
});

describe("logProtectedDataAccess — fail-safe (most important guarantee)", () => {
  it("swallows a Prisma failure instead of throwing", async () => {
    createMock.mockRejectedValue(new Error("connection terminated"));

    await expect(
      logProtectedDataAccess({
        shopId: "shop-1.myshopify.com",
        actor: "merchant",
        action: "update",
        context: "application.approve",
      }),
    ).resolves.toBeUndefined();
  });

  it("swallows a foreign-key violation for a shop row that no longer exists", async () => {
    // Real scenario: a GDPR webhook arrives for an uninstalled/redacted
    // shop. The FK insert fails; the webhook must still ack 200.
    createMock.mockRejectedValue(
      new Error(
        'Foreign key constraint failed on the field: `ProtectedDataAccessLog_shopId_fkey`',
      ),
    );

    await expect(
      logProtectedDataAccess({
        shopId: "gone.myshopify.com",
        actor: "webhook",
        action: "delete",
        context: "gdpr.customers_redact",
      }),
    ).resolves.toBeUndefined();
  });

  it("swallows a non-Error rejection without throwing", async () => {
    createMock.mockRejectedValue("boom");

    await expect(
      logProtectedDataAccess({
        shopId: "shop-1.myshopify.com",
        actor: "system",
        action: "read",
      }),
    ).resolves.toBeUndefined();
  });

  it("reports the failure to the console so an audit-log outage stays visible", async () => {
    createMock.mockRejectedValue(new Error("connection terminated"));

    await logProtectedDataAccess({
      shopId: "shop-1.myshopify.com",
      actor: "merchant",
      action: "update",
      context: "application.approve",
    });

    expect(consoleError).toHaveBeenCalledTimes(1);
  });
});

describe("logProtectedDataAccess — never persists personal data", () => {
  it("stores only field categories, never the values behind them", async () => {
    await logProtectedDataAccess({
      shopId: "shop-1.myshopify.com",
      actor: "storefront",
      action: "create",
      // An opaque local Application id — not an email, not a name.
      subjectRef: "cm5abc123def456",
      fields: ["name", "email", "phone"],
      context: "application.submit",
    });

    const persisted = JSON.stringify(lastCreateData());

    // Values that WOULD be personal data if any call site ever passed them
    // through. None of them may appear in what reaches Prisma.
    for (const personal of [
      "ana@example.com",
      "Ana",
      "Garcia",
      "+34600111222",
      "Calle Mayor 1",
      "B12345678",
    ]) {
      expect(persisted).not.toContain(personal);
    }

    // What IS stored: categories and an opaque reference.
    expect(lastCreateData().fields).toBe("name,email,phone");
    expect(lastCreateData().subjectRef).toBe("cm5abc123def456");
  });

  it("persists exactly the six audit columns and nothing else", async () => {
    // A widened payload would be the vector for personal data creeping in,
    // so pin the column set.
    await logProtectedDataAccess({
      shopId: "shop-1.myshopify.com",
      actor: "webhook",
      action: "export",
      subjectRef: "8123456789",
      fields: ["email"],
      context: "gdpr.data_request",
    });

    expect(Object.keys(lastCreateData()).sort()).toEqual([
      "action",
      "actor",
      "context",
      "fields",
      "shopId",
      "subjectRef",
    ]);
  });

  it("never logs the entry's values to the console on failure", async () => {
    createMock.mockRejectedValue(new Error("connection terminated"));

    await logProtectedDataAccess({
      shopId: "shop-1.myshopify.com",
      actor: "storefront",
      action: "create",
      subjectRef: "cm5abc123def456",
      fields: ["email"],
      context: "application.submit",
    });

    // The console fallback must obey the same no-personal-data rule as the
    // table — host logs are retained too.
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).not.toContain("ana@example.com");
  });
});
