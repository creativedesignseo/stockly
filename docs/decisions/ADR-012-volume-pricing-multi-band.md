# ADR-012 — Volume Pricing: multi-band rules

Status: Accepted
Date: 2026-05-27
Owner: Jonatan Montilla
Reviewers: stockly-orchestrator (planning), stockly-implementer (this
PR), shopify-b2b-specialist (consulted via the Function input audit)

> Note: `ADR-011` is referenced in `prisma/schema.prisma` comments as
> the home for the per-rule customer eligibility decision but was never
> written as a standalone document. This ADR is the next available
> number (`012`); the eligibility decision lives implicitly in the
> schema migration that introduced `Tier.customerEligibility` (commit
> on 2026-05-27).

---

## Context

Stockly's wholesale pricing rule, as shipped in Sprint 2, is one row
per `Tier`: a single `minQty` triggers one `discountPct`. That covers
the simplest B2B case (5 % off at 10+ units) but loses to every
competitor on Shopify the moment a merchant wants three quantity bands
on the same product, or a per-unit fixed price, or an active-date
window.

Sami's "Volume Pricing" (the reference UX Jonatan validated against;
see `docs/competitive/sami-volume-pricing.md`) ships a single rule that
declares N bands, each with its own quantity range and discount value;
plus a per-rule active-date window; plus a "Mix variants of the same
product" aggregation mode; plus a "Show table on PDP" toggle. The
Piro Jewelry pilot is on Shopify Basic and is the live revenue path
for Stockly — any change to the pricing engine must preserve their
current single-band tiers byte-for-byte.

The Discount Function input was audited prior to this ADR
(`progress/2026-05-27-function-input-audit.md`); the audit confirmed
that no `run.graphql` change is needed and flagged the existing
tier-filter at `run.ts:256-263` as a fixed_price compatibility risk
(it drops tiers with `discountPct <= 0`, which a fixed_price tier
legitimately has).

## Decision

Extend the existing `Tier` model with seven additive fields to support
multi-band rules and the new feature surface, rather than introduce a
parallel `Rule` table.

### The seven sub-decisions

1. **Single URL.** `/app/pricing` stays the only entry point. A
   "Volume Pricing" rule is a `Tier`-group of N≥1 bands sharing a
   `groupId`. Legacy 1-band rules become 1-band groups via back-fill.

2. **Schema additions to `Tier`:**
   - `quantityTo Int?` — inclusive upper bound. Null on the last
     band = open-ended.
   - `groupId String?` — cuid that links bands of one rule. Nullable
     for one release cycle so additive `prisma db push` is safe; a
     back-fill script (`scripts/backfill-tier-groupids.ts`) populates
     legacy rows.
   - `discountFixedPrice Float?` — per-unit final price when
     `discountType = 'fixed_price'`.
   - `startsAt DateTime?`, `endsAt DateTime?` — per-rule active-date
     window. Read by the WASM Function at run time.
   - `showTableOnPdp Boolean @default(false)`, `tableTemplateId
     String?` — Phase-1 storage for the storefront table toggle. The
     theme app block that renders the table is Phase 2.
   - `@@index([shopId, groupId])` — supports the list-view aggregation.

3. **New `discountType = 'fixed_price'`.** A per-unit final price that
   overrides retail; baseline composition is skipped for this type.
   The existing `percentage` and `fixed_amount` types continue
   unchanged. `price_per_item` is explicitly NOT shipped — it
   duplicates `fixed_amount` semantically and would only confuse
   merchants.

4. **Active-date filter is read by the WASM Function.** No cron, no
   scheduled worker. `run.ts` calls `new Date().toISOString()` once at
   the top of the invocation and filters out any tier with
   `startsAt > now` or `endsAt < now`. Per the function-input audit,
   Shopify Functions do allow `Date.now()` — the runtime is
   deterministic per invocation, not per system clock. Three guardrail
   fixtures (`active-dates-{future,past,current}-window.json`) pin
   this; if a future Javy/QuickJS update degrades `Date.now()` the
   fixtures fail loudly.

   **Fallback if `Date.now()` ever returns deterministic-zero in
   production WASM:** pivot to server-side filtering at
   `syncTiersToFunction` write time + an hourly cron worker that
   re-syncs the metafield to drop newly-expired bands. Tracked as a
   Phase 2 follow-up if the fixtures catch a regression.

5. **"Show Table on Product Page"** toggle and `tableTemplateId` slot
   ship as storage in Phase 1; the theme app block that renders the
   storefront table ships in Phase 2. The admin UI surfaces a banner
   stating Phase 2 is pending.

6. **`aggregation = 'mix_variants'`** is a third aggregation mode
   between `per_line` and `cart_total`. Sums quantities across
   variants of the same product (within scope). Disabled when scope is
   `variant` (meaningless) and when scope is `all` (no Map key
   discrimination) — enforced at both the service layer and the
   admin form.

7. **Back-compat is non-negotiable.** Every existing tier keeps
   applying its current discount. The Function reads both the legacy
   metafield shape (no `groupId`, no `quantityTo`, no `startsAt` /
   `endsAt`) and the new shape, using the default-on-missing pattern
   already in place for `aggregation` and `discountType`. The fixture
   `legacy-single-band.json` pins this contract for one release cycle.

### Why one `Tier` row per band (not a parallel `Rule` table)

