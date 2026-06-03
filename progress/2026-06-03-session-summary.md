# 2026-06-03 — Session summary (resume here)

Long multi-topic session. Everything below is committed + pushed to `main`
and (where noted) deployed. Read this + HANDOFF.md + tasks/current.md to
resume.

## Shipped & LIVE today

**Camino B — opening-order minimum (the big one) — fully LIVE**
- Model: approve a wholesale customer → they see wholesale pricing
  immediately → their FIRST order must hit a minimum (€/qty) to graduate →
  reorders free → merchant "releases" them with one click. No dependency on
  privacy policy / orders-paid. Supersedes ADR-004's price-side FPQ →
  **ADR-016**.
- Fase 1 (revenue path, with TDD test), Fase 2 (admin badge + "Release"
  button), Fase 3 (NEW `stockly-opening-order` Cart & Checkout Validation
  Function + `opening-order-sync.server.ts` + wiring + `write_validations`
  scope). Shopify `stockly-36` + Fly. Journals:
  `progress/2026-06-03-camino-b-*.md`.
- ⏳ **To actually gate checkout:** the merchant must (1) re-grant
  `write_validations` (DONE by Jonatan) and (2) go to **Wholesale Pricing →
  Edit pricing settings → Save once** (that triggers the first sync that
  CREATES the validation in Shopify). Until that Save, no block. Then E2E
  test: cart below min blocks at checkout, at/above passes, "Release" frees.

**Storefront design**
- Input "double border" bug fixed (`stockly-34/35`): it was the HOST
  THEME's box-shadow input border; fix = `box-shadow:none!important`.
  Reusable lesson: `docs/architecture/theme-app-extension-css-gotchas.md`
  + memory `theme-extension-input-double-border`.
- **White-label accent (`stockly-37`):** storefront accent fallback bronze
  → neutral black (`#17150f`). The storefront is the MERCHANT's brand
  (neutral base, merchant picks colour); Stockly's brand colour, lime
  **`#C6F23E`**, is reserved for the ADMIN. Refines ADR-015. Memory
  `brand-color-stockly`.

**Admin**
- Approve directly from the applications modal (Approve primary / Reject
  secondary) — Fly.
- Moved "Current pricing setup" from Dashboard → Wholesale Pricing (no
  longer duplicated) + enriched that card.
- **Setup Guide widget on the dashboard** (`f0a2b12`): 4-step onboarding
  journey + progress bar. Pricing/form auto-detected from DB; theme steps
  (embed, QOF) show CTAs.

## Pending (priority order for next session)

1. **Onboarding wizard Step 2 UX fix (proposed, NOT done):** merge "Apply
   preset" + "Continue" into ONE "Continue" button (apply + advance).
   Today Continue is disabled until you click Apply preset — confusing.
   Code: `app/routes/app.onboarding.tsx` ~lines 737-745.
2. **Reorganise the nav + unify "Wholesale Pricing" and "Volume Pricing"**
   into one entry with tabs (most confusing thing today). `app/routes/app.tsx`
   NavMenu + the two pricing routes.
3. **Setup Guide: auto-detect the theme steps** (app embed + QOF block) —
   needs `read_themes` scope (another merchant re-grant) + Theme API.
4. **Admin lime `#C6F23E` subtly** (Polaris-safe icon-in-box tiles, etc.) —
   task #20.
5. Backlog: form builder (#12-14 — default B2B template, rename "Samita
   Wholesale", "Reset to template", visual preview), Customers section (#15),
   design-system v2 (#16), audit QOF/product-panel inputs for the box-shadow
   gotcha (#17), Company in default reg template (#11).

## Live versions
Shopify app **`stockly-37`** · Fly backend deployed 2026-06-03 (Camino B +
admin changes). Prod healthy (HTTP 200).
