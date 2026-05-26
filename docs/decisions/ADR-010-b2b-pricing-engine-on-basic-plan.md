# ADR-010 — B2B Pricing Engine on Shopify Basic/Grow Plans

**Status:** Accepted
**Date:** 2026-05-26
**Decision owner:** Jonatan Montilla (Adspubli)
**Supersedes / relates to:** ADR-006 (Wholesale Baseline + Product Panel), ADR-007 (Tier Aggregation), ADR-008 (Competitive Intelligence — BSS)

---

## Context

Stockly's value proposition is bringing **enterprise-grade B2B wholesale pricing** to Shopify Basic/Grow merchants — features normally exclusive to **Shopify Plus B2B** ($2,300/mo). The single most important architectural question for the product is:

> How do we apply automatic, per-customer wholesale pricing at checkout on a plan that explicitly blocks the official B2B catalog APIs?

Shopify's documented B2B pricing system (CompanyLocationCatalog + PriceList + Catalog assignment) is **plan-gated**. On Basic/Grow, attempting to assign a catalog to a Company Location returns:

```
ACCESS_DENIED: "Catalogs assigned to company locations can't be set to
active with your plan."
```

This is a hard plan restriction enforced by Shopify's GraphQL Admin API, not a UI limitation. It cannot be bypassed by clever permissions, scopes, or app-extension declarations.

Therefore, any B2B pricing on Basic/Grow must come from **a different Shopify API** that does NOT require Plus and that operates legitimately on the same checkout flow.

We identified two viable techniques during the Piro Jewelry engagement (May 2026). This ADR documents which one Stockly uses, which one it does not, and why.

---

## Decision

**Stockly's B2B pricing engine uses Shopify Functions (Discount Functions) as the primary mechanism, optionally combined with the Markets `applicationLevel: ALL` technique when the merchant needs catalog-level segmentation.**

Specifically:

1. **Primary engine — Discount Function (`extensions/stockly-volume-discount/`)**
   A WASM module compiled from TypeScript, targeted at `purchase.product-discount.run`. It reads tier configuration from a metafield on the DiscountNode and applies per-line percentage discounts at checkout for customers tagged `wholesale` (or matching the configured eligibility rules). This is the **only Stockly code path currently in production** for B2B pricing.

2. **Optional companion — Markets with `applicationLevel: ALL`**
   The technique discovered during the Piro engagement (see `docs/architecture/b2b-pricing-deep-dive.md`). It uses `marketUpdate` with `MarketConditionsCompanyLocationsInput { applicationLevel: ALL }` to make a single MarketCatalog apply to every Company Location in the shop. This solves a catalog-segmentation problem (a single common B2B catalog for all Companies) and is **not currently invoked by Stockly code**, but documented here as a fallback or complement for merchants who want hard catalog separation rather than discount-overlay.

Both techniques use **publicly documented, plan-supported Shopify APIs**. Neither relies on undocumented behavior, internal endpoints, or anything Shopify could deprecate without notice. Both are **first-class Shopify mechanisms** repurposed for a use case that the platform did not explicitly target.

---

## Why a Discount Function, not the Markets technique, as Stockly's primary engine

The Markets `applicationLevel: ALL` technique works beautifully when:
- The merchant has formal Shopify B2B Companies / Company Locations
- All B2B customers should see the same flat discount (e.g., −40% across the board)
- The merchant wants the discount to appear as the "real" price (not as a discount line on the receipt)

It is unsuitable as Stockly's universal engine because:

| Limitation | Impact |
|---|---|
| Requires merchant to enable **Shopify's B2B feature** (Companies + Locations) | Adds onboarding friction; many luxury SMBs use plain Customer accounts |
| Catalog-based pricing is **flat per Company Location** — cannot model tiered volume discounts | Breaks Stockly's #1 feature: volume tiers (10 units → 10%, 50 → 15%, etc.) |
| Cannot scope discounts to specific products or collections | Breaks per-collection / per-variant overrides (ADR-006, ADR-008 P0) |
| Cannot combine multiplicatively with a baseline wholesale discount | Breaks the baseline × tier composition model (ADR-006) |
| Requires merchant to set up PriceLists for every product | Heavy admin burden; Discount Functions read configuration from a single metafield |
| Cannot evaluate qualification rules at checkout (e.g., First-Purchase Qualifier) | Breaks FPQ flow (ADR-004) |

