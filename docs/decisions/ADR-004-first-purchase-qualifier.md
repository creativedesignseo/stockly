# ADR-004 — First-Purchase Qualifier and Multi-State Customer Model

**Date:** 2026-05-21
**Status:** Partially superseded by [ADR-016](./ADR-016-opening-order-minimum.md) (2026-06-03) — the 5-state lifecycle vocabulary stands, but the *price-side* FPQ enforcement described here is replaced by a checkout-side opening-order minimum (the pre-qualified customer now sees wholesale pricing immediately; the minimum gates checkout, not the discount).
**Deciders:** Jonatan Montilla (working session with Claude)
**Supersedes:** Sprint 1's simple tag-based binary eligibility

---

## Context

Sprint 1 shipped a binary tag-based eligibility check: a customer is wholesale if they have the shop's `wholesaleTag`. They have it or they don't. Tiers apply if they're tagged; otherwise retail.

In working session on 2026-05-21, real merchant requirements surfaced (using Piro Jewelry as exemplar but explicitly NOT building only for Piro):

1. **Approval gate**: merchants want to review and approve wholesale applications manually, not auto-promote anyone with a tag. Brand protection, fraud prevention, relationship vetting.

2. **First-purchase qualifier (FPQ)**: a wholesale customer's first order must meet a threshold (typically €200-1000 OR 12-50 units) to "earn" wholesale status. After that qualifying purchase, they buy freely.

3. **Configurability is mandatory**: each merchant has a different B2B model:
   - Some want amount-only thresholds (Piro: €500)
   - Some want quantity-only (artisan: 12 pieces)
   - Some want both required (aggressive: €1000 AND 50 pieces)
   - Some want either (flexible: €500 OR 24 pieces)
   - Some want neither (relationship-based, approval alone)

Hardcoding any single model forces merchants into our mold. Competing apps (BSS, Bold, B2B Hub) do exactly this and merchants complain. The configurability is THE differentiator.

## Decision

Implement a **5-state customer lifecycle** with **6 merchant-configurable variables** that compose to express any realistic B2B model.

### States
`visitor` → `pending` → `approved_pre_fpq` → `qualified` (or branch to `rejected`)

### Variables (on `Shop` model)
- `approvalRequired` (bool)
- `fpqMode` (amount / quantity / combined / none)
- `fpqAmount` (float)
- `fpqQuantity` (int)
- `fpqCombinedLogic` (and / or)
- `postQualificationMOQ` (int)

### Presets in admin
Pre-built configurations selectable in 1 click: Premium Boutique, Artisan Wholesale, Aggressive Volume, Flexible Entry, Relationship-based, Self-serve. Non-technical merchants don't need to understand each variable.

### Full canonical spec
See [B2B Customer Lifecycle Spec](../spec/b2b-customer-lifecycle.md) for state machine, resolution algorithm, data model, App Proxy contract, webhook handler design.

## Alternatives considered

### Alt 1 — Keep tag-only (Sprint 1 status quo)
- **Pro:** simplest possible
- **Con:** merchants must manage tags manually outside Stockly (no UI), no approval workflow, no FPQ
- **Con:** offers little value beyond what merchants can already do with raw Shopify
- **Rejected:** doesn't justify being a paid app

### Alt 2 — Only approval workflow, no FPQ
- **Pro:** simpler model
- **Con:** doesn't match real merchant requirements (Piro's spec REQUIRES FPQ)
- **Con:** loses a major differentiator
- **Rejected:** half-measure

### Alt 3 — Only FPQ, no manual approval
- **Pro:** fully automated, no merchant work
- **Con:** merchants want to vet who becomes wholesale (brand control)
- **Con:** some merchants explicitly want manual gate
- **Rejected:** removes merchant control

### Alt 4 — Hardcode Piro's exact model
- **Pro:** solves the pilot client problem fastest
- **Con:** stops being a product, becomes consulting
- **Con:** can't serve any other merchant without code changes
- **Con:** loses the configurability differentiator entirely
- **Rejected:** strategically wrong

### Decision: full configurable model (5 states × 6 variables × 6 presets)
Combines all benefits. Configurability IS the differentiator vs competitors.

## Consequences

### Positive
- Stockly serves many merchant B2B models with one codebase
- Presets keep this approachable for non-technical merchants
- Configurability is a marketing point: "the only B2B app that adapts to YOUR workflow"
- Future expansion (Net 30/60, quotes, customer-specific catalogs) builds cleanly on this state machine

### Negative
- Significantly more complex than Sprint 1's tag check
- New tables (`WholesaleApplication`) and new fields on existing tables
- Requires Shopify webhook handler for `orders/paid` to detect qualifying purchases
- Admin UI grows: applications queue, customer detail, settings for FPQ
- More edge cases to test (every state transition × every FPQ mode)

### Risks and mitigations
- **Bug in FPQ detection promotes customer prematurely OR fails to promote → angry merchant**
  - Mitigation: extensive test coverage of the resolution algorithm, idempotent webhook handler, manual override in admin
- **Merchant configures wrong preset and is surprised by behavior**
  - Mitigation: preview/simulation in admin ("if a customer orders X amount with Y units, they'll be Z"); preset descriptions explicit about what they enable
- **Webhook delivery failure misses qualifying purchase**
  - Mitigation: orders/paid + periodic reconciliation job that scans recent orders for unqualified customers

## Implementation plan

### Sprint 2 — Volume Pricing Display + FPQ foundation
- Add fields to `Shop` and `WholesaleCustomer` models
- Create `WholesaleApplication` model + migration
- Update App Proxy response shape (add `customerState`, `fpq`)
- Update Quick Order Form to respect new states (`approved_pre_fpq` shows FPQ progress, `qualified` shows free buying)

### Sprint 3 — Branded Cart
- FPQ progress banner in cart (cross-page persistence)
- FPQ-blocked checkout with branded message
- Post-qualification celebration UI

### Sprint 4 — Admin UI
- `/app/customers` list with state filter
- `/app/customers/applications` review queue
- `/app/customers/:id` detail with manual override
- `/app/settings/b2b-model` with presets + custom config

### Sprint 5 — Testing & Beta
- Webhook handler `orders/paid` with promotion logic
- Reconciliation job (cron)
- E2E tests across all states

## Revisit trigger

Revisit if:
- A merchant demands a state or transition the current model can't express → spec extension
- FPQ detection performance becomes a bottleneck (>500ms p99 on context endpoint) → caching layer
- We add B2B Net 30/60 terms (may need new states like `approved_pending_credit_check`) → state machine extension
