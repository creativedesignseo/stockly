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
import { resolveCustomerStatus } from "../services/wholesale-customers.server";

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
  let qualifiedAt: Date | null = null;
  if (customerId) {
    const status = await resolveCustomerStatus({
      shopId: shopRow.id,
      shopifyCustomerId: customerId,
      customerTags,
      shopWholesaleTag: shopRow.wholesaleTag,
    });
    eligible = status.eligible;
    qualifiedAt = status.qualifiedAt;
  }

  // Tiers only matter for eligible customers — saves payload size
  // for guests and non-wholesale customers. activeOnly so inactive
  // tiers (kept for history) never leak to the storefront.
  const tiers = eligible
    ? await listTiers(shopRow.id, { activeOnly: true })
    : [];

  // Customer state for the storefront (ADR-004 5-state lifecycle):
  //   - "visitor": not eligible (no tag, no DB row)
  //   - "qualified": eligible AND has completed FPQ
  //   - "approved_pre_fpq": eligible but FPQ not yet met
  // Pending/rejected states will be wired when the approval queue
  // ships in a follow-up.
  const customerState: "visitor" | "approved_pre_fpq" | "qualified" = !eligible
    ? "visitor"
    : qualifiedAt
      ? "qualified"
      : "approved_pre_fpq";

  return json(
    {
      eligible,
      customerState,
      shop: {
        domain: shopRow.id,
        wholesaleTag: shopRow.wholesaleTag,
        minOrderValue: shopRow.minOrderValue,
        onboarded: shopRow.onboarded,
        wholesaleBaselinePct: shopRow.wholesaleBaselinePct,
        // FPQ config so the storefront can drive a "Add €X more to
        // unlock wholesale" banner for approved_pre_fpq customers.
        fpq: {
          mode: shopRow.fpqMode,
          amount: shopRow.fpqAmount,
          quantity: shopRow.fpqQuantity,
          combinedLogic: shopRow.fpqCombinedLogic,
        },
        // Kept as a flat key for backward compatibility: storefront
        // bundles already shipped to merchant themes may read it.
        // Same value as `postQualification.quantity` below.
        postQualificationMOQ: shopRow.postQualificationMOQ,
        // Post-qualification gate config, mirroring the `fpq` shape above
        // so the storefront can reuse the same banner logic for the two
        // gates. This is the minimum applied to every order a customer
        // places AFTER `qualifiedAt` is set, whereas `fpq` only applies
        // to the opening order. A buyer is never subject to both.
        //
        // `quantity` is `postQualificationMOQ` — that column predates the
        // mode/amount fields and doubles as the quantity leg. Exposed raw,
        // with no normalization, so this endpoint stays a faithful
        // projection of the DB. Note the column defaults to 1, which the
        // schema documents as "no minimum": a storefront reading
        // `quantity: 1` will find the gate met by any non-empty cart,
        // which is the intended fail-open behavior.
        postQualification: {
          mode: shopRow.postQualificationMode,
          amount: shopRow.postQualificationMinAmount,
          quantity: shopRow.postQualificationMOQ,
          combinedLogic: shopRow.postQualificationCombinedLogic,
        },
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
        aggregation: t.aggregation, // 'per_line' | 'cart_total' (ADR-007)
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
