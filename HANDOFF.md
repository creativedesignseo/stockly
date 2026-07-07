# HANDOFF — Resume work hands-off

> Read this first if you're starting a fresh session on Stockly.
> Single source of truth for current state + resume instructions.

**Last updated:** 2026-07-07 — **Shopify app deploy shipped (`stockly-43`, LIVE), Railway pre-deploy pipeline fix committed+pushed but NOT yet activated by a real Railway deploy, `FLY_API_TOKEN` GitHub secret deleted.** Verified this session, not assumed: `bash scripts/verify.sh` green (lint, tsc, 105 app tests, 13 extension tests, both builds); `curl -sI https://stockly-production-5ccf.up.railway.app/` → `HTTP/2 200`; `railway status` → Postgres service Online, region `sfo`, volume 116 MB/500 MB; `npx shopify app versions list` → `stockly-4[3] ★ active`, confirming the deploy actually landed on Shopify's side (not just locally committed). Full detail of this turn's 3 actions:
  1. **`npx shopify app deploy --allow-updates` → `stockly-43` released and confirmed ACTIVE** (message: "Fly to Railway URLs + Discount Function clock bug fix (shop.localTime)"). Ships the `shopify.app.toml` Railway URLs (was Fly, uncommitted-then-committed fix from the prior session) + the Discount Function clock-bug fix (`shop.localTime` instead of `new Date()`) to Shopify Partners. Gated through `deployment-guardian` first (GO verdict, independently re-ran `verify.sh` and confirmed the commits on disk before deploying). Non-blocking pre-existing warning repeated: `registration-form.js` (14,629 B) exceeds the 10,000 B app-block threshold — deploy succeeded anyway, trim is still a tracked follow-up.
  2. **Railway pre-deploy pipeline fix — commit `dd7a02e`, pushed to `main`.** Added `railway.json` (`deploy.preDeployCommand: npx prisma db push --skip-generate`, mirroring Fly's old `release_command`) + updated `Dockerfile` comments to reference Railway instead of Fly. **⚠️ NOT YET ACTIVE**: per HANDOFF's own prior note, Railway deploys are MANUAL (`railway up` / dashboard), not triggered by `git push` — confirmed still true (`railway status` shows only the Postgres service info, no auto-deploy fired from the push). The `preDeployCommand` will only run on the next actual Railway deploy, and that first run against the live Railway Postgres is UNTESTED. **Pending Jonatan's go-ahead to run `railway up`** (asked, not yet answered as of this update).
  3. **`FLY_API_TOKEN` GitHub Actions secret deleted** (confirmed via `gh secret list` → now empty). Was already orphaned since the `fly-deploy.yml` workflow that consumed it was deleted 2026-07-03.
  - **Railway billing note (told to Claude by Jonatan, not independently re-verified via browser this session):** Trial Plan, one-time $5 credit, ~$0.89 consumed / ~$4.11 left as of 2026-07-07, no card on file (Railway stops deploys rather than auto-charging if credit runs out). ~99% of cost is RAM; DB storage and egress are both near-zero today. Saved as memory `railway-billing-trial-status` — treat as a point-in-time snapshot, re-check Workspace→Usage before relying on it for a scaling decision.

Prior 2026-07-03 — **Fly→Railway migration discovered + verified, Discount Function clock bug found and fixed (code committed, NOT yet deployed as of that session — since resolved above).** Session started because the HANDOFF still said Fly.io was production; found an uncommitted `shopify.app.toml` diff pointing at Railway and confirmed the Fly domain (`stockly-lustrous-forest-4364.fly.dev`) no longer resolves DNS at all — **production is now Railway** (`stockly-production-5ccf.up.railway.app`, project "adequate-learning", service "stockly", region `sfo`). Ran a 6-domain audit (auth/session, Partners config drift, extensions, DB schema, env vars, hardcoded URLs) via a parallel-agent workflow, then verified the most serious finding by hand. **Verified facts:**
  - **Railway's Postgres is schema-complete but data-empty** (fresh install, not a migrated copy of Fly's data): `Shop` row created 2026-06-24, `Application`/`Tier`/`WholesaleCustomer` all = 0. No revenue-path data was lost in the sense of "existed and got wiped" — the old Fly data's fate is simply unknown/irrelevant now (dev store, no real customers yet).
  - **The stored OAuth session's access token is expired** (1hr TTL) but this is EXPECTED and SELF-HEALING: `app/shopify.server.ts` has `expiringOfflineAccessTokens` + `unstable_newEmbeddedAuthStrategy` enabled, and traced SDK internals confirm `authenticate.webhook()` auto-refreshes it via the stored `refreshToken` (valid until 2026-09-22) before every webhook handler runs. No cron needed. ⚠️ If nobody reopens the app in Shopify admin before 2026-09-22, webhooks will start 500ing until someone does — put this on a calendar.
  - **CONFIRMED a real Discount Function bug** (not just a test artifact): `run.ts`'s ADR-012 active-date-window filter used `new Date().toISOString()`, but Shopify Functions execute in a deterministic sandbox with **no real wall clock** — `Date.now()`/`new Date()` return a fixed epoch there, in production too, not just in local tests. Confirmed by reading `schema.graphql`: Shopify exposes `shop.localTime` specifically to solve this (day-granularity `date` field + comparison helpers). **Fixed**: `run.graphql` now requests `shop.localTime.date`, `run.ts` compares tier `startsAt`/`endsAt` at date granularity against it. All 8 fixtures pass now (were 5/8). No real tiers exist in Railway's DB yet, so this wasn't actively mis-discounting any live order — caught before it could bite. Full detail: `progress/2026-07-03-railway-migration-audit-and-clock-bug-fix.md`.
  - Also fixed/cleaned this session (all committed, none deployed): `shopify.app.toml`'s Fly→Railway URLs (was sitting uncommitted), added a `test:extensions` script + wired it into `scripts/verify.sh` (root `vitest.config.ts` never covered `extensions/`, which is how the clock bug shipped undetected), deleted the dead `.github/workflows/fly-deploy.yml` + `fly.toml.bak`, marked `fly.toml` historical, corrected live legal pages (`/legal/privacy`, `/legal/terms`) that still named Fly.io as the hosting sub-processor, and a batch of Fly→Railway code-comment corrections.
  - `verify.sh` green throughout (lint, tsc, 105 app tests, 13 extension tests, both builds).
  - **⏳ PENDING Jonatan's explicit go-ahead, per AGENTS.md (none of this is deployed yet):** (1) `shopify app deploy` — ships the committed `shopify.app.toml` fix + the Discount Function fix to Shopify Partners (active version `stockly-42` still reflects the pre-migration Fly config); (2) a Railway pre-deploy pipeline fix (`prisma migrate deploy` doesn't currently run on Railway deploys — the Dockerfile still assumes Fly's `release_command` model; not broken today since the DB is schema-current, but the next schema change won't apply itself); (3) deleting the now-orphaned `FLY_API_TOKEN` GitHub secret (external-system action, not done automatically).

