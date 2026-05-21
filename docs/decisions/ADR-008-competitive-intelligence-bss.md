# ADR-008 — Competitive Intelligence: BSS B2B Solution

**Date:** 2026-05-21
**Status:** Accepted (reference doc, no architectural decision)
**Deciders:** Jonatan Montilla (working session 2026-05-21)
**Sources:** App Store listing, official docs, reviews, direct admin observation (live in dev store)

---

## Why this exists

Stockly competes against BSS B2B Solution head-on. BSS is the dominant Shopify B2B app with 1,023 reviews at 4.8/5. Before sinking more sprints into Stockly, we mapped BSS's surface area to see what they do, what they don't, and where Stockly should compete vs. differentiate. This ADR captures that map so future sessions don't re-discover.

## BSS at a glance

| Metric | Value |
|---|---|
| Reviews on App Store | 1,023 |
| Average rating | 4.8/5 (94% are 5★) |
| Pricing | Free (dev) · $25/mo Essential · $50/mo Advanced · $100/mo Platinum |
| Trial | 14 days free across all tiers |
| Vertical reach (from reviews) | Wholesale supply, fragrance (Spain!), crystals, cleaning, design |
| Onboarding | 4-step wizard with merchant segmentation |
| Compatibility | "Shopify store compatibility verification" required pre-install |
| Common complaint | "UI not intuitive" (recurring in reviews) |

The Spain merchant (Orient Fragrance Wholesale) in the review list specifically valued "hands-on setup assistance rather than generic tutorials" — that's a wedge Adspubli can exploit being Barcelona-local.

## Feature gap matrix

### Pricing & Discounts

| Feature | BSS | Stockly today | Stockly roadmap |
|---|---|---|---|
| Volume tiers (qty thresholds) | ✅ | ✅ | — |
| Cart-total aggregation | unclear | ✅ ADR-007 | — |
| Custom price per customer group | ✅ | partial (via tag) | Sprint 4 |
| Multiplicative baseline × tier | ❌ (additive) | ✅ ADR-006 | — |
| Variant-level pricing | ✅ | ❌ | Sprint 4-5 |
| Discount codes integration | ✅ | ❌ | Sprint 5 |
| Auto-repricing / price matching | ✅ | ❌ | Phase 2 |
| Bulk pricing import (CSV) | ✅ Platinum | ❌ | Sprint 5 |

### Customer lifecycle

| Feature | BSS | Stockly today | Stockly roadmap |
|---|---|---|---|
| B2B registration form | ✅ | ❌ | Sprint 4 (priority) |
| Approval workflow (pending/approved/rejected) | ✅ | schema yes, UI no | Sprint 4 (priority) |
| Auto-tagging on approval | ✅ | ❌ | Sprint 4 |
| Multi-step conditional forms | ✅ Platinum | ❌ | Sprint 6 |
| First-Purchase Qualifier | ❌ | ✅ ADR-004 (Stockly unique) | — |
| Net 30/60/90 terms | ✅ Advanced | ❌ | Phase 2 |

### Order controls

| Feature | BSS | Stockly today | Stockly roadmap |
|---|---|---|---|
| Min order value | ✅ Essential | ✅ (FPQ amount) | — |
| Min order quantity | ✅ Essential | ✅ (FPQ qty + postQual MOQ) | — |
| Max order limits | ✅ | ❌ | Sprint 5 |
| Qty increments (sets of 3, 6, 12) | ✅ Essential | ❌ | Sprint 5 |
| Manual orders by staff | ✅ Advanced | ❌ | Phase 2 |
| Custom fields on orders | ✅ Advanced | ❌ | Phase 2 |
| Extra fees (flat or %) | ✅ Advanced | ❌ | Phase 2 |
| Shipping rate rules | ✅ Advanced | Shopify native | — |

### Storefront UX

| Feature | BSS | Stockly today | Stockly roadmap |
|---|---|---|---|
| Bulk order page | basic | ✅ Quick Order Form (Sprint 1) | — |
| Wholesale Product Panel (Alibaba-style) | ❌ | ❌ | Sprint 3 — **Stockly unique** |
| Cart FPQ banner | ❌ | ✅ (deploy in progress) | — |
| Tier ladder visible | depends on theme | ✅ | — |
| Next-tier nudge | ❌ | ✅ | — |
| Strikethrough on cart/checkout | ✅ | ✅ | — |
| Onboarding wizard (admin) | ✅ 4-step | ❌ | Sprint 4 (priority) |

### Integrations

| Feature | BSS | Stockly today | Stockly roadmap |
|---|---|---|---|
| Public APIs | ✅ Platinum | ❌ | Phase 2 |
| ERP sync | ✅ Platinum | ❌ | Phase 2 |
| Shopify POS | ✅ | ❌ | Phase 2 |
| Bulk import/export pricing | ✅ Platinum | ❌ | Sprint 5 |
| Tax controls (VAT exempt) | ✅ Advanced | Shopify native | — |

## Where Stockly already wins

