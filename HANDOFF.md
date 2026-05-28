# HANDOFF — Resume work hands-off

> Read this first if you're starting a fresh session on Stockly.
> Single source of truth for current state + resume instructions.

**Last updated:** 2026-05-28 — Registration Form Phase 1 LIVE (ADR-013) + Volume Pricing ADR-012 data layer LIVE
**Last commit:** `3dab71d` — `docs(handoff): RF Phase 1 code complete, awaiting deploy approval`
**GitHub:** https://github.com/creativedesignseo/stockly
**Production URL:** https://stockly-lustrous-forest-4364.fly.dev
**Fly version:** `v48` (Registration Form Phase 1 deploy 2026-05-28)
**Shopify app version:** `stockly-24` (storefront block rewritten — schema-driven dynamic render)
**Postgres:** `RegistrationForm` + `Application` tables added; legacy `WholesaleApplication` retained (dual-write for 48h soak before Phase 1G drops it)
**Reviewer pass 1 verdict:** NEEDS-CHANGES (3 CRITs + 5 SHOULDs + 2 NITs) → all addressed in fix commit `99c2905`
**`tsc --noEmit`** now part of `scripts/verify.sh` — 0 errors at HEAD (was 23 pre-existing)
**Public legal URLs (LIVE, DRAFT):**
  - https://stockly-lustrous-forest-4364.fly.dev/legal/privacy
  - https://stockly-lustrous-forest-4364.fly.dev/legal/terms

---

## TL;DR — current state

**Stockly is LIVE in production on Fly.io.**
- App: `stockly-lustrous-forest-4364` (region `iad`, us-east)
- DB: Fly Managed Postgres `stockly-db` (region `iad`)
- Shopify app version: `stockly-18` published, active (Protected Customer Data level_1 live)
- Installed and functional on `desarrollo-adspubli.myshopify.com`
- Onboarding wizard verified loading
- Form de wholesale verified end-to-end (201 created in Postgres)
- **Admin Approve flow verified E2E on dev store** (PM session 2026-05-26).
  First wholesale application moved to `approved` state, Shopify Customer
  tagged. See `progress/2026-05-26-approve-flow-fix.md`.

**Pending validation by Jonatan:**
- Cross-check: Shopify Admin → Clientes → confirm `wholesale` tag on the
  approved customer
- Cross-check: `/app/customers/qualified` shows the WholesaleCustomer row
- Approve a 2nd application to confirm the path is repeatable
- Storefront test: log in as approved customer, confirm wholesale pricing
  renders + checkout charges discounted price (where B0-3 C1/C2/C3 may surface)
- Decide pilot #2 and #3 targets

**Out of scope until Sprint 5:**
- orders/paid webhook (needs Shopify protected customer data approval)
- Email notifications on application status change
- Variant-level pricing checkout enforcement for collection scope

---

## Architecture today (post Vercel→Fly migration)

```
                    GitHub creativedesignseo/stockly
                              ↓ push to main
                    ┌─────────────────────────┐
                    │ Fly.io (region iad)     │
                    │                          │
                    │ ┌──────────────────────┐ │
                    │ │ Container (Node 20)  │ │   ← Dockerfile multi-stage,
                    │ │ Remix + Polaris      │ │     debian-bookworm-slim,
                    │ │ remix-serve :3000    │ │     binary engine
                    │ └──────────┬───────────┘ │     rhel-openssl-3.0.x
                    │            ↕              │
                    │ ┌──────────────────────┐ │
                    │ │ Managed Postgres     │ │   ← pgbouncer pool,
                    │ │ stockly-db           │ │     all Stockly tables
                    │ └──────────────────────┘ │
                    └─────────────────────────┘
                              ↑
                              │ App Proxy + iframe + webhooks
                    ┌─────────────────────────┐
                    │ Shopify (stockly-15)    │
                    │ desarrollo-adspubli     │
                    └─────────────────────────┘
```

See [ADR-009](./docs/decisions/ADR-009-backend-fly-io.md) for the full reasoning of WHY Fly.io specifically (and why Vercel was the wrong call).

---

## What ships next (Volume Pricing, ADR-012) — PRE-DEPLOY

Merged into the worktree on 2026-05-28, awaiting deployment-guardian
sign-off. The pricing engine and data layer are end-to-end ready; the
multi-band admin UI ships in Phase 2.

**End-to-end ready (Phase 1):**
- `Tier` schema: `quantityTo`, `groupId`, `discountFixedPrice`,
  `startsAt`, `endsAt`, `showTableOnPdp`, `tableTemplateId`.
- Service layer: `createRule`, `updateRule`, `deleteRule`, `listRules`,
  `getRule`, `BandInput` / `RuleSummary` types.