Discount Functions, by contrast:

- Run **at every checkout evaluation** with full cart context (lines, customer, totals)
- Compute discounts **dynamically** from a metafield configuration the merchant edits in Stockly admin
- Support **any pricing model the function code expresses** — tiers, scopes, qualification gates, multiplicative composition
- Work on **all Shopify plans including Basic** because they are explicitly designed as the extensibility surface for pricing logic
- Output discount lines on the receipt — the customer sees the wholesale discount applied, which is desirable for transparency in B2B

For a product whose value proposition is **flexible, branded, premium-tier-aware B2B pricing**, Discount Functions are the correct primitive. The Markets technique is a complement, not a substitute.

---

## Alternatives considered and rejected

### Alt 1 — Direct CompanyLocationCatalog assignment via `catalogCreate`

```graphql
mutation {
  catalogCreate(input: {
    title: "Wholesale",
    status: ACTIVE,
    context: { companyLocationIds: [...] },
    priceListId: "..."
  }) { ... }
}
```

**Rejected.** Returns `ACCESS_DENIED` on Basic/Grow. Plan-gated to Plus.

### Alt 2 — Storefront-only pricing (no checkout enforcement)

Display discounted prices in custom storefront blocks (Quick Order Form, Wholesale Product Panel) without enforcing them at checkout.

**Rejected.** Sprint 1 shipped this as a stop-gap and immediately surfaced the bug: cart used base prices, checkout charged retail, customer saw the discount evaporate. Unacceptable for a premium product where pricing trust is paramount.

### Alt 3 — Shopify Scripts (legacy)

**Rejected.** Shopify Scripts are deprecated and only available on Plus. Not an option.

### Alt 4 — Shopify Flow + external service

Use Flow's `Run code` action to call an external pricing service.

**Rejected.** Flow's `Run code` is sandboxed and cannot make HTTP requests. Flow has no native action for cart pricing.

### Alt 5 — Manual Draft Orders for every B2B purchase

**Rejected.** Breaks the self-service buying experience that is the whole point of a B2B portal. Defeats the product's value proposition.

---

## Consequences

### Positive

