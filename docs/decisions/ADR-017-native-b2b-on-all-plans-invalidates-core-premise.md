# ADR-017 — Shopify's native B2B on all plans invalidates Stockly's core premise

**Date:** 2026-08-09
**Status:** Accepted (as a statement of fact); the strategic response is OPEN
**Supersedes the premise of:** [ADR-010](./ADR-010-b2b-pricing-engine-on-basic-plan.md)

---

## Context

Stockly was built on one sentence, still in `AGENTS.md` today:

> "A Shopify App that delivers enterprise-grade B2B wholesale features
> (volume tiers, branded storefront, custom pricing) on Shopify
> Basic/Grow plans — features normally locked to Shopify Plus B2B at
> $2,300/mo."

**That is no longer true.** Shopify Editions Spring 2026 announced:

> "B2B en más planes — Accede a perfiles de empresa, precios por volumen,
> hasta tres catálogos B2B y mucho más desde tu panel de control **sin
> coste adicional**."

Native B2B — company profiles, volume pricing, up to 3 B2B catalogs — has
been available on Basic, Grow and Advanced since **2026-04-02**, at no
extra cost. The Plus-only gate that justified this product is gone.

## Evidence (verified, not inferred)

Queried Piro Jewelry's live store (plan Basic) read-only via the Admin API
on 2026-08-09:

```
Empresas B2B en 'piro' — 50 encontradas
Catálogos B2B (10/3 máx en plan Basic)
```

The pilot merchant already runs **50 native B2B company accounts** on a
Basic plan. They are not waiting for Stockly to enable B2B — they already
have it, from Shopify, for free.

## What is still NOT native (where value remains)

Confirmed against Shopify's own community and current B2B docs:

1. **Minimum order VALUE (cart total).** Native B2B has quantity rules —
   minimum units, case packs, increments, per product per catalog — but
   no order-value threshold. A Shopify expert in the official community,
   answering exactly this question: *"no native setting for this
   anywhere, including Plus. Order-value rules need checkout
   validation."* This is precisely what `stockly-opening-order`
   (ADR-016) implements as a Cart & Checkout Validation Function.
2. **Wholesale application / registration flow.** Not native — merchants
   must invite companies manually or build their own intake.
3. **Quick Order Form.** Not native.
4. **Pricing logic beyond fixed price or flat percentage.** Native
   catalogs express those two shapes cleanly and nothing more.

## Decision

Record the premise change now rather than let the repo keep advertising a
moat that no longer exists. Concretely:

- Stockly's remaining defensible surface is **the order-value minimum,
  the application/registration flow, and the Quick Order Form** — not
  "B2B pricing on Basic", which Shopify now gives away.
- The Piro engagement is scoped accordingly: install for the **order
  minimum only**, discounts OFF, leaving Piro's native B2B and its
  existing −65% Price List as the pricing engine.

## Consequences

- **ADR-010's conclusion still holds mechanically** (a Discount Function
  is a valid way to price on Basic) but its *motivation* is void — the
  reason to do it at all was the Plus paywall.
- **Double-discount risk got worse, not better.** Editions also shipped
  *"B2B Discount Stacking — Aplica varios descuentos a un mismo producto
  en un pedido"*. Shopify now stacks discounts by design, so layering
  Stockly's Discount Function over Piro's Price List is more likely to
  compound, not less. Install with discounts disabled.
- **Open question, deliberately not answered here:** whether Stockly
  remains a product worth building for the App Store, or becomes a
  focused tool (order minimums + intake + QOF) that complements native
  B2B instead of replacing it. That decision needs Jonatan and should
  not be made inside a delivery sprint.
- **Unverified and blocking for Piro:** `stockly-opening-order` matches
  pending buyers by customer GID, but native B2B checkout runs in a
  **company-location** context. Whether the match holds there is an
  empirical question, untested as of this ADR. If it does not, the fix is
  to read the company location instead of the customer — days, not weeks.

## Also worth revisiting

Editions announced **"Shopify App Pricing"** — usage, recurring and hybrid
pricing models configured *"sin infraestructura de backend"*. This may
obsolete the Billing API plumbing built in `cf8adf0`. Check before
investing further there.

## Sources

- Shopify Editions Spring 2026 — https://www.shopify.com/es-es/editions/spring2026
- App Home UI extension — https://shopify.dev/docs/api/app-home-ui-extension/latest
- Minimum order value in B2B (Shopify community) —
  https://community.shopify.com/t/how-to-set-minimum-order-value-and-minimum-quantity-rules-for-b2b-customers-in-shopify/587196
