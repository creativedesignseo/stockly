# Stockly — Project Plan

**Document version:** 1.0
**Last updated:** May 20, 2026
**Owner:** Jonatan Montilla (Adspubli)

---

## 1. Executive Summary

**Stockly** is a Shopify App that delivers enterprise-grade B2B wholesale features (normally exclusive to Shopify Plus at $2,300/mo) to stores on Basic and Grow plans. Targeted at **premium luxury brands** that find existing wholesale apps too feature-heavy and visually generic.

**Why now:**
- Global B2B ecommerce: **$32.1T in 2025** (5x larger than B2C), growing 14.4% YoY
- Shopify B2B GMV: **+96% YoY growth**
- Shopify App Store: 11,905 apps, $1.5B paid to developers since launch
- Top wholesale apps (BSS, Bold) earn $300-500k/year but have UX complaints
- **Gap identified:** no app focuses on premium luxury brand aesthetic

**Why us:**
- Jonatan: Shopify Partner, direct experience deploying B2B for luxury brand (Piro Jewelry)
- Validated non-obvious assemblies of documented Shopify APIs (Discount Functions for tier-based B2B pricing on Basic/Grow; `marketUpdate` with `applicationLevel: ALL` for catalog-level segmentation when Shopify B2B Companies are enabled) that show deep API knowledge — full rationale in [ADR-010](./docs/decisions/ADR-010-b2b-pricing-engine-on-basic-plan.md) and [docs/architecture/b2b-pricing-deep-dive.md](./docs/architecture/b2b-pricing-deep-dive.md)
- Live pilot client (Piro) provides real-world validation
- Premium positioning differentiates from 8-10 existing competitors

---

## 2. Scope — MVP (v1.0)

### Core Features

| # | Feature | User Story | Priority |
|---|---|---|---|
| F1 | **Quick Order Form** | "As a wholesaler, I want to add 50 SKUs to cart in 30 seconds via a table view" | P0 |
| F2 | **Volume Pricing Display** | "As a wholesaler, I want to see tier pricing in real-time as I increase quantities" | P0 |
| F3 | **Branded Cart** | "As a wholesaler, I want a cart that matches the brand aesthetic, not generic" | P0 |
| F4 | **Admin Configuration UI** | "As a store owner, I want to configure tiers, messages, and branding without touching code" | P0 |
| F5 | **Custom Error Messages** | "As a wholesaler, I want clear branded messages when I don't meet minimums (not Shopify generic errors)" | P0 |

### Phase 2 Features (v1.5 – v2.0)

| # | Feature | Priority |
|---|---|---|
| F6 | Contextual B2B upsells ("add 50 more, unlock tier 2") | P1 |
| F7 | Customer-specific catalogs (workaround for Basic) | P1 |
| F8 | Quote system (draft orders) | P2 |
| F9 | Net 30/60 payment terms display | P2 |
| F10 | Reorder from order history | P2 |
| F11 | Analytics dashboard for store owner | P2 |
| F12 | Excel/CSV bulk import for orders | P3 |

### Out of Scope (for v1.0)

