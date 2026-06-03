# ADR-015 — Storefront blocks: premium, opinionated design

> **Status:** ACCEPTED 2026-06-01. Phase 2 (Quick Order Form re-skin)
> shipped the same day. Remaining phases tracked in
> `docs/design/storefront-premium-plan.md`.
>
> **Refinement 2026-06-03 (colour direction):** the storefront is
> **WHITE-LABEL** — it is the MERCHANT's brand, not Stockly's. The design
> stays premium/opinionated (type scale, radii, shadows, layout), but the
> **colour base is NEUTRAL BLACK**, and each merchant supplies their own
> accent (App Proxy branding / the QOF Appearance knob). The earlier
> "premium bronze" accent was a Stockly colour wrongly imposed on the
> storefront — the `--sk-accent` fallback is now neutral black (`#17150f`).
> Stockly's own brand colour (lime `#C6F23E`) lives in the **admin**, never
> in the storefront. See memory `brand-color-stockly`.
>
> **Authors:** Jonatan Montilla (Adspubli) + Claude Code.

## Context

Stockly renders four blocks inside the merchant's theme via the
`quick-order-form` theme app extension: Quick Order Form (QOF),
registration form, wholesale product panel, FPQ banner. Their visual
quality is now the owner's #1 concern ("falta diseño").

Two problems were verified in-repo:

1. **Divergent token sets.** The registration form already uses a premium
   token set (`--rf-*`: 12px radius, soft shadows, brand-tinted focus
   ring — see `docs/design-system.md` §2), but the QOF was still on the
   old, poorer `--stockly-primary/accent` set. The blocks spoke different
   visual languages — the "Frankenstein" the design-system doc set out to
   prevent.
2. **Theme-native by default = low elegance ceiling.** The QOF CSS header
   declared *"inherits the host theme's font and the page's neutral
   palette"*, and admitted *"mobile-card layout … is a follow-up; v1
   reduces type size"* — i.e. no real responsive, just a shrinking table.

A "theme-native / camaleón" block integrates with zero friction but can
never look premium — it always reads as "just another table". The owner's
goal is the opposite: a **deluxe Stockly aesthetic**.

## Decision

Storefront blocks adopt a **premium, opinionated, theme-independent**
design:

- **Stockly owns the look** — its own type scale, palette, spacing, radii,
  shadows. It does NOT inherit the merchant theme's font/palette by
  default. (System-UI font stack, not a web-font dependency, to avoid
  FOUC.)
- **One canonical token set, `--sk-*`**, shared by all four blocks (and
  conceptually with the admin). Supersedes the QOF's `--stockly-*` and
  unifies with the registration form's `--rf-*`.
- **Few high-level knobs, merchant-facing.** The merchant adjusts only a
  small set — primarily the **accent** (wired today through the App Proxy
  `branding` response → `--sk-accent`, falling back to a refined bronze),
  later density / base size / light-dark via an admin "Appearance" panel.
  Structure/typography/spacing are fixed. **The merchant cannot make it
  ugly** — this is deliberate.
- **Real responsive.** Mobile becomes a stacked card layout, not a shrunk
  table.

## Consequences

- The storefront stops looking like the merchant theme by default; this is
  intended. Risk of clashing with a given theme is mitigated by the
  adjustable accent knob.
- `color-mix()` is used for accent tints/strong variants (already used by
  the registration form; acceptable browser baseline in this codebase).
- Phase 2 was implemented as a **pure re-skin**: every `.stockly-qo__*`
  class and `data-stockly-*` JS hook preserved; only CSS rewritten + three
  `data-label` attributes added for the mobile cards. The pricing/cart JS
  is untouched, so the revenue path is unaffected. Validated visually on
  the real block markup (desktop + 390px mobile) before deploy.
- Per-line "retail-strikethrough → wholesale" price and a +/- stepper were
  NOT added here — they would require touching the block JS and are
  deferred (the JS only writes line/grand totals + the ladder today).

## Alternatives rejected

- **(a) Camaleón / theme-native refined** — keep inheriting the theme,
  just polish it. Rejected: low elegance ceiling, the explicit thing the
  owner is moving away from.
- **(b) Hybrid with many merchant knobs** (the BSS pattern, see
  `docs/competitive/` and `[[competitive-bss]]`) — expose colors, sizes,
  borders, etc. Rejected: high surface area, easy for the merchant to make
  it ugly, more maintenance. The few-knobs model is what reads as premium.

## Follow-ups

See `docs/design/storefront-premium-plan.md` — Phase 1 (extract `--sk-*`
into a shared `stockly-base.css`), Phase 3 (admin Appearance panel),
Phase 4 (propagate tokens to the other 3 blocks), Phase 5 (conditional
nav visibility by customer tag).
