# Stockly — Roadmap

> **Status as of 2026-05-26:** Sprints 0-4 are **complete and shipped**
> to production on Fly.io. The deliverable lists below for those
> sprints are kept as historical reference, not as an active plan.
> For the current operational state see [HANDOFF.md](./HANDOFF.md).
> For the active P0/P1 queue see [tasks/current.md](./tasks/current.md).
> Sprints 5-10 remain the forward plan; treat them as the source of
> truth for upcoming work.

**Original timeline:** 10 weeks to MVP launch
**Start:** May 20, 2026
**Original target MVP launch:** August 2026
**Cadence:** 1-week sprints (some 2-week for heavier work)
**Stack pivot during execution:** Vercel + Supabase → Fly.io + Fly
Managed Postgres (Sprint 4, documented in [ADR-009](./docs/decisions/ADR-009-backend-fly-io.md)).
The pre-pivot Supabase/Vercel deliverables below should be read as
"the original plan we executed against, then adjusted."

---

## Sprint 0 — Foundation (Week 1)

**Goal:** Project setup, dev environment, Shopify Partner account ready.

### Deliverables
- [x] Repo created at `/Users/aimac/Documents/Workspace/Clients/stockly/`
- [x] GitHub private repo
- [x] PROJECT.md + README.md + CLAUDE.md
- [ ] Shopify Partner account: app shell created (Stockly)
- [ ] Remix + TypeScript scaffold (`npm create @shopify/app@latest`)
- [ ] Supabase project + Postgres schema v0 (3 tables: `shops`, `settings`, `tiers`)
- [ ] Vercel project linked to repo, auto-deploy on `main`
- [ ] OAuth flow tested on dev store
- [ ] App Bridge embedded admin loads on dev store

### Exit criteria
- I can install Stockly on a dev store, see an empty Polaris admin page, and the DB receives the shop record on install.

---

## Sprint 1 — Quick Order Form MVP (Weeks 2-3)

**Goal:** Wholesale buyer can load a table of all products and add quantities in bulk.

### Deliverables
- [ ] Theme App Extension: `quick-order-form` block
- [ ] Storefront API integration: fetch products + variants + per-customer prices
- [ ] Table UI (Liquid + Web Component): columns = image, title, variant, price (tier-aware), qty input, total
- [ ] "Add all to cart" action (Storefront API `cartLinesAdd`)
- [ ] Customer tag gate: only visible to customers tagged `wholesale`
- [ ] Search/filter (client-side, by title/SKU)

### Exit criteria
- A wholesale-tagged customer on Piro can open `/pages/wholesale-order` and add 30+ SKUs to cart in under 60 seconds, with B2B prices applied.

---

## Sprint 2 — Volume Pricing Display + B2B Lifecycle Foundation (Weeks 4-5)

**Goal:** (1) Wholesalers see tier pricing in real-time as quantity changes. (2) Lay the foundation for the configurable B2B customer lifecycle (see [ADR-004](./docs/decisions/ADR-004-first-purchase-qualifier.md) and [spec](./docs/spec/b2b-customer-lifecycle.md)).

### Volume Pricing deliverables
- [ ] Tier ladder displayed on Quick Order Form (Alibaba-style, top of table)
- [ ] Per-row tier indicator when active ("-10% applied")
- [ ] Next-tier nudge ("Add 3 more to unlock -10%")
- [ ] Live recalculation already works (Sprint 1); add per-unit effective price display

### B2B Lifecycle deliverables
- [ ] DB migration: add FPQ fields to `Shop` (approvalRequired, fpqMode, fpqAmount, fpqQuantity, fpqCombinedLogic, postQualificationMOQ, fpqCurrency)
- [ ] DB migration: extend `WholesaleCustomer` (approvalStatus, approvedAt/By, qualifiedAt, qualifyingOrderId/Amount, rejectionReason)
- [ ] DB migration: new `WholesaleApplication` model
- [ ] Update App Proxy response to include `customerState` + `fpq` object
- [ ] Update Quick Order Form to respect 5 states (visitor / pending / approved_pre_fpq / qualified / rejected)

### Exit criteria
- Tier ladder visible on storefront. Customer in `approved_pre_fpq` sees FPQ progress banner. Customer in `qualified` buys freely. All states resolve correctly.

---

## Sprint 2.5 — Wholesale Baseline % + Tier Aggregation (Week 4 tail)

**Goal:** Add (1) the universal wholesale discount layer beneath volume tiers, and (2) cart-wide aggregation mode for tiers. See [ADR-006](./docs/decisions/ADR-006-wholesale-baseline-and-product-panel.md) and [ADR-007](./docs/decisions/ADR-007-tier-aggregation-cart-vs-line.md).

