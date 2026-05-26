/**
 * Shop hint cookie — remembers the merchant's `*.myshopify.com` domain
 * across iframe reloads so a browser refresh (F5) on a deep admin route
 * can recover the Shopify auth context.
 *
 * Why this exists
 * ---------------
 * When a merchant is inside the embedded admin and presses F5 on, say,
 * `/app/customers/applications`, the iframe reloads that exact URL —
 * App Bridge has already stripped the `shop`, `host`, and `id_token`
 * search params, so the request hits our loader with no Shopify context.
 * `authenticate.admin(request)` then has nothing to exchange and ends up
 * redirecting to `/auth/login`, where the boilerplate Polaris "Log in /
 * Shop domain" form renders.
 *
 * To break the loop we drop a long-lived, http-only cookie on every
 * successful admin authentication. When `/auth/login` is hit without a
 * `shop` query param, it falls back to:
 *
 *   1. the `Referer` header (admin.shopify.com/store/<handle>/…)
 *   2. this cookie
 *
 * If either yields a shop domain, we redirect to `/?shop=<domain>` so the
 * root loader can re-enter the proper bootstrap (which then triggers a
 * fresh id_token exchange via App Bridge instead of the login form).
 *
 * Security notes
 * --------------
 * - `HttpOnly` + `Secure` + `SameSite=None` — required for embedded
 *   iframes on `admin.shopify.com`. `SameSite=Lax` would block reading
 *   the cookie inside the iframe entirely.
 * - The cookie holds only the public `*.myshopify.com` domain, never a
 *   session token. Worst case if leaked: someone learns which shop the
 *   user belongs to — no auth bypass.
 * - We validate the domain against Shopify's allowed shapes before
 *   trusting it (no open-redirect from a forged Referer/cookie).
 */

const COOKIE_NAME = "stockly_last_shop";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Strict Shopify shop-domain validator.
 * Matches `<handle>.myshopify.com` plus the few `*.shop.dev` and
 * `*.spin.dev` variants used in Shopify-internal dev environments.
 */
const SHOP_DOMAIN_RE =
  /^[a-z0-9][a-z0-9-]*\.(myshopify\.com|shop\.dev|spin\.dev)$/i;

export function isValidShopDomain(value: string | null | undefined): value is string {
  if (!value) return false;
  return SHOP_DOMAIN_RE.test(value);
}

/**
 * Build a `Set-Cookie` header value for the shop-hint cookie.
 * Returns null if the input isn't a valid shop domain — callers should
 * just skip setting the cookie in that case.
 */
export function buildShopCookie(shop: string): string | null {
  if (!isValidShopDomain(shop)) return null;
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(shop)}`,
    "Path=/",
    `Max-Age=${ONE_YEAR_SECONDS}`,
    "HttpOnly",
    "Secure",
    "SameSite=None",
  ];
  return parts.join("; ");
}

/**
 * Read the shop-hint cookie from a request. Returns null if missing or
 * malformed (validated against the shop-domain shape).
 */
export function readShopCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const raw of header.split(";")) {
    const [k, ...rest] = raw.trim().split("=");
    if (k !== COOKIE_NAME) continue;
    try {
      const value = decodeURIComponent(rest.join("="));
      return isValidShopDomain(value) ? value : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Try to extract a Shopify shop domain from a `Referer` header.
 *
 * Handles both shapes the embedded admin sends:
 *   - https://admin.shopify.com/store/<handle>/apps/<app-handle>/...
 *     → returns `<handle>.myshopify.com`
 *   - https://<handle>.myshopify.com/admin/...
 *     → returns `<handle>.myshopify.com`
 *
 * Returns null if no shop can be parsed.
 */
export function shopFromReferer(referer: string | null): string | null {
  if (!referer) return null;
  let url: URL;
  try {
    url = new URL(referer);
  } catch {
    return null;
  }
  // Direct <handle>.myshopify.com referer.
  if (isValidShopDomain(url.hostname)) {
    return url.hostname.toLowerCase();
  }
  // admin.shopify.com/store/<handle>/...
  if (url.hostname === "admin.shopify.com") {
    const match = url.pathname.match(/^\/store\/([a-z0-9][a-z0-9-]*)\b/i);
    if (match) {
      const candidate = `${match[1].toLowerCase()}.myshopify.com`;
      if (isValidShopDomain(candidate)) return candidate;
    }
  }
  return null;
}
