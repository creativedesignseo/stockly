/**
 * Tests for the `/app/billing` route action (intent=subscribe).
 *
 * Lives under app/services/ (not app/routes/) even though it targets
 * a route module: Remix's Vite plugin treats every file directly
 * under app/routes/ as a route file (including `*.test.ts`), which
 * broke the production build with "Server-only module referenced by
 * client" once a colocated test file imported `../services/billing.server`.
 * No other route in this codebase has a colocated test file — keeping
 * tests here matches that existing convention and avoids re-triggering
 * Remix's route discovery on a test file.
 *
 * REVENUE-PATH GUARD: `billing.request` must be called with the exact
 * plan name the merchant picked, and `isTest` must be DERIVED from the
 * environment (never hardcoded) — hardcoding either value is the
 * easiest way to silently create real charges in test or fail to
 * detect real subscriptions in prod.
 *
 * Follows the `vi.hoisted` + `vi.mock` convention from
 * discount-function-sync.test.ts — no real Prisma or Shopify SDK
 * calls, `authenticateAdmin` is mocked entirely.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateAdminMock, billingRequestMock, billingCheckMock } =
  vi.hoisted(() => ({
    authenticateAdminMock: vi.fn(),
    billingRequestMock: vi.fn(),
    billingCheckMock: vi.fn(),
  }));

vi.mock("../lib/auth.server", () => ({
  authenticateAdmin: authenticateAdminMock,
}));

// eslint-disable-next-line import/first
import { action } from "../routes/app.billing";
// eslint-disable-next-line import/first
import { GROWTH_PLAN } from "./billing-plans";

function buildRequest(body: Record<string, string>): Request {
  const form = new URLSearchParams(body);
  return new Request("https://example.com/app/billing", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  authenticateAdminMock.mockReset();
  billingRequestMock.mockReset();
  billingCheckMock.mockReset();

  authenticateAdminMock.mockResolvedValue({
    shop: { id: "shop-1" },
    billing: {
      request: billingRequestMock,
      check: billingCheckMock,
    },
  });
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("/app/billing action — intent=subscribe", () => {
  it("calls billing.request with the submitted plan name", async () => {
    process.env.NODE_ENV = "development";
    billingRequestMock.mockResolvedValue(undefined);

    await action({
      request: buildRequest({ intent: "subscribe", plan: GROWTH_PLAN }),
      params: {},
      context: {},
    } as never);

    expect(billingRequestMock).toHaveBeenCalledTimes(1);
    expect(billingRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({ plan: GROWTH_PLAN, returnUrl: "/app/billing" }),
    );
  });

  it("derives isTest from the environment instead of hardcoding it", async () => {
    process.env.NODE_ENV = "production";
    billingRequestMock.mockResolvedValue(undefined);

    await action({
      request: buildRequest({ intent: "subscribe", plan: GROWTH_PLAN }),
      params: {},
      context: {},
    } as never);

    expect(billingRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({ isTest: false }),
    );

    process.env.NODE_ENV = "development";
    await action({
      request: buildRequest({ intent: "subscribe", plan: GROWTH_PLAN }),
      params: {},
      context: {},
    } as never);

    expect(billingRequestMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isTest: true }),
    );
  });

  it("rejects an unknown plan without calling billing.request", async () => {
    process.env.NODE_ENV = "development";

    const response = (await action({
      request: buildRequest({ intent: "subscribe", plan: "NotAPlan" }),
      params: {},
      context: {},
    } as never)) as Response;

    expect(billingRequestMock).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
  });

  it("rejects an unknown intent without calling billing.request", async () => {
    process.env.NODE_ENV = "development";

    const response = (await action({
      request: buildRequest({ intent: "cancel", plan: GROWTH_PLAN }),
      params: {},
      context: {},
    } as never)) as Response;

    expect(billingRequestMock).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
  });
});
