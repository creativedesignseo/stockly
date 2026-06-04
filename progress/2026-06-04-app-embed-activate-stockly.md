# 2026-06-04 — "Activate Stockly" app embed + Setup-guide auto-detection

## Objective

Jonatan noticed Stockly does NOT appear in the theme editor's **App embeds**
list (where Sami, BSS, Klaviyo, Judge.me show a toggle), and that Sami's
Setup guide step "Integrate Theme" auto-detects activation with a **Refresh
→ ✓**. Root cause: Stockly had NO app embed at all — all 4 of its blocks are
`target: "section"` (app blocks placed inside pages), so there was nothing to
toggle under "App embeds", yet the dashboard Setup guide step 1 told the
merchant to "enable the app embed" and linked to that empty panel.

Decision (with Jonatan): give Stockly the **same pattern as Sami** — a real
app embed "switch" + auto-detection in the Setup guide.

## Files changed

1. **`extensions/quick-order-form/blocks/stockly-embed.liquid`** (NEW) — the
   app embed block. `"target": "body"`, no settings (toggle only), name
   "Stockly". Loads `stockly-base.css` globally (tokens are host-scoped → no
   visual side-effect) and sets `window.__stocklyActive = true`. Handle
   `stockly-embed` is the key the admin reads for detection.
2. **`shopify.app.toml`** — added `read_themes` to `scopes` (needed to read
   the theme's `settings_data.json`). **This changes the granted scopes →
   the merchant must RE-GRANT on next app load.**
3. **`app/routes/app._index.tsx`**:
   - New `detectStocklyEmbedEnabled(admin)` — reads the active (`role:main`)
     theme's `config/settings_data.json` via the Asset REST API, scans
     `current.blocks` for a block whose `type` contains `/stockly-embed/`
     with `disabled !== true`. Returns true / false / null (null = scope not
     granted or unreadable → never throws; dashboard always renders).
   - Loader runs it in parallel with the existing counts; returns
     `setup.embedEnabled`.
   - `SetupGuide` step "embed" now uses `done: embedEnabled` (was hardcoded
     `null`) and gained a **Refresh** button (`useRevalidator().revalidate()`)
     so the merchant can re-check after toggling, exactly like Sami.

## Verification

- `bash scripts/verify.sh` → **all checks passed** (lint, tsc, extension
  build, Remix build). The pre-existing Polaris `@media print` CSS warning is
  unrelated.
- NOT yet validated: that Shopify accepts the new `target: "body"` app embed
  schema — that only surfaces on `shopify app deploy`. And the live
  Refresh→Done loop can only be confirmed on the dev store after deploy +
  re-grant.

## Deploy plan (NOT done — needs Jonatan's explicit go)

This change spans extension + scope + admin, so it needs BOTH pipelines:
1. **`npx shopify app deploy`** — publishes the new `stockly-embed` app embed
   AND the new `read_themes` scope. → Stockly appears under "App embeds";
   merchant must **re-grant permissions** (reopen the app) for `read_themes`.
2. **`fly deploy`** — ships the loader detection + Setup-guide Refresh.

Order: deploy both, reopen the app to re-grant `read_themes`, then in the
theme editor → App embeds → toggle **Stockly** ON → back in the dashboard
click **Refresh** → step 1 should flip to **Done**.

Until `read_themes` is granted, `detectStocklyEmbedEnabled` returns null and
the step shows the manual CTA (no error, dashboard fine).

## Open / next

- After deploy: confirm the embed appears + the Refresh→Done loop works.
- Consider auto-detecting the QOF block step too (harder — must scan page
  templates, not just app embeds). Out of scope here.
- Possible v2: make the embed FUNCTIONAL (inject a wholesale-customer
  detection script so pricing applies on all pages without placing blocks) —
  the "Embed funcional" option Jonatan deferred.