Prior 2026-06-08 — **Piro landing analysis (no code change)**: verified Piro's live B2B state via Admin API (read-only) — Piro on plan Basic ALREADY runs wholesale pricing via a Markets/Catalog **Price List at −65%** (+ an `AppCatalog` an installed app manages, 29 `WHOLESALE`-tagged products). This conflicts head-on with Stockly's Discount-Function engine → **Stockly install on Piro is ON HOLD pending a pricing-engine decision** (see Pilot status note + `progress/2026-06-08-piro-landing-analysis.md`). No prod/code change this turn. Prior same day — **Setup-guide manual "Mark as done" override LIVE** (Fly `v77`, commit `b8b8a8e`): every Setup-guide step now has a manual override so the merchant is never stuck — a "Mark as done" button on each not-done step, "Marked as done manually · Undo" on the manual ones. A step is Done if auto-detected OR listed in the new `Shop.setupManualSteps String[] @default([])` column (additive, applied in prod via `release_command` `prisma db push` — release log `🚀 Your database is now in sync`). This unblocks the **Add the Quick Order Form** step, which has no auto-detection (`done: null`) and could otherwise never reach 4/4. Auto-detected steps (embed/pricing/form) have no Undo — they reflect real store state. Admin-UI + additive schema field → `fly deploy` only, NO `shopify app deploy`; revenue path untouched. Deployment-guardian gated GO; first `fly deploy` aborted on a local `fly-agent.sock` timeout (prod stayed v75, no downtime), `fly agent restart` + `--wait-timeout 300` retry succeeded → v77. `verify.sh` green (105 tests). Journal: `progress/2026-06-08-setup-guide-detection-and-manual-mark.md`. ⏳ Pending Jonatan: open the QOF step → "Mark as done" → guide hits 4/4. Prior same day — **App-embed Setup-guide auto-detection FIXED & LIVE** (Fly `v75`, commit `4bf4f99`): the dashboard Setup-guide step 1 "Activate Stockly" never flipped to Done even with the app embed toggled ON. `detectStocklyEmbedEnabled()` read the theme's `config/settings_data.json` fine (`read_themes` granted) but ran a raw `JSON.parse` on it; Shopify ships that file as **JSONC** with an auto-generated `/* … */` header, so parse threw `SyntaxError: Unexpected token '/'` → `catch` → `null` → step stayed pending. Confirmed via Fly logs (`[setup-guide] embed detection failed: SyntaxError`). Fix: added `stripJsonComments()` (string-aware, preserves `https://` in values) and parse through it. Admin-UI only (`app/routes/app._index.tsx`) → `fly deploy` only, NO `shopify app deploy`; revenue path untouched. `verify.sh` green. ⏳ Pending Jonatan: reload the dashboard + click Refresh on step 1 → should flip to Done. Prior 2026-06-05 — **Phone field flag dropdown + integrated Shopify-native look LIVE** (Shopify `stockly-40`, commit `334db58`): the registration phone field's country-code `<select>` was upgraded to a flag dropdown integrated into the field (Shopify-native styling), refining the `stockly-39` dropdown. Storefront extension only → released via `npx shopify app deploy` (NO `fly deploy`); revenue path untouched. `verify.sh` green. Non-blocking deploy warning persists: `registration-form.js` 14.6 KB > 10 KB app-block threshold (tracked trim follow-up). Prior 2026-06-04 — **Phone field country-code dropdown LIVE** (Shopify `stockly-39`): the registration form's phone field now renders a country-code `<select>` (dial codes from the COUNTRY list, Spain default) + a national-number input, so customers never type the +34 prefix; at submit `getValue()` combines dial+number (respects a full +international number if typed). Also fixed embed auto-detection (was `admin.rest` undefined → now `admin.graphql` reading the MAIN theme's settings_data.json; Fly). Earlier same day: **'Activate Stockly' app embed LIVE** (Shopify `stockly-38` + Fly): new `stockly-embed` block (`target: body`) → Stockly now shows under the theme editor's "App embeds" toggle (like Sami); dashboard Setup-guide step 1 auto-detects it via `read_themes` (Asset API → settings_data.json) + a Refresh button. **`read_themes` scope ADDED → merchant must RE-GRANT (reopen app).** `progress/2026-06-04-app-embed-activate-stockly.md`. ⏳ Pending Jonatan: re-grant, toggle Stockly ON in App embeds, then dashboard → Refresh → step flips to Done. **Same day: the dashboard Setup guide was redesigned to the Sami-style collapsible accordion** (only the first incomplete step open; circular status icons — filled black check when done, dashed ring when not — replacing the Done/To do badges; "X of 4 steps completed"). Admin-UI only, Fly redeploy. Earlier same day: prod state VERIFIED by read-only query; **Camino B (opening-order minimum) Fases 1+2+3 DEPLOYED & CONFIGURED in prod**, but the checkout-block E2E was set up and then REVERTED (not completed) — full journal `progress/2026-06-04-camino-b-prod-verification.md` (also `progress/2026-06-03-camino-b-opening-order-fase1-2.md`). New B2B model decided with Jonatan: a wholesale customer is approved manually → sees wholesale pricing immediately → but their FIRST order must hit a minimum (€/qty) to become a full wholesaler; reorders are free; the merchant "releases" them with one click (no dependency on privacy policy / orders-paid). This supersedes the half-wired ADR-004 price-side FPQ (see `docs/decisions/ADR-016-opening-order-minimum.md`). **Fase 1 (DONE, commit `655d597`):** `approveCustomer` leaves `qualifiedAt=null` (= "owes opening order"); `discount-function-sync` now surfaces EVERY approved customer in `qualifiedCustomers` so the discount is gated on "is approved" not on qualifiedAt (keeps bug C3 fixed; the Discount Function WASM was NOT touched). First server-side revenue-path test added (`discount-function-sync.test.ts`, guards C3). **Fase 2 (DONE):** admin `applications` page shows an opening-order badge (pending/met, only when `fpqMode != none`) + a one-click "Release from opening order" action (`releaseOpeningOrder` → qualifiedAt=now). **✅ DEPLOYED 2026-06-03** (Fly manual `fly deploy --remote-only`, post-v66; release_command prisma db push = no-op since the FPQ fields already existed). Camino B Fases 1+2 + "Approve from the detail modal" are now LIVE. **Fase 3 (the checkout gate) is now LIVE too** (`stockly-36` + Fly, 2026-06-03): `opening-order-sync.server.ts` writes the Validation's config metafield (min + pending GIDs) on approve / release / settings save, and the `stockly-opening-order` function enforces the minimum at checkout. **✅ VERIFIED IN PROD 2026-06-03 (read-only DB query):** the gate is fully CONFIGURED on `desarrollo-adspubli.myshopify.com` — `fpqMode='amount'`, `fpqAmount=200`, `wholesaleBaselinePct=60`, `write_validations` re-granted. The two pre-conditions the prior note listed (re-grant scope + set fpqMode & save) are DONE; the HANDOFF was simply stale. **Mechanism correction:** the Validation is created/refreshed by `syncOpeningOrderValidation` on ANY of approve / release / settings-save (`app.customers.applications.tsx:475` & `:229`, `app.settings.pricing.tsx:165`) — NOT only the settings Save, as previously written. **Current functional state:** `pendingOpeningOrder = 0` of 3 wholesale customers — all 3 existing customers are already `qualifiedAt != null` (qualified/released), so the Validation's pending list is EMPTY and NOTHING is blocked at checkout right now. The gate only bites a customer approved AFTER the Camino B change who hasn't placed their opening order. **To actually SEE it block (E2E, still pending):** approve a NEW test customer → lands on the pending list (`qualifiedAt=null`) → cart below €200 is blocked at checkout, at/above passes, "Release" frees them. **Not yet verified (non-blocking):** that the `stockly-opening-order` Validation object itself exists+active in Shopify — confirmable via a GraphQL `validations` query with the app token. Storefront focus fix (single `--sk-accent` border, no theme box-shadow) shipped as `stockly-35`. **PENDING: Fase 3** = the actual checkout block — a NEW Cart & Checkout Validation Function (`cartValidationsGenerateRun`), CHECKOUT-CRITICAL, needs Shopify CLI auth for `typegen` + fixtures + confirming how it reads its config metafield. **Fase 4** = connect the cart/QOF "you need €X more" banner. **Fase 5** = ADR superseding ADR-004 + verify + deploy (`shopify app deploy` + `fly deploy`). `verify.sh` green. Prior 2026-06-02: **Storefront premium Phase 1 + Phase 4 LIVE** (Shopify `stockly-31`, ADR-015, `docs/design/storefront-premium-plan.md`; `progress/2026-06-02-storefront-premium-phase1-phase4.md`). Killed the "Frankenstein": the `--sk-*` token set now lives ONCE in a shared `extensions/quick-order-form/assets/stockly-base.css` (Phase 1, declared on a 4-host selector so the accent precedence chain still sees per-host inline overrides), loaded by each block's `.liquid` via `{{ 'stockly-base.css' | asset_url | stylesheet_tag }}`. The other 3 storefront blocks re-skinned onto it (Phase 4): `fpq-banner.css` + `wholesale-product-panel.css` pure re-skins (classes + `data-stockly-*` hooks + block JS untouched); `registration-form.css` light-touch — its `--rf-color-*` RUNTIME CONTRACT (injected by `registration-form.js` from the admin appearance JSON) preserved, only its *defaults* now derive from `--sk-*` (submit button goes bronze by default; merchant override still wins). Added shared `--sk-success*`/`--sk-danger*` semantic tokens. Text anchored to px (theme-proof). `verify.sh` green. CSS+Liquid only → released via `npx shopify app deploy` (NO `fly deploy`); revenue path untouched. **⏳ Pending Jonatan visual confirm: product page (panel), cart (FPQ banner), registration page — QOF unchanged.** (Pre-existing non-blocking deploy warning: `registration-form.js` 13 KB > 10 KB app-block threshold — trim is a tracked follow-up.) Prior 2026-06-02: **QOF merchant Appearance knobs LIVE** (Shopify `stockly-30`, ADR-015). The Quick Order Form theme-editor panel now has an **"Appearance"** group with three opinionated knobs: **accent color** (precedence chain: block setting → App Proxy branding → bronze fallback, so a color set in the editor wins over shop branding), **density** (comfortable/compact) and **text size** (small/medium/large). Emitted as inline CSS custom properties (`--sk-accent-theme`, `--sk-pad`, `--sk-cell-pad-y`, `--sk-text-base`) on the host; fixed steps only, so the merchant can't break the design. Pure CSS+Liquid — `data-stockly-*` contract + pricing JS untouched → `shopify app deploy` only, NO `fly deploy`. `verify.sh` green. ⏳ Pending Jonatan visual confirm in dev store (open the QOF block in the theme editor, expand Appearance). Prior 2026-06-01: **Quick Order Form premium re-skin LIVE** (ADR-015, Shopify `stockly-29`). The QOF storefront block moved to the canonical `--sk-*` premium token set (Stockly's own type scale / palette / shadows, NOT theme-inherited) + a REAL mobile **card** layout (was a shrinking table). Pure re-skin: every `.stockly-qo__*` class and `data-stockly-*` JS hook preserved, pricing/cart JS untouched; validated visually (desktop + 390px) on real block markup before deploy. CSS+liquid only → `shopify app deploy`, NO `fly deploy`. Design direction decided with Jonatan: **premium opinionated** (few merchant knobs, can't be made ugly) — see `docs/decisions/ADR-015-storefront-design-premium.md` + `docs/design/storefront-premium-plan.md` (phases 1,3,4,5 pending). **⏳ Pending Jonatan visual confirm in dev store.** Prior same-day: RF editor **Live preview now renders inside the App Bridge max modal** (was blank): `chrome="modal"` swaps Polaris `<Layout>` for an explicit 2-col CSS grid; `chrome="page"` unchanged. LIVE Fly v66 (admin-UI only). Read-only RESCUE AUDIT still open (see `tasks/current.md` + `progress/2026-05-29-rescue-deep-read-and-interview.md`)
**Last commit:** `dd7a02e` fix(deploy): wire prisma db push into Railway's preDeployCommand (2026-07-07, `railway.json` + Dockerfile comments; pushed to main, NOT yet activated by a real Railway deploy). Prior `2ab198f` chore(graphify): commit updated knowledge graph outputs; `340206c` docs: sync HANDOFF/tasks/ADR with verified Fly→Railway reality + clock-bug fix; `0310200` docs: correct Fly.io references now that Railway is the host; `3af6c2d` chore: mark fly.toml historical + Railway note in backfill runbook; `8a13540` fix: shopify.app.toml Fly→Railway URLs — **now LIVE on Shopify Partners as `stockly-43`** (deployed 2026-07-07, see "Last updated" above; this HANDOFF entry previously said "NOT yet pushed to Partners", that's now resolved); `a320048` chore(ci): wire extension vitest suites (`test:extensions`) into verify.sh; `1c52c5e` fix(functions): Discount Function active-date filter now reads `shop.localTime` instead of a broken `Date()` — **also now LIVE in `stockly-43`** — see `progress/2026-07-03-railway-migration-audit-and-clock-bug-fix.md`. Prior `8d3d925` feat(webhooks): auto opening-order enrollment for external wholesale approvals (2026-06-23). Older history below predates the Fly→Railway migration and the commit hashes referenced in it are historical. Prior `b8b8a8e` feat(admin): manual "Mark as done" override on Setup-guide steps — was LIVE on Fly `v77` 2026-06-08 (Fly is now decommissioned; see "Last updated" above). Prior `9eb969e` docs: app-embed detection fixed (Fly v75); `4bf4f99` fix(admin): parse JSONC settings_data.json so app-embed detection works — LIVE Fly `v75` 2026-06-08. Prior `f189bda` docs: phone field flag dropdown LIVE (stockly-40); `334db58` feat(registration): flag dropdown + integrated phone field (Shopify-native look) — LIVE `stockly-40` via `shopify app deploy` 2026-06-05. Prior `a79bc81` docs: phone country-code dropdown LIVE (stockly-39); `140ed3b` feat(registration): country-code dropdown on the phone field (LIVE `stockly-39`). Prior `cd53b06` fix(admin): embed detection via admin.graphql (Fly); `fc623ac` feat(admin): Sami-style collapsible Setup guide (Fly). Prior `7b974db` feat(admin): "Activate Stockly" app embed + Setup-guide auto-detection (LIVE `stockly-38` + Fly 2026-06-04). Prior `af1d930` docs: verify Camino B Fase 3 prod state + realign HANDOFF/tasks (`progress/2026-06-04-camino-b-prod-verification.md`). Prior `3ee7c74` docs: session summary 2026-06-03; `f0a2b12` feat(admin): Setup Guide widget on the dashboard; `c5499e6` docs: storefront white-label accent LIVE (stockly-37); `96ff2cf` refactor(storefront): neutral white-label accent (bronze → black); `e1b529f` style(admin): larger shop-wide pricing setup card.
**GitHub:** https://github.com/creativedesignseo/stockly
**Production URL:** https://stockly-production-5ccf.up.railway.app (Railway, region `sfo`, project "adequate-learning", service "stockly" — verified Online 2026-07-03). The old Fly URL `stockly-lustrous-forest-4364.fly.dev` no longer resolves DNS at all — Fly is decommissioned, do not deploy there.
**Host migration:** Fly.io → Railway happened around 2026-06-24 (inferred from the Railway DB's Shop.createdAt timestamp; no commit documents the cutover itself — it happened out-of-band). Railway currently has NO pre-deploy/release command wired up (unlike Fly's `release_command` in `fly.toml`), so `prisma migrate deploy`/`db push` must still be run manually against Railway after any schema change — tracked as a pending fix in `tasks/current.md`.
**Fly version (HISTORICAL — Fly is dead, kept for history only):** `v77` (manual `fly deploy --remote-only --wait-timeout 300` 2026-06-08 — Setup-guide manual "Mark as done" override + `Shop.setupManualSteps` column; admin-UI + additive schema, no `shopify app deploy`. v76 was the aborted attempt that timed out on the local `fly-agent.sock`; v77 is the successful retry after `fly agent restart`). `v75` (manual `fly deploy --remote-only` 2026-06-08 — app-embed Setup-guide detection now parses JSONC `settings_data.json` via `stripJsonComments` so the "Activate Stockly" step auto-completes once the embed is ON; admin-UI only, no `shopify app deploy`. Intermediate v67–v74 were the 2026-06-04 admin/embed-detection iterations — the HANDOFF previously lagged at v66). `v66` (manual `fly deploy --remote-only` 2026-06-01 — RF editor `chrome="modal"` split is now an explicit 2-col CSS grid (`gridTemplateColumns: minmax(320px,1fr) minmax(0,2fr)`) so the Live preview pane renders inside the App Bridge max modal instead of blank; `chrome="page"` byte-for-byte unchanged. Admin-UI only — no schema/extension/config change, so NO `shopify app deploy`. `release_command` prisma db push ran as a no-op). `v65` (manual `fly deploy` 2026-05-30 — `proxy.apply.tsx` cut over to schema-driven validation as AUTHORITATIVE: resolves the exact form the customer saw via its shortcode (`resolveStorefrontForm`) and gates on `validateResponses` against ITS definition; the legacy `validateApplication` no longer hardcodes company-required. Storefront now POSTs `__shortcode`. Needed BOTH `fly deploy` AND `shopify app deploy` since it touches `extensions/`). `v64` inline field panels in the max modal; `v63` the max modal itself.
**⚠️ Deploy gotcha (2026-05-30):** a `v64` attempt FAILED at Docker build — `@shopify/cli@4.1.0` (a stray devDep bump) requires Node ≥22.12 but the Dockerfile pins Node 20, so `npm ci --include=dev` errored `notsup`. **`scripts/verify.sh` does NOT catch this** (local Node is ≥22; the engine check only bites in the Node-20 Docker build). Fixed by reverting to `@shopify/cli@3.94.3`. Lesson: keep devDep bumps off the deploy unless the Dockerfile's Node satisfies their `engines`. Prod was never affected (build failed before release).
**Prior:** `v62` (2026-05-29 — N-forms: admin LIST → editor; v61 had failed on the `prisma db push` release_command demanding `--accept-data-loss` to ADD a UNIQUE, resolved by pre-creating `RegistrationForm_shortCode_key` + pre-filling shortCode, then v62 deployed clean).
**Shopify app version:** `stockly-40` (Registration phone field — country-code `<select>` upgraded to a flag dropdown integrated into the field, Shopify-native look; refines stockly-39. Storefront extension only; `registration-form.src.js` rebuilt → `registration-form.js`). `stockly-39` (Registration form phone field — country-code `<select>` (dial codes, Spain default) + national number input; submit combines dial+number via `getValue()`; `registration-form.src.js` rebuilt). `stockly-38` (Activate Stockly app embed — new `stockly-embed` block, `target: body`, appears under the theme editor's "App embeds" toggle like Sami; added `read_themes` scope → merchant must RE-GRANT; admin Setup-guide step 1 auto-detects the embed via Asset API + Refresh button). `stockly-37` (Storefront colour = WHITE-LABEL — `stockly-base.css` `--sk-accent` fallback changed from Stockly bronze `#9a6b34` to neutral black `#17150f`. The storefront is the MERCHANT's brand: premium/elegant design but neutral colour base; each merchant supplies their own accent (App Proxy branding / QOF Appearance knob). Stockly's real brand colour, lime `#C6F23E`, is reserved for the ADMIN (follow-up). Refines ADR-015; see memory `brand-color-stockly`). `stockly-36` (Camino B Fase 3 — NEW Cart & Checkout Validation Function `stockly-opening-order` (`cart.validations.generate.run`) that blocks checkout for an approved customer who still owes their opening order until the cart meets the minimum; reads config + pending-customer GIDs from its own metafield; fails open. Added `write_validations` scope → **merchant must RE-GRANT permissions** by reopening the app. 5 fixtures green. Pricing untouched). `stockly-35` (Registration form inputs — `box-shadow: none !important` on inputs base+focus to kill the HOST THEME's box-shadow input border, a Dawn-family pattern that drew a grey ring stacking inside our bronze border = the "two lines" bug. Now the only border decoration is our 1px `border`: grey at rest, `--sk-accent` bronze on focus. A single clean line). `stockly-34` (focus = single accent border, no halo — dropped the `0 0 0 3px` box-shadow ring that rendered as a solid second line in Safari; focus now just recolours the border to `--sk-accent` + keeps the subtle base shadow; `outline: none !important` still kills the theme's forced outline). `stockly-33` (earlier focus pass — single clean focus state, accent border + halo; the halo was the second line, removed in 34). `stockly-32` (Registration block UX — `registration-form.liquid`: short-code setting reworded as optional ("leave empty → active form"), and a new "Section padding" group with Top/Bottom padding range sliders (0–120px, default 0) applied inline on the host like native sections. CSS/Liquid/schema only; form JS + pricing untouched). `stockly-31` (Storefront premium Phase 1 + 4 — shared `stockly-base.css` `--sk-*` token asset loaded by all 4 blocks; `fpq-banner` + `wholesale-product-panel` re-skinned onto `--sk-*`; `registration-form` defaults derived from `--sk-*` with the `--rf-color-*` runtime contract preserved. CSS+Liquid only, pricing/form JS untouched). `stockly-30` (QOF "Appearance" knobs — block schema gained accent color + density + text size; `quick-order-form.liquid` builds an inline `--sk-*` style string from the settings, `quick-order-form.css` consumes `--sk-accent-theme`/`--sk-pad`/`--sk-cell-pad-y`/`--sk-text-base`. Pricing JS + `data-stockly-*` contract untouched). `stockly-29` (QOF premium re-skin — `quick-order-form.css` rewritten onto `--sk-*` tokens + real mobile card layout, ADR-015; `quick-order-form.liquid` gained `data-label` on sku/price/qty/total cells for the mobile labels. Pricing/cart JS untouched). `stockly-28` (storefront `registration-form.css` anchors its own base `font-size: 16px` + absolute-px text sizes, so it no longer inherits a theme's shrunk root — fixes 8.5px labels on `62.5%`-root themes. `stockly-27` made the JS POST `__shortcode`; `stockly-26` added the `form_shortcode` block setting. ⚠️ `registration-form.js` still >10 KB app-block threshold — non-blocking, trim later)
**Earlier 2026-05-29:** Fly v58 shipped the SaveBar fix `865e35d` (its 2026-05-28 push-deploy had failed on a release_command timeout); deploy is now gated to manual `workflow_dispatch`
**Deploy is MANUAL:** Railway deploys are triggered from the Railway dashboard/CLI (`railway up`), not GitHub Actions — the old `.github/workflows/fly-deploy.yml` (`workflow_dispatch`-gated `flyctl deploy`) was deleted 2026-07-03 since Fly no longer exists. Push to main does not auto-ship to prod. Storefront extension ships separately via `npx shopify app deploy` (also requires explicit go-ahead per AGENTS.md).

