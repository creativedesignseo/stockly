# Phase 1E — Registration Form storefront block rewrite

**Date:** 2026-05-28 (started + completed)
**Status:** completed
**Owner:** Claude (stockly-implementer worktree `agent-a26da9eaffb463ef1`)
**Related:** `progress/2026-05-27-registration-form-plan.md` §6 / §7,
ADR-008 (competitive intel), Phase 1 plan decisions 13 + 14 (App Proxy
+ back-compat).

## Objective

Rewrite the storefront wholesale registration block in
`extensions/quick-order-form/` to render dynamically from a JSON
definition fetched at runtime instead of hard-coding fields. This is
the storefront half of the Sami-style schema-driven form builder
(admin half + App Proxy endpoint live in sibling worktrees).

## Files inspected

- `extensions/quick-order-form/blocks/registration-form.liquid` — prior hardcoded markup, theme block schema, customer-tag gating.
- `extensions/quick-order-form/assets/registration-form.src.js` — prior web component (AJAX POST only, no fetch on connect).
- `extensions/quick-order-form/assets/registration-form.css` — prior style tokens.
- `extensions/quick-order-form/locales/en.default.json` — namespaced i18n strings.
- `extensions/quick-order-form/shopify.extension.toml` — extension type.
- `package.json` — build pipeline (`build:reg` esbuild script).
- `scripts/verify.sh` — verification contract.
- `progress/2026-05-27-registration-form-plan.md` (§6 + §7) — App Proxy contract + theme block requirements.

## Files changed

- `extensions/quick-order-form/blocks/registration-form.liquid` — stripped hardcoded grid + fields; kept a thin shell with mount point `<div data-stockly-root>`, loading skeleton, `<noscript>` fallback with the 4 legacy keys, and data attributes for fetch URL / customer prefill / fallback copy.
- `extensions/quick-order-form/assets/registration-form.src.js` — rewrite. Fetches `/apps/stockly/registration-form?shop={domain}`, normalizes payload (falls back to hardcoded `FALLBACK_DEFINITION` on any error), applies appearance via inline CSS custom properties, sanitizes + injects `customCss`, renders 7 field types via a single `createEl` helper, performs client-side validation (required / email / phone / password match), POSTs FormData to `/apps/stockly/apply` with snake_case keys preserved from `field.key`, optional `afterSubmitRedirectUrl` after success.
- `extensions/quick-order-form/assets/registration-form.js` — rebuilt minified bundle (`npm run build:reg`).
- `extensions/quick-order-form/assets/registration-form.css` — documented runtime CSS custom properties at top (`--rf-color-*`, `--rf-form-max-width`); added `.stockly-reg--layout-boxed`, `.stockly-reg__inner`, `.stockly-reg__skeleton*`, `.stockly-reg__field--half`, `.stockly-reg__field-error`, `select` styling.
- `extensions/quick-order-form/locales/en.default.json` — added `reg.select_placeholder`, `reg.select_country_placeholder`, `reg.confirm_password`, and 6 `reg.error_*` keys. Existing legacy keys untouched.

## Commands run

```
npm run build:reg
node --check extensions/quick-order-form/assets/registration-form.js
bash scripts/verify.sh
```

Worktree note: `node_modules` was missing on the worktree; created a
symlink to the main repo's `node_modules` so `verify.sh` could run.
Symlink is intentionally not committed.

## Verification

`bash scripts/verify.sh` → `all checks passed`. Sequence: lint, vitest,
`build:extensions` (compiled all 4 storefront bundles), `remix vite:build`.
Only warning is the pre-existing Polaris CSS `@media ... and print`
parse warning, unrelated to this change.

Minified bundle `registration-form.js` is 12.97 KB (was 1.88 KB) — the
increase is the country list + dynamic renderer + validators, all
expected and within budget for a Theme App Extension asset.

