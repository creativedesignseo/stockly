# Build the protected customer data access log

**Date:** 2026-08-11 (started)
**Status:** completed (code); not deployed — schema not yet pushed to prod
**Owner:** Claude (implementer) / Jonatan (approved the schema change)
**Related:** `docs/security/data-loss-prevention.md` §4, HANDOFF.md
(App Store submission), tasks/current.md (Protected Customer Data)

## Objective

Close Shopify's Level 2 protected-customer-data requirement *"Keep an
access log to protected customer data"*
(https://shopify.dev/docs/apps/launch/protected-customer-data), which is
a hard blocker for App Store submission. Every code path that reads,
writes, exports or deletes protected customer data now leaves an
auditable row behind.

## Files inspected

- `prisma/schema.prisma` — existing models, cascade conventions, doc-comment style.
- `app/services/opening-order-sync.server.ts` — the fail-safe posture to
  copy (swallow errors, never block the caller).
- `app/services/opening-order-sync.test.ts`, `discount-function-sync.test.ts` —
  the `vi.hoisted` + `vi.mock("../db.server")` test convention.
- `app/lib/auth.server.ts` — `authenticateAdmin` returns a hydrated `Shop`,
  so admin routes already have `shop.id` on hand.
- `app/db.server.ts` — singleton Prisma client.
- The six instrumented routes (see below).
- `docs/security/data-loss-prevention.md` — §4 already documents this exact
  feature; the implementation was built to match it.

## Files changed

- `prisma/schema.prisma` — new `ProtectedDataAccessLog` model + the
  `protectedDataAccessLogs` back-relation on `Shop`. Purely additive.
- `app/services/access-log.server.ts` (new) — `logProtectedDataAccess`,
  the single write path. Fail-safe and personal-data-free by contract.
- `app/services/access-log.server.test.ts` (new) — 12 tests.
- `app/routes/proxy.apply.tsx` — storefront submission → `storefront` /
  `create` / `application.submit`. Adds a `submittedFieldCategories`
  helper that maps a submission to category names only.
- `app/routes/app.customers.applications.tsx` — queue load → `merchant` /
  `read` / `application.list`; plus all four action intents: approve,
  reject, release-opening-order and set-tax-exempt.
- `app/routes/webhooks.customers.data_request.tsx` — `webhook` / `export`.
- `app/routes/webhooks.customers.redact.tsx` — `webhook` / `delete`.
- `app/routes/webhooks.shop.redact.tsx` — `webhook` / `delete`, logged
  BEFORE the deletion.
- `app/routes/webhooks.customers.update.tsx` — `webhook` / `update` on
  enrolment.

## Commands run

```bash
npx prisma migrate diff \
  --from-schema-datamodel <HEAD:prisma/schema.prisma> \
  --to-schema-datamodel prisma/schema.prisma --script
npx prisma generate
PATH="$(pwd)/node_modules/.bin:$PATH" bash scripts/verify.sh
```

`prisma db push` was deliberately NOT run. Deploying is gated.

## Verification

`scripts/verify.sh` green end to end: lint, `tsc --noEmit`, app tests
14 files / **149 tests** (was 13 / 137 — +1 file, +12 tests), extension
suites unchanged (8 + 14), both builds.

The generated migration SQL is `CREATE TABLE` + two `CREATE INDEX` +
one `ALTER TABLE` that adds the new table's own FK. **No ALTER touches
any existing table** — safe against Railway's pre-deploy
`prisma db push` without `--accept-data-loss`.

## Open risks

1. **Not yet in the production database.** The table exists in the schema
   and the generated client, not in prod. The first deploy carries the
   `prisma db push`. Until then every `logProtectedDataAccess` call in
   production will fail its insert — swallowed by design, logged to
   console, no user-visible impact, but also no audit trail. Deploy
   through `deployment-guardian`.
2. **Write volume on the queue loader.** `application.list` writes one row
   per page load and per tab switch. Correct for an access log, but the
   table grows with merchant browsing, not with customer count. Revisit
   with a retention/pruning job before the table gets large.
3. **`shop/redact` entries do not survive** — they cascade away with the
   `Shop` row. Intended (nothing about a redacted shop should remain), but
   `docs/security/data-loss-prevention.md` §7.2 says the table "is not
   subject to" Railway's 7-day log retention, which is true for every
   event EXCEPT this one. Worth a one-line clarification from
   `docs-curator`.
4. **No admin UI to read the log.** Compliance is satisfied by the table
   existing and being queryable; a reviewer asking to *see* it would need
   a manual SQL query today.

## Next step

Deploy (schema push + app) through `deployment-guardian`, then confirm a
row lands by loading `/app/customers/applications` on the dev store.