**Pricing areas (ADR-014):**
  - **Wholesale Pricing** `/app/pricing` — FLAT discount per rule (one value, no quantity). `Tier.kind='wholesale'`.
  - **Volume Pricing** `/app/volume-pricing` — multi-band quantity breaks. `Tier.kind='volume'`.
  - The Discount Function reads the same metafield and applies discounts identically regardless of kind. `kind` only filters the two admin lists.
  - 6 existing prod Tier rows back-filled to `kind='wholesale'` via the column default on `prisma db push`.
**Postgres:** `RegistrationForm` + `Application` tables added; legacy `WholesaleApplication` retained (dual-write for 48h soak before Phase 1G drops it)
**Reviewer pass 1 verdict:** NEEDS-CHANGES (3 CRITs + 5 SHOULDs + 2 NITs) → all addressed in fix commit `99c2905`
**`tsc --noEmit`** now part of `scripts/verify.sh` — 0 errors at HEAD (was 23 pre-existing)
**Public legal URLs (LIVE, DRAFT):**
  - https://stockly-lustrous-forest-4364.fly.dev/legal/privacy
  - https://stockly-lustrous-forest-4364.fly.dev/legal/terms

**Registration Form multi-form (LIVE 2026-05-29, Fly v62 / stockly-26):**
  - Model is now **N forms per shop** (was 1/shop). `RegistrationForm`:
    `shopId` no longer `@unique` (→ `@@index`); added `name`,
    `shortCode @unique` (cuid), `isDefault`.
  - **Admin**: `/app/registration-form` is now a LIST (IndexTable: Id /
    Name / Short Code chip / Status toggle / Created; All/Active/Draft
    tabs; "Add new" → TemplatePickerModal → creates a DRAFT → opens the
    editor). Default form cannot be deleted (server + UI guard).
  - **Editor opens in an App Bridge `variant="max"` modal (Fly v63,
    2026-05-30)** — full canvas, no admin nav rail, X to close; the
    modal's title bar owns Save/Discard. Rendered INLINE (same app
    context, not a nested `src` iframe) so the SaveBar, sub-modals and
    dirty tracking keep working. Editor body extracted to
    `app/components/registration-form/RegistrationFormEditor.tsx` with two
    chromes: `chrome="modal"` (the list opens it) and `chrome="page"` (the
    standalone deep-link route `/app/registration-form/$id`, back-compat).
    The list loader ships full `EditorState` per form so the modal renders
    with no round-trip.
  - **Storefront**: the `registration-form` theme block gained an
    optional `form_shortcode` setting. With a shortcode it serves that
    form; without one it serves the shop's active default (dual-serve,
    back-compat). Cross-shop isolation verified: `resolveStorefrontForm`
    filters by `shopId` AND `shortCode` (reviewer PASS + tests).
  - **Prod DB**: 1 existing row promoted in place — `name='Registration
    form'`, `shortCode='rfmpqd344201poil'`, `isDefault=true`,
    `status='draft'` (it was already draft pre-sprint; flip to active in
    the editor when you want the storefront to serve it).
  - Design system doc added: `docs/design-system.md` (canonical
    admin/storefront tokens + list→editor pattern).
  - **Pending validation by Jonatan (with your eyes):** open the admin
    list, create a 2nd form from a template, confirm it appears, edit it,
    then on the dev store paste its Short Code into a theme block and
    confirm the storefront renders THAT form (and a block with no
    shortcode still serves the default).

