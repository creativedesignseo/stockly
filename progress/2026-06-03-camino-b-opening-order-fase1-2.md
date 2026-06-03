# 2026-06-03 — Camino B (opening-order minimum): Fases 1 + 2

## Objective

Implement Jonatan's "opening order minimum" model (a B2B classic: the
first order must hit a minimum to become a full wholesaler; reorders are
free). Decided as **Camino B**: approval grants wholesale pricing
immediately, the minimum is enforced at checkout, and the merchant
releases the customer manually (no dependency on the privacy policy /
orders/paid webhook). Supersedes the half-wired ADR-004 price-side FPQ.

This entry covers Fases 1 + 2 (done). Fases 3-5 pending.

## Key design finding (from reading run.ts)

The Discount Function ALREADY had a price-side FPQ gate (run.ts ~520-533):
a customer NOT in `qualifiedCustomers` only gets the discount if their
cart meets the minimum. The C3 fix (approve → qualifiedAt=now) puenteaba
ese gate metiendo a todos en la lista. Jonatan's coherent model is "see
wholesale from unit 1, block CHECKOUT until the minimum" — so we keep the
discount ungated (every approved customer sees wholesale) and move the
minimum to a CHECKOUT-side Validation Function (Fase 3). `qualifiedAt`
recovers its ADR-004 meaning: "has completed the opening order".

## Fase 1 — revenue path (DONE, with test)

- `discount-function-sync.server.ts` — `buildConfiguration` now surfaces
  EVERY approved WholesaleCustomer in `qualifiedCustomers` (removed the
  `qualifiedAt: { not: null }` filter). The discount is gated on "is
  approved", not on qualifiedAt → keeps bug C3 fixed while freeing
  qualifiedAt to mean "opening order met". Exported `buildConfiguration`.
- `wholesale-customers.server.ts` — `approveCustomer` now leaves
  `qualifiedAt: null` on create (was `now`); re-approve preserves an
  existing qualifiedAt. Added `releaseOpeningOrder(shopId, customerId)`
  (sets qualifiedAt=now).
- `discount-function-sync.test.ts` (NEW) — first server-side revenue-path
  test. TDD: written first (red against the old filter), green after the
  change. Guards C3 by asserting every approved customer (pre-opening
  included) lands in qualifiedCustomers. The findMany mock simulates
  Prisma's `where` so a regressed filter is actually caught.
- **The Discount Function WASM was NOT touched.** Zero risk to price math.

## Fase 2 — admin "Release from opening order" (DONE)

`app.customers.applications.tsx`:
- Loader attaches each approved application's opening-order state
  (resolved via the linked WholesaleCustomer by shopify id → email) and a
  shop-level `openingOrderEnabled` flag (`fpqMode != none`) so the UI is
  silent when no minimum is configured.
- New action intent `release-opening-order` → `releaseOpeningOrder`.
- Row badge: "Opening order met" (success) / "Opening order pending"
  (attention), only for approved customers when openingOrderEnabled.
- Modal secondary action "Release from opening order" (one click) +
  result banner.

## Verification

`bash scripts/verify.sh` green after each phase (lint + tsc + vitest
incl. the new test + extension build + Remix build). The `@media ... print`
warning is pre-existing Polaris admin CSS, unrelated.

## Behaviour today (Fases 1+2 only, NOT yet deployed)

Neutral for the buyer: approved customers still see wholesale pricing
(existing customers like Carlos/Test Wholesale have qualifiedAt set =
"met"). New approvals land as "opening order pending" (badge only — no
checkout gate yet). Safe to deploy as-is; the gate arrives in Fase 3.

## Open / next

- **Fase 3 (checkout-critical):** Cart & Checkout Validation Function
  (`cartValidationsGenerateRun`). Confirmed output shape
  `{operations:[{validationAdd:{errors:[{message,target:"$.cart"}]}}]}`.
  OPEN: (a) how it reads its config (validation-node metafield + input
  query `.graphql`); (b) `typegen` needs Shopify CLI auth; (c) fixtures
  mandatory. Needs the sync to write a metafield with the minimum config
  + the list of customers with qualifiedAt=null.
- **Fase 4:** connect the cart/QOF banner to the opening-order state.
- **Fase 5:** ADR superseding ADR-004 + verify + deploy.

## Risks

- Fases 1+2 not committed yet (left in working tree, verify green).
- Existing prod customers auto-become "opening order met" (qualifiedAt was
  set by the old approve flow) — correct, they're established buyers.
