# B2B Pricing on Shopify Basic/Grow — Technical Deep Dive

**Audience:** developers maintaining or extending Stockly's pricing engine.
**Status:** living document. Originally written 2026-05-15 during Piro Jewelry engagement; ported to Stockly repo 2026-05-26 to keep the IP inside the product repository.
**Companion ADR:** [ADR-010](../decisions/ADR-010-b2b-pricing-engine-on-basic-plan.md).

---

## Why this document exists

Stockly's competitive moat is the ability to deliver B2B pricing automation on Shopify Basic/Grow — plans where Shopify's official B2B catalog system is plan-gated. This document captures, in full technical detail, **how to do that** using only documented Shopify APIs.

There are two complementary techniques. Stockly currently ships only the first. The second is documented here so that any future maintainer can add it as an option without re-discovering it.

---

## Technique 1 — Discount Functions (Stockly's primary engine)

### What it is

A Shopify Function targeting `purchase.product-discount.run` — a WASM module that Shopify executes server-side during cart evaluation and at checkout. It receives the cart context (lines, customer, totals) and returns a list of discounts to apply.

Documentation: <https://shopify.dev/docs/api/functions/reference/product-discounts>

### Why it works on Basic/Grow

Shopify Functions are explicitly designed as the extensibility surface for pricing, shipping, and payment logic across **all plans**. There is no plan gate. The function runs in Shopify's WASM sandbox with documented input/output contracts.

### How Stockly uses it

1. **Source code:** `extensions/stockly-volume-discount/src/run.ts` (TypeScript, compiled to WASM via the Shopify CLI).
2. **Input query:** `extensions/stockly-volume-discount/src/run.graphql` — declares the data the function receives from Shopify (cart lines, customer tags, etc.).
3. **Manifest:** `extensions/stockly-volume-discount/shopify.extension.toml` — declares the target, the input query path, and the WASM build path.
4. **Configuration source:** a metafield on a DiscountNode (`$app:stockly-volume-discount` namespace, `function-configuration` key), written by `app/services/discount-function-sync.server.ts` whenever the merchant saves changes in Stockly admin.
5. **Discount node creation:** the first time the merchant configures tiers, Stockly calls `discountAutomaticAppCreate` to create the discount node and associate it with the function. Subsequent updates use `discountAutomaticAppUpdate`.

### The configuration shape

```json
{
  "tiers": [
    {
      "scope": "all",
      "scopeId": null,
      "minQty": 10,
      "discountPct": 10,
      "aggregation": "per_line"
    },
    {
      "scope": "product",
      "scopeId": "gid://shopify/Product/12345",
      "minQty": 5,
      "discountPct": 15,
      "aggregation": "per_line"
    }
  ],
  "wholesaleBaselinePct": 40,
  "fpqAmount": 500,
  "qualifiedCustomers": [
    "gid://shopify/Customer/111",
    "gid://shopify/Customer/222"
  ]
}
```

Field meanings:

| Field | Meaning |
|---|---|
| `tiers[].scope` | `all` \| `product` \| `variant` — which lines this tier can apply to |
| `tiers[].scopeId` | Required when scope is `product` or `variant`; the GID of the targeted entity |
| `tiers[].minQty` | Inclusive minimum quantity that activates the tier |
| `tiers[].discountPct` | Percentage off the base price (0–100) |
| `tiers[].aggregation` | `per_line` — quantity check per line; `cart_total` — sum of all eligible-line qtys checked once |
| `wholesaleBaselinePct` | Baseline discount for wholesale-tagged customers (composed multiplicatively with tier %) |
| `fpqAmount` | First-Purchase Qualifier threshold (see ADR-004) |
| `qualifiedCustomers` | Customer GIDs that have passed FPQ and are eligible for wholesale pricing |

### The execution model (per checkout)