- Multi-currency support (handle via Shopify Markets)
- Multi-language i18n (English-only for v1)
- Mobile native apps (PWA-friendly web only)
- Custom payment integrations (use Shopify Payments)
- Inventory management (stay in Shopify's domain)

---

## 3. Target Market

### Primary Audience

**Premium Shopify Basic/Grow stores selling wholesale**, specifically:

- **Vertical:** Jewelry, beauty, fashion, home decor, gourmet food
- **Brand profile:** Cares about aesthetic, has 50-500 SKUs, $100k-2M annual revenue
- **B2B activity:** Receives 5-50 wholesale leads/month, currently manual workflow
- **Pain points they have:**
  - Existing B2B apps look generic / don't match brand
  - Shopify Plus is too expensive for their size
  - Manual catalog assignment per company is unsustainable
  - Generic Shopify error pages break the premium experience

### Secondary Audience (Phase 2)

- Shopify Plus stores looking for *lighter*, more branded B2B layer
- Agencies (like Adspubli) implementing for multiple clients

### Anti-personas (NOT our target)

- Stores with 1000+ SKUs (need enterprise complexity, go to BSS)
- Stores prioritizing lowest price (will go to $29 generic apps)
- Stores not concerned with branding (default Shopify is fine for them)

---

## 4. Competitive Landscape

### Direct Competitors

| App | Reviews | Rating | Pricing | Strength | Weakness |
|---|---|---|---|---|---|
| **BSS B2B Wholesale Solution** | 1,022 | 4.8★ | Free + paid | All-in-one features | Generic UI, complex setup |
| **B2B Wholesale Hub** | 673 | 4.7★ | From $39/mo | Net terms, quick order | Standard UI |
| **Wholesale Pricing Discount B2B** | popular | — | Variable | Flexibility, support | Setup complexity |
| **B2B:Wholesale Pricing Discount** | 898 | 4.9★ | Free + paid | Cost-effective | Limited advanced features |

### Our Differentiators

1. **Premium UX** — only app focused on luxury brand aesthetic
2. **Mobile-first** — competitors are desktop-first
3. **Fast** — Remix + edge functions vs slow legacy apps
4. **Branded errors** — replace ALL Shopify generic errors with custom messages
5. **Simple admin** — fewer features but pulidas, not "kitchen sink"
6. **Theme-native** — Online Store 2.0 + Horizon compatible from day 1

---

## 5. Tech Architecture (high-level)

```
┌─────────────────────────────────────────────────────────┐
│  SHOPIFY MERCHANT'S STORE                                │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  │
│  │ Storefront   │  │ Admin Panel   │  │ Webhooks     │  │
│  │ (theme ext)  │  │ (embedded)    │  │ (events)     │  │
│  └──────┬───────┘  └───────┬───────┘  └──────┬───────┘  │
└─────────┼──────────────────┼─────────────────┼──────────┘
          │                  │                 │
          ▼                  ▼                 ▼
┌─────────────────────────────────────────────────────────┐
│  STOCKLY APP                                             │
│                                                          │
│  Frontend (storefront extensions)                        │
│    └─ Liquid + Web Components + Theme App Extensions     │
│                                                          │
│  Backend / Admin                                         │
│    └─ Remix + TypeScript + App Bridge + Polaris          │
│                                                          │
│  Database                                                │
│    └─ PostgreSQL (Supabase free tier → paid at scale)    │
│                                                          │
│  Hosting                                                 │
│    └─ Vercel (free tier hasta 100k req/mes)              │
│                                                          │
│  APIs                                                    │
│    ├─ Shopify Admin GraphQL API                          │
│    │   (Orders, Customers, Companies, Products,          │
│    │    Catalogs, Markets)                               │
│    └─ Shopify Storefront API (precios per-customer)      │
└─────────────────────────────────────────────────────────┘
```

See [docs/04-tech-stack.md](./docs/04-tech-stack.md) for detailed decisions.

---

## 6. Roadmap Overview

| Sprint | Weeks | Focus | Deliverable |
|---|---|---|---|
| 0 | 1 | Foundation | Repo, Partner account, scaffold |
| 1 | 2-3 | Quick Order MVP | Bulk order table working in storefront |
| 2 | 4 | Volume Pricing | Dynamic tier display in product + cart |
| 3 | 5 | Cart Redesign | Sticky branded cart with totals |
| 4 | 6-7 | Admin UI | Polaris dashboard for store owner config |
| 5 | 8 | Testing & Beta | Install on Piro, bug fixing |
| 6 | 9 | Launch | Production deploy + 3 pilot stores live |
| 7 | 10 | App Store prep | Listing, screenshots, video, submit |

See [ROADMAP.md](./ROADMAP.md) for detailed sprint plans.

---

## 7. Business Model

### Phase 1: Custom App (Months 0-4)

```
Revenue:
  3 pilot clients × $4-5k upfront        =  $12-15k
  3 clients × $300-500/mo × 12 months    =  $14k/year recurring
  ─────────────────────────────────────
  Year 1 estimate                        =  $26-29k

Costs (Year 1):
  Shopify Partner Account                =  $0
  Hosting (Vercel + Supabase free tier)  =  $0
  Domain registration                    =  $15
  ─────────────────────────────────────
  Total costs Year 1                     =  ~$15
```

### Phase 2: Public App in Shopify App Store (Months 4+)

```
Pricing tiers:
  STARTER       $39/mo    (up to 100 wholesale orders/mo)
  GROWTH        $79/mo    (unlimited orders + analytics)
  PLUS          $149/mo   (white label + priority support)

Average ARPU target:  $60/mo

Conservative projection:
  Month 6:    10 clients   →   $600/mo
  Month 12:   60 clients   →   $3,600/mo
  Month 18:   150 clients  →   $9,000/mo
  Month 24:   300 clients  →   $18,000/mo  ($216k/year)

Optimistic projection:
  Month 24:   1,000 clients × $50/mo = $50,000/mo  ($600k/year)
```

### Shopify Revenue Share

- **First $1M/year:** 0% commission (you keep 100%)
- **Above $1M/year:** 15% commission on the overage only
- **Processing fee:** 2.9% on all transactions (payment networks)

---

## 8. Success Metrics

### Phase 1 KPIs (Month 4)

- ✅ 3 pilot clients deployed and active
- ✅ Cart conversion > 90% (no checkout errors)
- ✅ Quick Order form usage on >50% of B2B sessions
- ✅ Pilot clients report >50% time savings vs previous workflow

### Phase 2 KPIs (Month 12)

- 🎯 50+ paying customers in App Store
- 🎯 4.5★+ rating on App Store
- 🎯 MRR > $3,000
- 🎯 Churn < 5%/month
- 🎯 Customer support tickets < 30/month per 100 clients

### Long-term (Month 24)

- 🚀 200+ paying customers
- 🚀 MRR > $12,000
- 🚀 Featured in Shopify App Store (B2B category)
- 🚀 First case study published (Piro Jewelry success)

---

## 9. Risk Register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Shopify API breaking changes | Medium | High | Subscribe to changelog, automated tests, version pinning |
| Competitor copies our positioning | High | Medium | Move fast, build moat through community + content |
| MVP takes longer than 10 weeks | High | Medium | Conservative estimates, scope discipline |
| Low App Store discoverability | Medium | High | SEO of listing, paid promotion in Month 6 |
| Pilot client churn | Low | High | Strong onboarding, weekly check-ins |
| Burnout (solo founder) | Medium | High | Set sustainable pace, automate support |

---

## 10. Decisions Log

All major decisions are documented in `docs/decisions/` as Architecture Decision Records (ADRs):

- [ADR-001: Naming](./docs/decisions/ADR-001-naming.md) — Stockly chosen as working name
- [ADR-002: Framework](./docs/decisions/ADR-002-framework.md) — Remix over Next.js
- [ADR-003: Hosting](./docs/decisions/ADR-003-hosting.md) — Vercel + Supabase

---

## 11. Open Questions

- [ ] Final commercial name decision (defer to Month 3 when MVP is ready)
- [ ] Logo design (defer to Month 2, after MVP UX defined)
- [ ] Pilot client #2 and #3 identification
- [ ] Pricing tiers final structure (validate with pilot client interviews)
- [ ] App Store submission timeline (Month 9 vs Month 10)

---

**Next review:** End of Sprint 0
