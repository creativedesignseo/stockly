# 2026-08-21 — Close-out: verify reality, refresh the graph, publish

## Objective

Run the "cierra y publica" ritual after the App Store corrections were
resubmitted: verify against reality (never assume), sync the docs to what
was actually observed, refresh the code graph, commit and push.

## Verified today (observed, not assumed)

- `bash scripts/verify.sh` → **green**. Exact counts read from the runner
  rather than carried over from an earlier commit message: **156 app tests
  across 14 files**, plus the extension fixtures (14 + 8) and both builds.
  (An earlier draft of the HANDOFF entry said 162; corrected before commit.)
- Production, live over HTTPS: `/healthz`, `/`, `/legal/privacy`,
  `/legal/terms`, `/auth/login` → all **200**. All four mandatory webhooks
  (`customers/redact`, `shop/redact`, `app/uninstalled`,
  `customers/data_request`) → **401** against a forged HMAC. App Bridge
  served from Shopify's CDN in the served HTML.
- Marketing site: `stocklygo.site` **200**, `/privacy` redirect **200**.
- Railway: deployment `dfda1b4a` **SUCCESS**, `stockly` + both Postgres
  services Online. Usage $1.20 of the $5 included in Hobby at mid-cycle
  (98% RAM, egress 0.01 GB) → the month costs the flat $5.
- App Store: status **"In review / We're reviewing your response"** since
  the corrections were resubmitted earlier today.

## Changed

- `.gitignore` — added `Promo/`. It held 851 MB of screencast footage,
  untracked but **not ignored**: a single `git add -A` would have committed
  it. It was already excluded from Railway and Docker builds; git was the
  gap.
- `HANDOFF.md`, `tasks/current.md` — close-out entries with the numbers
  above.
- `graphify-out/` — refreshed outputs, including the 2026-08-20 and
  2026-08-21 snapshots (the dated directories are versioned, matching the
  convention from 2026-08-11..15).

## Open risks / notes

- **The graph's semantic pass is stale.** `graphify --update` did the
  incremental scan (125 code, 25 docs, 20 images changed) but refused the
  semantic extraction: no LLM API key configured on this machine
  (`GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / etc.). The **code** graph is
  current; doc/paper/image labels are not. Set a key before relying on the
  graph to answer questions about docs or media.
- Transient macOS TCC glitch mid-session: `~/Documents` and `~/Downloads`
  returned `Operation not permitted` for a few minutes, then recovered on
  its own. Nothing was lost and no system setting was changed. Worth
  remembering if it recurs — the first instinct (a permanent permission
  revocation needing System Settings) was wrong.

## Next step

Nothing. Wait for Shopify's verdict at `info@adspubli.com`. On approval:
reinstall Piro, rotate the client secret, re-enable `customers/update`.
