# Analyze Piro's live B2B state before any Stockly install

**Date:** 2026-06-08 (started)
**Status:** completed (analysis) — decision pending Jonatan/Ana
**Owner:** both
**Related:** HANDOFF.md "Pilot status", ADR-010 (B2B pricing engine), competitive-bss memory

## Objective

Jonatan asked whether Stockly is ready to install on the first real pilot
store (Piro Jewelry). Before answering from assumptions, verify Piro's
actual B2B setup via the Admin API and surface any blocker to dropping
Stockly on top.

## Sources inspected (all read-only)

- `shopify.app.toml` — Stockly's scopes (`write_products, write_publications,
  write_discounts, write_customers, read_orders, write_validations,
  read_themes`) + `protected_customer_data_permissions` level_1 for `name`.
  Stockly's engine = Discount Function (WASM) over retail, gated by customer tag.
- `shopify-admin --store piro shop` — Piro on plan **Basic**, USD,
  `piroaccessories.myshopify.com` / pirojewelry.com.
- `shopify-admin --store piro market list` — Market **"Wholesale B2B"**
  (`wholesale-b2b`), active.
- `shopify-admin --store piro catalog list` — "International" catalog +
  a **`Channel Catalog … gid://shopify/AppCatalog/…`** (an installed app
  manages a catalog).
- `shopify-admin --store piro pricelist list` — **"Wholesale B2B …" Price
  List at −65% off base**, active (re-confirmed).
- `shopify-admin --store piro product list --query "tag:wholesale"` —
  **29 products** tagged `WHOLESALE`.

## Key finding

Piro (on Basic) ALREADY runs a full B2B pricing system via Markets +
Catalog + a Price List at −65%, partly managed by an installed app
(AppCatalog visible). This is a DIFFERENT engine from Stockly's
tag-gated Discount Function.

## Risk #1 (blocking) — pricing-engine conflict

Installing Stockly on Piro without removing the existing Price List would
have two engines discounting the same carts (Price List −65% AND the
Discount Function), risking double-discount / unpredictable checkout
prices. Not a "just try it" — a decision-before-install.

Three paths:
1. **Replace** — Stockly takes over; disable Piro's Price List/Catalog,
   migrate the 29 products, verify no current customer loses their price.
2. **Leave as-is** — Piro doesn't need Stockly for pricing; only the
   application form / approval queue would add value.
3. **Pilot on dev store** until Stockly has proven parity with the −65%.

Recommendation: **do NOT install Stockly on Piro yet.** Piro already solves
what Stockly sells (B2B pricing on Basic); migrating needs a clear upside.

## Open risks / unknowns

- HOW a Piro customer reaches the −65% today is unconfirmed (login + tag/
  segment? market selector? which app owns the AppCatalog — possibly BSS,
  which we have a teardown of). This answer picks the path above.
- Did NOT over-query Piro's production store; stopped at the minimum needed.

## Next step

Jonatan/Ana to confirm how wholesale access works on Piro today. If path 1
(replace), hand the AppCatalog/PriceList migration analysis to the
`shopify-b2b-specialist` agent for a per-product migration plan + risks.
Otherwise keep closing dev-store validations.
