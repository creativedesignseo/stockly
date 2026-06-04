# tasks/current.md — Stockly active task queue

> Single page of what's being worked on **right now**. Keep it short.
> Older completed tasks live in `progress/`. Strategic plan lives in
> `ROADMAP.md`. Operational truth lives in `HANDOFF.md`.

**Last updated:** 2026-06-04 (verified Camino B prod state, realigned docs,
set up + reverted the checkout-block E2E, **shipped the "Activate Stockly"
app embed — stockly-38 + Fly; ⏳ pending Jonatan: re-grant read_themes +
toggle the embed ON + dashboard Refresh** — see
`progress/2026-06-04-app-embed-activate-stockly.md`). **▶ RESUME HERE:**
`progress/2026-06-04-camino-b-prod-verification.md` (latest), then
`progress/2026-06-03-session-summary.md` for the full pending list
(onboarding button fix, unify Pricing nav, read_themes auto-detection,
admin lime, form builder…).

---

## In progress (2026-06-03) — Camino B: opening-order minimum

New B2B model decided with Jonatan: approve manually → sees wholesale
pricing immediately → first order must hit a minimum (€/qty) to become a
full wholesaler → reorders free → merchant "releases" with one click. No
dependency on privacy policy / orders-paid. Supersedes the half-wired
ADR-004 price-side FPQ. Full journal:
`progress/2026-06-03-camino-b-opening-order-fase1-2.md`.

