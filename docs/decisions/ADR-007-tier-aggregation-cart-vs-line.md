# ADR-007 — Tier Aggregation: per-line vs cart-total

**Date:** 2026-05-21
**Status:** Accepted (implementation pending)
**Deciders:** Jonatan Montilla (working session 2026-05-21)
**Extends:** ADR-004 (B2B lifecycle), ADR-006 (Wholesale Baseline + Product Panel)

---

## Context

Sprint 2 shipped a Discount Function that applies volume tiers per cart line:
- Tier "Volume 10" with `minQty=10` activates only if a single cart line's quantity ≥ 10
- A customer with 5 belts + 3 rings + 4 scarves (= 12 units mixed) gets NO discount under this model

Pilot client Piro Jewelry — and several other typical B2B scenarios — work differently:
- Boutiques buy assortments (different SKUs, low qty each, but high total order)
- Their wholesale rule: "minimum 12 pieces total in the order, mix any way you want"
- This is **cart-wide aggregation**, not per-line

This is also the model that Faire (the closest B2B marketplace to Stockly's positioning) enforces by default.

## Decision

Add an **`aggregation`** field to each `Tier`. Each tier independently declares how its `minQty` is evaluated against the cart.

### Schema change
```prisma
model Tier {
  // existing fields...
  aggregation String @default("per_line")  // "per_line" | "cart_total"
}
```

### Semantics
- **`per_line`** (default, preserves Sprint 2 behavior): `minQty` is compared to each individual cart line's quantity. The tier applies to that one line if it qualifies. Multiple lines independently qualify or don't.
- **`cart_total`** (new): `minQty` is compared to the SUM of all line quantities in the cart (subject to the tier's scope filter — see below). If the cart total meets the threshold, the tier applies to **all qualifying lines**.

### Discount target (resolved by user choice in working session)
When a `cart_total` tier activates, the discount applies to **every cart line that's within the tier's scope** (all lines if `scope='all'`, all lines whose product is in `scopeId` if `scope='collection'`, etc.).

Rejected alternatives discussed:
- "Only the first 12 pieces" (confusing — what gets discounted vs. not?)
- "Reward line at cart subtotal" (visually noisy; doesn't match per-line strikethrough UX we already have)

## Worked example — Piro

Configuration:
```yaml
Shop:
  fpqMode: amount
  fpqAmount: 500
  wholesaleBaselinePct: 65
  postQualificationMOQ: 12     # cart-wide

Tier "Assortment 12":
  scope: all
  aggregation: cart_total
  minQty: 12
  discountPct: 0               # no extra tier discount, just the gate

Tier "Assortment 24":
  scope: all
  aggregation: cart_total
  minQty: 24
  discountPct: 10              # +10% on top of baseline
```

### Scenario A — first qualifying order
Boutique customer (approved, pre-FPQ) puts in cart:
- 5 belts × €65 = €325 retail
- 3 rings × €10 = €30 retail
- 4 scarves × €85 = €340 retail
- **Total cart**: 12 pieces, €695 retail

Evaluation:
- FPQ: cart subtotal €695 ≥ €500 → FPQ MET ✓
- Baseline -65% on every line: belts €22.75 each, rings €3.50, scarves €29.75
- Tier "Assortment 12" (cart_total, minQty 12): 12 pieces ≥ 12 → ACTIVE, 0% extra (it's the floor)
- Tier "Assortment 24" (cart_total, minQty 24): 12 pieces < 24 → no extra discount

Customer pays:
- Belts 5 × €22.75 = €113.75
- Rings 3 × €3.50 = €10.50
- Scarves 4 × €29.75 = €119.00
- **Total**: €243.25 (vs €695 retail, ~65% off)
- Marked as `qualified` after payment

### Scenario B — repeat customer, large order
Same customer, now `qualified`, places:
- 30 mixed pieces, €1,800 retail
- No FPQ check (already qualified)
- Baseline -65% → €630
- Tier "Assortment 24" cart_total: 30 ≥ 24 → ACTIVE, -10%
- Math: retail × 0.35 × 0.90 = retail × 0.315
- **Total**: €567

### Scenario C — same customer, single item
- 1 ring, €10 retail
- No minimum (postQualificationMOQ enforcement is at checkout, not here)
- Wait — `postQualificationMOQ: 12` means... clarify in implementation: is it a HARD block at checkout, or a soft floor for tiers? **Decision below.**

## Open question (to resolve in implementation)

`postQualificationMOQ` — is it:
- **(a) A blocking gate**: cart < 12 pieces → checkout disabled
- **(b) A soft floor for tiers only**: customer can buy 1 piece but won't get tier discounts

**Recommended in implementation**: (b) for v1 — soft floor. Merchants who want a hard MOQ can use Shopify's native cart minimum settings. This keeps Stockly out of Shopify's existing UX surface.

## Alternatives considered

### Alt 1 — Shop-level setting only (no per-tier flexibility)
- Pro: simpler model, one boolean per shop
- Con: removes the case of "this specific product has its own per-line tier; other products participate in cart-wide assortments"
- Rejected: insufficient flexibility for jewelry brands with statement pieces

### Alt 2 — Eliminate per-line entirely
- Pro: cleanest mental model — everything cart-wide
- Con: breaks the existing Sprint 2 behavior; merchant who likes per-line loses functionality
- Rejected: regression risk + losing optionality

### Alt 3 — Inferred aggregation by scope
- "If scope=all → cart_total automatically; if scope=product → per_line automatically"
- Pro: zero new fields
- Con: surprising/implicit; merchant can't override
- Rejected: explicit > implicit

## Consequences

### Positive
- Models real wholesale workflows (Faire-style assortment minimums)
- Composes cleanly with FPQ and wholesale baseline (orthogonal concepts)
- Each tier independently picks its mode — supports complex catalog strategies (e.g., commodity items per-line, statement pieces cart-wide)

### Negative
- DB migration (one new column, safe default `"per_line"`)
- Admin UI grows: tier form needs an "Aggregation" select
- Discount Function needs cart-summing logic for `cart_total` tiers
- App Proxy must include `aggregation` in the tier payload it sends to the Web Component
- Client-side resolver (`_resolveDiscountPct` in quick-order-form.js) needs to know cart context, not just per-row

### Implementation phases

**Phase 1 — Schema + Function (Sprint 2.5 alongside baseline)**
1. Prisma migration: add `Tier.aggregation` with default `"per_line"`
2. Update Discount Function `run.ts`:
   - For per-line tiers: existing behavior
   - For cart-total tiers: compute cart-wide qty sum (within scope), compare to minQty, emit discount on every line in scope
3. Update sync service: include `aggregation` in metafield JSON payload
4. Update admin: add a select to tier create/edit form

**Phase 2 — Storefront UX (Sprint 3 alongside Product Panel)**
1. Quick Order Form: when a cart_total tier is involved, the per-row total reflects the aggregate decision; the ladder pill shows "12+ mixed units" to clarify
2. Wholesale Product Panel: similar treatment

## Revisit trigger

Revisit if:
- A merchant requests cross-collection aggregation (e.g., "any 12 pieces from these 3 collections"). Today scope is a single collection. A new field `additionalScopeIds` might be needed.
- A merchant wants "minimum order value AND minimum quantity" as composed gate (currently we have either-or in `fpqCombinedLogic`)