A parallel table would mean rewriting every existing query, every
existing service helper, and the sync layer to join across two tables.
The N=1 case becomes harder, not easier. Keeping bands as `Tier` rows
grouped by `groupId` means:

- `listTiers`, `resolveTier`, `syncTiersToFunction` all continue to
  iterate one shape (Tier). The Function evaluates band-by-band as
  it does today — the band IS a Tier from its perspective.
- `RuleSummary` / `listRules` is a thin in-memory aggregation. The
  admin list still pages on the same query.
- A merchant with three 5-band rules has 15 rows in `Tier`. At the
  expected scale (hundreds of rules per shop tops, ADR-007), this is
  trivial.

### Why nullable `groupId` for a release cycle

Production runs `prisma db push` (per `tasks/current.md`), not
versioned migrations. A non-null column would refuse to apply against
the live DB (existing NULLs). The two-step ordering — push schema,
then back-fill — is the only safe option short of a maintenance
window. The back-fill script is idempotent and exits non-zero if any
NULL remains, so a re-run is harmless.

### Edge case: `fixed_price` and the `discountPct > 0` filter

The existing tier-validator in `run.ts` dropped any tier with
`discountPct <= 0`. A `fixed_price` tier legitimately has
`discountPct = 0` because its value lives in `discountFixedPrice`.
This ADR ships the validator rewrite that branches on `discountType`:
percentage tiers still require `discountPct > 0`, fixed_amount
requires `discountAmount > 0`, fixed_price requires
`discountFixedPrice > 0`. The legacy fixture
(`legacy-single-band.json`) pins that the previous filter behavior
holds for percentage tiers.

## Consequences

### Positive

- Volume Pricing reaches parity with Sami's reference UX (the
  feature Jonatan named as the next gap after the multi-product
  scope work). Stockly can now market "volume bands with mixed
  discount types" without an asterisk.
- The `fixed_price` mode unlocks a B2B pattern Stockly couldn't
  express before: "this customer pays €70/unit no matter what the
  retail price is". Common for wholesale catalogs where the merchant
  thinks in net prices, not percentages off.
- `mix_variants` removes a friction point Jonatan flagged from
  customer feedback: "buyers want to mix sizes to clear the minimum
  without inflating a single SKU".
- Schema is forward-compatible: per-band scheduling, per-band
  customer overrides, table-template picker — all can land later by
  populating reserved fields.

### Negative

- The `prisma db push` + back-fill ordering is a manual step for
  deployment-guardian. A skipped back-fill leaves rows with NULL
  `groupId` that the new list view fingerprints as "_orphan:<id>"
  groups (defensive fallback in `listRules`); still functional but
  ugly.
- The Phase-1 admin UI does NOT yet ship the multi-band band-editor
  table. The service layer (`createRule` / `updateRule`) and the
  Function fully support N≥1 bands today, but the admin form only
  edits one band per save. Multi-band creation is the next UI work
  item; until it lands, Volume Pricing is reachable from API/script
  callers only.
- One more code path in `run.ts` — three branches per discount type
  (the third is now `fixed_price`). The unit fixtures are the load-
  bearing safety net.

### Function input byte budget

Each band adds ~120 bytes JSON to the metafield. Worst-case estimate:
100 rules × 5 bands = ~60 KB, well within Shopify's 50 KB per-Function
input ceiling for the typical merchant. A merchant with >300 rules
should be re-evaluated, but that's far beyond Stockly's current
revenue scale.

## Alternatives considered

- **Parallel `Rule` table** — rejected. See "Why one Tier row per
  band" above.
- **Per-band active dates** — deferred to Phase 2. Phase 1 applies
  one `(startsAt, endsAt)` to every band of a rule (the form writes
  the same values to all bands). Per-band scheduling is a noise-to-
  signal trade Jonatan was happy to defer until a merchant asks.
- **Server-side scheduler for active dates** — rejected as the
  primary path. The Function-side `Date.now()` reading is simpler,
  zero infra, and verifiable by fixtures. The scheduler is the
  documented fallback IF the fixtures ever catch a runtime
  regression.
- **`price_per_item` type** — rejected per Jonatan's pre-approved
  decision. Duplicates `fixed_amount`.

## Verification

- `bash scripts/verify.sh` — lint + tests + build pipeline green.
- Service-layer additions covered by the existing per-tier test
  suite (`app/services/tiers.test.ts`, 42 cases).
- Function changes covered by 7 fixtures under
  `extensions/stockly-volume-discount/tests/fixtures/`:
  `legacy-single-band`, `fixed-price-discount`, `multi-band-rule`,
  `mix-variants-aggregation`, `active-dates-{future,past,current}-window`.
  The active-dates trio is the explicit `Date.now()` guardrail.
- Production migration ordering: (1) `prisma db push` against the
  Fly Managed Postgres (additive only, safe), (2) run
  `scripts/backfill-tier-groupids.ts` via `fly ssh console`. Both
  steps go through `deployment-guardian` — this ADR documents the
  contract; it does not execute the steps.

## References

- Plan: `progress/2026-05-27-volume-pricing-plan.md`
- Input audit: `progress/2026-05-27-function-input-audit.md`
- Competitive reference: `docs/competitive/sami-volume-pricing.md`
- Aggregation precedent: `docs/decisions/ADR-007-tier-aggregation-cart-vs-line.md`
- Pricing engine architecture: `docs/decisions/ADR-010-b2b-pricing-engine-on-basic-plan.md`