- Sync layer: v4 metafield shape with the new fields per scoped tier.
- Discount Function (`run.ts`): mix_variants aggregation, fixed_price
  discount type, active-date filter (reads `Date.now()`), quantityTo
  band upper bound, `discountPct = 0` legitimately accepted for
  fixed_price tiers.
- 7 unit fixtures pin the new Function behavior including 3
  active-date guardrails for the `Date.now()` runtime.
- Admin list: one row per `groupId`, inline status toggle, "Volume
  bands" column.

**Storage-only / Phase 2 (UI not yet built):**
- Multi-band band-editor table on `/app/pricing/new` and
  `/app/pricing/$id`. The forms still edit ONE band per save. Multi-
  band rules are creatable today via `createRule` service calls but
  not via the admin UI.
- Active-date pickers in the sidebar (`startsAt` / `endsAt` form
  inputs). Field exists in DB + Function.
- "Show Table on PDP" toggle (`showTableOnPdp`) form input. Field
  exists in DB.
- Theme app block that renders the storefront volume-pricing table.

**Pending production steps for deployment-guardian:**
1. `prisma db push` against Fly Managed Postgres
   `stockly-lustrous-forest-4364` — purely additive (every new field
   is nullable or has a default), safe.
2. Back-fill `groupId` on legacy rows:
   ```
   fly ssh console -a stockly-lustrous-forest-4364 \
     -C 'node /app/scripts/backfill-tier-groupids.js'
   ```
   The script exits non-zero if any NULL remains. Re-runs are no-ops.
3. `fly deploy` (Remix server with the new service-layer helpers).
4. `npx shopify app deploy` (publishes the new Function WASM with
   mix_variants + fixed_price + active-date filter).
5. Verify Piro Jewelry's live tiers still apply at checkout (legacy
   fixture covers this in CI; production smoke is `legacy-single-band`
   semantics on a real cart).

---

## What works (validated 2026-05-26)

- `https://stockly-lustrous-forest-4364.fly.dev/` returns 200
- `/app?shop=...&embedded=1&host=...&id_token=...` returns 302 (correct embedded bootstrap)
- `/auth/login?shop=...` returns 302 (OAuth start)
- `/apps/stockly/apply` (App Proxy POST from storefront) returns 201 with JSON
- Admin iframe in Shopify loads the wizard
- Sprint 4 admin pages live: `/app`, `/app/onboarding`, `/app/pricing` (list + new + edit, Sami-style; was `/app/tiers` until 2026-05-27), `/app/customers/applications`, `/app/settings/pricing` (Sami-style 2026-05-27), `/app/qualify-customer`
- Storefront blocks active: Quick Order Form, Wholesale FPQ Banner, Wholesale Product Panel, Wholesale Registration
- **Admin Approve action** (`POST /app/customers/applications` with
  `intent=approve`): resolves Shopify Customer (by id → by email → create),
  tags as `wholesale`, upserts WholesaleCustomer row with
  `qualifiedAt=now` (bypass FPQ), marks application approved, **and
  re-syncs the Discount Function metafield** so the new customer's GID
  lands in `qualifiedCustomers` immediately. Errors surface to the
  merchant via Polaris Banner (commit `81b7546`). Protected Customer
  Data access is live and granted on the dev store under Custom
  distribution.
- **B2B pricing engine E2E** (Discount Function `stockly-volume-discount`
  + `wholesaleBaselinePct` 55):
  - Customer logs in to storefront
  - Cart drawer shows retail price ~~tachado~~ and wholesale price for
    every line, with "Wholesale 55%" label
  - Checkout subtotal applies the discount: €130 retail → €58.50
    wholesale, "TOTAL SAVINGS €71.50" shown by Shopify
  - Validated 2026-05-26 PM with Test Wholesale customer
    (creativedesignseo@gmail.com, Shopify GID 10103069901128)

---

## Resume work checklist (next session)

1. **Confirm production is alive:**
   ```bash
   cd /Users/aimac/Documents/Workspace/Clients/stockly
   fly status --app stockly-lustrous-forest-4364
   curl -sI -A "Mozilla/5.0" https://stockly-lustrous-forest-4364.fly.dev/
   ```
   Expected: machines `started` + HTTP 200.

2. **Check what's pending:** read `ROADMAP.md` and `docs/sprints/sprint-N.md` retros if they exist.

3. **Recent context:** read commit log of last session (`git log --oneline -20`). Today's commits all start with `fix(...)` documenting bugs in [ADR-009](./docs/decisions/ADR-009-backend-fly-io.md).

4. **DON'T touch infra unless asked.** Production is fragile after the migration. Any deploy-related work — check [shopify-remix-deploy-gotchas memory](https://github.com/creativedesignseo/stockly/blob/main/docs/decisions/ADR-009-backend-fly-io.md) FIRST.

---

## Critical deploy commands