1. Customer adds items to cart → Shopify evaluates discount functions.
2. Stockly's function receives `input` (cart lines, buyer identity, metafield config).
3. Function checks customer tags. If not `wholesale`-tagged AND not in `qualifiedCustomers`, returns `{ discounts: [] }` — no discount applied.
4. If eligible, function evaluates tiers against cart lines:
   - For each line: resolve applicable tiers (specificity: variant > product > all).
   - Compose multiplicatively: `finalDiscountPct = 1 - (1 - baseline/100) × (1 - tier/100)`.
   - Apply `DiscountApplicationStrategy.All` (not `First` — see ADR-006 risk #1 for the bug that led to this choice).
5. Function returns the discount list. Shopify applies it to the cart in real time and persists it on checkout completion.

### Output budget and limits

- **Input size:** 256 KB hard ceiling on the metafield input. At ~50 bytes per customer GID in `qualifiedCustomers`, this caps at roughly 5000 qualified customers per shop. Migration plan documented in audit (P2-2).
- **Execution time:** 50ms hard timeout per invocation. Current logic is O(lines × tiers) with no I/O — well within budget.
- **No network:** functions cannot make HTTP requests. All state must come from the input metafield or the cart payload.

### How to add a new pricing rule

1. Update `src/run.graphql` if the rule needs new input data from Shopify.
2. Update `src/run.ts` with the new logic. Keep it pure and O(n).
3. Add a fixture under `tests/` covering the new rule (vitest + fixture JSON).
4. Update the configuration shape in `app/services/discount-function-sync.server.ts` if merchants need to control the new rule from admin.
5. Update admin UI in `app/routes/app.tiers.*.tsx` or `app/routes/app.settings.pricing.tsx`.
6. Verify locally with `shopify app function run` (passing a fixture) before deploying.

---

## Technique 2 — Markets with `applicationLevel: ALL` (companion, not currently in Stockly code)

### What it is

A Shopify Markets configuration that uses the `MarketConditionsCompanyLocationsInput.applicationLevel: ALL` enum to make a single MarketCatalog apply to **every** Company Location in the shop, without listing IDs.

### When it is useful

For merchants who have already enabled Shopify's B2B feature (Companies + Company Locations + the B2B portal at `account.{domain}.com`), this technique provides:

- A clean catalog-level separation between retail and wholesale (different products visible, different prices)
- No discount lines on the receipt — wholesale prices appear as the "real" price
- The official Shopify B2B portal UX (multi-buyer accounts, address books, etc.)

It does NOT support tier-based volume discounts, per-product overrides, or FPQ qualification — for those, Discount Functions remain the primary engine.

### Why this is plan-supported (not a hack)

`marketUpdate` is a fully documented mutation in the Shopify Admin GraphQL API. The `MarketConditionApplicationType` enum (`ALL` | `SPECIFIED`) is in the public schema. There is no plan gate on this mutation for Basic/Grow.

The reason most apps and merchants don't know about it: Shopify's UI for Markets exposes only the geographic Market type (countries/regions). Conditional Markets (with `companyLocationsCondition`) are mutation-only — you can read them via the API but you cannot create them in the admin UI. Discovery requires reading the GraphQL schema, not the dashboard.

### Where it fails (the gotcha that costs you a day)

Attempting to assign a catalog directly to a Company Location returns:

```
ACCESS_DENIED: "Catalogs assigned to company locations can't be set to
active with your plan."
```

This is the **direct CompanyLocationCatalog assignment** path — a different API surface that IS plan-gated. The trick is to assign the catalog to the **Market**, then make the Market match all Company Locations via `applicationLevel: ALL`. This is documented, permitted, and works on Basic/Grow.

### The exact mutation

If you have a Market dedicated to B2B (let's call it "Wholesale B2B") with a MarketCatalog attached to a PriceList:

```graphql
mutation MakeMarketCoverAllB2BCompanies($marketId: ID!) {
  marketUpdate(
    id: $marketId
    input: {
      conditions: {
        conditionsToAdd: {
          companyLocationsCondition: {
            applicationLevel: ALL
          }
        }
      }
    }
  ) {
    market {
      id
      name
      conditions {
        companyLocationsCondition { applicationLevel }
      }
    }
    userErrors { field message code }
  }
}
```

If the Market previously had `SPECIFIED` Company Location IDs listed, you must delete those in the same operation:

```graphql
mutation Swap($marketId: ID!) {
  marketUpdate(
    id: $marketId
    input: {
      conditions: {
        conditionsToDelete: {
          companyLocationsCondition: {
            companyLocationIds: ["gid://shopify/CompanyLocation/...", ...]
          }
        }
        conditionsToAdd: {
          companyLocationsCondition: {
            applicationLevel: ALL
          }
        }
      }
    }
  ) {
    market { id name }
    userErrors { field message code }
  }
}
```

If you don't delete SPECIFIED first, Shopify returns `INCOMPATIBLE_CONDITIONS` — `SPECIFIED` and `ALL` cannot coexist on the same condition.

### Runtime behavior

When a B2B customer (member of a Company) logs in:

```
Customer logs in to portal
  ↓
Shopify identifies CompanyLocation membership
  ↓
Two Markets potentially match:
  - Geographic Market (e.g., "United States")
  - Conditional Market ("Wholesale B2B", applicationLevel: ALL)
  ↓
Shopify picks the MORE SPECIFIC Market.
companyLocationsCondition is more specific than regionsCondition.
  ↓
"Wholesale B2B" wins. Its catalog (with wholesale PriceList) applies.
  ↓
Customer sees wholesale prices.
```

The Storefront API's `companyLocation.market` field returns the **primary geographic** Market (e.g., "United States"), not the matched conditional one. This is misleading and worth a comment in any code that touches it. The actual applied catalog is observable at checkout, not via that field.

### Limitations

- Applies to **all** Company Locations uniformly. Cannot differentiate distributor tiers (e.g., A-level wholesalers at −40%, B-level at −30%) without dropping back to `SPECIFIED` and listing IDs.
- Does not gate purchasing — any B2B customer sees the prices regardless of approval status. Approval gating must be enforced separately (Stockly does this via the customer tag + Discount Function eligibility check; Shopify's native B2B has the "Orders not approved" block).
- Requires the merchant to have configured Shopify B2B (Companies feature). Not all Basic/Grow merchants have this enabled — it's a recent (2025+) feature even on non-Plus plans.

### When Stockly might activate this

Phase 2 candidate: a Stockly admin toggle "Enable Shopify B2B mode" that, when the merchant has Companies configured, runs the mutation above to bind a Stockly-managed Market to all Company Locations. This complements the Discount Function rather than replacing it — Discount Functions still handle volume tiers and FPQ on top of the Market-level baseline catalog.

Not in MVP scope (ADR-010 § Open questions).

---

## Cross-cutting concerns

### How the two techniques relate

| Concern | Discount Function | Markets `applicationLevel: ALL` |
|---|---|---|
| Plan requirement | Any (Basic and up) | Any (Basic and up, but needs Shopify B2B feature enabled) |
| Pricing model | Programmable (tiers, scopes, FPQ, multiplicative) | Flat per catalog |
| Eligibility | Customer tag OR explicit GID list in metafield | All B2B Company Locations uniformly |
| Receipt appearance | Discount line ("−15%") | Wholesale price as the "real" price |
| Real-time merchant control | Yes (metafield write, instant) | Yes (mutation, instant) |
| Volume tier support | Yes | No |
| Per-product overrides | Yes | No |
| Per-collection overrides | Yes (planned) | No |
| First-Purchase Qualifier | Yes (ADR-004) | No |
| Multi-buyer accounts | No | Yes (via Shopify B2B) |
| NET 30/60 payment terms | No (not Stockly MVP) | Yes (via Shopify B2B) |

For Stockly's target customer (premium luxury SMB on Basic/Grow without formal B2B Companies infrastructure), Discount Functions cover 100% of MVP needs. The Markets technique becomes relevant only when the merchant adopts formal Shopify B2B — which is a feature, not a bug, of Stockly's positioning.

### What competitors do (BSS, Bold, B2B Hub)

Based on the BSS audit captured in ADR-008:

- **BSS** uses Discount Functions but with simpler tier-only logic. No multiplicative baseline, no FPQ, no per-customer GID eligibility in the function metafield. Catalog-level segmentation requires Plus.
- **Bold** uses storefront-only pricing simulation + manual draft orders for high-value B2B. Same fragility Stockly rejected in Alt 2 above.
- **B2B Hub** focuses on Plus stores and the Companies feature directly. Limited Basic/Grow support.

Stockly's differentiation is the **assembly**: multiplicative composition + tier scoping + FPQ + branded storefront UI all on Basic/Grow. The Markets technique is bonus IP that becomes relevant for hybrid merchants.

---

## Validation procedures

### Validate Discount Function end-to-end

See ADR-010 § "How to validate this decision in 5 minutes."

### Validate Markets technique on a test store

1. Ensure the store has Shopify B2B enabled (Settings → Customer accounts → Business-to-business).
2. Create at least one Company with one Company Location.
3. Create a Market named "Wholesale B2B" with no geographic condition.
4. Create a MarketCatalog under that Market, assign it a PriceList with a discount (e.g., flat −30% on all products).
5. Run the mutation in § "The exact mutation" above with the Market's GID.
6. Query the market to confirm `companyLocationsCondition.applicationLevel == "ALL"`.
7. Log in to the B2B portal as a customer of the Company. Browse to a product. Price should reflect the catalog discount.
8. Verify on a non-B2B customer (regular customer account): price should be retail.

If step 7 fails, check the merchant's Shopify B2B feature is actually enabled (not just the Companies API surface). Some shops have the API but not the storefront B2B feature; in that case the conditional Market is silently inactive.

---

## Historical context

This technique was discovered during the Piro Jewelry (piroaccessories.myshopify.com) engagement in May 2026. The original write-up lived in `~/Documents/Workspace/Clients/pirojewelry.com/08_wholesale/SOLUCION_AUTO_ASIGNACION_MARKET_B2B.md`. That file remains as the engagement-specific record. **This file is the canonical Stockly version** and supersedes the Piro version for Stockly maintenance purposes.

Key decisions made during discovery:

1. Tried `catalogCreate` with `companyLocationIds` context → blocked by plan.
2. Tried `catalogContextUpdate` on existing MarketCatalog → blocked by plan.
3. Tried looking for a `market` field on `CompanyLocationUpdateInput` → no such field exists.
4. Tried hypothesized `companyLocationAssignMarket` mutation → does not exist in the schema.
5. Tried Shopify Flow with Run code → sandboxed, no HTTP.
6. Reading `MarketConditionsInput` schema revealed `applicationLevel: ALL` enum → ran the mutation → it worked.

Total discovery time: ~6 hours. Total solution: one mutation. The high ratio of investigation-to-code is typical for plan-restricted Shopify APIs and is why this document exists — so the next engineer skips steps 1–5.
