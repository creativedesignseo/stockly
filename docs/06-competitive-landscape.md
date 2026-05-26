# 06 — Competitive Landscape

## Market map (Shopify B2B/Wholesale apps)

### Tier 1: Established leaders

| App | Reviews | Rating | Starting price | Key strength |
|---|---|---|---|---|
| BSS B2B Wholesale Solution | 1,022 | 4.8★ | Free + paid tiers | Most features, all-in-one |
| B2B:Wholesale Pricing Discount | 898 | 4.9★ | Free + paid | Cost-effective, simple |
| B2B Wholesale Hub | 673 | 4.7★ | $39/mo | Net terms + quick order |
| Wholesale Pricing Discount | popular | — | Variable | Flexible discount engine |
| Bold B2B/Wholesale | 500+ | 4.5★ | $9.99+ | Long-standing, recognized brand |

### Tier 2: Newer/niche

| App | Niche |
|---|---|
| SparkLayer | Mid-market B2B, premium positioning (closest to us, but enterprise-focused) |
| Wholesale Helper | Bulk SKU import |
| B2B/Wholesale Solution by ProductWind | Net terms specialist |
| Wholesale Now | Quick install, simple tiers |

### Tier 3: Free or trial-only

Many small apps offering wholesale pricing as a feature inside a broader app (discount apps, customer apps, etc.). Generally lower quality, low retention.

---

## Detailed competitor analysis

### BSS B2B Wholesale Solution
- **Strengths:** Feature breadth (every B2B feature you can think of), strong support, mature codebase
- **Weaknesses:** Generic Polaris admin UI, generic storefront block styling, steep learning curve, "kitchen sink" UX
- **Reviews mention:** "Powerful but overwhelming," "support is good but I shouldn't need it for basic things"
- **Pricing:** Free starter → up to $130/mo for top tier

### B2B Wholesale Hub
- **Strengths:** Clean modern UI for the category, good docs, recognizable brand
- **Weaknesses:** Still desktop-first, not designed for premium brands, limited theming
- **Reviews mention:** "Good for the price," "wish it matched our theme better"
- **Pricing:** From $39/mo

### Bold B2B/Wholesale
- **Strengths:** Legacy customers, embedded in ecosystem since 2015
- **Weaknesses:** Aging UX, slow load times, no mobile-first redesign yet
- **Reviews mention:** "Works but feels dated," "support is hit or miss"
- **Pricing:** From $9.99/mo

### SparkLayer (our closest competitor in positioning)
- **Strengths:** Premium positioning, beautiful design, full B2B platform
- **Weaknesses:** Expensive ($199+/mo), targets mid-market not SMB, complex setup
- **Reviews mention:** "Beautiful but pricey," "more than we needed for our size"
- **Pricing:** From $199/mo
- **Why we still have a gap:** They target Shopify Plus mid-market. We target Basic/Grow SMB.

---

## Our position in the market

```
                  ┌─────────────────────────────────────┐
                  │             PREMIUM                  │
                  │                                       │
                  │           SparkLayer ●                │
                  │          ($199+/mo,                   │
                  │           mid-market)                 │
                  │                                       │
                  │                                       │
                  │     ★ STOCKLY ($39-149)              │
                  │     (Premium SMB —                    │
                  │      our sweet spot)                  │
                  │                                       │
   FEATURE-LIGHT  │                                       │  FEATURE-HEAVY
   ───────────────┼──────────────────────────────────────┼─────────────────
                  │                                       │
                  │                                       │
                  │                          ● BSS B2B    │
                  │                         (Free-$130,   │
                  │                          everything)  │
                  │                                       │
                  │   ● B2B Hub                           │
                  │  ($39+, mid-tier)                     │
                  │                                       │
                  │   ● Bold ($9.99,                      │
                  │     budget option)                    │
                  │                                       │
                  │             GENERIC                   │
                  └─────────────────────────────────────┘
```

**Empty quadrant we own:** Premium aesthetic + feature-light + SMB price point.

---

## How competitors can react

### Likely responses to Stockly success

1. **BSS adds a "premium theme" option** — defensible because we'll already have brand equity with the segment
2. **SparkLayer drops prices to compete down-market** — they likely won't (cannibalization risk on enterprise)
3. **A new entrant copies our positioning** — possible, but we have 6-12 month head start + Piro case study
4. **Bold modernizes** — they've been promising this for years, hasn't happened

### Our moat (defensible advantages)

1. **Domain expertise from Piro** — real-world deployment, real customer pain understood
2. **Premium brand reputation** (early days but building)
3. **Deep Shopify API knowledge (Discount Functions + Markets `applicationLevel: ALL`)** — documented Shopify mechanisms that competitors haven't assembled into a B2B pricing engine for Basic/Grow plans. Not a hack: both are first-class, plan-supported APIs. Discovery required reading the GraphQL schema directly rather than the admin UI. See [ADR-010](./decisions/ADR-010-b2b-pricing-engine-on-basic-plan.md).
4. **Theme-native execution** — hard to replicate without designer-developer founder
5. **Speed of iteration** — solo founder + AI co-pilot ships in days vs weeks
6. **Adspubli agency clients pipeline** — built-in distribution to premium DTC brands

---

## Pricing context

| App | Cheapest tier | Most popular tier | Top tier |
|---|---|---|---|
| Bold | $9.99 | $29 | $79 |
| B2B Hub | $39 | $79 | $149 |
| BSS B2B | Free | $50 | $130 |
| SparkLayer | $199 | $399 | $999+ |
| **Stockly (planned)** | **$39** | **$79** | **$149** |

We deliberately match B2B Hub pricing — same price, better product, premium positioning.

---

## Watch list (monitoring competitors)

Set up alerts for:
- New apps in Shopify App Store "Wholesale" category
- BSS B2B changelog updates
- SparkLayer pricing changes
- Shopify B2B native feature announcements (could obsolete features)
- Industry reports: Shopify Plus B2B adoption stats

**Monthly review:** Pull App Store data, update this doc.