---

## TL;DR — current state

**Stockly is LIVE in production on Fly.io.**
- App: `stockly-lustrous-forest-4364` (region `iad`, us-east)
- DB: Fly Managed Postgres `stockly-db` (region `iad`)
- Shopify app version: `stockly-26` published, active (Protected Customer Data level_1 live). Backend on Fly `v62`.
- Installed and functional on `desarrollo-adspubli.myshopify.com`
- Onboarding wizard verified loading
- Form de wholesale verified end-to-end (201 created in Postgres)
- **Admin Approve flow verified E2E on dev store** (PM session 2026-05-26).
  First wholesale application moved to `approved` state, Shopify Customer
  tagged. See `progress/2026-05-26-approve-flow-fix.md`.

**Pending validation by Jonatan:**
- Cross-check: Shopify Admin → Clientes → confirm `wholesale` tag on the
  approved customer
- Cross-check: `/app/customers/qualified` shows the WholesaleCustomer row
- Approve a 2nd application to confirm the path is repeatable
- Storefront test: log in as approved customer, confirm wholesale pricing
  renders + checkout charges discounted price (where B0-3 C1/C2/C3 may surface)
- Decide pilot #2 and #3 targets

**Out of scope until Sprint 5:**
- orders/paid webhook (needs Shopify protected customer data approval)
- Email notifications on application status change
- Variant-level pricing checkout enforcement for collection scope

