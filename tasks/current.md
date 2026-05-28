# tasks/current.md — Stockly active task queue

> Single page of what's being worked on **right now**. Keep it short.
> Older completed tasks live in `progress/`. Strategic plan lives in
> `ROADMAP.md`. Operational truth lives in `HANDOFF.md`.

**Last updated:** 2026-05-26 (PM session)

---

## Current state

Stockly is **live in production on Fly.io** (`stockly-lustrous-forest-4364`,
Fly v10, Shopify app `stockly-18`, Custom distribution).
Sprint 4 (admin pages, applications queue, pricing settings, onboarding
wizard, qualify-customer tool) is complete and verified on the dev store
`desarrollo-adspubli.myshopify.com`. A 12-agent audit ran earlier today —
findings drive the P0/P1 lists below. The PM session validated the
admin Approve flow E2E (first wholesale application moved to approved
state) — see `progress/2026-05-26-approve-flow-fix.md`.

**Source of truth for "what works":** `HANDOFF.md`.

---

## P0 — blocking pilot #2 and App Store

These must close before charging a paying customer or submitting to the
Shopify App Store.

- [x] **B0-1 — DONE 2026-05-27.** Three new handlers:
  - `app/routes/webhooks.customers.data_request.tsx` — looks up
    WholesaleCustomer + WholesaleApplication rows by id/email and
    structured-logs them for the merchant audit trail.
  - `app/routes/webhooks.customers.redact.tsx` — hard-deletes
    WholesaleCustomer + WholesaleApplication rows in a transaction.
  - `app/routes/webhooks.shop.redact.tsx` — deletes Session rows and
    the Shop row (cascade to Tier, WholesaleCustomer,
    WholesaleApplication, OnboardingResponse via schema's
    onDelete: Cascade).
  All 3 verify HMAC automatically via `authenticate.webhook`
  (returns 401 on tampering, exactly what App Store requires).
  Registered in `shopify.app.toml` under `[[webhooks.subscriptions]]`
  with the `compliance_topics` key (not regular `topics`).
  Released to Partners via `npx shopify app deploy` in the same
  session as the code deploy.
- [ ] **B0-2 — Billing API.** Wire `billing` config in `shopifyApp()`, add
  `/app/billing` plan picker, call `appSubscriptionCreate` from onboarding.
  ~3 days.
- [ ] **B0-3 — Discount Function pricing bugs (C1, C2, C3).**
  - C1: `webhooks.orders.paid` evaluates FPQ against the wrong amount —
    pending verification; the Function itself evaluates FPQ against
    `cartWholesaleSubtotal` (correct per ADR-004). The bug may live in
    the webhook handler, not the Function. To be reproduced.
  - [x] **C2 — DONE 2026-05-27.** `webhooks.orders.paid.tsx` now calls
    `syncTiersToFunction(admin, shopRow.id)` after the per-customer
    metafield write, mirroring the approve action's pattern. Errors
    swallowed (logged, not thrown) — qualification is already in
    effect via the per-customer metafield; the sync just refreshes
    the bypass list on the shop-level configuration metafield. **The
    webhook subscription itself is still NOT registered** in
    `shopify.app.toml` (commented out) — that's a separate gate that
    requires Protected Customer Data + a real Privacy Policy URL
    (B0-5). Code is ready; enabling the subscription is a 2-line
    diff once B0-5 lands.
  - [x] **C3 — DONE 2026-05-26.** Admin-approved (track-2) customers
    were paying retail at checkout because `approveCustomer` was
    creating WholesaleCustomer rows with `qualifiedAt=null`, and the
    Function's `qualifiedCustomers` bypass list is sourced ONLY from
    rows with `qualifiedAt != null`. Fix in commit `0250d1f`:
    `approveCustomer` now sets `qualifiedAt=now`, and the approve
    action calls `syncTiersToFunction` immediately after. Validated
    E2E on dev store — checkout charges €58.50 wholesale on a €130
    retail cart, with `WHOLESALE 55%` labels on each line. See
    `progress/2026-05-26-approve-flow-fix.md` for the full chain.
- [x] **B0-4 — Rotate `DATABASE_URL` password.** _Done 2026-05-26._
  Forensic investigation revealed the credential lived inside the
  Vercel project `stockly` (Vercel Marketplace → Prisma Postgres
  integration), not in a standalone Prisma account. Resolution:
  deleted the entire Vercel project via `vercel project rm stockly`,
  which cascaded to env vars (DATABASE_URL, SHOPIFY_API_SECRET,
  SHOPIFY_API_KEY, PRISMA_DATABASE_URL, POSTGRES_URL) and the
  associated Prisma Postgres DB. Also deleted local `.env.local`
  (4 zombie vars: DATABASE_URL, POSTGRES_URL, PRISMA_DATABASE_URL,
  VERCEL_OIDC_TOKEN). Production on Fly.io confirmed unaffected
  (HTTP 200, secrets still deployed).
