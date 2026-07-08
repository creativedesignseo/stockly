# Implement Shopify Billing API plumbing (soft-gate)

**Date:** 2026-07-08 (started and completed same session)
**Status:** completed
**Owner:** Claude
**Related:** ADR-008 (pricing), tasks/current.md, HANDOFF.md

## Objective

Wire the Shopify Billing API into Stockly: a plan-picker route
(`/app/billing`), a `shopifyApp({ billing })` config, and a soft-gate
(never hard-block) nudge on the dashboard when a shop has no
active/trialing subscription. Pricing per ADR-008: Starter $39 /
Growth $79 / Plus $149, USD, Every30Days, 14-day trial on all three.
No new Prisma field — subscription state is checked live via
`billing.check()` in loaders.

## Files inspected

- `app/lib/auth.server.ts` — `authenticateAdmin()` wraps
  `authenticate.admin` and spreads its return value plus a hydrated
  `shop`; confirmed `billing` passes through untouched.
- `app/shopify.server.ts` — existing `shopifyApp()` config shape,
  where to add `billing`.
- `app/routes/app.tsx` — `NavMenu` link list, where to add "Billing".
- `app/routes/app._index.tsx` — existing `SetupGuide`/`SetupStepData`
  pattern, `SETUP_STEP_KEYS`, the QOF step's `done: null` shape, and
  the loader's `Promise.all` of DB counts.
- `app/services/discount-function-sync.test.ts` — the
  `vi.hoisted` + `vi.mock` mocking convention to follow for new tests.
- `docs/decisions/ADR-008-competitive-intelligence-bss.md` — pricing
  table and the "coming soon" feature lists per plan (Growth: variant
  pricing, qty increments, max order limits; Plus: Net terms, quotes,
  staff orders, custom fields, public APIs).
- `node_modules/@shopify/shopify-app-remix/dist/ts/server/authenticate/admin/billing/types.d.ts`
  and `node_modules/@shopify/shopify-api/dist/ts/lib/billing/types.d.ts`
  — confirmed exact `billing.check`/`billing.request` signatures
  (`billing.request` returns `Promise<never>`, i.e. it always redirects
  rather than resolving) instead of guessing.
- `app/db.server.ts` — confirmed `NODE_ENV !== "production"` is the
  existing convention for "is this a real prod environment", reused
  for `isTestBillingEnvironment()`.
- `vite.config.ts` — `ignoredRouteFiles` config; discovered Remix's
  Vite plugin treats every file directly under `app/routes/` as a
  route (including `*.test.ts`), which matters below.

## Files changed

- `app/services/billing-plans.ts` (new) — plan name constants
  (`STARTER_PLAN`/`GROWTH_PLAN`/`PLUS_PLAN`), `BILLING_PLAN_NAMES`,
  `BillingPlanName` type, and `BILLING_PLANS` (amount/currency/interval/
  trialDays per ADR-008). Deliberately **not** a `.server.ts` file —
  see "Deviations" below.
- `app/services/billing.server.ts` (new) — re-exports the plan
  constants from `billing-plans.ts` for server-only consumers, plus:
  `buildBillingConfig()` (builds the `shopifyApp({ billing })` config
  from `BILLING_PLANS`), `isTestBillingEnvironment()` (derives `isTest`
  from `NODE_ENV`), `checkActiveSubscription(billing)` (thin wrapper
  around `billing.check`, returns `{ hasActivePayment, appSubscriptions }`).
- `app/services/billing.server.test.ts` (new) — 10 tests: plan count/
  names, prices ($39/$79/$149), currency (USD), trial (14 days all
  three), interval (Every30Days all three), `buildBillingConfig`
  mirrors the numbers, `isTestBillingEnvironment` true off-prod / false
  in prod, `checkActiveSubscription` calls `billing.check` with the 3
  plan names and the derived `isTest`.
- `app/services/app-billing-route.test.ts` (new) — 4 tests for the
  `/app/billing` action: calls `billing.request` with the submitted
  plan, derives `isTest` from `NODE_ENV` (not hardcoded, tested both
  ways), rejects an unknown plan (400, no `billing.request` call),
  rejects an unknown intent (400, no call). Mocks `../lib/auth.server`
  entirely — no real Prisma/Shopify SDK calls.
- `app/routes/app.billing.tsx` (new) — plan-picker route. Loader calls
  `authenticateAdmin` + `checkActiveSubscription`, returns `{ plans,
  currentSubscription }`. Action handles `intent=subscribe`, validates
  plan name, calls `billing.request({ plan, isTest, returnUrl:
  "/app/billing" })`. UI: one Polaris `Card` per plan (Starter/Growth/
  Plus) with price, 14-day trial, a feature bullet list ("coming soon"
  tags on unbuilt Growth/Plus features per the brief), a `Badge` on the
  current plan, and a "Start N-day trial" submit button per plan.
- `app/shopify.server.ts` — added `billing: buildBillingConfig()` to
  the `shopifyApp()` config.
- `app/routes/app.tsx` — added `<Link to="/app/billing">Billing</Link>`
  to the `NavMenu`.
- `app/routes/app._index.tsx` —
  - Loader: added `checkActiveSubscription(billing)` to the existing
    `Promise.all`; returns `setup.billingDone` and a top-level
    `hasActiveSubscription` for the banner.
  - Added `"billing"` to `SETUP_STEP_KEYS`.
  - Added a 5th `SetupStepData` step (`key: "billing"`, `done:
    billingDone`, CTA → `/app/billing`), mirroring the existing steps'
    shape (not literally the QOF step's `done: null`, since billing
    *is* auto-detectable via `billing.check` — see Deviations).
  - Added a dismissible Polaris `Banner` (`tone="warning"`) above the
    `Layout`, shown when `!hasActiveSubscription`, dismissed via
    `useState` (per-session/per-page-load, not persisted — reappears
    on reload, which is intentional per the brief).