### Wholesale Baseline deliverables
- [ ] Prisma migration: `Shop.wholesaleBaselinePct Int @default(0)`
- [ ] App Proxy response includes `shop.wholesaleBaselinePct`
- [ ] Quick Order Form JS: compose `baseline × tier` multiplicatively
- [ ] Discount Function sync: include baseline in metafield payload
- [ ] Discount Function `run.ts`: emit composed % per line (not raw tier %)
- [ ] Admin: `/app/settings/pricing` with a number input for baseline
- [ ] Unit tests for composition math (multiplicative, never additive)

### Tier Aggregation deliverables
- [ ] Prisma migration: `Tier.aggregation String @default("per_line")`
- [ ] App Proxy response includes `aggregation` per tier
- [ ] Discount Function `run.ts`: cart-wide qty summing for `cart_total` tiers; per-line for `per_line` tiers
- [ ] Sync service: include `aggregation` in metafield JSON payload
- [ ] Admin tier create/edit form: add aggregation select (per_line / cart_total)
- [ ] Unit tests covering both modes

### Exit criteria
- Merchant sets `wholesaleBaselinePct = 65` in admin.
- Wholesale customer sees a €749,95 product priced at €262,48 in the QO Form (€749,95 × 0.35).
- At qty 10 with a 10% tier (per_line), they see €236,23 (€262,48 × 0.90).
- Cart and checkout show the same €236,23 thanks to the Discount Function.
- A merchant configures a cart-wide tier "Assortment 12 (-10%)" with `aggregation: cart_total`.
- Customer with 5 belts + 3 rings + 4 scarves (12 mixed units total) gets the -10% on every line — cart and checkout reflect it correctly.

---

## Sprint 3 — Wholesale Product Panel + Branded Cart (Week 5-6)

**Goal:** (1) Build the per-product wholesale panel (Alibaba-style variant matrix). (2) Polish the cart for B2B context. See [ADR-006](./docs/decisions/ADR-006-wholesale-baseline-and-product-panel.md) for the panel.

### Wholesale Product Panel deliverables
- [ ] New Theme App Extension: `wholesale-product-panel` (`section` placement on product templates)
- [ ] Visibility: renders only for wholesale-approved customers (Liquid + JS gate)
- [ ] Liquid: variant matrix (one row per variant) + tier ladder + bulk total + Add bulk to cart
- [ ] Web Component: shares hydration logic with Quick Order Form (extract shared module)
- [ ] CSS theme-native with branding variables (premium feel, not Alibaba red)
- [ ] Block schema: heading, "not eligible" copy, layout choices

### Branded Cart deliverables (smaller now — Discount Function already handles discount math)
- [ ] Theme App Extension: cart override (drawer or page mode)
- [ ] Brand customization: colors, fonts, copy (from admin)
- [ ] Tier upsell banner ("add 50 more to unlock 10% off")
- [ ] Order minimum (€/$ threshold) display
- [ ] Empty state: branded, not default Shopify

### Exit criteria
- Wholesale customer browses a product page on Piro → sees the Wholesale Product Panel above the retail UI with variant matrix + tier ladder + bulk total
- Bulk add to cart works; discount applies via Discount Function
- Cart page on Piro looks 100% on-brand

---

## Sprint 4 — Admin UI + B2B Model Configuration (Weeks 6-7)

**Goal:** Store owner can configure everything without touching code, INCLUDING the full B2B customer lifecycle.

### Deliverables
- [ ] Polaris admin: dashboard page (overview)
- [ ] Settings → Branding (colors, fonts, logo upload — Vercel Blob)
- [ ] Settings → Tiers manager: CRUD with tier shape preview ("Forma A/B/C" + breakpoint math)
- [ ] Settings → Copy manager: edit customer-facing strings per state
- [ ] Settings → B2B Model: preset selector (Premium Boutique, Artisan Wholesale, Aggressive Volume, Flexible Entry, Relationship-based, Self-serve) + custom config form
- [ ] `/app/customers` — list with state filter (visitor/pending/approved_pre_fpq/qualified/rejected)
- [ ] `/app/customers/applications` — applications review queue (approve/reject with optional reason)
- [ ] `/app/customers/:id` — detail page with manual override of qualification
- [ ] Preview mode: simulate "if customer orders X amount with Y units, they become Z state"

### Exit criteria
- Store owner can select "Premium Boutique" preset → tier set to 10% @ qty 10 → edit a copy string → upload a logo → and see all of it on the storefront within 10 seconds.
- Owner can approve a pending application from the queue and the customer is immediately promoted to `approved_pre_fpq`.

---

## Sprint 5 — Production Migration + Testing & Beta (Week 8)

