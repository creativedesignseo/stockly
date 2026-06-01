# 2026-06-01 — Quick Order Form premium re-skin (ADR-015)

## Objective

Take the storefront design direction Jonatan chose (premium, opinionated,
Stockly-own identity — not theme-inherited; few merchant knobs) and ship
the first surface — the Quick Order Form (QOF), his flagship "el PDF del
futuro" — to production. Goal was explicit: "termina hasta publicar y
estar en producción."

## Decision captured first

- ADR-015 (`docs/decisions/ADR-015-storefront-design-premium.md`):
  premium opinionated, canonical `--sk-*` token set, few knobs, real
  responsive. Rejected camaleón/theme-native and the BSS many-knobs model.
- Phased plan: `docs/design/storefront-premium-plan.md`.

## Files inspected

- `extensions/quick-order-form/blocks/quick-order-form.liquid` — markup +
  class/`data-*` contract.
- `extensions/quick-order-form/assets/quick-order-form.css` — old
  theme-native styles.
- `extensions/quick-order-form/assets/quick-order-form.src.js` — confirmed
  the JS contract: it writes ladder tiers (`.stockly-qo__ladder-tier*`),
  line totals (`[data-stockly-line-total]`), grand total, toggles `[hidden]`
  states, and the add-error `.stockly-qo__add-error`. It does NOT rewrite
  the per-unit price cell and adds no +/- stepper — so per-line
  strikethrough pricing and a stepper are out of scope for a CSS-only pass.
- `docs/design-system.md` §2 — existing premium `--rf-*` tokens to align with.

## Files changed

- `extensions/quick-order-form/assets/quick-order-form.css` — full rewrite
  onto `--sk-*` tokens (own type scale, warm ink palette, bronze accent via
  `var(--stockly-primary, #9a6b34)` so merchant branding still wins, soft
  shadows, 16px card radius), card host, premium states/ladder/table/qty/
  footer/CTA, and a real `@media (max-width:640px)` card layout. Preserved
  the `[hidden] !important` contract and every `.stockly-qo__*` selector.
- `extensions/quick-order-form/blocks/quick-order-form.liquid` — added
  `data-label` to the sku/price/qty/total `<td>`s (mobile card labels).
  No structural/JS-hook change.
- `docs/decisions/ADR-015-*.md`, `docs/design/storefront-premium-plan.md`,
  `docs/design/prototypes/*` (prototype + final real-markup captures) — new.

## Verification

- Built a throwaway `_qof_test.html` with the REAL block markup + the new
  CSS, served locally, drove it with Playwright at 1100px and 390px.
- Caught and fixed: (1) SKU meta cell shown unlabelled — `td.cell--sku`
  specificity bug vs `td{display:block}`; (2) price/qty/total not going
  flex for the same specificity reason (td-qualified the selectors);
  (3) horizontal overflow from the desktop `table-wrap{overflow-x:auto}` not
  reset on mobile. Re-validated clean.
- Removed the test harness from `extensions/.../assets/` before deploy.
- `bash scripts/verify.sh` → all checks passed (the Polaris `@media print`
  warning is pre-existing, unrelated).

## Deploy

- `npx shopify app deploy --allow-updates --message "QOF premium re-skin
  (ADR-015): --sk-* tokens, real mobile cards"` → **stockly-29 released to
  users.** (`--force` is not a flag in CLI 3.94.3; `--allow-updates` is the
  CI/non-interactive flag.)
- No `fly deploy` — CSS+liquid only, no Remix/server change.
- Pre-existing non-blocking warning: `registration-form.js` >10KB app-block
  threshold (tracked separately).

## Open risks / next

- ⏳ Pending Jonatan's visual confirm on the dev store (desktop + phone) as
  the `Test Wholesale` customer.
- Phase 1 (extract `--sk-*` into a shared `stockly-base.css`), Phase 3
  (admin Appearance panel = the merchant knobs), Phase 4 (propagate tokens
  to registration form / product panel / FPQ banner), Phase 5 (conditional
  nav visibility by tag) remain — see the plan doc.
- Deferred (needs JS work): per-line retail→wholesale strikethrough and a
  +/- qty stepper.