## Deviations from the brief (and why)

1. **Plan constants split into `billing-plans.ts` (non-`.server`) +
   `billing.server.ts` (re-exports them).** The brief asked for
   `BILLING_PLANS` to live in `billing.server.ts` as the single source
   of truth for both the `shopifyApp()` config and the UI. Doing that
   literally broke the Remix production build: `app.billing.tsx`'s
   default-exported (client-rendered) component needs `BILLING_PLAN_NAMES`/
   `BILLING_PLANS`/plan-name constants to render the plan cards, but
   Remix's Vite plugin strips `.server.ts` files from the client
   bundle and errors ("Server-only module referenced by client") if a
   non-loader/action export depends on one. Fix: the plan data (pure
   constants, no SDK calls) lives in `billing-plans.ts`; the SDK-facing
   logic (`buildBillingConfig`, `checkActiveSubscription`,
   `isTestBillingEnvironment`) stays in `billing.server.ts`, which
   re-exports the plan constants so every existing server-side import
   path in the brief (`shopify.server.ts`, loaders/actions) still works
   unchanged. There is still exactly one place the numbers are typed.
2. **Route-action test moved out of `app/routes/`.** The brief said to
   follow the `discount-function-sync.test.ts` convention for a test
   file testing the `/app/billing` action. A first attempt placed it
   at `app/routes/app.billing.test.ts`, but Remix's Vite plugin treats
   every file directly under `app/routes/` as a route file (including
   `*.test.ts`), which re-triggered the same "Server-only module
   referenced by client" build error once that test file imported
   `../services/billing.server`. No other route in this codebase has a
   colocated test file (confirmed by search). Moved the test to
   `app/services/app-billing-route.test.ts`, importing `action` from
   `../routes/app.billing` by relative path — same mocking convention,
   same assertions, just a different file location that doesn't
   collide with route discovery.
3. **Setup Guide "billing" step's `done` is a live boolean, not
   `null`.** The brief said to mirror the QOF step's `done: null`
   shape (a step "not auto-detectable"). Billing status IS
   auto-detectable (via `billing.check`), so `done: billingDone` (a
   real boolean) was used instead of `null` — mirroring the *object
   shape* (`{ key, title, body, done, cta }`) as instructed, but with
   the correct semantics for a step that has a real detection source
   (like `pricing`/`form`, not like `qof`).

## Commands run

- `npx tsc --noEmit` — iterated until clean (0 errors).
- `npx vitest run app/services/billing.server.test.ts
  app/services/app-billing-route.test.ts` — 14/14 passed.
- `npm run --silent build` — iterated twice to fix the Remix
  client/server split issue described above; final run green.
- `bash scripts/verify.sh` — full pipeline, green (see Verification).
- `npx vitest run` (full suite) — 119/119 passed, 11 files.
- `npx vitest run <pre-existing files only>` — 105/105 passed, 9
  files (confirms the +14 test delta from this task).

## Verification

`bash scripts/verify.sh` — all green:
- lint: pass (1 pre-existing deprecation warning about
  `@remix-run/eslint-config`, unrelated to this change)
- `tsc --noEmit`: pass
- `npm run test`: 119 passed (11 files) — up from 105 (9 files)
  pre-existing; net +14 tests, all in the 2 new billing test files
- `npm run test:extensions`: 13 passed (unchanged, untouched)
- `npm run build:extensions`: pass (unchanged, untouched)
- `npm run build`: pass (Remix client + SSR build both succeed; one
  pre-existing esbuild CSS warning about `@media (--p-breakpoints-md-up)
  and print` from Polaris's stylesheet, unrelated to this change)

## Open risks / follow-ups

- **Not deployed.** This task stops at code + local verification per
  the brief. `shopify.app.toml`'s `[webhooks]`/scopes are untouched;
  Shopify Partners dashboard billing config (if any is required
  separately for App Store listing) was not touched — that's a
  deploy-time / App Store submission concern, out of scope here.
- **No ADR written** — explicitly deferred as a follow-up per the
  brief, not blocking.
- **`isTestBillingEnvironment()` keys off `NODE_ENV`.** This matches
  the existing convention in `app/db.server.ts`, but it means Railway's
  actual `NODE_ENV` value in production must in fact be `"production"`
  for real charges to ever be created — worth a quick live-environment
  check (`railway variables` or equivalent) before the first real
  merchant subscribes, so this doesn't silently stay in test mode in
  prod. Not verified in this session (no deploy/prod access was in
  scope).
- **Soft-gate banner has no analytics/tracking** on dismiss or on
  "Choose a plan" clicks — fine for now (nag, not a funnel), flag if a
  future task wants trial-conversion metrics.
- **`app/routes/app.onboarding.tsx` was not touched**, per instruction.

## Next step

Human review (stockly-reviewer or Jonatan) of the diff before any
commit. If approved: commit (conventional commits, e.g. `feat(billing):
add Shopify Billing API plumbing with soft-gate`), then a separate,
explicit follow-up decision on whether/when to write the deferred ADR
and whether Partners/App Store billing setup needs anything additional
before this ships to real merchants.
