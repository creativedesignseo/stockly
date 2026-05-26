/**
 * Tests for the shop-hint cookie helpers — covers the F5 recovery path.
 * No DB required; pure pure-function tests.
 */
import { describe, expect, it } from "vitest";

import {
  buildShopCookie,
  isValidShopDomain,
  readShopCookie,
  shopFromReferer,
} from "./shop-cookie.server";

describe("isValidShopDomain", () => {
  it.each([
    "desarrollo-adspubli.myshopify.com",
    "piroaccessories.myshopify.com",
    "a.myshopify.com",
    "some-handle.shop.dev",
    "abc123.spin.dev",
  ])("accepts %s", (value) => {
    expect(isValidShopDomain(value)).toBe(true);
  });

  it.each([
    "",
    null,
    undefined,
    "evil.com",
    "myshopify.com",
    ".myshopify.com",
    "-bad.myshopify.com",
    "admin.shopify.com",
    "store.myshopify.com.attacker.com",
    "https://store.myshopify.com",
  ])("rejects %p", (value) => {
    expect(isValidShopDomain(value as string)).toBe(false);
  });
});

describe("buildShopCookie", () => {
  it("returns a SameSite=None; Secure; HttpOnly cookie for valid shops", () => {
    const c = buildShopCookie("desarrollo-adspubli.myshopify.com");
    expect(c).not.toBeNull();
    expect(c).toContain("stockly_last_shop=desarrollo-adspubli.myshopify.com");
    expect(c).toContain("Path=/");
    expect(c).toContain("HttpOnly");
    expect(c).toContain("Secure");
    expect(c).toContain("SameSite=None");
    expect(c).toMatch(/Max-Age=\d+/);
  });

  it("returns null for invalid shops (no cookie should be written)", () => {
    expect(buildShopCookie("evil.com")).toBeNull();
    expect(buildShopCookie("")).toBeNull();
  });
});

function reqWith(headers: Record<string, string>): Request {
  return new Request("https://stockly.example/auth/login", { headers });
}

describe("readShopCookie", () => {
  it("returns the shop when the cookie is present and valid", () => {
    const req = reqWith({
      cookie:
        "foo=bar; stockly_last_shop=desarrollo-adspubli.myshopify.com; other=1",
    });
    expect(readShopCookie(req)).toBe("desarrollo-adspubli.myshopify.com");
  });

  it("returns null when no cookie header is present", () => {
    expect(readShopCookie(reqWith({}))).toBeNull();
  });

  it("returns null when the cookie value is not a valid shop domain", () => {
    const req = reqWith({ cookie: "stockly_last_shop=evil.com" });
    expect(readShopCookie(req)).toBeNull();
  });

  it("decodes URL-encoded values", () => {
    const req = reqWith({
      cookie: `stockly_last_shop=${encodeURIComponent("piroaccessories.myshopify.com")}`,
    });
    expect(readShopCookie(req)).toBe("piroaccessories.myshopify.com");
  });
});

describe("shopFromReferer", () => {
  it("extracts shop from admin.shopify.com referer", () => {
    expect(
      shopFromReferer(
        "https://admin.shopify.com/store/desarrollo-adspubli/apps/stockly-12",
      ),
    ).toBe("desarrollo-adspubli.myshopify.com");
  });

  it("extracts shop from deep admin.shopify.com paths with query strings", () => {
    expect(
      shopFromReferer(
        "https://admin.shopify.com/store/piroaccessories/apps/stockly-12/app/customers/applications?foo=bar",
      ),
    ).toBe("piroaccessories.myshopify.com");
  });

  it("returns the host directly when the referer is a *.myshopify.com page", () => {
    expect(
      shopFromReferer("https://desarrollo-adspubli.myshopify.com/admin/themes"),
    ).toBe("desarrollo-adspubli.myshopify.com");
  });

  it("returns null for unknown hosts", () => {
    expect(shopFromReferer("https://google.com/search?q=stockly")).toBeNull();
    expect(
      shopFromReferer("https://admin.shopify.com/something-not-store"),
    ).toBeNull();
  });

  it("returns null for missing or malformed referers", () => {
    expect(shopFromReferer(null)).toBeNull();
    expect(shopFromReferer("")).toBeNull();
    expect(shopFromReferer("not a url")).toBeNull();
  });
});
