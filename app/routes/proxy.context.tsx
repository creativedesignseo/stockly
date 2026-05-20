/**
 * App Proxy endpoint — single round-trip context for storefront blocks.
 *
 * Storefront URL: /apps/stockly/context
 * Shopify forwards it to: /proxy/context (this route)
 *
 * Returns everything a Theme App Extension needs in one request:
 *   - eligibility (is this customer allowed to see wholesale?)
 *   - branding (colors, fonts)
 *   - copy (editable customer-facing strings)
 *   - tiers (volume pricing rules)
 *   - shop settings (min order value, etc.)
 *
 * The block calls this once on page load and caches the result.
 *
 * Auth: Shopify signs every proxy request with HMAC. We verify via
 * `authenticate.public.appProxy` which throws on invalid signature.
 *
 * Query params Shopify adds to every proxy request:
 *   - shop: the storefront's shop domain
 *   - path_prefix: the configured subpath
 *   - timestamp + signature: HMAC
 *   - logged_in_customer_id: numeric customer ID, or empty string
 *
 * Additional params our theme block passes:
 *   - customer_tags: comma-separated tag list (read from Liquid)
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import { authenticate } from "../shopify.server";
import { getOrCreateShop, parseShop } from "../services/shops.server";
import { listTiers } from "../services/tiers.server";
import { isEligible } from "../services/wholesale-customers.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Verifies HMAC signature; throws 401 if invalid.
  const { session } = await authenticate.public.appProxy(request);

  // `session` is null if no customer is logged in; we still respond,
  // but with `eligible: false`.
  const url = new URL(request.url);
  const shopDomain = session?.shop ?? url.searchParams.get("shop");

  if (!shopDomain) {
    return json(
      { error: "Missing shop parameter" },
      { status: 400, headers: corsHeaders() },
    );
  }

  // Look up our Shop row.
  const shopRow = await getOrCreateShop(shopDomain);
  const { branding, copy } = parseShop(shopRow);

  // Determine eligibility.
  const customerId = url.searchParams.get("logged_in_customer_id") ?? "";
  const customerTags =
    url.searchParams
      .get("customer_tags")
      ?.split(",")
      .map((t) => t.trim())
      .filter(Boolean) ?? [];

  let eligible = false;
  if (customerId) {
    eligible = await isEligible({
      shopId: shopRow.id,
      shopifyCustomerId: customerId,
      customerTags,
      shopWholesaleTag: shopRow.wholesaleTag,
    });
  }

  // Tiers only matter for eligible customers — saves payload size
  // for guests and non-wholesale customers.
  const tiers = eligible ? await listTiers(shopRow.id) : [];

  return json(
    {
      eligible,
      shop: {
        domain: shopRow.id,
        wholesaleTag: shopRow.wholesaleTag,
        minOrderValue: shopRow.minOrderValue,
        onboarded: shopRow.onboarded,
      },
      branding,
      copy,
      tiers: tiers.map((t) => ({
        id: t.id,
        name: t.name,
        scope: t.scope,
        scopeId: t.scopeId,
        minQty: t.minQty,
        discountPct: t.discountPct,
        position: t.position,
      })),
    },
    {
      headers: {
        ...corsHeaders(),
        // App Proxy responses can be cached briefly per-customer.
        // Short TTL so admin changes propagate quickly.
        "Cache-Control": "private, max-age=60",
      },
    },
  );
};

function corsHeaders() {
  // App Proxy already restricts callers to the merchant's storefront,
  // so wide CORS is acceptable here. (Theme blocks are same-origin
  // from the storefront's perspective; this header is defensive only.)
  return {
    "Content-Type": "application/json; charset=utf-8",
  };
}

// No default export on purpose: this is a Remix "resource route" — a
// loader-only endpoint that returns JSON. If we add a default export,
// Remix treats it as a navigable page and renders the full HTML
// document around the loader data on plain fetch() requests, breaking
// the App Proxy contract.
