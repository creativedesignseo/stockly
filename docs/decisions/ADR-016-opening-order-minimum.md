# ADR-016 — Opening-Order Minimum (Camino B), superseding the ADR-004 price-side FPQ

**Date:** 2026-06-03
**Status:** Accepted (Fases 1+2 shipped to `main`, not yet deployed; Fases 3–5 pending)
**Deciders:** Jonatan Montilla (working session with Claude)
**Supersedes:** the price-side First-Purchase Qualifier behavior of
[ADR-004](./ADR-004-first-purchase-qualifier.md). The 5-state lifecycle
vocabulary of ADR-004 stays; what changes is *how the minimum is enforced
and what the pre-qualified customer sees*.

---

## Context

ADR-004 designed a First-Purchase Qualifier: a wholesale customer's first
order must meet a threshold to "earn" wholesale status. The implementation
wired this as a **price-side gate** inside the Discount Function — a
customer not yet qualified only receives the discount if their cart meets
the minimum; otherwise they pay retail.

Two problems surfaced in a 2026-06-03 working session:

1. **It was half-built and self-contradictory.** The "approved_pre_fpq"
   state had no admin UI, the automatic graduation depended on the
   `orders/paid` webhook (gated behind the unfinished Privacy Policy,
   B0-5), and the C3 bug fix (approve → `qualifiedAt=now`) puenteaba the
   gate entirely — so in practice no one ever experienced it.

2. **The price-side model is incongruent.** If the minimum is "spend €X at
   wholesale", the customer must SEE wholesale prices to build that cart.
   Showing them retail until they hit the minimum is backwards — nobody
   builds a €500 retail cart hoping to become wholesale afterwards.
   (Jonatan identified this directly.)

Competitive research (BSS, Wholesale Gorilla, Process Wholesale, native
Shopify B2B) confirmed the industry pattern: **approval unlocks wholesale
pricing immediately on login; order minimums are enforced at CHECKOUT**,
communicated up front — never by silently withholding the discount.

## Decision

Adopt the **opening-order minimum** model ("Camino B"):

1. **Approval grants wholesale pricing immediately.** Every approved
   `WholesaleCustomer` is surfaced in the Discount Function's
   `qualifiedCustomers` list, so they see wholesale pricing from the first
   unit. The discount is gated on **"is approved"**, never on
   `qualifiedAt`. (This is what keeps bug C3 fixed.)

2. **The minimum is an OPENING ORDER, enforced at CHECKOUT.** While a
   customer still owes their opening order (`qualifiedAt = null`), a
   **Cart & Checkout Validation Function** blocks completing the purchase
   until the cart meets the configured minimum (`fpqAmount` / `fpqQuantity`
   / `fpqMode`, reused as the opening-order config). The customer sees
   wholesale pricing throughout; only checkout is gated. A banner tells
   them how much more they need.

3. **`qualifiedAt` recovers its ADR-004 meaning:** "has completed the
   opening order". It no longer governs the discount.

4. **Graduation is MANUAL (for now).** The merchant clears the
   opening-order requirement with one click (`releaseOpeningOrder` →
   `qualifiedAt=now`). This deliberately avoids the `orders/paid` →
   Protected Customer Data → Privacy Policy dependency chain. Automatic
   graduation (the original ADR-004 webhook) becomes a later upgrade once
   B0-5 lands ("Camino A").

5. **Reorders are free.** Once released, the customer buys with no minimum.

### Enforcement mechanism

The checkout block uses a **Cart and Checkout Validation Function** (WASM,
`cartValidationsGenerateRun`), available on Basic/Grow/Advanced (not just
Plus). This is the same plan-agnostic Functions architecture as the
Discount Function — reinforcing the ADR-010 "checkout-enforced, what you
see is what you pay" moat. The minimum is measured on the wholesale
subtotal.

## Alternatives considered

### Alt 1 — Keep the ADR-004 price-side FPQ
- **Con:** incongruent (customer can't build a wholesale cart without
  seeing wholesale prices); half-built; depends on the unfinished privacy
  policy for graduation. **Rejected** — it's the model Jonatan rejected.

### Alt 2 — Permanent per-order minimum (MOQ), no opening-order concept
- **Pro:** simplest; what most Shopify apps actually ship.
- **Con:** doesn't match Jonatan's intent (the minimum should apply to the
  first order and then disappear — the classic wholesale "opening order").
  **Rejected** as the primary model, though the same Validation Function
  could express a permanent MOQ later via `postQualificationMOQ`.

### Alt 3 — Automatic graduation now (Camino A)
- **Con:** requires `orders/paid` + Protected Customer Data + the Privacy
  Policy (B0-5), none of which are ready. **Deferred** — Camino B's manual
  release ships value now; auto-graduation is a drop-in upgrade later.

## Consequences

### Positive
- Matches a real, well-understood wholesale model (opening order).
- Coherent UX: wholesale pricing from unit 1, clear checkout gate + banner.
- No dependency on the Privacy Policy / orders-paid — ships now.
- Reuses the existing FPQ config fields + the Functions architecture.
- The Discount Function WASM was not touched (zero pricing risk).

### Negative / risks
- Graduation is manual until Camino A — fine at low customer volume.
- A new Validation Function is **checkout-critical**: a bug blocks ALL
  checkouts, not just wholesale. Mandatory fixtures + Shopify CLI `typegen`
  before deploy.
- Two config interpretations of `fpqAmount/fpqMode` now coexist (the
  inert price-side gate in the Discount Function + the active checkout
  gate). The price-side gate is dormant for approved customers (all are in
  `qualifiedCustomers`); documented here to avoid confusion.

## Implementation status (2026-06-03)

- **Fase 1 (done, `655d597`):** discount gated on "is approved";
  `approveCustomer` leaves `qualifiedAt=null`; `releaseOpeningOrder` added;
  first server-side revenue-path test guards C3.
- **Fase 2 (done):** admin opening-order badge + one-click release.
- **Fase 3 (pending, checkout-critical):** the Cart & Checkout Validation
  Function + the metafield sync feeding it. Needs Shopify CLI auth for
  `typegen` + fixtures.
- **Fase 4 (pending):** connect the cart/QOF "need €X more" banner.
- **Fase 5 (pending):** this ADR (done) + deploy.

See `progress/2026-06-03-camino-b-opening-order-fase1-2.md`.

## Revisit trigger

Revisit if/when:
- B0-5 (Privacy Policy) lands → upgrade to automatic graduation (Camino A).
- A merchant needs a permanent per-order minimum → extend the Validation
  Function to also read `postQualificationMOQ`.
