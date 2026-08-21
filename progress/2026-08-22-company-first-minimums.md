# 2026-08-22 — Company-first B2B minimums, and the bug that disabled every minimum

## The headline finding

**The checkout order minimum NEVER worked — on any shop, ever.** Not a
Piro problem, not a list problem: `opening-order-sync.server.ts` filtered
Shopify Functions by apiType `"cart_and_checkout_validation"`, but the
API returns `"cart_checkout_validation"` (no "and"). The filter never
matched, `validationCreate` never ran, and zero Validation objects
existed on any shop since the feature shipped (commit 417e436,
2026-06-03). Verified live: Piro lists both deployed functions, yet
`validations(first:50)` returned an empty array; a $82.60 B2B order
sailed past a configured $300 minimum on 2026-08-21.

Fixed with `matchesValidationApiType` (exact string + `*validation*`
fallback so a future Shopify rename degrades to the title check instead
of silently disarming checkout again), pinned by unit tests.

## The rearchitecture (per Jonatan's design decision)

Identity is now **company-first**. Verified against shopify.dev + the
local Function schemas before building (4-agent research pass):

- `buyerIdentity.purchasingCompany` is available to BOTH Functions and
  is NOT deprecated (unlike everything Market-shaped, which is being
  removed — nothing here keys on markets).
- The gate is picked by ONE bit of state on the company itself: app
  metafield `$app:stockly`/`qualified` (ISO timestamp). Present →
  recurring minimum; absent → opening-order minimum. Both Functions read
  it directly from input; nothing is synced, nothing goes stale.
- Writers: `orders/paid` (payload carries `company.id`; `ensure` read
  guard preserves the first-qualification timestamp under retries) and a
  one-off backfill (`ordersCount > 0` → qualified) so installing Stockly
  never gates a merchant's established buyers. `metafieldsSet` on
  Company needs only `write_customers` — no new scope, no re-consent.
- Tag-based shops keep the original customer-list fallback unchanged.
- Precedence (adversarial-review find): a customer present in
  `qualifiedCustomers` wins over a PENDING company, mirroring the
  Discount Function — protects merchants migrating tag→B2B. Pinned by
  fixture.
- The Discount Function now treats any company buyer as wholesale (the
  92-of-98 untagged Piro contacts see wholesale pricing with zero
  maintenance) and skips its FPQ for qualified companies.

Bootstrap: `afterAuth` hook (fire-and-forget — the SDK awaits the hook
inside token exchange and converts rejections into a 500, so imports and
work all live inside a guarded void closure) + settings-save retry path
+ `scripts/bootstrap-shop.mts` for already-installed shops.

`orders/paid` webhook subscription ENABLED in the public toml (the
protected-data approval that blocked it landed 2026-08-21 with the App
Store approval). Dev/piro tomls intentionally lag, with notes.

## Adversarial review (3 agents) — all findings fixed

1. Gate-precedence disagreement between the two Functions (HIGH) — fixed
   + fixture.
2. afterAuth blocked OAuth's first request and could 500 on import
   failure — now fire-and-forget with imports inside the guard.
3. Backfill stamped `companiesBackfilledAt` even when the scan failed →
   permanent false "done" — now stamps only a clean, complete run;
   throttle-paced writes (60ms).
4. Webhook rules/metrics duplicated (drift risk) — hoisted; amount now
   uses `subtotal_price` to match the checkout gate's semantics.
5. Stale copy/comments (import screen claimed minimums need importing —
   false for B2B; 80-line list-era identity header; "qualify manually"
   path that does not exist) — all rewritten.
6. Dead company/location candidates in `buyerIdentifiers` — pruned.
7. Obsolete fixture deleted; added company+empty-config fail-open and
   precedence fixtures; restored fixture trailing newlines.

## Verified

- `verify.sh` green. Suites: **179 app + 21 validation + 11 discount**.
- Both extension suites run against freshly built WASM.
- Non-findings confirmed by the reviewers: no fail-open violation in any
  enumerated input shape (guest / customer-only / company±metafield /
  malformed config / empty config / mode none); the two `qualified`
  parsers agree on every input; generated api.ts committed; no secrets
  in the diff.

## Still open

- **The $app:stockly namespace write→read resolution** is the one
  assumption not yet proven end-to-end (backend writes via Admin API,
  Function reads in checkout). Everything else was verified against
  docs/schema; this needs the live E2E test on Piro after deploy.
- Deploy + `scripts/bootstrap-shop.mts piroaccessories.myshopify.com`
  (needs a fresh session token — expired; any admin visit refreshes it).
- E2E on Piro: pending company (Jonatan's own, no completed orders) →
  cart under $300 must BLOCK checkout; established company → under the
  recurring minimum only.
- Catalog double-discount exposure widened by company-as-wholesale when
  `pricingSource=stockly` AND a live catalog price list exists
  (documented; auto-detection of catalog price lists is backlog).

## Addendum — live E2E session (same day, evening)

Real-buyer verification on Piro (Jonatan, pending company
`creativedesignseo`), step by step:

1. **Add-to-cart initially REJECTED** — validations run on every cart
   mutation and block the mutation, so a below-minimum cart could never
   be assembled. Fixed with `buyerJourney.step` (pass CART_INTERACTION,
   gate CHECKOUT_*), deployed as app version `stockly-5`. Fixture pins
   it. 22/22.
2. **Checkout at $291.20 BLOCKED** with the opening-order message; at
   $301.00 unblocked; dropping to $257.25 re-blocked. The gate evaluates
   live. Modal-vs-banner question answered: the banner IS Shopify's
   native render for validation errors; nothing else is injectable into
   checkout.
3. **"(No address)" dead end**: form-created companies have no location
   address and `editableShippingAddress: false`. Enabled it for
   Jonatan's location via `companyLocationUpdate` — which RESET
   `checkoutToDraft` (omitted fields are cleared, learned the hard way:
   his checkout flipped to pay-now with retail gateways
   Afterpay/Affirm). Restored, then set to pay-now DELIBERATELY at his
   request. Rule recorded: always send every buyerExperienceConfiguration
   field.
4. Afterpay in a B2B checkout is platform behaviour (pay-now B2B shows
   the store's gateways; no per-company filter exists).

**Still unverified: `orders/paid` → company qualification.** The test
order is unpaid. That is the only link not yet seen firing in
production.
