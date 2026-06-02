# HANDOFF — Resume work hands-off

> Read this first if you're starting a fresh session on Stockly.
> Single source of truth for current state + resume instructions.

**Last updated:** 2026-06-02 (later) — **Storefront premium Phase 1 + Phase 4 SHIPPED TO CODE, ⏳ PRE-DEPLOY** (ADR-015, `docs/design/storefront-premium-plan.md`; `progress/2026-06-02-storefront-premium-phase1-phase4.md`). Killed the "Frankenstein": the `--sk-*` token set now lives ONCE in a shared `extensions/quick-order-form/assets/stockly-base.css` (Phase 1, declared on a 4-host selector so the accent precedence chain still sees per-host inline overrides), loaded by each block's `.liquid` via `{{ 'stockly-base.css' | asset_url | stylesheet_tag }}`. The other 3 storefront blocks re-skinned onto it (Phase 4): `fpq-banner.css` + `wholesale-product-panel.css` pure re-skins (classes + `data-stockly-*` hooks + block JS untouched); `registration-form.css` light-touch — its `--rf-color-*` RUNTIME CONTRACT (injected by `registration-form.js` from the admin appearance JSON) preserved, only its *defaults* now derive from `--sk-*` (submit button goes bronze by default; merchant override still wins). Added shared `--sk-success*`/`--sk-danger*` semantic tokens. Text anchored to px (theme-proof). `verify.sh` green. CSS+Liquid only → needs `npx shopify app deploy` ONLY (NO `fly deploy`); revenue path untouched. **⏳ NOT deployed yet — pending Jonatan go + visual confirm (product page panel, cart FPQ banner, registration page).** Prior 2026-06-02: **QOF merchant Appearance knobs LIVE** (Shopify `stockly-30`, ADR-015). The Quick Order Form theme-editor panel now has an **"Appearance"** group with three opinionated knobs: **accent color** (precedence chain: block setting → App Proxy branding → bronze fallback, so a color set in the editor wins over shop branding), **density** (comfortable/compact) and **text size** (small/medium/large). Emitted as inline CSS custom properties (`--sk-accent-theme`, `--sk-pad`, `--sk-cell-pad-y`, `--sk-text-base`) on the host; fixed steps only, so the merchant can't break the design. Pure CSS+Liquid — `data-stockly-*` contract + pricing JS untouched → `shopify app deploy` only, NO `fly deploy`. `verify.sh` green. ⏳ Pending Jonatan visual confirm in dev store (open the QOF block in the theme editor, expand Appearance). Prior 2026-06-01: **Quick Order Form premium re-skin LIVE** (ADR-015, Shopify `stockly-29`). The QOF storefront block moved to the canonical `--sk-*` premium token set (Stockly's own type scale / palette / shadows, NOT theme-inherited) + a REAL mobile **card** layout (was a shrinking table). Pure re-skin: every `.stockly-qo__*` class and `data-stockly-*` JS hook preserved, pricing/cart JS untouched; validated visually (desktop + 390px) on real block markup before deploy. CSS+liquid only → `shopify app deploy`, NO `fly deploy`. Design direction decided with Jonatan: **premium opinionated** (few merchant knobs, can't be made ugly) — see `docs/decisions/ADR-015-storefront-design-premium.md` + `docs/design/storefront-premium-plan.md` (phases 1,3,4,5 pending). **⏳ Pending Jonatan visual confirm in dev store.** Prior same-day: RF editor **Live preview now renders inside the App Bridge max modal** (was blank): `chrome="modal"` swaps Polaris `<Layout>` for an explicit 2-col CSS grid; `chrome="page"` unchanged. LIVE Fly v66 (admin-UI only). Read-only RESCUE AUDIT still open (see `tasks/current.md` + `progress/2026-05-29-rescue-deep-read-and-interview.md`)
**Last commit:** `feat(storefront): shared --sk-* base + premium re-skin of all blocks` (Phase 1 + Phase 4; CSS+Liquid only, PRE-DEPLOY — hash filled in at the LIVE doc commit). Prior `11c91b2` feat(quick-order-form): merchant Appearance knobs in theme editor (accent/density/text size). Prior `db61ec5` QOF premium re-skin; `165766d` fix(registration-form): explicit grid split so live preview shows in max modal; `f8225a0` anchored storefront form font sizes (theme-proof).
**GitHub:** https://github.com/creativedesignseo/stockly
**Production URL:** https://stockly-lustrous-forest-4364.fly.dev
**Fly version:** `v66` (manual `fly deploy --remote-only` 2026-06-01 — RF editor `chrome="modal"` split is now an explicit 2-col CSS grid (`gridTemplateColumns: minmax(320px,1fr) minmax(0,2fr)`) so the Live preview pane renders inside the App Bridge max modal instead of blank; `chrome="page"` byte-for-byte unchanged. Admin-UI only — no schema/extension/config change, so NO `shopify app deploy`. `release_command` prisma db push ran as a no-op). `v65` (manual `fly deploy` 2026-05-30 — `proxy.apply.tsx` cut over to schema-driven validation as AUTHORITATIVE: resolves the exact form the customer saw via its shortcode (`resolveStorefrontForm`) and gates on `validateResponses` against ITS definition; the legacy `validateApplication` no longer hardcodes company-required. Storefront now POSTs `__shortcode`. Needed BOTH `fly deploy` AND `shopify app deploy` since it touches `extensions/`). `v64` inline field panels in the max modal; `v63` the max modal itself.
**⚠️ Deploy gotcha (2026-05-30):** a `v64` attempt FAILED at Docker build — `@shopify/cli@4.1.0` (a stray devDep bump) requires Node ≥22.12 but the Dockerfile pins Node 20, so `npm ci --include=dev` errored `notsup`. **`scripts/verify.sh` does NOT catch this** (local Node is ≥22; the engine check only bites in the Node-20 Docker build). Fixed by reverting to `@shopify/cli@3.94.3`. Lesson: keep devDep bumps off the deploy unless the Dockerfile's Node satisfies their `engines`. Prod was never affected (build failed before release).
**Prior:** `v62` (2026-05-29 — N-forms: admin LIST → editor; v61 had failed on the `prisma db push` release_command demanding `--accept-data-loss` to ADD a UNIQUE, resolved by pre-creating `RegistrationForm_shortCode_key` + pre-filling shortCode, then v62 deployed clean).
**Shopify app version:** `stockly-30` (QOF "Appearance" knobs — block schema gained accent color + density + text size; `quick-order-form.liquid` builds an inline `--sk-*` style string from the settings, `quick-order-form.css` consumes `--sk-accent-theme`/`--sk-pad`/`--sk-cell-pad-y`/`--sk-text-base`. Pricing JS + `data-stockly-*` contract untouched). `stockly-29` (QOF premium re-skin — `quick-order-form.css` rewritten onto `--sk-*` tokens + real mobile card layout, ADR-015; `quick-order-form.liquid` gained `data-label` on sku/price/qty/total cells for the mobile labels. Pricing/cart JS untouched). `stockly-28` (storefront `registration-form.css` anchors its own base `font-size: 16px` + absolute-px text sizes, so it no longer inherits a theme's shrunk root — fixes 8.5px labels on `62.5%`-root themes. `stockly-27` made the JS POST `__shortcode`; `stockly-26` added the `form_shortcode` block setting. ⚠️ `registration-form.js` still >10 KB app-block threshold — non-blocking, trim later)
**Earlier 2026-05-29:** Fly v58 shipped the SaveBar fix `865e35d` (its 2026-05-28 push-deploy had failed on a release_command timeout); deploy is now gated to manual `workflow_dispatch`
**Deploy is now MANUAL:** `.github/workflows/fly-deploy.yml` is `workflow_dispatch` only. Push to main no longer ships to prod. Deploy with `gh workflow run fly-deploy.yml --ref main`. Storefront extension ships separately via `npx shopify app deploy`.

**Pricing areas (ADR-014):**
  - **Wholesale Pricing** `/app/pricing` — FLAT discount per rule (one value, no quantity). `Tier.kind='wholesale'`.
  - **Volume Pricing** `/app/volume-pricing` — multi-band quantity breaks. `Tier.kind='volume'`.
  - The Discount Function reads the same metafield and applies discounts identically regardless of kind. `kind` only filters the two admin lists.
  - 6 existing prod Tier rows back-filled to `kind='wholesale'` via the column default on `prisma db push`.
**Postgres:** `RegistrationForm` + `Application` tables added; legacy `WholesaleApplication` retained (dual-write for 48h soak before Phase 1G drops it)
**Reviewer pass 1 verdict:** NEEDS-CHANGES (3 CRITs + 5 SHOULDs + 2 NITs) → all addressed in fix commit `99c2905`
**`tsc --noEmit`** now part of `scripts/verify.sh` — 0 errors at HEAD (was 23 pre-existing)
**Public legal URLs (LIVE, DRAFT):**
  - https://stockly-lustrous-forest-4364.fly.dev/legal/privacy
  - https://stockly-lustrous-forest-4364.fly.dev/legal/terms

**Registration Form multi-form (LIVE 2026-05-29, Fly v62 / stockly-26):**
  - Model is now **N forms per shop** (was 1/shop). `RegistrationForm`:
    `shopId` no longer `@unique` (→ `@@index`); added `name`,
    `shortCode @unique` (cuid), `isDefault`.
  - **Admin**: `/app/registration-form` is now a LIST (IndexTable: Id /
    Name / Short Code chip / Status toggle / Created; All/Active/Draft
    tabs; "Add new" → TemplatePickerModal → creates a DRAFT → opens the
    editor). Default form cannot be deleted (server + UI guard).
  - **Editor opens in an App Bridge `variant="max"` modal (Fly v63,
    2026-05-30)** — full canvas, no admin nav rail, X to close; the
    modal's title bar owns Save/Discard. Rendered INLINE (same app
    context, not a nested `src` iframe) so the SaveBar, sub-modals and
    dirty tracking keep working. Editor body extracted to
    `app/components/registration-form/RegistrationFormEditor.tsx` with two
    chromes: `chrome="modal"` (the list opens it) and `chrome="page"` (the
    standalone deep-link route `/app/registration-form/$id`, back-compat).
    The list loader ships full `EditorState` per form so the modal renders
    with no round-trip.
  - **Storefront**: the `registration-form` theme block gained an
    optional `form_shortcode` setting. With a shortcode it serves that
    form; without one it serves the shop's active default (dual-serve,
    back-compat). Cross-shop isolation verified: `resolveStorefrontForm`
    filters by `shopId` AND `shortCode` (reviewer PASS + tests).
  - **Prod DB**: 1 existing row promoted in place — `name='Registration
    form'`, `shortCode='rfmpqd344201poil'`, `isDefault=true`,
    `status='draft'` (it was already draft pre-sprint; flip to active in
    the editor when you want the storefront to serve it).
  - Design system doc added: `docs/design-system.md` (canonical
    admin/storefront tokens + list→editor pattern).
  - **Pending validation by Jonatan (with your eyes):** open the admin
    list, create a 2nd form from a template, confirm it appears, edit it,
    then on the dev store paste its Short Code into a theme block and
    confirm the storefront renders THAT form (and a block with no
    shortcode still serves the default).

---

## TL;DR — current state

**Stockly is LIVE in production on Fly.io.**
- App: `stockly-lustrous-forest-4364` (region `iad`, us-east)
- DB: Fly Managed Postgres `stockly-db` (region `iad`)
- Shopify app version: `stockly-26` published, active (Protected Customer Data level_1 live). Backend on Fly `v62`.
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
                    │ Shopify (stockly-26)    │
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
npx --yes shopify app deploy --allow-updates --message "What changed"
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
