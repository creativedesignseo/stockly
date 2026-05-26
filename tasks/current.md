# tasks/current.md — Stockly active task queue

> Single page of what's being worked on **right now**. Keep it short.
> Older completed tasks live in `progress/`. Strategic plan lives in
> `ROADMAP.md`. Operational truth lives in `HANDOFF.md`.

**Last updated:** 2026-05-26

---

## Current state

Stockly is **live in production on Fly.io** (`stockly-lustrous-forest-4364`).
Sprint 4 (admin pages, applications queue, pricing settings, onboarding
wizard, qualify-customer tool) is complete and verified on the dev store
`desarrollo-adspubli.myshopify.com`. A 12-agent audit ran on this date —
findings drive the P0/P1 lists below.

**Source of truth for "what works":** `HANDOFF.md`.

---

## P0 — blocking pilot #2 and App Store

These must close before charging a paying customer or submitting to the
Shopify App Store.

- [ ] **B0-1 — GDPR mandatory webhooks.** Implement `customers/data_request`,
  `customers/redact`, `shop/redact` handlers, register in
  `shopify.app.toml`. App Store auto-rejects without these. ~1 day.
- [ ] **B0-2 — Billing API.** Wire `billing` config in `shopifyApp()`, add
  `/app/billing` plan picker, call `appSubscriptionCreate` from onboarding.
  ~3 days.
- [ ] **B0-3 — Discount Function pricing bugs (C1, C2, C3).**
  - C1: `webhooks.orders.paid` evaluates FPQ against the wrong amount
  - C2: Function not re-synced after FPQ webhook promotes a customer
  - C3: Track-2 (DB-row, no tag) customers see wholesale on storefront
    but pay retail at checkout
  ~2-3 days + tests.
- [ ] **B0-4 — Rotate `DATABASE_URL` password.** Old Prisma/Vercel
  credential is in `.env.local` on disk. Rotate in Prisma Data Platform,
  revoke `VERCEL_OIDC_TOKEN`, delete file. ~30 min.
- [ ] **B0-5 — Privacy Policy + Terms of Service URLs.** Required for
  Protected Customer Data approval AND App Store listing. ~1 day.
- [ ] **B0-6 — Fly health checks + `min_machines_running = 1`.** Current
  `fly.toml` has no health checks and 0-machine idle, contradicting
  ADR-009's "no cold starts". ~30 min.

---

## P1 — pre-pilot polish

- [ ] **P1-1** Resource Picker (App Bridge) for Tier scope selection —
  replaces the manual `gid://shopify/Product/...` input.
- [ ] **P1-2** Rate-limit on `/proxy/apply` (5/min per shop + IP).
- [ ] **P1-3** Centralize multiplicative pricing math — Function, QOF
  and Product Panel currently round differently.
- [ ] **P1-4** `WebhookEvent` idempotency table; transaction-wrap
  `orders/paid` handler.
- [ ] **P1-5** Discount Function test fixtures: baseline×tier, FPQ
  pre/post, variant>product>all specificity, cart_total vs per_line.
- [ ] **P1-6** Remove `app.additional.tsx` and the "Additional page"
  NavMenu entry (template residue visible to merchants).
- [ ] **P1-7** Register a custom domain to replace
  `stockly-lustrous-forest-4364.fly.dev`.
- [ ] **P1-8** `markApplicationApproved` auto-tags the customer and
  triggers `syncTiersToFunction` so admin and checkout never diverge.

---

## Blocked

- **`orders/paid` webhook activation** — blocked on Shopify Protected
  Customer Data approval, which is blocked on **B0-5** (Privacy Policy
  URL).
- **Multi-region deploy (EU)** — deferred until we have an EU merchant
  paying.

## Known pre-existing failures (not blockers, but on the floor)

- **Lint: 2 unused imports** in
  `app/routes/app.customers.applications.tsx` (lines 27 and 336 —
  `Form` and `submitting`). Residue from commit `935de4b` (per-row
  useFetcher migration). 2-minute fix: remove the unused names.
  Detected by `scripts/verify.sh` on 2026-05-26.

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