---

## Architecture today (post Vercel→Fly migration)

```
                    GitHub creativedesignseo/stockly
                              ↓ push to main
                    ┌─────────────────────────┐
                    │ Fly.io (region iad)     │
                    │                          │
                    │ ┌──────────────────────┐ │
                    │ │ Container (Node 20)  │ │   ← Dockerfile multi-stage,
                    │ │ Remix + Polaris      │ │     debian-bookworm-slim,
                    │ │ remix-serve :3000    │ │     binary engine
                    │ └──────────┬───────────┘ │     rhel-openssl-3.0.x
                    │            ↕              │
                    │ ┌──────────────────────┐ │
                    │ │ Managed Postgres     │ │   ← pgbouncer pool,
                    │ │ stockly-db           │ │     all Stockly tables
                    │ └──────────────────────┘ │
                    └─────────────────────────┘
                              ↑
                              │ App Proxy + iframe + webhooks
                    ┌─────────────────────────┐
                    │ Shopify (stockly-26)    │
                    │ desarrollo-adspubli     │
                    └─────────────────────────┘
```

See [ADR-009](./docs/decisions/ADR-009-backend-fly-io.md) for the full reasoning of WHY Fly.io specifically (and why Vercel was the wrong call).

---

## What ships next (Volume Pricing, ADR-012) — PRE-DEPLOY

