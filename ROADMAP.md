# Stockly — Roadmap

**Timeline:** 10 weeks to MVP launch
**Start:** May 20, 2026
**Target MVP launch:** August 2026
**Cadence:** 1-week sprints (some 2-week for heavier work)

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

## Sprint 2 — Volume Pricing Display (Week 4)

**Goal:** Wholesalers see tier pricing in real-time as quantity changes.

### Deliverables
- [ ] Admin UI: define tiers per product/collection ("buy 10+, get 5% off; 50+, 10% off")
- [ ] DB schema: `tiers` table (shop_id, scope, min_qty, discount_pct)
- [ ] Storefront block: tier table on product page
- [ ] Live recalculation in Quick Order Form when qty changes
- [ ] "Add X more to unlock tier 2" contextual hint

### Exit criteria
- On product page, wholesaler types qty=25 and sees current tier highlighted + next-tier nudge.

---

## Sprint 3 — Branded Cart (Week 5)

**Goal:** Replace generic cart with a branded, B2B-aware cart.

### Deliverables
- [ ] Theme App Extension: cart override (drawer or page mode)
- [ ] Brand customization: colors, fonts, copy (from admin)
- [ ] Custom error messages (replace Shopify's "12 minimum" generic page)
- [ ] Tier upsell banner ("add 50 more to unlock 10% off")
- [ ] Order minimum (€/$ threshold) display
- [ ] Empty state: branded, not default Shopify

### Exit criteria
- Cart on Piro looks 100% on-brand. When wholesaler doesn't meet 12-unit minimum, they see "Add X more — minimum 12 pieces" in Cormorant Garamond + rose, not the Shopify generic page.

---

## Sprint 4 — Admin UI (Weeks 6-7)

**Goal:** Store owner can configure everything without touching code.

### Deliverables
- [ ] Polaris admin: dashboard page (overview)
- [ ] Settings: branding (colors, fonts, logo upload)
- [ ] Tiers manager: CRUD with bulk apply
- [ ] Copy manager: edit all customer-facing messages (errors, hints, empty states)
- [ ] Customer eligibility: tag-based + Company-based filters
- [ ] Preview mode: see storefront with changes before publish

### Exit criteria
- Store owner can change a tier discount + an error message + brand color, click Save, and see it reflected in the storefront within 10 seconds.

---

## Sprint 5 — Testing & Beta (Week 8)

**Goal:** Stabilize on real store (Piro), fix bugs, polish.

### Deliverables
- [ ] Install on production Piro (`piroaccessories.myshopify.com`)
- [ ] Migration plan: existing wholesale flow → Stockly
- [ ] Vitest unit tests (>50% coverage on business logic)
- [ ] Playwright E2E: install → configure → wholesale customer order flow
- [ ] Performance audit (Lighthouse on storefront: >85)
- [ ] Bug triage + fix sprint
- [ ] Documentation: user guide + setup video

### Exit criteria
- Piro Jewelry runs Stockly in production for 7 days with zero critical bugs. Owner can demo it without my help.

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
