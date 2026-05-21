# ADR-006 — Wholesale Baseline % + Wholesale Product Panel

**Date:** 2026-05-21
**Status:** Accepted (implementation pending)
**Deciders:** Jonatan Montilla (working session 2026-05-21)
**Extends:** ADR-004 (B2B customer lifecycle)

---

## Context

During Sprint 2 testing, two product-shaping decisions surfaced from looking at how Alibaba (the canonical B2B reference) presents wholesale pricing on product pages:

### Observation 1 — Pricing has TWO layers in real B2B

A wholesale-approved customer has a "starting price" that's already lower than retail (typically 40-65% off MSRP for jewelry/fashion/premium accessories). Then **volume tiers** stack on top of that starting price as additional discounts for buying more units. This is how Faire, McMaster-Carr, real wholesale platforms work.

Stockly today only has ONE layer (the Tier). The Tier applies % off the Shopify base price. There's no concept of a wholesale-starting-point that's universally cheaper than retail.

### Observation 2 — Product pages need a B2B-aware "panel"

Today Stockly only has the Quick Order Form (page-level catalog with bulk-order table). For the realistic B2B flow on luxury brands (boutique buyer browsing individual products), each product page needs a panel — like Alibaba's variant matrix with tier pricing — visible only to wholesale customers, sitting above the standard retail product UI.

## Decision

### Decision 1 — Two-layer pricing, multiplicative

Introduce **`Shop.wholesaleBaselinePct`** (Int, default 0).

When an approved wholesale customer sees prices, the displayed and charged price is:

```
finalPrice = retailPrice × (1 - wholesaleBaselinePct/100) × (1 - tierDiscountPct/100)
```

Two layers, multiplicative composition. See [memory/wholesale-pricing-composition](../../memory/wholesale-pricing-composition.md) for full rationale and worked examples.

### Decision 2 — Wholesale Product Panel as a new block

Introduce a new Theme App Extension: **`wholesale-product-panel`**.

- Target: `section` placement on product templates
- Visibility: renders only for wholesale-approved customers (Liquid + JS gate)
- Content:
  - Tier ladder (same component as the Quick Order Form ladder)
  - Variant matrix with per-variant qty inputs (Alibaba-style)
  - Total with wholesale baseline + tier applied
  - "Add bulk to cart" CTA
- Position: above the standard product content (retail Add to cart stays — single-unit purchase remains possible)

## Alternatives considered

### Alt 1 — Single-layer pricing (status quo: tiers only)
- **Pro:** simpler
- **Con:** doesn't match how merchants think (they have a wholesale price list + volume discounts as separate concepts)
- **Con:** requires merchant to manually set the wholesale price per-product via tier scope=product, error-prone at scale
- **Rejected:** not how the market works

### Alt 2 — Per-product wholesale prices (no universal baseline)
- **Pro:** maximum flexibility
- **Con:** merchant has to maintain TWO prices per product; mismatched data
- **Con:** doesn't capture the common case ("everything is 65% off retail")
- **Verdict:** maybe later as override on top of universal baseline; not v1

### Alt 3 — Per-collection baselines (Jewelry 50%, Accessories 65%)
- **Pro:** balance between flexibility and simplicity
- **Con:** another configuration surface; many merchants don't need this
- **Verdict:** future enhancement; v1 is shop-wide single baseline

### Composition mode: aditivo vs multiplicative vs replace
See [memory/wholesale-pricing-composition](../../memory/wholesale-pricing-composition.md). Multiplicative locked.

### Panel placement: inline vs drawer vs replacement
See previous strategic discussion. **Inline panel above retail content** chosen (Faire-style). Drawer rejected (too easy to miss). Replacement rejected (loses brand experience).

## Consequences

### Positive
- Pricing model matches industry conventions — merchants don't have to translate their existing wholesale workflow
- The Wholesale Product Panel becomes a major differentiator — most B2B apps just hide retail prices and show wholesale; few do a proper variant-matrix bulk-order panel
- Composes cleanly with existing FPQ + approval workflow (ADR-004): an `approved_pre_fpq` customer sees wholesale prices in the panel; `qualified` customer can actually order from it

### Negative
- Database migration (Prisma): add `wholesaleBaselinePct` to Shop, default 0 (safe default = retail prices for everyone, preserving current behavior)
- App Proxy response shape grows: must include `shop.wholesaleBaselinePct`
- Quick Order Form needs update: line totals now compose baseline × tier
- Shopify Discount Function needs update: emit composed % per line, not raw tier %
- New extension to build (~3-5h of focused work for the Wholesale Product Panel)

### Risks and mitigations
- **Customer sees different prices in QO Form vs Product Panel** (consistency)
  - Mitigation: both blocks call the same /apps/stockly/context endpoint and use the same composition math
- **Discount Function math diverges from client-side display** (worse failure: customer sees €X in cart preview but pays €Y at checkout)
  - Mitigation: composition logic in ONE place (a shared util in the Function's metafield config); both client and Function read from same JSON
- **Merchant sets wholesaleBaselinePct + aggressive tier → effective discount feels too high to them**
  - Mitigation: admin preview ("with current settings, a wholesale customer at qty 10 pays €X for a €Y retail product")

## Implementation plan

### Step 1 — Wholesale Baseline (Sprint 2.5, ~2-3h)
1. Prisma migration: add `Shop.wholesaleBaselinePct Int @default(0)`
2. Update App Proxy response to include `shop.wholesaleBaselinePct`
3. Update Quick Order Form JS: compose baseline × tier in `_recalcTotals`
4. Update Discount Function sync service: include `wholesaleBaselinePct` in metafield payload
5. Update Discount Function `run.ts`: emit composed % per line
6. Admin settings page: `/app/settings/pricing` with a number input for baseline %
7. Tests: unit tests for composition math

### Step 2 — Wholesale Product Panel (Sprint 3, ~3-5h)
1. Generate new Theme App Extension: `wholesale-product-panel` (`shopify app generate extension`)
2. Liquid template: variant matrix + tier ladder + bulk total + bulk CTA
3. Web Component: shares hydration logic with Quick Order Form (extract shared module)
4. CSS: theme-native styling with branding variables
5. Block schema: heading, "first order minimum" copy, "not eligible" copy
6. Test on dev store with snowboard + 4 wholesale products

## Revisit trigger

Revisit if:
- A pilot client wants per-collection baselines (likely follow-up; add `Collection.wholesaleBaselineOverridePct`)
- Per-product wholesale price override needed (escape hatch for special products)
- Customer hits checkout with a Function-applied discount but Stripe/Shopify total disagrees (math divergence — must be solved before any pilot launch)