Merged into the worktree on 2026-05-28, awaiting deployment-guardian
sign-off. The pricing engine and data layer are end-to-end ready; the
multi-band admin UI ships in Phase 2.

**End-to-end ready (Phase 1):**
- `Tier` schema: `quantityTo`, `groupId`, `discountFixedPrice`,
  `startsAt`, `endsAt`, `showTableOnPdp`, `tableTemplateId`.
- Service layer: `createRule`, `updateRule`, `deleteRule`, `listRules`,
  `getRule`, `BandInput` / `RuleSummary` types.
- Sync layer: v4 metafield shape with the new fields per scoped tier.
- Discount Function (`run.ts`): mix_variants aggregation, fixed_price
  discount type, active-date filter (reads `Date.now()`), quantityTo
  band upper bound, `discountPct = 0` legitimately accepted for
  fixed_price tiers.
- 7 unit fixtures pin the new Function behavior including 3
  active-date guardrails for the `Date.now()` runtime.
- Admin list: one row per `groupId`, inline status toggle, "Volume
  bands" column.

**Storage-only / Phase 2 (UI not yet built):**
- Multi-band band-editor table on `/app/pricing/new` and
  `/app/pricing/$id`. The forms still edit ONE band per save. Multi-
  band rules are creatable today via `createRule` service calls but
  not via the admin UI.