- [⏳] **B0-5 — Privacy + Terms SCAFFOLDED 2026-05-27, pending Jonatan
  legal review.** Two new public routes:
  - `app/routes/legal.privacy.tsx` → served at
    `/legal/privacy` (no Shopify auth, public). GDPR-compliant
    structure: responsable, datos recopilados, finalidad y base
    legal, conservación, transferencias, derechos del interesado,
    AEPD, cookies, menores, cambios, contacto.
  - `app/routes/legal.terms.tsx` → served at `/legal/terms`. SaaS
    B2B template: descripción, cuenta, planes/facturación (Shopify
    Billing), trial, uso aceptable, IP, garantías, limitación de
    responsabilidad (cap 12 meses), indemnización, terminación,
    jurisdicción Barcelona.
  - Content language: Spanish primary (ES/EU market). English
    translation deferred to a follow-up.
  - URLs are public, work without Shopify embed context.
  - **NEXT STEPS (Jonatan):**
    1. Read both files; flag anything that doesn't match Adspubli's
       actual legal posture (address, contact emails, jurisdiction,
       limitation amounts).
    2. Run by an abogado especialista en RGPD/SaaS OR a service like
       Iubenda/TermsFeed for a quick professional pass.
    3. Once approved, set the URLs in **Partner Dashboard → Stockly →
       App setup → Privacy / Terms** so they appear in the App Store
       listing.
    4. Submit Protected Customer Data request via Partner Dashboard
       for the `orders/*` topic family — unblocks B0-3 C1 + order
       tagging live (P1-10).
- [x] **B0-6 — DONE 2026-05-27.** `fly.toml` now has
  `min_machines_running = 1` (primary machine never sleeps) and
  `auto_stop_machines = 'suspend'` (secondaries resume in ~100ms
  instead of cold-starting in 5-30s). New `app/routes/healthz.tsx`
  exposes a lightweight liveness endpoint (no DB, no Shopify auth)
  and `[[http_service.checks]]` polls it every 30s with 5s timeout,
  10s grace at boot. ADR-009's "no cold starts" promise now holds in
  the config, not just the doc.

---

## P1 — pre-pilot polish

- [x] **P1-1 — DONE 2026-05-27.** Tier scope selection (in
  `app.tiers.new.tsx` and `app.tiers.$id.tsx`) now has a "Browse…"
  button via `useAppBridge().resourcePicker({ type: scope })` that
  opens Shopify's native picker modal. Cancel = no-op. On select
  the canonical GID is written into the form and the human-readable
  title is shown as helpText ("Selected: …"). Manual GID paste still
  works for power users / migration scripts.
- [ ] **P1-2** Rate-limit on `/proxy/apply` (5/min per shop + IP).
- [ ] **P1-3** Centralize multiplicative pricing math — Function, QOF
  and Product Panel currently round differently.
- [ ] **P1-4** `WebhookEvent` idempotency table; transaction-wrap
  `orders/paid` handler.
- [ ] **P1-5** Discount Function test fixtures: baseline×tier, FPQ
  pre/post, variant>product>all specificity, cart_total vs per_line.
- [x] **P1-6** Remove `app.additional.tsx` and the "Additional page"
  NavMenu entry (template residue visible to merchants). _Done
  2026-05-26._
- [ ] **P1-7** Register a custom domain to replace
  `stockly-lustrous-forest-4364.fly.dev`.
- [x] **P1-10 — DONE 2026-05-27.** Order tagging in
  `webhooks.orders.paid.tsx`: if `customer.tags` includes the shop's
  wholesaleTag, tag the Order with `<wholesaleTag>-order` via
  Shopify `tagsAdd`. Runs BEFORE the FPQ early-return so every
  wholesale order gets tagged (not just qualifying ones). Errors
  swallowed (logged) — tag failure doesn't block qualification. NOT
  YET LIVE for merchants: the `orders/paid` subscription itself is
  still gated by B0-5 (Privacy Policy URL needed for Protected
  Customer Data approval of `orders/*` topics). Code ready; ships
  automatically when the subscription is enabled.
- [x] **P1-11 — DONE 2026-05-27.** Tax-exempt toggle exposed in the
  Applications modal as a secondary action visible for approved
  applications with a linked Shopify customer. New action intent
  `set-tax-exempt` calls `customerUpdate(taxExempt: true)`. Banner
  surfaces success/error. BSS Advanced parity feature ($50 tier).
