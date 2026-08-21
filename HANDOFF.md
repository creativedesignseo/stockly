# HANDOFF — Resume work hands-off

> Read this first if you're starting a fresh session on Stockly.
> Single source of truth for current state + resume instructions.

> **Where this project stands, in one paragraph.** **Stockly is APPROVED and
> published** (https://apps.shopify.com/stockly-2, visibility Limited on
> purpose). The 2026-08-22 session then found and killed the product's biggest
> latent defect — the checkout minimum had NEVER worked on any shop (a one-string
> apiType bug meant the Validation was never created) — and rebuilt B2B identity
> company-first: `purchasingCompany` + one app metafield on the Company picks
> opening vs recurring minimum, no lists, no sync. Verified END-TO-END by a real
> buyer on Piro: cart builds freely, checkout blocks under $300 with the
> opening-order message, unblocks at $301, re-blocks when the cart drops. The
> one remaining unverified link is the automatic company qualification on a PAID
> order (Jonatan's test purchase is still unpaid). Post-approval queue: rotate
> the client secret, tell Ana, and productize the B2B setup fixes done by hand
> today.

**Last updated:** 2026-08-22 (close-out) — **🏗️ COMPANY-FIRST B2B MINIMUMS LIVE
AND PROVEN BY A REAL BUYER. Everything below was checked against code and
production this session, not assumed.**

  - **🔴→✅ THE MINIMUM NEVER WORKED, ANYWHERE, EVER — found and fixed.**
    `opening-order-sync` filtered functions by apiType
    `"cart_and_checkout_validation"`; the API returns
    `"cart_checkout_validation"`. The filter never matched, so
    `validationCreate` never ran since the feature was born (2026-06-03).
    Verified live before the fix: functions deployed, `validations(first:50)`
    EMPTY. After: **`Validation/136216655` exists and is enabled on Piro** —
    the first Validation object in the product's history. Guarded by
    `matchesValidationApiType` + tests.
  - **✅ Identity is company-first now.** A cart with
    `buyerIdentity.purchasingCompany` IS wholesale; the gate (opening vs
    recurring) is read from app metafield `$app:stockly/qualified` ON THE
    COMPANY. Writers: `orders/paid` (ensure-guarded) + a one-off backfill
    (`ordersCount > 0` → qualified; stamps only clean runs). Verified on Piro:
    99 companies scanned, 5 with orders → 5 qualified, 0 errors. Tag/list flow
    unchanged as fallback. Precedence: customer in `qualifiedCustomers` beats a
    pending company (mirrors the Discount Function; fixture-pinned).
  - **✅ Cart building is free; only checkout gates.** First live test rejected
    the very first add-to-cart (validations run on every cart mutation and
    block the mutation). Fixed with `buyerJourney.step`: pass on
    CART_INTERACTION, gate on CHECKOUT_*. Deployed as app version
    **stockly-5**.
  - **✅ E2E PROVEN BY A REAL BUYER on Piro (Jonatan, company
    `creativedesignseo`, pending):** 43 items added freely → checkout at
    $291.20 BLOCKED with the opening-order message → $301.00 unblocked →
    dropping to $257.25 re-blocked live. **Still unverified: automatic company
    qualification on payment** — the test order is unpaid; when it is paid,
    `orders/paid` should write the company metafield. Watch the Railway logs on
    the next paid B2B order.
  - **✅ afterAuth bootstrap works in production:** opening the app on Piro
    fired it (Railway logs: `Running afterAuth hook`, then
    `[company-backfill] scanned=99 qualified=5 errors=0`) — installs and token
    refreshes now arm the Validation and run the backfill with no human steps.
  - **⚠️ B2B onboarding gaps found live, fixed BY HAND on Jonatan's company
    only, and now product backlog:** companies created by Piro's request form
    have NO location address and `editableShippingAddress: false` → new
    wholesale buyers hit "(No address)" with nowhere to type one. Also
    `companyLocationUpdate` RESETS omitted `buyerExperienceConfiguration`
    fields (learned by accidentally flipping Jonatan's checkout from
    submit-for-review to pay-now — restored, then set to pay-now deliberately
    at his request; always send ALL fields). The other 98 Piro companies are
    untouched — Ana's call. Productize as a "B2B setup check" in Stockly.
  - **Verified this close-out:** `verify.sh` green (179 app + 22 validation +
    11 discount = 212 tests); production `/healthz` `/` `/auth/login` 200; all
    FIVE webhook routes (incl. `orders/paid`, now subscribed) 401 to forged
    HMAC; Railway `794693d8` SUCCESS; Shopify app version `stockly-5` active;
    Piro: Validation enabled, 5/99 companies qualified, Jonatan's pending.
  - **Deferred/backlog:** message with amounts ("add $X more"), cart-progress
    theme block, B2B setup check, bulk `editableShippingAddress` for Piro (ask
    Ana), catalog-price-list auto-detection, client secret rotation (Jonatan
    only), graphify LLM key.

Prior 2026-08-21 (night) — **🛡️ ONE SOURCE OF WHOLESALE DISCOUNT.
Piro had THREE 65% discounts configured at once — a Shopify B2B catalog price
list, Stockly's baseline, and an active Stockly rule. They compose
multiplicatively: a $28 bracelet would have hit checkout at $28 × 0.35³ =
**$1.20**, 95.7% off. It had not fired only because Stockly's FPQ gate was
withholding its own discount from an unqualified buyer — reinstalling or
qualifying anyone would have detonated it. Worse than the stacking, the two
engines defeat each other's logic: the FPQ promises "no wholesale price until
the first order reaches $300", while the catalog hands out the same 65%
unconditionally, so buyers get wholesale pricing without ever qualifying and
the gate is decorative. Fix: `Shop.pricingSource` ('stockly' | 'catalog',
default 'stockly'), enforced in `buildConfiguration` — in 'catalog' mode
Stockly emits baseline 0 and an empty tiers array, so the Discount Function
has nothing to apply. The switch lives at the sync boundary, NOT in the UI, so
a leftover baseline or a rule someone re-enables later cannot leak a second
discount into checkout. Order minimums, the registration form, the approval
queue and the quick order form are untouched in both modes. Piro set to
'catalog', duplicate rule deactivated. 4 new tests. Deployed `42031df`;
`verify.sh` green (160 app tests); `pricingSource` column live in production.**

  - **How this was missed for weeks, recorded so it is not repeated:** the
    catalog price list was already documented in project memory ("Piro runs
    B2B pricing via a Markets/Catalog Price List (−65%), a different engine
    than Stockly"), and was explained to Jonatan earlier the same day. What
    was never done was the obvious next query — *what does Stockly have
    configured for that same shop?* — one Prisma call that had already been
    run minutes earlier for another reason. The compounding risk was also
    stated as hypothetical ("if we reinstall, they could compound") when it
    was already configured and waiting. **When two systems can price the same
    order, read BOTH configurations before concluding anything.**

Prior 2026-08-21 (evening) — **🎉 APPROVED AND PUBLISHED. Shopify's
verdict arrived at 18:30 UTC: *"your app has officially been approved and
published on the Shopify App Store as a listed application"*. The listing is
live at `https://apps.shopify.com/stockly-2` (handle is `stockly-2`, not
`stockly`) and returns 200. Visibility deliberately left at **Limited** —
"Make fully visible" untouched. Three things shipped on the back of it:**

  - **✅ `customers/update` webhook re-enabled in `shopify.app.public.toml`
    (`dd244bd`).** It had been commented out since 2026-08-11 because a
    brand-new public app had no protected-customer-data approval. That
    approval landed with the App Store approval — Partners → API access
    requests now reads *"Protected customer data access: Approved, Aug 21,
    2026"*, checked before touching the file. No scope change (it rides on
    the already-granted `write_customers`), so installed shops are not asked
    to re-consent.
  - **✅ DEPLOYED 2026-08-21 20:50 UTC — app version `stockly-3` is active.**
    `npx shopify app deploy --config=public` succeeded, and the fact that it
    did is itself the proof the protected-data approval is real: the same
    command failed on 2026-08-11 with *"This app is not approved to subscribe
    to webhook topics containing protected customer data"*. The repo and
    Shopify's live config now agree.
  - **⚠️ Auto-enrolment still only covers customers tagged FROM NOW ON.**
    `customers/update` fires on change, so the 45 Piro companies that already
    carry the wholesale tag are not enrolled by it. Stockly knows 5 of Piro's
    50 companies, which means the checkout minimum currently protects 10% of
    their wholesale buyers. A one-off backfill is needed — tracked in
    `tasks/current.md`.
  - **✅ The blank admin nav icon is fixed, uploaded and verified in the
    admin.** Root cause found by reading the DOM, not by guessing: the sidebar
    does NOT render the colour app icon — it renders an SVG as a **mask**
    filled with `currentColor`. The uploaded SVG began with `<rect
    width="3.84" height="3.84"/>`, a full-canvas background rectangle, so the
    mask painted the whole 20x20 box solid and buried the logo. Corrected
    silhouette (rect removed, viewBox 16x16, paths scaled x4) lives in
    `docs/brand/stockly-nav-icon-16.svg` and is uploaded via **Dev Dashboard →
    App settings → Navigation bar → Manage → Upload icon**. Confirmed in the
    real admin sidebar afterwards, not just in the preview.
  - **⏳ The client secret is STILL NOT ROTATED**, and deliberately so. It is
    the one task that cannot be delegated to an agent: the reason for rotating
    is that the old secret leaked into a session transcript, and having an
    agent read the new one would write it into the current transcript,
    reproducing the exact problem. Button lives at Dev Dashboard → App
    settings → Credentials → Secret → **Rotate**. Order matters: rotate → put
    in Railway → confirm deploy SUCCESS + `/healthz` → only then revoke the
    old one. Cheapest moment there will ever be: only two sessions exist in
    production, both ours.
  - **Verified this close-out, not assumed:** `verify.sh` green (156 app tests
    in 14 files, extension fixtures, both builds); production `/healthz`, `/`,
    both legal pages and `/auth/login` all **200**; all five webhook routes
    (including `customers/update`) **401** to a forged HMAC; listing **200**;
    Railway `dfda1b4a` **SUCCESS**.

Prior 2026-08-21 (later) — **✅ CLOSE-OUT VERIFIED. Nothing pending on
our side; the app sits at "In review / We're reviewing your response" and every
claim below was re-checked today, not assumed: `verify.sh` green (156 app tests in 14 files,
plus the 14 + 8 extension fixtures, both builds); production `/healthz`, `/`, `/legal/privacy`,
`/legal/terms`, `/auth/login` all **200**; all four mandatory webhooks **401** to
a forged HMAC; App Bridge served from Shopify's CDN; `stocklygo.site` and its
`/privacy` redirect both **200**; Railway deployment `dfda1b4a` **SUCCESS**, both
services Online. Railway spend is $1.20 of the $5 included in the Hobby plan at
mid-cycle (98% of it RAM, egress 0.01 GB) — the month costs the flat $5.
Housekeeping: `Promo/` (851 MB of screencast footage) was untracked but NOT
gitignored — one `git add -A` from entering the repo; now ignored. The code
graph was refreshed (incremental scan: 125 code + 25 docs + 20 images changed);
its semantic pass needs an LLM API key that is not configured on this machine,
so the doc/image labels are stale while the code graph is current.**

Prior 2026-08-21 — **📤 CORRECTIONS RESUBMITTED. Both issues marked
resolved in the Partner Dashboard with proof screencasts recorded on
`adspubli-wholesale-test` (billing: youtu.be/IHVh0XtPukM · volume pricing:
youtu.be/W_eAWPeotpY, both unlisted), and "Submit fixes" pressed — status is
now "In review / We're reviewing your response". The recordings double as
production verification of both fixes: the approval page showed a TEST charge
(new `BILLING_TEST_SHOPS` allowlist, deployed same day), approving returned
INSIDE the app with "Current plan" visible, and the volume-pricing
create→save→delete flow ran with no stuck save bar and a working delete
Modal. Visibility stays LIMITED — "Make fully visible" untouched.**

Prior 2026-08-20 — **🔧 REVIEWER FEEDBACK FIXED AND DEPLOYED. Two
issues (ref 129441): (1.2.2) after approving the subscription the merchant
landed OUTSIDE the admin — the `returnUrl` pointed at our host; now the
documented `admin.shopify.com/store/{handle}/apps/{client-id}/app/billing`
pattern. (2.1.1) creating a volume pricing rule left a ZOMBIE "Unsaved
changes" bar that blocked all admin navigation — App Bridge's host is synced
only by a bubbling event from the in-iframe element, so any hide scheduled
after unmount can never reach it; a new `useManagedSaveBar` hook hides during
the navigation's "loading" render (still mounted) in all six save-bar forms.
Also fixed while in there: both $id Delete buttons were dead (`window.confirm`
is inert in the sandboxed iframe → Polaris Modal), failed validation used to
hide the save bar (pristine baselines), a phantom-dirty bar on legacy rules,
the billing loader crashing on a failed subscription check (the likely 13 Aug
"Application Error"), and root/app ErrorBoundaries so nothing renders Remix's
raw error page. `verify.sh` green (159 app tests), 3-agent adversarial review
passed, deployed `7466026`. NEXT: screencast → mark resolved → resubmit.
Details and reviewer-response drafts: `progress/2026-08-20-*.md`.**

Prior 2026-08-14 (later) — **🛠️ HARDENING PASS FOR THE ACTIVE REVIEW. Three parallel audits ran against the install path, the admin screens and the webhook/billing paths. The 2026-08-13 webhook mystery is SOLVED and fixed; four more rejection-grade defects were found and fixed; 43 hardcoded euro symbols are gone. All four mandatory webhooks return 200 in production and 401 to a forged HMAC. `verify.sh` green, deployed `2dff4a1`.**

  - **✅ ROOT CAUSE OF THE SILENT 500s — found and fixed.** It was never in the handlers. `shopify.server.ts` sets `expiringOfflineAccessTokens: true` (~1h TTL), so `authenticate.webhook` refreshes the token on delivery; the SDK's refresh helper re-throws only `InvalidJwtError` and a 400 `invalid_subject_token` and turns **everything else into a bare `Response(500)` with no body**. Uninstall revokes the grant, so the refresh runs against a permission Shopify just destroyed. The reviewer used the admin until 14:46 and uninstalled at 16:04 — token long expired — hence 18 silent 500s each. It was unreproducible afterwards because a never-seen shop has no session to refresh and a freshly seeded one is not expired: the only two cases tested. **Yesterday's logging sat one line too late to ever see it.** Fix: `app/lib/webhook-auth.server.ts` verifies the HMAC itself when the SDK throws and proceeds without a session — none of the four mandatory webhooks need an admin client. Forged webhooks still get 401 (verified). This also defuses the refresh token's own **2026-09-22 expiry**, which would otherwise have 500'd every webhook until someone reopened the app.
  - **✅ `app/uninstalled` deleted sessions only `if (session)`** — false in exactly the case that matters, which is why the reviewer's sessions were still in the database a day later. `deleteMany` is idempotent; it now runs unconditionally.
  - **✅ Billing `returnUrl` was `"/app/billing"`.** Shopify binds it to a `URL!` scalar (RFC-3986 absolute), so a bare path fails coercion and **"Start 14-day trial" threw instead of redirecting** — requirement 1.2, on a button the reviewer will press. Now absolute. The test asserted the broken value and was updated.
  - **✅ Only the Starter plan is offered now.** Growth ($79) and Plus ($149) had 3-of-4 and 5-of-6 bullets marked "(coming soon)" — variant pricing, quantity increments, Net terms, quotes, public APIs, none built. The App Store listing was trimmed to match — see below.
  - **✅ `/auth/login` no longer asks for a shop domain** (requirement 2.3.1) and **the redirect loop is gone at the root, not masked.** The recovery redirect could never succeed — it cannot supply `embedded=1` or `host`, so `/app` always bounced straight back; the guard cookie only hid it in Chrome, since a third-party cookie with no `Partitioned` attribute is dropped by Safari's ITP. Redirect removed. Verified live: `/auth/login` now resolves in **1 hop** and serves no "Shop domain" field.
  - **✅ Dashboard survives a billing hiccup.** `checkActiveSubscription` ran unguarded inside a `Promise.all`; one failed call rendered Remix's bare "Application Error" inside the admin iframe. Now caught, with the two fallbacks pointing in opposite directions on purpose (don't tick an unconfirmed setup step; don't accuse the merchant of not paying because our own call broke).
  - **✅ 43 hardcoded `€` removed** across onboarding and the four pricing editors, including the first screen after install ("first order must reach a € threshold") on a reviewer's USD store. The mechanism already existed on two other routes and is now shared in `app/lib/currency.ts` / `currency.server.ts`.
  - **✅ Merchant-facing copy cleaned:** `/app/qualify-customer` explained itself with "upserts", "`qualifiedAt = now()`" and "metafield"; the registration-form page carried a Banner containing the literal words *"this is a placeholder"*; two ACCESS_DENIED errors told the merchant to run `npx shopify app deploy` "from the project root"; the onboarding wizard named a third-party agency and offered a call nothing notifies anyone about; "(Sprint 5)" leaked into four validation messages; both pricing empty states linked merchants to shopify.dev developer docs; the dashboard subtitle was the bare myshopify domain.
  - **Verified in production, not assumed:** all four mandatory webhooks `200`; forged HMAC `401` on both redact topics; `/healthz`, `/`, `/legal/privacy`, `/legal/terms`, `/auth/login` all `200`; `/auth/login` 1 hop, no shop-domain field; App Bridge served from Shopify's CDN.
  - **✅ The webhook fix is confirmed by real traffic, not only by our own tests.** Dev Dashboard, `14 Aug 17:25 — OK — shop/redact — xbbf0y-vp.myshopify.com`: a store that had been failing since the 12th. Shopify retried after the deploy and it passed. Every remaining `ERR` in that log is dated the 13th, before the fix.
  - **✅ THE BILLING BUTTON IS PROVEN — pressed against real Shopify.** This was the last open unknown and it is closed. On `adspubli-wholesale-test`, `Choose a plan → Start 14-day trial` now reaches Shopify's own approval screen: *"Stockly de Adspubli · Plan: Starter · 39,00 $ USD cada 30 días · prueba gratis de 14 días"*. Before the `returnUrl` fix this threw instead of redirecting. **Not approved deliberately** — reaching the screen is the proof; approving would leave a live subscription behind and adds nothing.
  - **⚠️ Found while proving it, unresolved by choice: on that approval screen the "Aprobar" button is GREYED OUT**, with *"No tienes ninguna forma de pago guardada"* — on a **development store**. `isTestBillingEnvironment()` (`app/services/billing.server.ts`) returns `NODE_ENV !== "production"`, and the container always runs `production`, so every charge is marked real. **A reviewer will land on this exact screen**, and if their store has no payment method they hit the same dead button. Two readings and no data to choose between them: reviewers' stores are normally set up for this, or it blocks them. The available lever — an env var forcing `test: true` — was **not** pulled, because switching it on in production would mean no real merchant is ever charged. That is a worse failure than the risk it removes. If the reviewer reports it, it is one line and one variable.
  - **✅ The listing's pricing now matches the code: `Public plans (1/4)`, `starter` only.** Growth and Plus deleted from the Shopify pricing page as well as the codebase; Shopify's own dialog confirmed no merchant was subscribed to either.
  - **⏳ Known and NOT fixed:** no `ErrorBoundary` in `app/root.tsx`, so an unexpected throw outside `/app/*` renders Remix's unstyled "Application Error"; no Prisma `connection_limit` on the Railway `DATABASE_URL`; `app/routes/app.onboarding.tsx` redirects drop the query string; legal pages are Spanish-only against an English listing; three declared scopes (`write_products`, `write_publications`, `read_orders`) are never used — deliberately left alone, since changing scopes mid-review forces re-consent.

Prior 2026-08-14 — **🔍 THE REVIEWER TESTED THE APP ON 13 AUG AND THE PRODUCT WORKED — ten `purchase.product-discount.run` executions, all OK. Two real defects surfaced around that session and are now fixed and verified in production (`3f48f87`): an infinite `/auth/login` redirect loop, and mandatory GDPR webhooks failing silently, which left the reviewer's two shops sitting in the production database for over 24 hours after they asked us to delete them.**

  - **✅ What the reviewer actually did** (Dev Dashboard → Registros, 13 Aug): `14:04–14:17` GraphQL admin OK on store `r73294`; `14:38–14:39` the same on `r73295`; **`14:40–14:46` ten `purchase.product-discount.run` executions, every one OK**. The wholesale pricing engine ran in front of a Shopify reviewer and worked. Uninstalls followed at ~16:04.
  - **🔴 GDPR failure, found by reading the database rather than any log — FIXED.** `app/uninstalled` and `shop/redact` each returned **500 eighteen times** for the reviewer's stores; Shopify exhausted its retries; **both `Shop` rows and their sessions survived a redaction request by more than 24 hours.** Deleted by hand — production now holds exactly `piroaccessories` and `adspubli-wholesale-test`. **The cause of the 500s is still unknown**: the identical handlers return 200 today, verified against production both with a seeded shop that had a session and with one that never existed. Something transient that cannot be reconstructed. What changed is that both handlers now log the message and stack before rethrowing — rethrowing stays correct (it asks Shopify to retry), the silence did not.
  - **🔴 Infinite redirect loop — FIXED and verified live.** `/auth/login` recovers the shop from `Referer`/cookie → `/?shop=X` → `/app?shop=X` → cannot authenticate without a session → back to `/auth/login`. Harmless when a session exists, endless when it does not. Reproduced against production with a bare `Referer` header. Fix: a 15-second `stockly_auth_recovery` cookie makes the recovery fire **at most once**; the second arrival renders the page. Verified in production: 1st visit `302` + guard armed, 2nd visit `200` + guard cleared. 6 new tests in `app/lib/shop-cookie.test.ts`.
  - **⚠️ Still open and unchanged: `/auth/login` renders a "Shop domain" form**, which requirement 2.3.1 prohibits. The loop fix does not remove it — it only stops the cycling. This remains the most likely rejection reason.
  - **Verified:** `verify.sh` green — **155 app tests** (was 149), 14 + 8 fixtures, both builds. Deployed `3f48f87`, `/healthz` 200.

Prior 2026-08-13 — **🚀 SUBMITTED TO THE SHOPIFY APP STORE. Status "Enviada", a reviewer is assigned, visibility is LIMITED (unlisted). All ten preliminary checks green. Railway now serves the PUBLIC app, which means PIRO IS DOWN until approval. Two rejection-grade code defects were found and fixed before submitting. Two things need action now: rotate the leaked client secret, and tell Ana.**

  - **✅ SUBMITTED.** Every preliminary check is green, including *"Comprobaciones de las aplicaciones incrustadas"*, which turned green once real session data existed. Shopify writes to `info@adspubli.com`; the confirmation screen stresses replying fast or the review stalls. **Realistic: 2–4 weeks.**
  - **Visibility is LIMITED and must stay that way for now.** Only merchants with the direct URL can install. The dashboard offers *"Dar visibilidad completa"* — **do not press it during review**, and think hard before pressing it after: App Store reviews are permanent and weigh heavily in ranking, while limited→full is a one-click change at any time. The asymmetry is the whole argument. Two concrete reasons to stay unlisted: on Basic plans Stockly always renders struck-through retail + discount rather than a clean wholesale price (Cart Transform `update` is Plus-only), and only the Starter plan is genuinely deliverable.
  - **⚠️ Most likely rejection cause, left in deliberately: `/auth/login` still asks for the `.myshopify.com` domain** (requirement 2.3.1). The index route was cleaned, this one was not, because Shopify's install flow falls back to it and breaking it on submission day was the larger risk. **Do not "fix" it while a reviewer is active** — a broken install during review is a guaranteed rejection. If the rejection cites it, fix it then, knowing exactly what the reviewer asked for.
  - **⏳ Freeze the listing, the visibility and any large deploy until there is a verdict.**
  - **📧 Ana has not been told.** Piro has been down since the credential switch. Note before writing to her: **the order minimums have never actually run on Piro** — the $300 gate she believes she has comes from the theme (`theme/snippets/b2b-minimum-order.liquid`), not from Stockly, and the theme gate is bypassable via cart permalinks. Approval will be the *first* time minimums are genuinely enforced there. Frame it as the upgrade it is, but do not let her keep believing it already worked.

  - **✅ Listing: 14 issues → 0.** Fixed this session: Features (the field held **9 entries** — the four real ones duplicated twice plus blanks — tripping *"At most 5 features are allowed"*; now exactly 4), 3 desktop screenshots at 1600×900 with alt text, app card subtitle, 5 search terms, Sales channel requirements (**Online Store**, correct — the app ships a theme app extension), privacy policy + developer website (`stocklygo.site/privacy`, `stocklygo.site`), all three contact emails (`info@adspubli.com`), and step-by-step reviewer instructions.
  - **✅ Test account requirement dissolved, not worked around.** Checked *"My app doesn't require an account to use it"* — true: Stockly is embedded, reviewers authenticate with their own Shopify session. **The separate demo store with reviewer credentials, tracked as a blocker since 2026-08-09, was never actually needed.**
  - **✅ Pricing plans now match the code.** Created Starter/Growth/Plus at **$39/$79/$149 monthly, 14-day trial**, mirroring `app/services/billing-plans.ts`. The first attempt advertised a **$390/year** cycle the app cannot charge — `BILLING_PLAN_DEFINITIONS` is `Every30Days`-only, so a merchant picking annual would have hit a plan that does not exist. Caught before submitting.
  - **🔴 Two rejection-grade defects found by the AI self-review (`/shopify-app-store-review`) and FIXED — commit `96cd8a4`.** (1) **Requirement 2.2.3**: App Bridge was never loaded from Shopify's CDN. `@shopify/app-bridge-react@4` was installed, but the package alone does not satisfy the rule — the `app-bridge.js` script tag must be served before any other script. **This is what was pinning the "Comprobaciones de las aplicaciones incrustadas" check in a permanent pending state.** `app/root.tsx` now serves it first in `<head>` and carries a loader for the public `client_id`. (2) **Requirement 2.3.1**: `app/routes/_index/route.tsx` was still the **untouched Remix template** — a "Shop domain" form (expressly prohibited: an app must not ask a merchant to type their myshopify.com domain) plus placeholder copy (*"A short heading about [your app]"*, three *"Product feature"* bullets) on a page reviewers do see. Replaced with factual copy; form removed. `/auth/login` left in place because Shopify's install flow falls back to it — **flagged, not resolved.**
  - **🔴 Deploys had been failing silently — commit `d0d2c4d`.** `railway up` tars the working directory before building, and nothing excluded **`Promo/` (851 MB of screencast footage)** or `graphify-out/` (16 MB). Two deployments sat in `INITIALIZING` and never reached the builder while production kept serving the old release, so it failed without an error anywhere visible. Added `.railwayignore` + the same entries to `.dockerignore`; the next deploy completed in ~5 min.
  - **🔴 PIRO IS DOWN — deliberate, authorized by Jonatan.** One backend cannot serve two Shopify apps with different credentials. Railway's `SHOPIFY_API_KEY`/`SHOPIFY_API_SECRET` were switched from the Piro custom app (`b530543e…`) to the **public app (`40128ca5…`)**, verified from the live HTML (`data-api-key="40128ca5…"`) and `/healthz` 200. **Ana cannot open Stockly until the public app is approved and reinstalled on `piroaccessories`.** Her 5 wholesale customers are intact in the database — nothing was deleted.
  - **🔴 ROTATE THE CLIENT SECRET.** The public app's `SHOPIFY_API_SECRET` was printed in plaintext into this session's transcript (a masking `sed` failed on leading whitespace). It sits in `~/.claude/projects/…/*.jsonl` on Jonatan's Mac. Rotate at Dev Dashboard → Configuración → Credenciales → **Rotar**, then update Railway. **Not yet done.**
  - **✅ The public app is installed and generating real traffic** on `adspubli-wholesale-test.myshopify.com`. Verified two ways, not assumed: a `Shop` row + OAuth `Session` in the production database (created `2026-08-12T22:28Z`), and Shopify's own Dev Dashboard logs showing **dozens of `Solicitud de GraphQL … admin … OK`** at 22:35–22:36. **An earlier attempt the same evening left no trace anywhere** — it was reported as done but never completed OAuth, which is why the check looked stuck. Verify installs against the database, not against the user saying "listo".
  - **⏳ The only thing left is Shopify's clock.** *"Comprobaciones de las aplicaciones incrustadas"* re-evaluates **every 2 hours**; both sub-checks (App Bridge from CDN, session tokens) are now satisfied in production and there is finally session data to read. When it turns green, **"Enviar para revisión"** activates. Everything else on the checklist is green, including the AI self-review and Jonatan's own attestation.
  - **Feature media and screencast are done** (Jonatan): video `https://youtu.be/GMqYypoJf6w` plus a 1600×900 thumbnail.
  - **Note for whoever reads the earlier entries:** the *"listing text is written but NOT saved"* problem below is **resolved** — the copy is saved. The React form does reject programmatic injection, but clicking and typing through the browser works.

---

## The other thing that is live: the marketing site

**`https://stocklygo.site` — LIVE, source in `site/`.** Verified 2026-08-15:
apex and `stocklygo.netlify.app` both `200`. This is the project's second
production asset and it is independent of the Railway app — it can be
deployed, broken or fixed without touching Stockly itself.

- **Astro 5 + Tailwind v4, static, on Netlify** (project `stocklygo`, team
  AdsPubli). Ships **0 KB of JavaScript**: the FAQ is native `<details>`, the
  waitlist is a native form POST. DNS is Cloudflare, **grey cloud / DNS only**
  — the orange proxy blocks Netlify's Let's Encrypt validation.
- `/privacy` and `/terms` **301 to the Railway legal pages**, so those two
  URLs have one source of truth. The App Store listing points at
  `stocklygo.site/privacy`.
- **The waitlist form works end to end** (Netlify form detection had to be
  enabled by API and the site redeployed — detection happens at deploy time).
- **⚠️ Two things still wrong on it:** `hello@stocklygo.site` is printed in
  the footer and **does not exist** — create the alias or change the address;
  and two test submissions (`test-deploy-check@`, `test-browser-path@`) are
  sitting in the Netlify form inbox and should be deleted by hand.
- **⏳ The day the app is approved, swap the CTA.** The primary call to
  action is an early-access waitlist, not an install button. Checklist at the
  end of `site/README.md`.

Content rules, deploy notes and the Netlify/Cloudflare gotchas hit while
setting it up are in `site/README.md` and `docs/handoff-archive.md`.

## Older entries

Everything before 2026-08-12 lives in **`docs/handoff-archive.md`** — the
Railway outage and recovery, the Fly→Railway migration, the Discount Function
clock bug, the Piro install, the Functions-need-Plus discovery, the Level 2
compliance work, and the Billing API plumbing. Closed history; read it when
you need the backstory of a decision, not at session start.