- Active-date pickers in the sidebar (`startsAt` / `endsAt` form
  inputs). Field exists in DB + Function.
- "Show Table on PDP" toggle (`showTableOnPdp`) form input. Field
  exists in DB.
- Theme app block that renders the storefront volume-pricing table.

**Pending production steps for deployment-guardian:**
1. `prisma db push` against Fly Managed Postgres
   `stockly-lustrous-forest-4364` — purely additive (every new field
   is nullable or has a default), safe.
2. Back-fill `groupId` on legacy rows:
   ```
   fly ssh console -a stockly-lustrous-forest-4364 \
     -C 'node /app/scripts/backfill-tier-groupids.js'
   ```
   The script exits non-zero if any NULL remains. Re-runs are no-ops.
3. `fly deploy` (Remix server with the new service-layer helpers).
4. `npx shopify app deploy` (publishes the new Function WASM with
   mix_variants + fixed_price + active-date filter).
5. Verify Piro Jewelry's live tiers still apply at checkout (legacy
   fixture covers this in CI; production smoke is `legacy-single-band`
   semantics on a real cart).

---

## What works (validated 2026-05-26)

- `https://stockly-lustrous-forest-4364.fly.dev/` returns 200
- `/app?shop=...&embedded=1&host=...&id_token=...` returns 302 (correct embedded bootstrap)
- `/auth/login?shop=...` returns 302 (OAuth start)
- `/apps/stockly/apply` (App Proxy POST from storefront) returns 201 with JSON
- Admin iframe in Shopify loads the wizard
- Sprint 4 admin pages live: `/app`, `/app/onboarding`, `/app/pricing` (list + new + edit, Sami-style; was `/app/tiers` until 2026-05-27), `/app/customers/applications`, `/app/settings/pricing` (Sami-style 2026-05-27), `/app/qualify-customer`
- Storefront blocks active: Quick Order Form, Wholesale FPQ Banner, Wholesale Product Panel, Wholesale Registration
- **Admin Approve action** (`POST /app/customers/applications` with
  `intent=approve`): resolves Shopify Customer (by id → by email → create),
  tags as `wholesale`, upserts WholesaleCustomer row with
  `qualifiedAt=now` (bypass FPQ), marks application approved, **and
  re-syncs the Discount Function metafield** so the new customer's GID
  lands in `qualifiedCustomers` immediately. Errors surface to the
  merchant via Polaris Banner (commit `81b7546`). Protected Customer
  Data access is live and granted on the dev store under Custom
  distribution.
- **B2B pricing engine E2E** (Discount Function `stockly-volume-discount`
  + `wholesaleBaselinePct` 55):
  - Customer logs in to storefront
  - Cart drawer shows retail price ~~tachado~~ and wholesale price for
    every line, with "Wholesale 55%" label
  - Checkout subtotal applies the discount: €130 retail → €58.50
    wholesale, "TOTAL SAVINGS €71.50" shown by Shopify
  - Validated 2026-05-26 PM with Test Wholesale customer
    (creativedesignseo@gmail.com, Shopify GID 10103069901128)

---

## Resume work checklist (next session)

1. **Confirm production is alive:**
   ```bash
   cd /Users/aimac/Documents/Workspace/Clients/stockly
   fly status --app stockly-lustrous-forest-4364
   curl -sI -A "Mozilla/5.0" https://stockly-lustrous-forest-4364.fly.dev/
   ```
   Expected: machines `started` + HTTP 200.

2. **Check what's pending:** read `ROADMAP.md` and `docs/sprints/sprint-N.md` retros if they exist.

3. **Recent context:** read commit log of last session (`git log --oneline -20`). Today's commits all start with `fix(...)` documenting bugs in [ADR-009](./docs/decisions/ADR-009-backend-fly-io.md).

4. **DON'T touch infra unless asked.** Production is fragile after the migration. Any deploy-related work — check [shopify-remix-deploy-gotchas memory](https://github.com/creativedesignseo/stockly/blob/main/docs/decisions/ADR-009-backend-fly-io.md) FIRST.

---

## Critical deploy commands

```bash
# Deploy (auto on push to main, or manual)
fly deploy --app stockly-lustrous-forest-4364

# Logs (use --no-tail; interactive mode blocks shell scripts)
fly logs --app stockly-lustrous-forest-4364 --no-tail

# SSH into running machine
fly ssh console -a stockly-lustrous-forest-4364

# Run schema update against prod DB
fly ssh console -a stockly-lustrous-forest-4364 -C 'npx prisma db push --skip-generate'

# Set/update env var (NEVER use echo — adds trailing \n)
fly secrets set SHOPIFY_API_KEY="value" --app stockly-lustrous-forest-4364
# OR for piped values:
printf "value" | fly secrets set KEY=- --app stockly-lustrous-forest-4364

# Push Shopify app config (URLs in shopify.app.toml)
npx --yes shopify app deploy --allow-updates --message "What changed"
```

