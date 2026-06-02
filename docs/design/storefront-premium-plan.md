# Storefront Premium Redesign — phased plan

> Status (2026-06-02): Phases 1, 2 and 4 SHIPPED to code (verify green,
> pending `shopify app deploy` + visual confirm). Phase 3's merchant knobs
> shipped a different way — in the QOF theme-editor block panel
> ("Appearance", stockly-30) rather than a centralized admin panel; the
> admin panel remains a later option if cross-block coherence needs it.
> Phase 5 (conditional nav by tag) still open. Created 2026-06-01.
> Decision owner: Jonatan. Direction locked: **premium, opinionated,
> Stockly-own identity — NOT inherited from the merchant theme.**
> See the prototype: `docs/design/prototypes/quick-order-form.html`.
>
> Governing rule: the base design is FIXED; the merchant paints inside
> the lines via a FEW high-level knobs (accent, density, base size,
> light/dark). Few knobs = impossible to make it ugly. This is the
> deliberate opposite of BSS's "expose everything" anti-pattern.

---

## Why (one paragraph)

The two storefront blocks speak different visual languages today: the
registration form already has premium tokens (`--rf-*`, 12px radius, soft
shadows, brand-tinted focus ring — design-system §2), while the Quick
Order Form is stuck on the old "theme-native" `--stockly-primary/accent`
set with no real mobile layout. Unify both onto ONE premium token set
(`--sk-*`), led by the QOF (Jonatan's flagship surface — "el PDF del
futuro").

---

## Phase 0 — ADR-015 (decision record)  ·  no deploy

Write `docs/decisions/ADR-015-storefront-design-premium.md`:
- Decision: premium opinionated, Stockly identity, unified `--sk-*` tokens.
- Rejected alternatives: (a) camaleón/theme-native (low elegance ceiling),
  (b) hybrid with many merchant knobs (BSS anti-pattern).
- Consequences: storefront stops inheriting the theme font/palette by
  default; one canonical token set; an admin "Appearance" panel becomes
  the single source for the knobs.
- Mitigation for "clashes with theme": adjustable accent knob.

**Deliverable:** ADR-015 committed. **Touches:** docs only.

---

## Phase 1 — Canonical tokens  ·  DONE 2026-06-02 (shipped to code)

> Implemented: `extensions/quick-order-form/assets/stockly-base.css` holds
> the canonical `--sk-*` set on a 4-host selector. Each block's `.liquid`
> loads it via `{{ 'stockly-base.css' | asset_url | stylesheet_tag }}` (app
> blocks allow only one schema `stylesheet`). QOF's duplicated token block
> removed. See `progress/2026-06-02-storefront-premium-phase1-phase4.md`.



Define the definitive `--sk-*` set (promote design-system.md §2,
generalize the prototype's `:root`). Decide defaults: accent, ink scale,
type scale (Inter + graceful fallback), radii, shadows, density, spacing.

Mechanism decision: ship ONE shared `stockly-base.css` asset (tokens +
primitives) that all four blocks include, instead of each block
re-declaring tokens. Avoids drift.

**Deliverable:** design-system.md updated to v2 + `stockly-base.css`
draft. **Touches:** docs + a new (unreferenced yet) asset. No deploy.

---

## Phase 2 — Port the Quick Order Form to premium  ·  shopify app deploy

Bring the prototype into the real block.
- `quick-order-form.liquid`: new structure/classes from the prototype.
- `quick-order-form.css`: rewrite onto `--sk-*`; real mobile card layout
  (today it only shrinks the table).
- Restyle the existing states (loading / empty / not-eligible) in the new
  language — do NOT drop them.
- Retail-strikethrough → wholesale-accent price, qty stepper, footer with
  "you save €X".

**Risk:** `quick-order-form.src.js` (~20KB) drives prices + state via
`data-*` hooks and class toggles. Map the new markup WITHOUT breaking it —
keep the `data-stockly-*` contract, restyle only. Re-test the live
pricing path on the dev store.

**Deliverable:** QOF visually = prototype, on real data. **Touches:**
`extensions/` → `bash scripts/verify.sh` + `npx shopify app deploy` +
dev-store smoke (wholesale customer sees correct discounted math).

---

## Phase 3 — Admin "Appearance" panel  ·  fly deploy + shopify app deploy

One Polaris panel in the Stockly admin where the merchant sets the FEW
knobs (accent, density, base size, light/dark). Persist (shop config in
Postgres or a metafield). Storefront reads them and injects `--sk-*` on
the block host at runtime — REUSE the registration form's pattern (the
App Proxy `branding` response already feeds `--stockly-primary/accent`,
per the QOF CSS header comment).

**Deliverable:** merchant changes accent in admin → storefront reflects it
live, no code. **Touches:** admin (Remix) + storefront (liquid reads
branding) → both pipelines.

---

## Phase 4 — Propagate to the other 3 blocks  ·  DONE 2026-06-02 (shipped to code)

> Implemented: `fpq-banner.css` and `wholesale-product-panel.css` re-skinned
> onto `--sk-*` (pure re-skin, classes + JS hooks preserved). Registration
> is light-touch: its `--rf-color-*` RUNTIME CONTRACT (injected by
> registration-form.js from the admin appearance JSON) is preserved — only
> the *defaults* now derive from `--sk-*`, plus radii/shadows/font aligned.
> Verify green; pending `shopify app deploy` + visual confirm.



registration form (already close), wholesale product panel, FPQ banner →
same `--sk-*` tokens, same identity. Kills the "Frankenstein" for good.

**Deliverable:** all 4 blocks coherent. **Touches:** `extensions/`.

---

## Phase 5 — Conditional visibility by customer tag (the menu)  ·  shopify app deploy

Independent of the redesign; can run in parallel. A new **app embed**
(theme app extension `target: head/body`) that hides nav links marked
"wholesale-only" from non-wholesale customers — server-decided (no flash),
configurable list of paths, works in any theme. Must support BOTH
directions (wholesale-only AND non-wholesale-only, e.g. hide
`wholesale-application` from existing wholesalers).

**Critical caveat:** this is COSMETIC, not access control. The real
content gate already exists (the not-eligible state + the discount
function). Hiding the menu link is UX tidiness; the URL stays reachable.

**Deliverable:** retail no longer sees the wholesale link in the menu.
**Touches:** `extensions/` (new app embed) → `npx shopify app deploy`.

---

## Sequencing & notes

- Phases 0–1 are doc/design, no deploy — safe to do during the rescue audit.
- Phase 2 is the proving ground: validate the token system on the flagship
  before propagating (Phase 4).
- Phase 5 is independent; slot it whenever.
- Every extensions-touching phase needs `shopify app deploy` (not just
  `fly deploy`) and must clear `bash scripts/verify.sh` first.
- Deploy gate stays manual + deployment-guardian (per AGENTS.md).