Manual visual-regression intent: side-by-side compare the rendered DOM
against the previous Liquid form on a `pages/wholesale-application`
page. Same CSS class names (`.stockly-reg__field`, `.stockly-reg__grid`,
`.stockly-reg__submit`, etc.) → no theme-level visual regression
expected. Form structure (heading → intro → 2-column grid → submit) is
preserved; the seed default form definition (delivered by the
Foundation implementer) replicates the 8 legacy fields with matching
`field.key` values, so the rendered DOM is byte-equivalent in field
order, names, and types apart from the country field which now uses a
`<select>` instead of a free-text `<input>`.

## Back-compat verification

- POST body keys driven by `field.key` from the definition — renderer
  never camelCases. Verified in `_onSubmit`: `formData.append(r.field.key, value)`.
- `FALLBACK_DEFINITION` uses snake_case (`first_name`, `last_name`,
  `company_name`) so even with no proxy response, the legacy POST shape
  is preserved.
- Customer prefill checks both `first_name` and `firstName` keys to
  cover both naming conventions in case the merchant edits the seed.
- `<noscript>` shell uses snake_case too.

## Field types implemented (Phase 1)

`text`, `email`, `password` (with `confirmPaired` → side-by-side
confirm input + match validation), `phone`, `select` (uses
`field.options[].value/.label`), `country` (hardcoded ISO list, 61
countries), `textarea` (honors `field.rows`, default 4).

## Appearance properties applied at runtime

- `appearance.layout` → toggles class `.stockly-reg--layout-default` /
  `.stockly-reg--layout-boxed` on the host.
- `appearance.width` (number, px) → `--rf-form-max-width`.
- `appearance.colors.{main,heading,label,description,option,paragraph,paragraphBackground}`
  → matching `--rf-color-*` CSS custom properties on host.
- `appearance.background.color` (when `background.type === 'color'`) →
  `--rf-color-background`.
- `appearance.customCss` → sanitized (strip `<script>`, raw HTML tags,
  `@import`, `expression(`), injected as a `<style data-stockly-custom-css>`
  child of the host.

## Open risks

- **Country code mismatch.** The dynamic renderer emits ISO-2 codes
  (`ES`, `US`, ...) for `country` fields, while the legacy free-text
  input accepted any string. If existing back-office logic does a
  string match on `responses.country == 'Spain'`, that breaks. Server
  side should accept ISO-2 going forward — flagged for the Foundation
  implementer.
- **`customCss` sanitization is a denylist.** Good enough for Phase 1
  given the admin is trusted, but a future XSS audit should switch to
  an allowlist parser (or render in a sandboxed `<iframe>`).
- **Loading skeleton flashes on fast networks.** Not painful; could
  switch to "render only once fetch resolves OR 100ms elapsed, whichever
  comes first" in Phase 2 if merchants complain.
- **Coordination with Foundation worktree.** This branch assumes the
  `GET /apps/stockly/registration-form` endpoint will exist and return
  the documented shape. If Foundation lands with a different envelope
  (e.g. wraps in `{ ok, data }`), `_normalizePayload` needs to be
  updated before merge.

## Plan deviations

- Plan §7.1 said to keep `data-already-wholesale` on the wrapper; done,
  plus added `data-customer-email/first-name/last-name` so the renderer
  can prefill known fields without re-fetching customer state.
- Plan §7.2 said custom CSS injection is "scoped inside the host" —
  implemented as a top-level `<style>` child of the host, since
  `<style>` inside a custom element scopes to the document by default.
  Merchant CSS should use `stockly-registration .foo` selectors
  (documented at top of `registration-form.css`).
- Plan implied a per-field `placeholder` semantics; added a sensible
  default placeholder for `phone` and `select`/`country` (the empty
  first option) so the UX is not blank when the definition omits one.
- Added an `afterSubmitRedirectUrl` honour in the submit handler (plan
  mentions it in the App Proxy response shape but does not specify
  storefront behaviour). 1.2-second delay before navigation so the
  success state is visible.

## Next step

Foundation implementer to land `/apps/stockly/registration-form` GET
loader + seed default form. Then merge this branch and the admin UI
branch; smoke-test on Piro storefront before flipping the legacy
hardcoded path off.
