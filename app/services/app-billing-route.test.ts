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
import { STARTER_PLAN } from "./billing-plans";

function buildRequest(body: Record<string, string>): Request {
  const form = new URLSearchParams(body);
  return new Request("https://example.com/app/billing", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

const originalNodeEnv = process.env.NODE_ENV;
const originalApiKey = process.env.SHOPIFY_API_KEY;

beforeEach(() => {
  authenticateAdminMock.mockReset();
  billingRequestMock.mockReset();
  billingCheckMock.mockReset();

  authenticateAdminMock.mockResolvedValue({
    shop: { id: "shop-1" },
    session: { shop: "example-store.myshopify.com" },
    billing: {
      request: billingRequestMock,
      check: billingCheckMock,
    },
  });
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalApiKey === undefined) delete process.env.SHOPIFY_API_KEY;
  else process.env.SHOPIFY_API_KEY = originalApiKey;
});

describe("/app/billing action — intent=subscribe", () => {
  it("calls billing.request with the submitted plan name", async () => {
    process.env.NODE_ENV = "development";
    process.env.SHOPIFY_API_KEY = "test-api-key";
    billingRequestMock.mockResolvedValue(undefined);

    await action({
      request: buildRequest({ intent: "subscribe", plan: STARTER_PLAN }),
      params: {},
      context: {},
    } as never);

    expect(billingRequestMock).toHaveBeenCalledTimes(1);
    expect(billingRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: STARTER_PLAN,
        // The returnUrl must land the merchant back INSIDE the embedded
        // admin. Shopify's approval page redirects the TOP-LEVEL window
        // to this URL: our own host (absolute or not) loads outside the
        // admin with no host/embedded params and dead-ends on the public
        // index — a reviewer screencasted exactly that (1.2.2). The
        // admin.shopify.com/store/{handle}/apps/{client-id}/… shape is
        // the official docs' pattern and the SDK's own default.
        returnUrl:
          "https://admin.shopify.com/store/example-store/apps/test-api-key/app/billing",
      }),
    );
  });

  it("derives isTest from the environment instead of hardcoding it", async () => {
    process.env.NODE_ENV = "production";
    billingRequestMock.mockResolvedValue(undefined);

    await action({
      request: buildRequest({ intent: "subscribe", plan: STARTER_PLAN }),
      params: {},
      context: {},
    } as never);

    expect(billingRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({ isTest: false }),
    );

    process.env.NODE_ENV = "development";
    await action({
      request: buildRequest({ intent: "subscribe", plan: STARTER_PLAN }),
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
      request: buildRequest({ intent: "cancel", plan: STARTER_PLAN }),
      params: {},
      context: {},
    } as never)) as Response;

    expect(billingRequestMock).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
  });
});