- [ ] **P1-9** Quick Order Form currency consistency: in dev store with
  a Spain-via-VPN visitor, the PRICE column rendered `€65,00` while
  LINE TOTAL and ORDER TOTAL rendered `$631.80`. The math is correct
  (validated 2026-05-26: 24 × €65 × 0.405 = €631.80), but mixing
  symbols in the same table is jarring. Likely cause: product price
  comes from Markets-resolved storefront context (EUR), while line
  total is computed against the shop's primary currency (USD for the
  dev store). Fix: resolve both via the same source — either format
  with the storefront `Shopify.currency.active` everywhere, or pin
  the QOF to the cart's currency.
- [x] **P1-8 — DONE 2026-05-26.** `markApplicationApproved` already
  auto-tags as part of the approve action. The missing piece was
  `syncTiersToFunction` — now called immediately after `approveCustomer`
  in commit `0250d1f`. Closed together with C3.

---

## Blocked

- **`orders/paid` webhook activation** — blocked on Shopify Protected
  Customer Data approval, which is blocked on **B0-5** (Privacy Policy
  URL).
- **Multi-region deploy (EU)** — deferred until we have an EU merchant
  paying.

## Known pre-existing failures (not blockers, but on the floor)

- **`tsc --noEmit` fails on `extensions/stockly-volume-discount/src/run.ts`
  in a fresh worktree** (discovered 2026-05-28, volume-pricing area work).
  8 errors: 2× `Cannot find module '../generated/api'` (TS2307) plus 6×
  implicit-`any` callbacks that depend on those generated types. Root
  cause: `extensions/stockly-volume-discount/generated/api.ts` is a
  Shopify codegen artifact produced by `npm run typegen` (i.e.
  `shopify app function typegen`) and is NOT committed to git, so it's
  absent until someone runs typegen (needs Shopify CLI auth). The
  root-level `tsc` in `scripts/verify.sh` compiles the extension source
  and trips on the missing module. Proven pre-existing: removing the new
  `app.volume-pricing.*` route files leaves exactly the same 8 errors,
  all confined to `run.ts`; the new routes add zero type errors. Fix is
  either to run `typegen` before verify, exclude the extension from the
  root tsconfig, or commit the generated stub. Not caused by and not
  related to the volume-pricing routes.

  Lint warnings from `935de4b` (unused `Form` / `navigation` /
  `submitting`) cleaned up on 2026-05-26.

---

## Next recommended action

**Open: B0-4 (rotate DB password).** Fastest, lowest-risk P0 with no
dependencies. Then B0-6 (Fly health checks, 30 min). Then sequence
B0-5 → B0-1 → B0-3 → B0-2 over the next 5–7 working days.

For B0-3 specifically: **before** touching code, validate manually in
Piro whether C1/C2/C3 are currently mis-charging real wholesale
customers. That tells us whether B0-3 is "urgent now" or "urgent for
pilot #2".

---

## Out of scope right now

- Multi-currency tier math
- i18n beyond English (Spanish admin planned for Sprint 6)
- Net 30/60 terms (Phase 2)
- Quote system (Phase 2)
- Analytics dashboard (Phase 2)

---

## Notes / reusable assets created during this project

- **`harness-bootstrap` global skill** (lives at
  `~/.claude/skills/harness-bootstrap/`) generalizes this project's
  harness pattern. Invoke it from any new project root with a phrase
  like "set up the harness here" and it will scaffold AGENTS.md,
  CLAUDE.md, scripts/verify.sh, tasks/current.md, progress/, plus 5
  generic subagents and 4 skills — adapted to the detected stack and
  hosting. Created 2026-05-26 right after the Stockly harness work
  proved the pattern.

- **PM 2026-05-26 findings worth keeping in mind**:
  - `useFetcher` responses do NOT populate `useActionData`. Any
    fetcher-driven action must lift `fetcher.data` to a parent
    `useState` for banners to render. (Fixed in `app.customers.applications.tsx`.)
  - `console.error(err)` collapses nested arrays via `util.inspect`
    (`graphQLErrors: [Array]`). Always `JSON.stringify` graphQLErrors in
    catch blocks for debuggable Fly logs.
  - `fly deploy` and `shopify app deploy` are independent pipelines.
    The toml-declared `protected_customer_data_permissions` only takes
    effect after `shopify app deploy` releases a new app version.
  - Selecting a **Distribution method** (Custom or App Store) is a
    prerequisite for requesting Protected Customer Data — Shopify hides
    the request form silently if no distribution is set, even on dev
    stores.
  - Dev stores **auto-grant** Protected Customer Data once the app
    version with the toml declarations is live (no merchant reinstall
    required). Production stores will require explicit grant + Partners
    review (blocked by **B0-5** Privacy Policy URL).

- **`.github/workflows/fly-deploy.yml`** exists locally but is currently
  **untracked** in git. No CI/CD for Fly today; every deploy is manual.
  Decision pending: commit + add `FLY_API_TOKEN` GitHub secret (so push
  to `main` auto-deploys), or keep manual until pilot #2. Tracked here
  to avoid re-discovering this twice.
