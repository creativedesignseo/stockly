# BSS B2B Solution — Technical Profile

> Focused technical deep-dive on Stockly's largest direct competitor.
> For market positioning, pricing strategy, and feature comparison
> across the whole landscape see [`docs/06-competitive-landscape.md`](../06-competitive-landscape.md).
> This file is the engineering counterpart: *what they built with, and
> what that tells us about how to compete*.

**Last verified:** 2026-05-26 (live inspection from `desarrollo-adspubli.myshopify.com`)
**Inspection method:** Claude in Chrome MCP → admin iframe URL extraction + DNS/HTTP probing via `curl` + WHOIS.

---

## Identity

| Field | Value |
|---|---|
| App Store handle | `b2b-solution-custom-pricing` |
| Public listing | https://apps.shopify.com/b2b-solution-custom-pricing |
| Developer | BSS B2B Suite (BSS Commerce) — Hanoi, Vietnam |
| Launched | September 18, 2020 |
| Public traction (2026-05-26) | 1,023 reviews · 4.8★ · 94% 5-star |
| Backend domain | `b2b-solution.bsscommerce.com` |
| Marketing site | `bsscommerce.com` (Drupal/Magento-style cache headers) |

---

## Stack inference

| Layer | Detected | Evidence |
|---|---|---|
| Server framework | **Node.js + Express** | `x-powered-by: Express` on `b2b-solution.bsscommerce.com` |
| Edge / proxy | **Cloudflare** | `server: cloudflare`, IPs in 104.26.0.0/16 + 172.67.0.0/16, `cf-ray` + `cf-cache-status` headers |
| Origin host | Hidden behind Cloudflare | No leaked headers; likely AWS or Asian regional host (BSS is Vietnamese) |
| CORS posture | `Access-Control-Allow-Origin: *` | Permissive — typical SaaS app |
| CSP on root path | `frame-ancestors 'none'` | Root rejects framing; the app routes selectively allow Shopify admin |
| Embed mechanism | Standard Shopify admin iframe with name `app-iframe` | Observed in DOM at the parent admin page |

---

## Architecture inference (the strategically important part)

**BSS launched September 2020. Shopify Discount Functions launched in 2022.**

That means the BSS pricing engine is **pre-Functions**. The likely
implementation:

- Storefront-side price overrides (Liquid + JS injected via theme blocks)
- Cart-attribute manipulation to carry discount context
- Draft Orders generated server-side from the Express backend at
  checkout-intent time

This is exactly the architecture [ADR-010](../decisions/ADR-010-b2b-pricing-engine-on-basic-plan.md)
explains Stockly deliberately rejects, because it produces a class of
bug equivalent to Stockly's old **C3** (storefront shows wholesale,
checkout charges retail) — see `progress/2026-05-26-approve-flow-fix.md`
for what that looks like and how it broke our own product before we
fixed it.

For BSS to migrate to Functions would be a near-total rewrite of their
core. With 1k+ active merchants depending on the existing behavior, the
migration cost is prohibitive. This is **structural technical debt**
they cannot easily pay down.

**Implication for Stockly:** the "what you see = what you pay" line is
defensible against BSS for years to come. The Function-WASM architecture
is not a marketing claim — it is an engineering moat.

---

## Pricing tiers (2026-05-26)

Re-verified directly from the Shopify App Store listing, more granular
than the summary in `06-competitive-landscape.md`:

| Plan | Monthly | Annual | Annual savings | Key inclusions |
|---|---|---|---|---|
| Free — Dev Partner | $0 | — | — | Dev stores only |
| Essential | **$25** | $270 | 10% | Volume pricing, approval workflow, auto-tagging |
| Advanced | **$50** | $510 | 15% | Customer-specific pricing, tax toggle, net terms, wholesale shipping |
| Platinum | **$100** | $960 | 20% | Variant-level pricing, custom price lists per customer, API access, bulk import/export |

Free trial: 14 days on every paid tier.

---

## Feature gap analysis vs Stockly (as of 2026-05-26)

| Capability | BSS | Stockly | Gap direction |
|---|---|---|---|
| Volume/tier pricing | Essential+ | ✅ Live | Even |
| Customer approval workflow | Essential+ | ✅ Live (admin queue) | Even |
| Auto-tag on approval | Essential+ | ✅ Live (commit `0250d1f`) | Even |
| Customer-specific pricing | Advanced+ | Partial (via tier scope) | BSS ahead |
| Tax display toggle / exempt | Advanced+ | Not built | BSS ahead |
| Net terms | Advanced+ | Phase 2 roadmap | BSS ahead |
| Wholesale shipping rates | Advanced+ | Not built | BSS ahead |
| Variant-level pricing | Platinum | ✅ Live (Function reads variant > product > all) | Even |
| Bulk import/export | Platinum | Not built | BSS ahead |
| API access | Platinum | Not built (`/proxy/*` only) | BSS ahead |
| **First-Purchase Qualifier (FPQ)** | — | ✅ Live | **Stockly only** |
| **Discount Function (checkout-enforced)** | — | ✅ Live | **Stockly only** |
| **Markets `applicationLevel: ALL` segmentation** | — | ✅ Live | **Stockly only** |
| **What-you-see-equals-what-you-pay guarantee** | Can't structurally guarantee | ✅ Validated E2E 2026-05-26 | **Stockly only** |
| **EU/Spain local white-glove onboarding** | — | ✅ via Adspubli | **Stockly only** |

---

## Stockly's roadmap implication

BSS is ahead on **integration breadth** (tax, net terms, shipping,
import/export, API). Stockly is ahead on **engineering correctness**
(Functions, Markets, FPQ, single-source-of-truth pricing).

The two roadmap implications:

1. **Don't chase BSS feature-for-feature on integration breadth** —
   that's a treadmill where they have a 5-year head start. Pick the
   1-2 highest-impact gaps (probably **net terms** for premium B2B
   credibility, and **bulk import** for onboarding existing wholesale
   customers) and ignore the rest.

2. **Double-down on the engineering moats** — every Stockly feature
   should reinforce "checkout-enforced, no surprises". Write the
   marketing in those terms. The pricing engine differentiation is
   harder for BSS to replicate than any feature gap is for us.

---

## How to reproduce this inspection

For future re-verification (when BSS releases major version, or for
auditing other competitors), the procedure is:

```bash
# 1. Get the app's backend domain by inspecting the iframe src in the
#    Shopify admin via Claude in Chrome MCP, or manually via DevTools.
#    Look for the iframe with name="app-iframe".

# 2. Probe the domain.
DOMAIN=b2b-solution.bsscommerce.com
curl -sI -A "Mozilla/5.0" "https://$DOMAIN/" | head -20
dig +short "$DOMAIN"
dig +short -x "$(dig +short "$DOMAIN" | head -1)"
whois "$(dig +short "$DOMAIN" | head -1)" | grep -iE "^(OrgName|netname|country):"

# 3. Pricing + reviews from the App Store listing. WebFetch works:
#    https://apps.shopify.com/<app-handle>
```

Update this file when BSS changes pricing, ships a major architectural
shift, or when a new direct competitor warrants the same treatment.

---

## Open questions / what we did NOT verify

- The exact origin host behind Cloudflare. Could be inferred via
  certificate transparency logs (`crt.sh` for `bsscommerce.com`) or
  via error-page leaks, but not worth the time.
- What the BSS app's admin UI actually does feature-by-feature.
  Would require logging in to an Essential or Advanced trial account.
  Worth doing once before a pricing/positioning decision, not before.
- The BSS storefront block implementation (Liquid file content).
  Available via theme inspector if/when we install their app on a
  test store with the trial.