---

## Files modified in the 2026-05-26 migration

Build/infra:
- `Dockerfile` — rewritten multi-stage with Debian + binaryTargets + .npmrc + HOST=0.0.0.0
- `fly.toml` — NEW (region iad, release_command for prisma db push)
- `vercel.json` — DELETED
- `vite.config.ts` — removed `vercelPreset()` import
- `package.json` — removed `@vercel/remix` dep
- `prisma/schema.prisma` — added `binaryTargets = ["native", "rhel-openssl-3.0.x"]`
- `shopify.app.toml` — URLs auto-updated by `shopify app deploy` to point to Fly

Code fixes:
- `app/services/shops.server.ts` — `getOrCreateShop` uses `upsert` (race-safe)
- `app/routes/app._index.tsx` — preserves `searchParams` in redirect to `/app/onboarding`

---

## Open decisions / TODOs

- **`stockly-lustrous-forest-4364` is the auto-assigned URL** because `stockly` was taken globally. When Stockly has revenue, register a custom domain (`app.stockly.io` or similar) and update Shopify Partners + DNS.
- **Vercel project** still exists, dormant. Delete after 1 week of stable Fly to avoid confusion.
- **Fly billing baseline (2026-05-27 cleanup):** After removing 2 orphan
  Postgres deployments (the MPG cluster `d1zj5omlxp30yqkv` and the
  legacy Postgres app `stockly-lustrous-forest-4364-db`, both leftover
  from Sprint 0 migration attempts), monthly Fly cost is **~$2.50**:
    - Active MPG cluster `n83v7rggv44r5gxk` — $2.16 + $0.14 storage
    - 1-2 small Stockly app machines — ~$0.30 prorated
    - Bandwidth — $0 (under the 100 GB/mo free tier)
  Scaling expectation: ~$5-10/mo at 10 paying merchants, ~$30-50/mo at
  100. Confirmed Stockly continues working post-cleanup (/healthz 200,
  Prisma can query the DB).
- **Migrations**: still using `prisma db push`. Move to versioned migrations when there's customer data to protect (Sprint 5 or later).
- **Custom domain on Fly**: `fly certs create app.stockly.io` once domain registered.
- **Multi-region**: when EU merchants matter, `fly machine clone --region cdg` (Paris). One command.

---

## Pilot status

| # | Store | Status |
|---|---|---|
| 1 | Piro Jewelry (`piroaccessories.myshopify.com`) | **Already runs B2B pricing on a DIFFERENT engine** — Stockly install ON HOLD pending a pricing-engine decision (see note). |
| 2 | TBD | Not identified yet |
| 3 | TBD | Not identified yet |

**Piro B2B state — VERIFIED 2026-06-08 via Admin API (`shopify-admin --store piro`, read-only):**
Piro is on plan **Basic** (USD) yet already has a full B2B pricing setup —
NOT a homemade tag hack:
  - Market **"Wholesale B2B"** (`wholesale-b2b`) — active.
  - A **Catalog** ("International") **+ an `AppCatalog`** (`Channel Catalog …`)
    → an installed app manages a catalog.
  - A **Price List "Wholesale B2B …" at −65% off base** — active.
  - **29 products tagged `WHOLESALE`**.
**Risk #1 (blocking): pricing-engine conflict.** Piro applies wholesale via a
Markets/Catalog **Price List (−65%)**; Stockly applies via its **Discount
Function (WASM)** over retail, gated by customer tag. Two engines discounting
the same thing → installing Stockly on top WITHOUT removing the Price List
risks double-discount / unpredictable checkout pricing. This is a
decision-before-install, not a "just try it". Three paths: (1) Stockly
**replaces** the Price List/Catalog (migrate the 29 products + verify no
current customer loses their price); (2) Piro **stays as is** (then it doesn't
need Stockly for pricing — only the application form / queue would add value);
(3) keep piloting on the **dev store** until Stockly has proven parity with
the −65% Piro already enjoys. **Recommendation: do NOT install Stockly on Piro
yet** — Piro already solves what Stockly sells; migrating needs a clear upside
(better signup UX? Camino B opening-order? dropping the app behind the
AppCatalog?). **Open question for Jonatan/Ana:** how does a Piro customer reach
that −65% today (login + tag/segment? market selector? which app owns the
AppCatalog — BSS?). That answer picks the path. Journal:
`progress/2026-06-08-piro-landing-analysis.md`.

The Adspubli onboarding service pitch (Barcelona-local white-glove) is in Sprint 4's onboarding wizard Step 3.

---

## Pointers to deeper docs

- [PROJECT.md](./PROJECT.md) — full plan, scope, market
- [ROADMAP.md](./ROADMAP.md) — 10-week sprint plan
- [CLAUDE.md](./CLAUDE.md) — AI conventions
- [docs/decisions/](./docs/decisions/) — all 10 ADRs (ADR-010 is the B2B pricing engine)
- [docs/architecture/b2b-pricing-deep-dive.md](./docs/architecture/b2b-pricing-deep-dive.md) — full engineering teardown of the pricing engine
- [docs/architecture/theme-app-extension-css-gotchas.md](./docs/architecture/theme-app-extension-css-gotchas.md) — reusable Shopify storefront CSS gotchas (e.g. the theme box-shadow "double border" on inputs, fixed in stockly-35)
- [docs/spec/b2b-customer-lifecycle.md](./docs/spec/b2b-customer-lifecycle.md)
- [docs/competitive/](./docs/competitive/) — competitor engineering teardowns. Currently: BSS B2B Solution (the largest direct competitor).
- [progress/2026-05-26-approve-flow-fix.md](./progress/2026-05-26-approve-flow-fix.md) — full journal of the day Stockly's checkout pricing was validated E2E for the first time

Memory files (loaded automatically in every Claude session):
- Index: `~/.claude/projects/-Users-aimac-Documents-Workspace-Clients-stockly/MEMORY.md`
- Key entries: `backend-choice-fly`, `shopify-remix-deploy-gotchas`, `b2b-customer-lifecycle`, `wholesale-pricing-composition`
