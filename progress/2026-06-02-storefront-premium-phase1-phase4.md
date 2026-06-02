# 2026-06-02 — Storefront premium: Phase 1 (shared tokens) + Phase 4 (propagate to all blocks)

## Objective

Continue the premium-opinionated storefront redesign (ADR-015,
`docs/design/storefront-premium-plan.md`). The Quick Order Form already
lived on the canonical `--sk-*` token set (stockly-29/30); the other three
storefront blocks did not, so they spoke different visual languages
("Frankenstein"). Goal: kill the drift by introducing ONE shared token
asset (Phase 1) and re-skinning the remaining three blocks onto it
(Phase 4) — in a single pass, per Jonatan's scope decision.

## Decisions

- **Phase 1 mechanism**: the `--sk-*` tokens now live in a new shared
  `extensions/quick-order-form/assets/stockly-base.css`, declared on a
  4-host selector (`stockly-quick-order, stockly-product-panel,
  stockly-fpq-banner, stockly-registration`) — NOT on `:root`, so the
  accent precedence chain still sees per-host inline overrides
  (`--sk-accent-theme` from the QOF Appearance setting → `--stockly-primary`
  from App Proxy branding → bronze fallback). App blocks only allow ONE
  `stylesheet` in their schema, so each block's `.liquid` loads the base
  with `{{ 'stockly-base.css' | asset_url | stylesheet_tag }}` alongside
  its own per-block stylesheet.
- Added semantic tokens to the base (`--sk-success*`, `--sk-danger*`) that
  were previously hardcoded and duplicated across blocks.
- **Registration is light-touch, NOT a token rename.** Its `--rf-color-*`
  custom properties are a RUNTIME CONTRACT: `registration-form.js`
  `_applyAppearance()` injects them inline from the merchant's admin
  appearance JSON. Renaming them would break the admin appearance panel.
  Instead, their *defaults* now derive from `--sk-*` (e.g.
  `--rf-color-main: var(--sk-accent)`), so the form inherits the premium
  identity out of the box while a merchant-set value still wins (inline
  setProperty overrides the CSS default). Radii/shadows/font aligned to
  `--sk-*` too.
- QOF/product-panel/fpq are pure re-skins: every `.stockly-*__*` class and
  `data-stockly-*` hook preserved, all block JS untouched → revenue path
  and form logic unaffected.
- Text sizes anchored to absolute px (theme-proof, the `font-size: 62.5%`
  root lesson from stockly-28); spacing left in rem to match the already-
  shipped QOF/registration convention.

## Files changed

- `extensions/quick-order-form/assets/stockly-base.css` — NEW. Canonical
  `--sk-*` token set on the 4-host selector.
- `extensions/quick-order-form/assets/quick-order-form.css` — removed the
  duplicated token block (now in base.css); kept host layout props;
  updated header comment.
- `extensions/quick-order-form/assets/fpq-banner.css` — re-skin onto
  `--sk-*` (was `--stockly-*` + hardcoded gold/green).
- `extensions/quick-order-form/assets/wholesale-product-panel.css` —
  full re-skin onto `--sk-*`; radii/shadows/qty-stepper aligned to the QOF.
- `extensions/quick-order-form/assets/registration-form.css` — defaults
  derive from `--sk-*`; radii/shadows/font aligned; `--rf-*` contract kept.
- `extensions/quick-order-form/blocks/{quick-order-form,fpq-banner,
  wholesale-product-panel,registration-form}.liquid` — each now loads
  `stockly-base.css` via `stylesheet_tag`.

## Files inspected (not changed)

- `extensions/quick-order-form/assets/registration-form.js` — confirmed the
  `--rf-color-*` / `--rf-form-max-width` runtime injection contract.
- All four `.liquid` blocks — confirmed custom-element host names + schema
  `stylesheet` keys.

## Commands run

- Token sanity grep: no orphan `--stockly-border/bg-soft/accent`; every
  `--sk-*` used is defined in base.css or is one of the 4 QOF-inline tokens
  (`--sk-accent-theme/pad/cell-pad-y/text-base`, defaulted in their `var()`).
- `bash scripts/verify.sh` → **all checks passed** (the `@media ... print`
  warning is pre-existing Polaris admin CSS, unrelated).

## Verification result

`verify.sh` green. CSS-only + liquid; no schema/JS/Discount-Function change.
Visual confirmation pending (see risks).

## Open risks

- **No browser visual pass yet.** Unlike stockly-29 (which used Playwright
  on real markup and caught 2 specificity bugs), this went straight from
  code to verify. Risk is lower (token re-skin, no layout/structure change)
  but the product-panel was rewritten wholesale — worth a screenshot pass
  or careful dev-store look.
- **Registration default look changes** even with no merchant override: the
  submit button goes from black `#111` to the bronze accent, headings to
  warm ink. Intended (ADR-015 identity) but Jonatan should eyeball it.
- `stockly-base.css` is loaded once per block instance on a page; the same
  href dedupes at the browser, harmless, and blocks rarely co-occur.

## Next step

1. Deploy gate: `npx shopify app deploy` (extensions only — NO `fly deploy`).
   Requires Jonatan's explicit go + deployment-guardian per AGENTS.md.
2. Visual validation on the dev store: product page (panel), cart (FPQ
   banner), registration page, wholesale-order page (QOF unchanged).
3. Plan remainder: Phase 5 (conditional nav visibility by tag) still open.