1. **Multiplicative pricing composition** — model is cleaner than BSS's additive approach. Math can never exceed 100% off; merchant doesn't need a calculator to predict outcomes.
2. **FPQ with qualified-once-then-free** — specific to Piro-style "first order is the commitment, then free buying." BSS doesn't have this lifecycle native; closest is order minimums on every order.
3. **Tier aggregation `per_line` vs `cart_total`** — flexibility BSS doesn't expose cleanly.
4. **Wholesale Product Panel concept** — Alibaba-style on individual product pages. BSS doesn't have this.
5. **Premium UX positioning** — BSS reviews repeat "UI not intuitive." Stockly's luxury-brand-Polaris angle is defensible.

## Where Stockly needs to catch up (priority order)

### P0 — Required to compete (target Sprint 4)

1. **B2B Registration form** — biggest gap. Without it, merchant has to tag wholesale customers manually in Shopify admin. BSS makes this a first-class flow.
2. **Approval queue UI** at `/app/customers/applications` — schema exists, only UI is missing.
3. **Variant-level pricing override** — required for brands with statement pieces.
4. **Auto-tag on approval** — write back to Shopify Customer.tags when the merchant approves. Lets the rest of the storefront react (theme filters, etc.).
5. **Admin onboarding wizard** — segments the merchant ("Are you Wholesalers / Manufacturer / Retailer-with-B2B?") and pre-fills config presets. BSS does 4 steps; we can do 3 with the existing presets from ADR-004.

### P1 — Important (target Sprint 5)

6. **Qty increments** (sets of 3, 6, 12) — common wholesale request, BSS has it in Essential ($25).
7. **Max order limits** — fraud + abuse control.
8. **Bulk import/export tier config** — for shops with 50+ tiers.
9. **Multi-language storefront copy** — Stockly's reach is global (English-first product); merchants want translations.

### P2 — Differentiation for Phase 2

10. **Net 30/60/90 payment terms** — big differentiator at the $50+/mo tier. BSS gates this behind Advanced.
11. **Quote system** (Shopify Draft Orders) — sales reps creating quotes.
12. **Manual orders by staff** — phone orders, sales rep workflow.
13. **Custom fields on orders** — PO numbers, project codes, account numbers.
14. **Public APIs** — ERP sync. Differentiator at the Platinum/$100 tier.

## Pricing positioning

```
BSS:                   Stockly target:
─────────────          ─────────────────
$25  Essential         $39  Starter   (+$14)
$50  Advanced          $79  Growth   (+$29)
$100 Platinum          $149 Plus     (+$49)
```

We sit $14–$49/mo above BSS at each tier. Justifications that must be visible in the App Store listing and marketing:

1. **Premium UX** — proven via screenshots showing the Polaris-native admin and the Quick Order Form's clean storefront treatment.
2. **Stockly-unique features**: FPQ qualified-once model, Wholesale Product Panel, multiplicative pricing math.
3. **White-glove onboarding** — Adspubli (Jonatan, Barcelona) personally onboards every pilot. This is the wedge against BSS's generic experience.
4. **Luxury / premium brand vertical positioning** — BSS targets "wholesale supply" generically. Stockly targets jewelry, fashion, accessories, premium goods.

## Patterns Stockly should adopt (legitimate inspiration, not copy)

These are UX patterns observed in BSS's admin that match industry-standard B2B app conventions. We can adopt them without crossing legal lines.

1. **4-step admin onboarding wizard** with progress indicator at the top.
2. **Merchant segmentation question** in step 1 ("Where are you in your B2B journey?" + "What's your business model?") — drives preset recommendations.
3. **"Book a Demo" as a wizard step** — Adspubli can offer in-person Barcelona meetings as Stockly's setup help.
4. **"Built for Shopify B2B merchants" badge** at the top — leverages Shopify Plus B2B marketing if we go after Plus stores too.
5. **In-flow plan upgrade** — Stockly upgrades happen inside the admin, not on a separate billing page.

## Recommended ROADMAP additions

Concrete edits to make in `ROADMAP.md` based on this research:

### Sprint 4 (Admin UI) — add these deliverables

- **B2B Registration form** (Theme App Extension block + admin queue route)
- **Approval queue UI** at `/app/customers/applications` (we have the route stub from earlier)
- **Variant-level pricing override** (extend Tier with `variantId` scope option)
- **Auto-tag on approval** (writes to Shopify customer tags via admin GraphQL)
- **Onboarding wizard** for the merchant (3 steps: segment → preset → first action)

### Sprint 5 (Testing + Beta) — add these deliverables

- **Qty increments** on tier config (e.g., "must be in multiples of 6")
- **Max order limits** on Shop config (per-order cap)
- **Bulk import/export tiers** (CSV)
- **i18n storefront copy** (Spanish + French + Italian first wave)

### Phase 2 (post-launch)

- Net 30/60/90
- Quote system (Draft Orders)
- Manual orders by staff
- Custom fields on orders
- Public APIs

## Limitations of this analysis

- Direct exploration of BSS's pricing-rules and customer-groups admin UIs was blocked by their onboarding wizard. Going past would have modified the merchant's BSS account state; not done.
- Pricing comparison assumes Stockly's planned tiers; final pricing will require A/B testing with pilot clients.
- BSS may have undocumented features. The matrix is based on their public listing + docs + reviews.

## Revisit trigger

Revisit this ADR if:
- A new major competitor enters (e.g., Shopify launches a native Plus-replacement)
- BSS releases new features that change the gap analysis
- Pricing benchmarks shift (any competitor moves their tiers ±20%)
- A pilot client cites a specific BSS feature as blocking
