/**
 * Tests for the billing plan config — the single source of truth
 * consumed by both `shopifyApp({ billing })` (app/shopify.server.ts)
 * and the plan-picker UI (app/routes/app.billing.tsx).
 *
 * REVENUE-PATH GUARD: pricing here must match ADR-008 exactly
 * (Starter $39 / Growth $79 / Plus $149, USD, Every30Days, 14-day
 * trial on all three). A typo here is a pricing bug in production.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { BillingInterval } from "@shopify/shopify-app-remix/server";
import {
  BILLING_PLANS,
  BILLING_PLAN_NAMES,
  STARTER_PLAN,
  buildBillingConfig,
  isTestBillingEnvironment,
  checkActiveSubscription,
} from "./billing.server";

describe("BILLING_PLANS — ADR-008 pricing source of truth", () => {
  it("defines exactly 3 plans named Starter, Growth, Plus", () => {
    expect(BILLING_PLAN_NAMES).toEqual([STARTER_PLAN]);
    expect(Object.keys(BILLING_PLANS)).toHaveLength(1);
  });

  it("prices Starter at $39, Growth at $79, Plus at $149", () => {
    expect(BILLING_PLANS[STARTER_PLAN].amount).toBe(39);
  });

  it("uses USD for all three plans", () => {
    for (const name of BILLING_PLAN_NAMES) {
      expect(BILLING_PLANS[name].currencyCode).toBe("USD");
    }
  });

  it("gives all three plans a 14-day trial", () => {
    for (const name of BILLING_PLAN_NAMES) {
      expect(BILLING_PLANS[name].trialDays).toBe(14);
    }
  });

  it("bills every 30 days for all three plans", () => {
    for (const name of BILLING_PLAN_NAMES) {
      expect(BILLING_PLANS[name].interval).toBe(BillingInterval.Every30Days);
    }
  });
});

describe("buildBillingConfig", () => {
  it("mirrors BILLING_PLANS into the shopifyApp({ billing }) shape without re-typing numbers", () => {
    const config = buildBillingConfig();

    expect(Object.keys(config)).toEqual([STARTER_PLAN]);
    expect(config[STARTER_PLAN].trialDays).toBe(14);
    expect(config[STARTER_PLAN].lineItems).toEqual([
      { amount: 39, currencyCode: "USD", interval: BillingInterval.Every30Days },
    ]);
  });
});

describe("isTestBillingEnvironment", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalTestShops = process.env.BILLING_TEST_SHOPS;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalTestShops === undefined) delete process.env.BILLING_TEST_SHOPS;
    else process.env.BILLING_TEST_SHOPS = originalTestShops;
  });

  it("is true when NODE_ENV is not 'production' (dev/test safety default)", () => {
    process.env.NODE_ENV = "development";
    expect(isTestBillingEnvironment()).toBe(true);

    process.env.NODE_ENV = "test";
    expect(isTestBillingEnvironment()).toBe(true);
  });

  it("is false in production for any shop not on the allowlist", () => {
    process.env.NODE_ENV = "production";
    delete process.env.BILLING_TEST_SHOPS;
    expect(isTestBillingEnvironment()).toBe(false);
    expect(isTestBillingEnvironment("real-merchant.myshopify.com")).toBe(false);

    // A configured allowlist must NEVER leak test billing to other shops.
    process.env.BILLING_TEST_SHOPS = "adspubli-wholesale-test.myshopify.com";
    expect(isTestBillingEnvironment("real-merchant.myshopify.com")).toBe(false);
    expect(isTestBillingEnvironment()).toBe(false);
  });

  it("is true in production for shops on the BILLING_TEST_SHOPS allowlist", () => {
    process.env.NODE_ENV = "production";
    process.env.BILLING_TEST_SHOPS =
      "adspubli-wholesale-test.myshopify.com, other-dev.myshopify.com";
    expect(
      isTestBillingEnvironment("adspubli-wholesale-test.myshopify.com"),
    ).toBe(true);
    expect(isTestBillingEnvironment("other-dev.myshopify.com")).toBe(true);
    // Case-insensitive: Shopify domains are lowercase, but don't bet on it.
    expect(
      isTestBillingEnvironment("Adspubli-Wholesale-Test.myshopify.com"),
    ).toBe(true);
  });
});

describe("checkActiveSubscription", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls billing.check with the 3 plan names and the derived isTest flag", async () => {
    process.env.NODE_ENV = "development";
    const checkMock = vi.fn().mockResolvedValue({
      hasActivePayment: true,
      appSubscriptions: [{ name: STARTER_PLAN, status: "ACTIVE", id: "gid://1" }],
    });

    const result = await checkActiveSubscription({ check: checkMock });

    expect(checkMock).toHaveBeenCalledWith({
      plans: [STARTER_PLAN],
      isTest: true,
    });
    expect(result).toEqual({
      hasActivePayment: true,
      appSubscriptions: [{ name: STARTER_PLAN, status: "ACTIVE", id: "gid://1" }],
    });
  });

  it("passes isTest: false when NODE_ENV is production", async () => {
    process.env.NODE_ENV = "production";
    const checkMock = vi.fn().mockResolvedValue({
      hasActivePayment: false,
      appSubscriptions: [],
    });

    await checkActiveSubscription({ check: checkMock });

    expect(checkMock).toHaveBeenCalledWith(
      expect.objectContaining({ isTest: false }),
    );
  });
});