- **Plan-agnostic engine.** The same Discount Function works on Basic, Grow, Advanced, and Plus. Stockly merchants never need to upgrade plans for the core feature.
- **Single source of truth.** Tier configuration lives in the metafield on the DiscountNode, written by `app/services/discount-function-sync.server.ts` whenever the merchant saves changes in admin. Function reads it on every cart evaluation.
- **Full programmability.** Any pricing rule expressible in TypeScript (and compilable to WASM under the function's 256 KB input / 50ms execution budget) can be implemented. Tiers, scopes, FPQ, multiplicative baseline, eligible customer GIDs, exclusions — all in user-space.
- **Receipts are honest.** Customers see "Wholesale tier 2 −15%" as a discount line, not a mysteriously different unit price. Good for premium positioning and trust.
- **Stockly's IP is real and defensible.** The combination of (a) Discount Function with multiplicative baseline × tier composition, (b) FPQ qualification gate, (c) eligible-customer GIDs in function metafield, (d) per-scope tier specificity is a non-obvious assembly. Competitors (BSS, Bold, B2B Hub) target Plus stores or simulate B2B with manual tagging — none currently combine these primitives the way Stockly does.

### Negative / constraints to manage

- **256 KB metafield input ceiling.** The function configuration (including the `qualifiedCustomers` list of GIDs after FPQ flow promotions) lives in one metafield. At ~50 bytes per GID, ~5000 customers approaches the limit. Mitigation tracked in audit as P2-2: move per-customer eligibility to per-customer metafields or tags before ~3000 customers per shop. See `docs/architecture/b2b-pricing-deep-dive.md`.
- **50ms execution budget per checkout.** Function logic must stay O(lines × tiers) and free of I/O. Current `extensions/stockly-volume-discount/src/run.ts` complies; future features must respect this.
- **Sync correctness is critical.** Any divergence between the DB (`Tier` rows) and the metafield (`buildConfiguration` output) means admin shows one thing and checkout charges another. Tests in `app/services/tiers.test.ts` cover the resolution logic; an integration test against a real metafield write is on the QA roadmap (audit P1-5).
- **No native Shopify B2B UI.** Customers do not get the official Shopify B2B portal experience (account hierarchies, multi-buyer permissions, NET terms). For merchants who need that, the Markets `applicationLevel: ALL` technique is the documented escape hatch in `docs/architecture/b2b-pricing-deep-dive.md`.

### Neutral

- The Discount Function is invisible to the merchant in the Shopify admin's standard discount UI. It appears as a single automatic discount node named `t:name` (resolved per shop). Merchants manage tiers exclusively through Stockly admin. This is documented in onboarding copy.

---

## Implementation references

| Concern | Location |
|---|---|
| Function source (WASM input) | `extensions/stockly-volume-discount/src/run.ts` |
| Function input query (GraphQL) | `extensions/stockly-volume-discount/src/run.graphql` |
| Function manifest | `extensions/stockly-volume-discount/shopify.extension.toml` |
| Tier resolution logic (server) | `app/services/tiers.ts` |
| Function configuration sync | `app/services/discount-function-sync.server.ts` |
| Eligibility (tag + DB row) | `app/services/wholesale-customers.server.ts` |
| FPQ qualification (webhook side) | `app/routes/webhooks.orders.paid.tsx` |
| Tier resolution tests | `app/services/tiers.test.ts` |
| Multiplicative composition spec | `docs/decisions/ADR-006-wholesale-baseline-and-product-panel.md` |
| Cart vs per-line aggregation spec | `docs/decisions/ADR-007-tier-aggregation-cart-vs-line.md` |
| FPQ design | `docs/decisions/ADR-004-first-purchase-qualifier.md` |
| Markets technique deep-dive | `docs/architecture/b2b-pricing-deep-dive.md` |

---

## Open questions and follow-ups

- **Markets companion mode.** Should Stockly admin offer an "Enable B2B Companies mode" toggle that, for merchants who have Shopify B2B configured, runs the `marketUpdate ... applicationLevel: ALL` mutation to give them catalog-level separation in addition to the Discount Function? Tracked as a Phase 2 feature; not blocking MVP. See `docs/architecture/b2b-pricing-deep-dive.md` for the mutation template.
- **Scaling `qualifiedCustomers`.** Currently embedded in the function metafield. Migration plan to per-customer metafield is in the audit backlog (P2-2). Trigger: ~3000 qualified customers per shop.
- **Multi-currency tier math.** Discount Function works in percentages, currency-neutral. FPQ amount (`docs/decisions/ADR-004`) is currency-bound. Multi-market merchants need per-market FPQ amounts, currently single-amount only.

---

## How to validate this decision in 5 minutes

If a future maintainer wants to confirm the engine works as described:

1. In Stockly admin, create a tier: scope=all, minQty=2, discountPct=10, aggregation=per_line.
2. Click Save. Watch the network panel — `discount-function-sync.server.ts` writes the metafield via `discountAutomaticAppCreate` or `discountAutomaticAppUpdate`.
3. On the dev store, tag a customer as `wholesale`, log in, add 2 of any product to cart.
4. Open checkout. The discount line "Stockly volume discount −10%" appears, line price reflects the discount, total updates.
5. Remove the customer tag. Reload checkout. The discount disappears, retail price applies.

This confirms: configuration is read live from the metafield, eligibility is enforced, and the discount is computed at the Shopify Function layer — exactly what this ADR specifies.