- [x] **Fase 1 — revenue path** (commit `655d597`). `approveCustomer`
  leaves `qualifiedAt=null`; `discount-function-sync` surfaces EVERY
  approved customer in `qualifiedCustomers` (discount gated on "is
  approved", not qualifiedAt — keeps C3 fixed; WASM untouched). First
  server-side revenue-path test added (guards C3).
- [x] **Fase 2 — admin release** (commit `655d597`). Opening-order badge
  (pending/met, gated on `fpqMode != none`) + one-click "Release from
  opening order" on `app.customers.applications.tsx`.
- [x] **Fase 3 — checkout block — DEPLOYED & CONFIGURED (stockly-36 + Fly, 2026-06-03).**
  ✅ VERIFIED in prod (read-only query 2026-06-03): `write_validations` granted,
  `fpqMode='amount'`, `fpqAmount=200`, baseline 60%. The "set fpqMode + save"
  pre-condition is DONE. NOTE: the Validation is (re)created on approve / release
  / settings-save — not only the Save. **Functional gap:** `pendingOpeningOrder=0`
  of 3 customers (the 3 existing ones are already `qualifiedAt != null`), so the
  pending list is empty and nothing blocks today. **E2E attempted 2026-06-04 but
  NOT completed:** de-qualified the test customer `creativedesignseo` (GID
  10103069901128) as guinea pig, then reverted to the original `qualifiedAt`
  (pending back to 0) since the storefront steps weren't run. To resume, see the
  step-by-step + the de-qualify one-liner in
  `progress/2026-06-04-camino-b-prod-verification.md`. Threshold is measured on the
  PAID subtotal (after wholesale discount): baseline 60% → block needs retail
  <~€500, pass needs retail ≥~€500. Also unverified (non-blocking): the Validation
  object exists+active in Shopify (needs a fresh-token GraphQL check from the app).
  - Part 1 (commit `76866c1`): WASM extension `stockly-opening-order`
    (`cart.validations.generate.run`) + 5 green fixtures. Blocks checkout
    if customer is on the pending list + cart < minimum; fails open.
  - Part 2: `opening-order-sync.server.ts` (validationCreate +
    metafieldsSet with config + pending GIDs from qualifiedAt=null rows);
    wired into approve, release, and settings/pricing save; added
    `write_validations` scope to shopify.app.toml.
  - **To go live:** `shopify app deploy` (publishes the function + the new
    scope → merchant must RE-GRANT the scope on the dev store) AND
    `fly deploy` (sync + wiring). Then E2E: approve a customer with
    fpqMode=amount set, confirm checkout is blocked below the minimum and
    passes at/above it, then "Release" and confirm checkout is free.
- [ ] **Fase 4 — banner.** Connect the cart/QOF "you need €X more to
  activate" banner to the opening-order state (the fpq-banner block exists).
- [~] **Fase 5 — ADR + deploy.** ADR-016 written (supersedes ADR-004's
  price-side FPQ) ✅. Pending: verify + deploy (`shopify app deploy` +
  `fly deploy`) with explicit Jonatan go — blocked on Shopify CLI auth
  (same gate as Fase 3 typegen).

**✅ Status (2026-06-03):** Fases 1+2 DEPLOYED to Fly (+ "Approve from the
detail modal"). Buyer-neutral — the checkout gate (Fase 3) is NOT built
yet, so an approved customer shows "opening order pending" but the minimum
is NOT enforced at checkout. To resume Fase 3: authenticate the Shopify
CLI, then build the Cart & Checkout Validation Function with fixtures.

---

## Backlog (2026-06-03) — Registration Form / form builder UX

From a review session with Jonatan (the admin form builder + storefront
block). Separate front from Camino B.

- [x] **Storefront block short-code copy + section padding — LIVE (stockly-32).**
  Short-code setting reworded as optional ("leave empty → active form") +
  new "Section padding" group (Top/Bottom sliders, 0–120px). The admin
  "Copy short code" chip already existed (icon + tooltip + "Copied!").
- [ ] **Default template should be B2B** + rename "Samita Wholesale" →
  "Wholesale B2B (recommended)", surface first (`seeds.ts` + test). A
  wholesale app shouldn't default to a B2C name+email+password form. This
  is the root cause of the company-less applications Jonatan saw.
- [ ] **Default reg form must include Company** (overlaps above) — the
  served form must carry `company_name`; the Applications "Company" column
  fills ONLY from a field whose key === `company_name` (proxy.apply.tsx:86).
  Fragile magic-key mapping; robust fix = a "field role" selector in the
  editor (Company / Tax ID / Country…). See task notes.
- [ ] **Rename "Reset to template"** (reads like "delete all") →
  "Start from a template".
- [ ] **Visual preview in the template picker** — reuse `FormPreview` for a
  live mini-preview per template (vs Sami's static thumbnails). Polish.
- [x] **Input "double border" fixed — LIVE (stockly-35).** Dawn-family
  themes draw input borders with a `box-shadow` ring (often `!important`)
  that stacked on our border = two lines. Fixed on the registration form
  with `box-shadow: none !important` + `outline: none !important`. Full
  writeup: `docs/architecture/theme-app-extension-css-gotchas.md`.
- [ ] **Audit QOF + product-panel inputs** for the same theme box-shadow
  ring (qty inputs, variant select) — apply the same reset.

---

## Just shipped (2026-06-02) — Premium Phase 1 + Phase 4 (LIVE, stockly-31)

ADR-015 / `docs/design/storefront-premium-plan.md`. Unified all four
storefront blocks onto ONE premium token set, killing the "Frankenstein".

- **Phase 1**: `--sk-*` tokens extracted to a shared
  `extensions/quick-order-form/assets/stockly-base.css` (declared on a
  4-host selector so per-host inline accent overrides still resolve);
  loaded by each block's `.liquid` via `stylesheet_tag` (app blocks allow
  only one schema `stylesheet`). Added `--sk-success*`/`--sk-danger*`.
- **Phase 4**: `fpq-banner.css` + `wholesale-product-panel.css` pure
  re-skins onto `--sk-*` (classes + `data-stockly-*` hooks + JS untouched).
  `registration-form.css` light-touch: `--rf-color-*` runtime contract
  (injected by registration-form.js from admin appearance JSON) preserved;
  only its defaults derive from `--sk-*` + radii/shadows/font aligned.

CSS+Liquid only → released via `npx shopify app deploy` (NO `fly deploy`);
revenue path untouched. `verify.sh` green. Full journal:
`progress/2026-06-02-storefront-premium-phase1-phase4.md`. (Non-blocking
deploy warning: `registration-form.js` 13 KB > 10 KB app-block threshold —
trim is a tracked follow-up, not introduced here.)

**⏳ Pending Jonatan visual confirm:** product page (panel), cart (FPQ
banner), registration page. QOF unchanged. Remaining plan: Phase 5
(conditional nav visibility by tag).

---

## Just shipped (2026-06-02) — QOF merchant Appearance knobs

**LIVE on Shopify `stockly-30`** (commit `11c91b2`, ADR-015). The Quick
Order Form theme-editor panel gained an **"Appearance"** group so the
merchant can adjust the look from where they already edit the block —
deliberately FEW knobs (premium-opinionated, can't be made ugly):

- **Accent color** (`color` setting). Precedence chain in the CSS: block
  setting (`--sk-accent-theme`) → App Proxy branding (`--stockly-primary`)
  → bronze fallback. A color set here wins over the shop branding; left
  empty it inherits the brand color.
- **Density** (comfortable/compact) → `--sk-pad` + `--sk-cell-pad-y`.
- **Text size** (small/medium/large) → `--sk-text-base`.

All emitted as inline CSS custom properties on the host from
`quick-order-form.liquid`; `quick-order-form.css` consumes them at 5
anchor points. **Pure CSS+Liquid** — the `data-stockly-*` contract and the
pricing/cart JS are untouched, so the revenue path is unaffected.
`verify.sh` green. `shopify app deploy` only (no `fly deploy`).

Decision recap (with Jonatan): the knobs live in the **theme editor block
panel** (chosen over a centralized admin "Appearance" panel) — fastest,
native Shopify controls, no backend change. The admin-side centralized
panel (original Phase 3) remains a later option if cross-block coherence
becomes a need.

**⏳ Validate in prod (Jonatan):** open the QOF block in the theme editor,
expand the **Appearance** group, try the accent color / density / text
size and confirm the storefront reflects them.

---

## Just shipped (2026-06-01) — Quick Order Form premium re-skin

**LIVE on Shopify `stockly-29`** (ADR-015). First step of the
premium-opinionated storefront design direction decided with Jonatan
(deluxe Stockly identity, NOT theme-inherited; few merchant knobs).

The QOF storefront block (`extensions/quick-order-form/`) moved to the
canonical `--sk-*` token set: Stockly's own type scale, warm-ink palette,
bronze accent, soft shadows, larger radii — and a **real mobile card
layout** (each product becomes a labelled card; was just a shrinking
table). Implemented as a **pure re-skin**: every `.stockly-qo__*` class
and `data-stockly-*` JS hook preserved; only `quick-order-form.css`
rewritten + three `data-label` attrs added to `quick-order-form.liquid`
for the mobile labels. Pricing/cart JS untouched → revenue path safe.
Validated visually on real block markup (desktop 1100px + mobile 390px)
with Playwright before deploy; fixed two CSS specificity bugs (SKU cell +
meta-row flex losing to `td{display:block}`) and a mobile overflow.
CSS+liquid only → `shopify app deploy`, no `fly deploy`. `verify.sh` green.

Prototype + final captures: `docs/design/prototypes/`. Plan for the rest:
`docs/design/storefront-premium-plan.md` (Phase 1 shared `stockly-base.css`,
Phase 3 admin Appearance panel = the merchant knobs, Phase 4 propagate to
the other 3 blocks, Phase 5 conditional nav visibility by tag).

**⏳ Validate in prod (Jonatan):** open the wholesale-order page on the dev
store as the `Test Wholesale` customer — confirm the new premium look on
desktop, then on a phone confirm the card layout. The accent follows the
merchant brand color if set (App Proxy branding → `--sk-accent`), else a
refined bronze.

---

## In progress (2026-05-29) — Rescue audit + interview

Read-only deep audit of the whole project to produce a rescue plan
without scope creep. Interview rounds 1+2 asked; awaiting Jonatan's
answers. **New top concern from Jonatan: DESIGN** ("falta diseño /
necesito reconfigurar todo") — OPEN whether that means a visual pass
(maquillaje) or re-architecture (cirugía); that decision shapes the
whole plan. **Continuing in the Claude Code desktop app.** Full technical radiography + open questions in
`progress/2026-05-29-rescue-deep-read-and-interview.md`. NO code is to be
touched until the interview closes. Key findings to act on after:
Volume Pricing multi-band has no admin UI (storage-only); the Discount
Function's 7 fixtures have never run (broken extension test runner);
no Billing (B0-2); `orders/paid` still gated on B0-5; ADR-014 referenced
but missing.

---

## Just shipped (2026-05-30) — Storefront form font sizes (theme-proof)

Form labels rendered at 8.5px on the dev store because our storefront CSS
sized text in `rem`, inheriting the theme's 10px root (`font-size: 62.5%`).
Anchored the component's own base (`font-size: 16px` on the host) and moved
all text sizes to absolute px (label 14, heading 24, hint 12…). Legible on
any theme now. Commit `f8225a0`, Shopify stockly-28 (CSS-only → `shopify
app deploy`, no `fly deploy`).

**Decided with Jonatan:** ship a good DEFAULT now; a merchant-adjustable
text-size control ("perilla") in the Appearance panel is a FOLLOW-UP
feature (would touch editor + storefront + preview, like the other
multi-layer changes). Not started.

---

## Just shipped (2026-05-30) — Schema-driven storefront validation

The storefront wholesale form rejected valid submissions with "Company
name is required" even when the form had no company field, because
`proxy.apply.tsx` gated on the legacy `validateApplication` (company +
email hardcoded). **Cut over to schema-driven validation as
authoritative** (commit `ffc9781`, Fly v65 + Shopify stockly-27): the
storefront POSTs the form's `__shortcode`; the server resolves that exact
form (`resolveStorefrontForm`) and validates against its definition
(`validateResponses`). A field absent from the form is never required; a
required field IS enforced. `validateApplication` no longer hardcodes
company. **Needed both `fly deploy` AND `shopify app deploy`** (touches
`extensions/`).

**Validate in prod (Jonatan):** on the dev store storefront, submit the
default form (First/Last/Email/Password) → should succeed (no company
error) and appear in `/app/customers/applications`. Optional: add a
required custom field in the admin, use its shortcode, submit empty →
that field should now be required.

---

## Just shipped (2026-05-30) — RF editor in a max modal

The Registration Form editor now opens in an App Bridge `variant="max"`
modal (full canvas, no admin nav rail, X to close) instead of a cramped
embedded page — matching the Sami competitor's editor. **LIVE on Fly
v63** (commit `e22c3b7`, `fly deploy` only — pure admin-UI change, no
schema/extension/config). Implemented inline (no nested `src` iframe);
editor body extracted to a reusable `RegistrationFormEditor` component
with `chrome="modal"` / `chrome="page"`. This is the FIRST concrete step
of the design-rescue direction Jonatan asked for — it also answers the
"maquillaje vs cirugía" question for this screen: **maquillaje** (the
data model + logic were fine; only the container changed).

**Validated in prod (Jonatan, 2026-05-30):** editor opens full-screen —
visual goal achieved. 🎉

**FIXED 2026-05-30 (Fly v64, commit `233d6df`).** The per-field
edit/delete/add controls did nothing inside the max modal — they were
floating Polaris modals that portal to `document.body`, which renders
BEHIND the max-modal overlay. Replaced all four (FieldEditModal,
TypePickerModal, TemplatePickerModal, delete-confirm) with INLINE panels
that swap the editor's middle pane (new `FieldEditForm` + inline
type/template/delete panels in `RegistrationFormEditor`). `FieldEditModal`
+ `TypePickerModal` deleted as orphans. Pattern doc gotcha #1 updated with
the implemented solution.

**Live preview in the max modal — FIXED 2026-06-01 (Fly v66, commit
`165766d`).** It rendered blank because, inside the max-modal overlay
(no `<Page>`), Polaris `<Layout>`'s viewport-media-query wrap dropped the
preview section out of the modal's scrollable area. `chrome="modal"` now
uses an explicit 2-col CSS grid (fixed tracks, no media query);
`chrome="page"` byte-for-byte unchanged. `FormPreview` itself was never
broken. Admin-UI only (`fly deploy`, no `shopify app deploy`).
**⏳ Pending visual validation by Jonatan:** open the RF editor in the max
modal and confirm the preview shows on the right.

---

## Just shipped (2026-05-29) — Registration Form multi-form

LIVE on Fly v62 + Shopify stockly-26. N forms per shop; admin LIST →
editor (`/app/registration-form` list, `/app/registration-form/$id`
editor); storefront `form_shortcode` block setting with dual-serve
back-compat. Full detail in `progress/2026-05-29-multi-form-sprint.md`
and the "Registration Form multi-form" block in HANDOFF.md. Open
follow-ups from the reviewer: SHOULD-2 (`proxy.apply.tsx` validates
non-default forms against the default definition — log-only noise, fix
before the Phase 1F validator cutover) and trimming `registration-form.js`
below the 10 KB app-block threshold.

---

## Current state

Stockly is **live in production on Fly.io** (`stockly-lustrous-forest-4364`,
Fly v10, Shopify app `stockly-18`, Custom distribution).
Sprint 4 (admin pages, applications queue, pricing settings, onboarding
wizard, qualify-customer tool) is complete and verified on the dev store
`desarrollo-adspubli.myshopify.com`. A 12-agent audit ran earlier today —
findings drive the P0/P1 lists below. The PM session validated the
admin Approve flow E2E (first wholesale application moved to approved
state) — see `progress/2026-05-26-approve-flow-fix.md`.

**Source of truth for "what works":** `HANDOFF.md`.

---

## P0 — blocking pilot #2 and App Store

These must close before charging a paying customer or submitting to the
Shopify App Store.

- [x] **B0-1 — DONE 2026-05-27.** Three new handlers:
  - `app/routes/webhooks.customers.data_request.tsx` — looks up
    WholesaleCustomer + WholesaleApplication rows by id/email and
    structured-logs them for the merchant audit trail.
  - `app/routes/webhooks.customers.redact.tsx` — hard-deletes
    WholesaleCustomer + WholesaleApplication rows in a transaction.
  - `app/routes/webhooks.shop.redact.tsx` — deletes Session rows and
    the Shop row (cascade to Tier, WholesaleCustomer,
    WholesaleApplication, OnboardingResponse via schema's
    onDelete: Cascade).
  All 3 verify HMAC automatically via `authenticate.webhook`
  (returns 401 on tampering, exactly what App Store requires).
  Registered in `shopify.app.toml` under `[[webhooks.subscriptions]]`
  with the `compliance_topics` key (not regular `topics`).
  Released to Partners via `npx shopify app deploy` in the same
  session as the code deploy.
- [ ] **B0-2 — Billing API.** Wire `billing` config in `shopifyApp()`, add
  `/app/billing` plan picker, call `appSubscriptionCreate` from onboarding.
  ~3 days.
- [ ] **B0-3 — Discount Function pricing bugs (C1, C2, C3).**
  - C1: `webhooks.orders.paid` evaluates FPQ against the wrong amount —
    pending verification; the Function itself evaluates FPQ against
    `cartWholesaleSubtotal` (correct per ADR-004). The bug may live in
    the webhook handler, not the Function. To be reproduced.
  - [x] **C2 — DONE 2026-05-27.** `webhooks.orders.paid.tsx` now calls
    `syncTiersToFunction(admin, shopRow.id)` after the per-customer
    metafield write, mirroring the approve action's pattern. Errors
    swallowed (logged, not thrown) — qualification is already in
    effect via the per-customer metafield; the sync just refreshes
    the bypass list on the shop-level configuration metafield. **The
    webhook subscription itself is still NOT registered** in
    `shopify.app.toml` (commented out) — that's a separate gate that
    requires Protected Customer Data + a real Privacy Policy URL
    (B0-5). Code is ready; enabling the subscription is a 2-line
    diff once B0-5 lands.
  - [x] **C3 — DONE 2026-05-26.** Admin-approved (track-2) customers
    were paying retail at checkout because `approveCustomer` was
    creating WholesaleCustomer rows with `qualifiedAt=null`, and the
    Function's `qualifiedCustomers` bypass list is sourced ONLY from
    rows with `qualifiedAt != null`. Fix in commit `0250d1f`:
    `approveCustomer` now sets `qualifiedAt=now`, and the approve
    action calls `syncTiersToFunction` immediately after. Validated
    E2E on dev store — checkout charges €58.50 wholesale on a €130
    retail cart, with `WHOLESALE 55%` labels on each line. See
    `progress/2026-05-26-approve-flow-fix.md` for the full chain.
- [x] **B0-4 — Rotate `DATABASE_URL` password.** _Done 2026-05-26._
  Forensic investigation revealed the credential lived inside the
  Vercel project `stockly` (Vercel Marketplace → Prisma Postgres
  integration), not in a standalone Prisma account. Resolution:
  deleted the entire Vercel project via `vercel project rm stockly`,
  which cascaded to env vars (DATABASE_URL, SHOPIFY_API_SECRET,
  SHOPIFY_API_KEY, PRISMA_DATABASE_URL, POSTGRES_URL) and the
  associated Prisma Postgres DB. Also deleted local `.env.local`
  (4 zombie vars: DATABASE_URL, POSTGRES_URL, PRISMA_DATABASE_URL,
  VERCEL_OIDC_TOKEN). Production on Fly.io confirmed unaffected
  (HTTP 200, secrets still deployed).
- [⏳] **B0-5 — Privacy + Terms SCAFFOLDED 2026-05-27, pending Jonatan
  legal review.** Two new public routes:
  - `app/routes/legal.privacy.tsx` → served at
    `/legal/privacy` (no Shopify auth, public). GDPR-compliant
    structure: responsable, datos recopilados, finalidad y base
    legal, conservación, transferencias, derechos del interesado,
    AEPD, cookies, menores, cambios, contacto.
  - `app/routes/legal.terms.tsx` → served at `/legal/terms`. SaaS
    B2B template: descripción, cuenta, planes/facturación (Shopify
    Billing), trial, uso aceptable, IP, garantías, limitación de
    responsabilidad (cap 12 meses), indemnización, terminación,
    jurisdicción Barcelona.
  - Content language: Spanish primary (ES/EU market). English
    translation deferred to a follow-up.
  - URLs are public, work without Shopify embed context.
  - **NEXT STEPS (Jonatan):**
    1. Read both files; flag anything that doesn't match Adspubli's
       actual legal posture (address, contact emails, jurisdiction,
       limitation amounts).
    2. Run by an abogado especialista en RGPD/SaaS OR a service like
       Iubenda/TermsFeed for a quick professional pass.
    3. Once approved, set the URLs in **Partner Dashboard → Stockly →
       App setup → Privacy / Terms** so they appear in the App Store
       listing.
    4. Submit Protected Customer Data request via Partner Dashboard
       for the `orders/*` topic family — unblocks B0-3 C1 + order
       tagging live (P1-10).
- [x] **B0-6 — DONE 2026-05-27.** `fly.toml` now has
  `min_machines_running = 1` (primary machine never sleeps) and
  `auto_stop_machines = 'suspend'` (secondaries resume in ~100ms
  instead of cold-starting in 5-30s). New `app/routes/healthz.tsx`
  exposes a lightweight liveness endpoint (no DB, no Shopify auth)
  and `[[http_service.checks]]` polls it every 30s with 5s timeout,
  10s grace at boot. ADR-009's "no cold starts" promise now holds in
  the config, not just the doc.

---

## P1 — pre-pilot polish

- [x] **P1-1 — DONE 2026-05-27.** Tier scope selection (in
  `app.tiers.new.tsx` and `app.tiers.$id.tsx`) now has a "Browse…"
  button via `useAppBridge().resourcePicker({ type: scope })` that
  opens Shopify's native picker modal. Cancel = no-op. On select
  the canonical GID is written into the form and the human-readable
  title is shown as helpText ("Selected: …"). Manual GID paste still
  works for power users / migration scripts.
- [ ] **P1-2** Rate-limit on `/proxy/apply` (5/min per shop + IP).
- [ ] **P1-3** Centralize multiplicative pricing math — Function, QOF
  and Product Panel currently round differently.
- [ ] **P1-4** `WebhookEvent` idempotency table; transaction-wrap
  `orders/paid` handler.
- [ ] **P1-5** Discount Function test fixtures: baseline×tier, FPQ
  pre/post, variant>product>all specificity, cart_total vs per_line.
- [x] **P1-6** Remove `app.additional.tsx` and the "Additional page"
  NavMenu entry (template residue visible to merchants). _Done
  2026-05-26._
- [ ] **P1-7** Register a custom domain to replace
  `stockly-lustrous-forest-4364.fly.dev`.
- [x] **P1-10 — DONE 2026-05-27.** Order tagging in
  `webhooks.orders.paid.tsx`: if `customer.tags` includes the shop's
  wholesaleTag, tag the Order with `<wholesaleTag>-order` via
  Shopify `tagsAdd`. Runs BEFORE the FPQ early-return so every
  wholesale order gets tagged (not just qualifying ones). Errors
  swallowed (logged) — tag failure doesn't block qualification. NOT
  YET LIVE for merchants: the `orders/paid` subscription itself is
  still gated by B0-5 (Privacy Policy URL needed for Protected
  Customer Data approval of `orders/*` topics). Code ready; ships
  automatically when the subscription is enabled.
- [x] **P1-11 — DONE 2026-05-27.** Tax-exempt toggle exposed in the
  Applications modal as a secondary action visible for approved
  applications with a linked Shopify customer. New action intent
  `set-tax-exempt` calls `customerUpdate(taxExempt: true)`. Banner
  surfaces success/error. BSS Advanced parity feature ($50 tier).
- [ ] **P1-9** Quick Order Form currency consistency: in dev store with
  a Spain-via-VPN visitor, the PRICE column rendered `€65,00` while
  LINE TOTAL and ORDER TOTAL rendered `$631.80`. The math is correct
  (validated 2026-05-26: 24 × €65 × 0.405 = €631.80), but mixing
  symbols in the same table is jarring. Likely cause: product price
  comes from Markets-resolved storefront context (EUR), while line
  total is computed against the shop's primary currency (USD for the
  dev store). Fix: resolve both via the same source — either format
  with the storefront `Shopify.currency.active` everywhere, or pin
  the QOF to the cart's currency.
- [x] **P1-8 — DONE 2026-05-26.** `markApplicationApproved` already
  auto-tags as part of the approve action. The missing piece was
  `syncTiersToFunction` — now called immediately after `approveCustomer`
  in commit `0250d1f`. Closed together with C3.

---

## Blocked

- **`orders/paid` webhook activation** — blocked on Shopify Protected
  Customer Data approval, which is blocked on **B0-5** (Privacy Policy
  URL).
- **Multi-region deploy (EU)** — deferred until we have an EU merchant
  paying.

## Known pre-existing failures (not blockers, but on the floor)

- **RESOLVED 2026-05-29.** `tsc --noEmit` previously failed on
  `extensions/stockly-volume-discount/src/run.ts` in a fresh worktree
  (8 errors: missing `../generated/api` + dependent implicit-`any`).
  Root cause was that the Shopify codegen artifact
  `extensions/stockly-volume-discount/generated/api.ts` was
  `.gitignore`d, so absent until `npm run typegen` (needs CLI auth).
  Fix: committed `generated/api.ts` (the `.gitignore` now keeps the
  rest of `generated/` ignored but whitelists `api.ts`). This keeps the
  root `tsc` type-checking the run.ts revenue path in CI/fresh clones
  with zero fragility. Regenerate the artifact with `npm run typegen`
  after `schema.graphql` changes. `bash scripts/verify.sh` green at the
  fix commit.

  Lint warnings from `935de4b` (unused `Form` / `navigation` /
  `submitting`) cleaned up on 2026-05-26.

---

## Next recommended action

**Open: B0-4 (rotate DB password).** Fastest, lowest-risk P0 with no
dependencies. Then B0-6 (Fly health checks, 30 min). Then sequence
B0-5 → B0-1 → B0-3 → B0-2 over the next 5–7 working days.

For B0-3 specifically: **before** touching code, validate manually in
Piro whether C1/C2/C3 are currently mis-charging real wholesale
customers. That tells us whether B0-3 is "urgent now" or "urgent for
pilot #2".

---

## Out of scope right now

- Multi-currency tier math
- i18n beyond English (Spanish admin planned for Sprint 6)
- Net 30/60 terms (Phase 2)
- Quote system (Phase 2)
- Analytics dashboard (Phase 2)

---

## Notes / reusable assets created during this project

- **`harness-bootstrap` global skill** (lives at
  `~/.claude/skills/harness-bootstrap/`) generalizes this project's
  harness pattern. Invoke it from any new project root with a phrase
  like "set up the harness here" and it will scaffold AGENTS.md,
  CLAUDE.md, scripts/verify.sh, tasks/current.md, progress/, plus 5
  generic subagents and 4 skills — adapted to the detected stack and
  hosting. Created 2026-05-26 right after the Stockly harness work
  proved the pattern.

- **PM 2026-05-26 findings worth keeping in mind**:
  - `useFetcher` responses do NOT populate `useActionData`. Any
    fetcher-driven action must lift `fetcher.data` to a parent
    `useState` for banners to render. (Fixed in `app.customers.applications.tsx`.)
  - `console.error(err)` collapses nested arrays via `util.inspect`
    (`graphQLErrors: [Array]`). Always `JSON.stringify` graphQLErrors in
    catch blocks for debuggable Fly logs.
  - `fly deploy` and `shopify app deploy` are independent pipelines.
    The toml-declared `protected_customer_data_permissions` only takes
    effect after `shopify app deploy` releases a new app version.
  - Selecting a **Distribution method** (Custom or App Store) is a
    prerequisite for requesting Protected Customer Data — Shopify hides
    the request form silently if no distribution is set, even on dev
    stores.
  - Dev stores **auto-grant** Protected Customer Data once the app
    version with the toml declarations is live (no merchant reinstall
    required). Production stores will require explicit grant + Partners
    review (blocked by **B0-5** Privacy Policy URL).

- **`.github/workflows/fly-deploy.yml`** is committed (since `6461a32`)
  and triggers `flyctl deploy --remote-only` **on every push to
  `main`** — IF the `FLY_API_TOKEN` GitHub secret is set. This conflicts
  with AGENTS.md's "no `fly deploy` without explicit permission" rule.
  DECISION PENDING (2026-05-29): either (a) switch the trigger to
  `workflow_dispatch` so deploys stay manual/gated, or (b) keep
  auto-deploy on push and accept that pushing to `main` ships to prod.
  Verify whether `FLY_API_TOKEN` is actually configured in GitHub before
  deciding — if it isn't, the workflow is currently a no-op safety-wise.
