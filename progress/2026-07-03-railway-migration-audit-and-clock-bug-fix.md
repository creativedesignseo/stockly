# Railway migration audit + Discount Function clock bug fix

**Date:** 2026-07-03 (started)
**Status:** completed (code + docs); **shopify app deploy and the Railway
pre-deploy pipeline fix are still PENDING Jonatan's explicit go-ahead**
**Owner:** Claude
**Related:** ADR-009 (Vercel→Fly), ADR-012 (active-date tiers), HANDOFF.md

## Objective

Jonatan asked to review everything so the app is actually operational.
Session started from a HANDOFF still describing Fly.io as the production
host; discovered mid-session that production had silently moved to
Railway with an empty database, then ran a full 6-domain audit (auth,
Partners config, extensions, DB schema, env vars, hardcoded URLs) to find
out what, if anything, is actually broken.

## Files inspected

- `shopify.app.toml` — uncommitted diff already pointed Fly→Railway URLs.
- Railway (`railway status`/`variables`/`logs`) — service "stockly" Online,
  region sfo, project "adequate-learning"; Postgres service separate.
- Railway Postgres (via `DATABASE_PUBLIC_URL` proxy + repo's Prisma client)
  — schema-complete (8/8 tables, all columns/indexes match
  `prisma/schema.prisma`) but data-empty except one fresh onboarding
  (Shop created 2026-06-24, 1 Session, 1 default RegistrationForm, 3
  OnboardingResponse rows). `Application`/`Tier`/`WholesaleCustomer` = 0.
- The stored offline `Session` row — accessToken expired (1hr TTL),
  refreshToken valid until 2026-09-22. Traced `@shopify/shopify-app-remix`
  internals (`ensure-offline-token-is-not-expired.js`,
  `refresh-token.js`) — confirmed the SDK auto-refreshes this
  transparently inside `authenticate.webhook()`, no cron needed. This is
  `expiringOfflineAccessTokens` + `unstable_newEmbeddedAuthStrategy`
  (both enabled in `app/shopify.server.ts`), Shopify's current
  recommended pattern — not a bug.
- `extensions/stockly-volume-discount/schema.graphql` — confirmed
  `shop.localTime` exists specifically because Shopify Functions run in
  a deterministic sandbox with no wall clock; `LocalTime` only exposes
  `date` (day granularity) + boolean comparison helpers that need
  compile-time literal args (can't parametrize per dynamic tier).
- `extensions/stockly-volume-discount/tests/fixtures/*.json` — 3 of 8
  failing before the fix, consistent with `new Date()` returning epoch-0
  inside the Function sandbox during `function-runner` execution.

## Files changed

- `extensions/stockly-volume-discount/src/run.graphql` — added
  `shop { localTime { date } }` to the input query.
- `extensions/stockly-volume-discount/src/run.ts` — active-date filter
  now compares `input.shop.localTime.date` (day-level) against
  `startsAt`/`endsAt`'s date portion, instead of `new Date().toISOString()`.
- `extensions/stockly-volume-discount/generated/api.ts` — regenerated via
  `npm run typegen`.
- All 8 fixtures under `tests/fixtures/` — added `shop.localTime.date`
  (fixed test date `2025-06-15`, arbitrary mid-range so tests never go
  stale); `no-discounts.json`'s stale `discountApplicationStrategy:
  "FIRST"` expectation corrected to `"ALL"` (code has emitted `ALL`
  since an earlier fix; the fixture just never got updated).
- `package.json` — new `test:extensions` script (runs vitest in both
  Function extensions via npm workspaces).
- `scripts/verify.sh` — runs `test:extensions` right after the app test
  suite, closing the gap that let the clock bug ship silently (root
  `vitest.config.ts` never covered `extensions/`).
- `AGENTS.md` — corrected the stale "only one fixture exists" note (8
  now) and documented the Shopify Functions no-real-clock constraint.
- `shopify.app.toml` — committed the pre-existing uncommitted fix
  (Fly→Railway URLs for application_url/redirect_urls/app_proxy).
- `fly.toml` — marked historical (comment only, file kept for
  reference/rollback).
- `.github/workflows/fly-deploy.yml`, `fly.toml.bak` — deleted (dead,
  and the former was still armed with a live `FLY_API_TOKEN` secret
  against a Fly app that no longer exists).
- `scripts/backfill-tier-groupids.ts` — annotated the one-shot `fly ssh
  console` runbook line as historical, noted the Railway equivalent.
- `app/routes/legal.privacy.tsx`, `app/routes/legal.terms.tsx` — Fly.io
  → Railway as the named hosting sub-processor (these are live pages,
  the old text was a factual/compliance error).
- `app/routes/healthz.tsx`, `app/routes/app.customers.applications.tsx`,
  `app/routes/proxy.apply.tsx`,
  `app/routes/webhooks.customers.data_request.tsx`,
  `prisma/schema.prisma` — comment-only Fly→Railway/host corrections.

## Commands run

- `bash scripts/verify.sh` (before and after) — green both times, 105
  app tests; after: `test:extensions` also green (8+5=13 tests).
- `railway status` / `railway variables --kv` (stockly + Postgres
  services) / `railway logs` — read-only.
- Prisma queries against Railway's public Postgres proxy (read-only
  counts + `information_schema` column/table diff vs `schema.prisma`).
- Direct Admin GraphQL curl with the stored session token — confirmed
  expired (`Invalid API key or access token`) before tracing why that's
  expected/self-healing.
- `cd extensions/stockly-volume-discount && npm run typegen && npm run
  build && npx vitest run` — 8/8 green after the fix.
- `npm run --workspace=extensions/stockly-volume-discount
  --workspace=extensions/stockly-opening-order test -- run` — validated
  the new `test:extensions` invocation shape before wiring it in.
- 5 separate commits (see `git log`), each scoped to one logical change.

## Verification

`bash scripts/verify.sh` green end-to-end after all changes: lint, tsc,
105 app tests, 13 extension tests (8 volume-discount + 5 opening-order),
extension build, Remix build. No production/deploy command was run —
this entire session was code + local verification + git commits only.

## Open risks

- **`shopify app deploy` has NOT run.** The committed `shopify.app.toml`
  fix and the Discount Function bugfix are only live in git — Shopify
  Partners' active app version (`stockly-42`, built 2026-06-23, before
  the Railway migration) still reflects the OLD Fly config. Needs
  Jonatan's explicit go-ahead per AGENTS.md before running.
- **Railway has no pre-deploy/release command wired up** (`prisma
  migrate deploy` doesn't run on deploy — the Dockerfile assumes Fly's
  `release_command` model, which Railway doesn't have configured). Not
  broken today (DB is already schema-current), but the next schema
  change won't apply itself. Needs a `railway.toml` `preDeployCommand`
  or pointing Railway's start command at `npm run docker-start` —
  deploy-pipeline change, needs go-ahead.
- **Session refreshToken expires 2026-09-22.** Self-heals on every
  webhook call today; if nobody reopens the app in Shopify admin before
  that date, webhooks start 500ing until someone does. Process reminder,
  not a code fix.
- **`FLY_API_TOKEN` GitHub secret still exists** even though the
  workflow that used it was deleted. Deleting a repo secret is an
  external-system action — flagged for Jonatan, not done automatically.
- **The Discount Function fix is unverified against REAL Shopify Functions
  execution** (only verified against the local `function-runner` CLI via
  fixtures). High confidence given `shop.localTime` is Shopify's
  documented mechanism for exactly this problem, but the true proof is a
  live tier with startsAt/endsAt tested end-to-end post-deploy.
- No tiers exist in the Railway DB today (fresh install), so the
  previously-broken behavior wasn't actively mis-discounting any real
  order — this was caught before it could bite in production data.

## Next step

Get Jonatan's explicit "sí" for: (1) `shopify app deploy` (ships the
Fly→Railway config fix and the Discount Function fix together), (2) the
Railway pre-deploy pipeline fix, (3) deleting the stale `FLY_API_TOKEN`
GitHub secret. Then re-verify prod (curl the Railway app, confirm OAuth
redirect works end-to-end on the dev store) before calling this closed.
