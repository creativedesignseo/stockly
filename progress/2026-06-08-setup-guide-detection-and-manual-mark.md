# Fix Setup-guide app-embed detection + add manual "Mark as done" override

**Date:** 2026-06-08 (started)
**Status:** completed
**Owner:** both
**Related:** HANDOFF.md (Setup guide), tasks/current.md (Registration Form / form builder UX), `app/routes/app._index.tsx`, `prisma/schema.prisma`

## Objective

The dashboard Setup-guide step "Activate Stockly in your store" never
flipped to Done even with the app embed toggled ON in the theme. Diagnose
the real cause from prod (not assumptions), fix it, and — at Jonatan's
request — add a manual override so the merchant can mark any step done by
hand (the Quick Order Form step has no auto-detection at all, so the guide
could otherwise never reach 4/4).

## Files inspected

- `app/routes/app._index.tsx` — the dashboard loader runs
  `detectStocklyEmbedEnabled(admin)`, which reads the MAIN theme's
  `config/settings_data.json` via `admin.graphql` (OnlineStoreTheme files
  API, `read_themes`) and `JSON.parse`s it.
- Fly logs (`fly logs --no-tail`) — showed the actual failure:
  `[setup-guide] embed detection failed: SyntaxError: Unexpected token '/', "/*`.
- `prisma/schema.prisma` — `model Shop` (where the manual-override field landed).
- `extensions/quick-order-form/blocks/stockly-embed.liquid` — confirmed the
  embed block handle is `stockly-embed`.

## Root cause

NOT scopes, NOT a re-grant, NOT the wrong theme. `read_themes` was granted
and the theme read fine. Shopify ships `settings_data.json` as **JSONC**
with an auto-generated `/* … */` header comment, so a raw `JSON.parse`
threw, the `catch` returned `null`, and the step stayed pending.

## Files changed

- `app/routes/app._index.tsx`:
  - Added `stripJsonComments()` (string-aware: preserves `https://` inside
    string values) and parse the theme config through it → detection works
    (commit `4bf4f99`).
  - Added an `action` + `Shop.setupManualSteps`-backed manual override:
    each not-done step shows a "Mark as done" button; manually-completed
    steps show "Marked as done manually · Undo". A step is done if
    auto-detected OR present in `setupManualSteps`. Auto-detected steps
    have no Undo (they reflect real store state) (commit `b8b8a8e`).
- `prisma/schema.prisma`: `Shop.setupManualSteps String[] @default([])` —
  additive, persists manual completions in the DB (cross-device).

## Commands run

```
fly logs --app stockly-lustrous-forest-4364 --no-tail   # diagnosis
bash scripts/verify.sh                                   # green (105 tests)
npx prisma generate
git push origin main
fly agent restart                                        # cleared a local fly-agent.sock timeout
fly deploy --remote-only --wait-timeout 300 --app stockly-lustrous-forest-4364
```

## Verification

- `verify.sh` green at each step.
- First `fly deploy` aborted on the `release_command` machine with a local
  `fly-agent.sock: i/o timeout` — prod stayed on v75 (Fly aborts cleanly,
  no downtime). `fly agent restart` + retry succeeded.
- Post-deploy prod reality (verified, not assumed):
  - Fly `v77`, root + `/healthz` HTTP 200, machine health check passing.
  - Release log: `🚀 Your database is now in sync with your Prisma schema`
    → `Shop.setupManualSteps` column applied.
  - No `SyntaxError` and no Prisma errors in logs after deploy.
- Earlier (v75) Jonatan confirmed visually that the embed step flipped to
  Done after Refresh ("3 of 4 steps completed").

## Open risks

- `release_command` (`prisma db push`) timeouts are a known recurring
  gotcha on this project (see HANDOFF "Deploy gotcha" notes). The fix here
  was `fly agent restart` + `--wait-timeout 300`; the push itself is fast
  (312 ms, instant `ADD COLUMN`).
- The QOF step (`done: null`) is now completable only via the manual mark
  by design — there is no storefront detection for it yet.

## Next step

Jonatan: reload the dashboard, open "Add the Quick Order Form" and click
"Mark as done" to take the guide to 4/4. No further code needed.