```bash
# Deploy (auto on push to main, or manual)
fly deploy --app stockly-lustrous-forest-4364

# Logs (use --no-tail; interactive mode blocks shell scripts)
fly logs --app stockly-lustrous-forest-4364 --no-tail

# SSH into running machine
fly ssh console -a stockly-lustrous-forest-4364

# Run schema update against prod DB
fly ssh console -a stockly-lustrous-forest-4364 -C 'npx prisma db push --skip-generate'

# Set/update env var (NEVER use echo — adds trailing \n)
fly secrets set SHOPIFY_API_KEY="value" --app stockly-lustrous-forest-4364
# OR for piped values:
printf "value" | fly secrets set KEY=- --app stockly-lustrous-forest-4364

# Push Shopify app config (URLs in shopify.app.toml)
npx --yes shopify app deploy --force --message "What changed"
```

---

## Files modified in the 2026-05-26 migration

Build/infra:
- `Dockerfile` — rewritten multi-stage with Debian + binaryTargets + .npmrc + HOST=0.0.0.0
- `fly.toml` — NEW (region iad, release_command for prisma db push)
- `vercel.json` — DELETED
- `vite.config.ts` — removed `vercelPreset()` import
- `package.json` — removed `@vercel/remix` dep
- `prisma/schema.prisma` — added `binaryTargets = ["native", "rhel-openssl-3.0.x"]`
- `shopify.app.toml` — URLs auto-updated by `shopify app deploy` to point to Fly

Code fixes:
- `app/services/shops.server.ts` — `getOrCreateShop` uses `upsert` (race-safe)
- `app/routes/app._index.tsx` — preserves `searchParams` in redirect to `/app/onboarding`

---

## Open decisions / TODOs

- **`stockly-lustrous-forest-4364` is the auto-assigned URL** because `stockly` was taken globally. When Stockly has revenue, register a custom domain (`app.stockly.io` or similar) and update Shopify Partners + DNS.
- **Vercel project** still exists, dormant. Delete after 1 week of stable Fly to avoid confusion.
- **Fly billing baseline (2026-05-27 cleanup):** After removing 2 orphan
  Postgres deployments (the MPG cluster `d1zj5omlxp30yqkv` and the
  legacy Postgres app `stockly-lustrous-forest-4364-db`, both leftover
  from Sprint 0 migration attempts), monthly Fly cost is **~$2.50**:
    - Active MPG cluster `n83v7rggv44r5gxk` — $2.16 + $0.14 storage
    - 1-2 small Stockly app machines — ~$0.30 prorated
    - Bandwidth — $0 (under the 100 GB/mo free tier)
  Scaling expectation: ~$5-10/mo at 10 paying merchants, ~$30-50/mo at
  100. Confirmed Stockly continues working post-cleanup (/healthz 200,
  Prisma can query the DB).
- **Migrations**: still using `prisma db push`. Move to versioned migrations when there's customer data to protect (Sprint 5 or later).
- **Custom domain on Fly**: `fly certs create app.stockly.io` once domain registered.
- **Multi-region**: when EU merchants matter, `fly machine clone --region cdg` (Paris). One command.

---

## Pilot status

| # | Store | Status |
|---|---|---|
| 1 | Piro Jewelry (`piroaccessories.myshopify.com`) | B2B active for months. Stockly install pending merchant approval. |
| 2 | TBD | Not identified yet |
| 3 | TBD | Not identified yet |

The Adspubli onboarding service pitch (Barcelona-local white-glove) is in Sprint 4's onboarding wizard Step 3.

---

## Pointers to deeper docs

- [PROJECT.md](./PROJECT.md) — full plan, scope, market
- [ROADMAP.md](./ROADMAP.md) — 10-week sprint plan
- [CLAUDE.md](./CLAUDE.md) — AI conventions
- [docs/decisions/](./docs/decisions/) — all 10 ADRs (ADR-010 is the B2B pricing engine)
- [docs/architecture/b2b-pricing-deep-dive.md](./docs/architecture/b2b-pricing-deep-dive.md) — full engineering teardown of the pricing engine
- [docs/spec/b2b-customer-lifecycle.md](./docs/spec/b2b-customer-lifecycle.md)
- [docs/competitive/](./docs/competitive/) — competitor engineering teardowns. Currently: BSS B2B Solution (the largest direct competitor).
- [progress/2026-05-26-approve-flow-fix.md](./progress/2026-05-26-approve-flow-fix.md) — full journal of the day Stockly's checkout pricing was validated E2E for the first time

Memory files (loaded automatically in every Claude session):
- Index: `~/.claude/projects/-Users-aimac-Documents-Workspace-Clients-stockly/MEMORY.md`
- Key entries: `backend-choice-fly`, `shopify-remix-deploy-gotchas`, `b2b-customer-lifecycle`, `wholesale-pricing-composition`