**Goal:** Stabilize on real store (Piro), migrate from SQLite to Vercel Postgres, fix bugs, polish.

### Production infra deliverables (per [ADR-005](./docs/decisions/ADR-005-backend-choice.md))
- [ ] Provision Vercel Pro project + Vercel Postgres + Vercel Blob
- [ ] Configure Resend for transactional email (welcome, approval notifications, qualifying purchase celebration)
- [ ] Wire Sentry for error tracking (free tier)
- [ ] Migrate Prisma schema: SQLite → PostgreSQL (drop SQLite migration, fresh PG migration)
- [ ] Adapt monetary fields to `Decimal` for precision
- [ ] Deploy `main` to Vercel production, verify smoke tests
- [ ] Set up Vercel Cron for reconciliation job (FPQ qualification scan)

### Webhook handler deliverables
- [ ] Shopify webhook `orders/paid` handler with HMAC verification
- [ ] Promotion logic: detect qualifying purchase, update `qualifiedAt`
- [ ] Reconciliation cron: scan recent orders for unqualified customers (safety net)

### Testing deliverables
- [ ] Vitest coverage >50% on business logic (resolveTier already done in Sprint 1; add FPQ resolution, eligibility algorithm)
- [ ] Playwright E2E: install → configure preset → application submit → approval → qualifying order → free buying
- [ ] Performance audit (Lighthouse on storefront: >85)
- [ ] Bug triage + fix sprint
- [ ] Documentation: user guide + setup video

### Piro beta deliverables
- [ ] Install on production Piro (`piroaccessories.myshopify.com`)
- [ ] Migration plan: existing Piro wholesale flow → Stockly's Premium Boutique preset

### Exit criteria
- Stockly runs on Vercel + Vercel Postgres in production
- Piro Jewelry runs Stockly in production for 7 days with zero critical bugs
- Owner can demo it without my help

---

## Sprint 6 — Launch Phase 1 (Week 9)

**Goal:** Three pilot clients live.

### Deliverables
- [ ] Onboard pilot client #2 (TBD)
- [ ] Onboard pilot client #3 (TBD)
- [ ] Contract templates (custom-app pricing $4-5k upfront + $300-500/mo)
- [ ] Support workflow (email + 1 weekly call per pilot)
- [ ] Internal: case study draft for Piro

### Exit criteria
- 3 stores actively using Stockly. First MRR collected ($900-1,500/mo).

---

## Sprint 7 — App Store Prep (Week 10)

**Goal:** Submission-ready listing for Shopify App Store.

### Deliverables
- [ ] App Store listing copy (description, key benefits, screenshots)
- [ ] 5+ screenshots (admin + storefront)
- [ ] 60-second demo video
- [ ] Privacy policy + terms of service
- [ ] GDPR webhooks (`customers/data_request`, `customers/redact`, `shop/redact`)
- [ ] Pricing tiers configured (Starter $39, Growth $79, Plus $149)
- [ ] Submit to Shopify App Store review

### Exit criteria
- App submitted. Now waiting on Shopify review (typically 5-15 business days).

---

## Post-Launch (Months 4+)

### Phase 2 features (priority order)
1. Contextual B2B upsells engine ("frequently bought together at this tier")
2. Customer-specific catalogs (workaround layer for non-Plus stores)
3. Quote system (Shopify Draft Orders)
4. Net 30/60 terms display
5. Reorder from order history
6. Analytics dashboard (orders, AOV, top SKUs, tier conversion)
7. Excel/CSV bulk import

### Growth initiatives
- [ ] Shopify App Store SEO optimization
- [ ] Content marketing: "Wholesale on Shopify Basic" guide series
- [ ] Partner with 2-3 Shopify dev agencies for referrals
- [ ] Paid listing promotion (Month 6)
- [ ] First case study published (Piro)

---

## Definition of Done (every sprint)

A sprint is DONE when:
1. All P0 deliverables shipped
2. Code merged to `main`
3. Deployed to Vercel production
4. Tested on Piro dev store (or production if applicable)
5. Documentation updated
6. Sprint review note added to `docs/sprints/sprint-N.md`

---

## Risks & blockers (per-sprint)

| Sprint | Top risk | Mitigation |
|---|---|---|
| 1 | Storefront API price-per-customer complexity | Spike upfront, fallback to Liquid pricing |
| 2 | Tier UX on mobile | Mobile-first design from day 1 |
| 3 | Theme conflicts on existing themes | Test on 3 popular themes (Dawn, Ella, Horizon) |
| 4 | Polaris React learning curve | Use Shopify CLI templates as base |
| 5 | Real-world edge cases on Piro | Daily standup with Heriberto during beta |
| 7 | App Store rejection | Pre-review checklist + Shopify Partner support |
