# 2026-08-20 — Fix the two App Store rejection issues (billing return + zombie save bar)

## Objective

Shopify's reviewer feedback arrived 2026-08-20 ("Action required: Issues
with your app submission", reference 129441, 14-day deadline → 2026-09-03).
Two issues, both with screencasts:

1. **1.2.2 Billing** — after approving the subscription on Shopify's
   "Approve subscription" page, the merchant lands on the public
   "Open Stockly from your Shopify admin" page (top-level, outside the
   admin) instead of back inside the app. The reviewer DID reach the
   approval page and DID approve (Partner activity log: subscription
   activated 15:26, cancelled+uninstalled 16:34, "Testing multiple
   apps") — only the return leg was broken.
2. **2.1.1 Critical errors** — after creating a volume pricing rule, the
   admin's "Unsaved changes" save bar stayed visible forever: Save and
   Discard dead, all admin navigation blocked ("unable to toggle other
   app dropdown and unable to save or discard the created volume
   pricing").

Both screencasts were downloaded from the feedback page and read
frame-by-frame (scratchpad). Evidence-first: every mechanism below was
confirmed against the shipped `app-bridge.js` from Shopify's CDN, the
SDK source in node_modules, or the official docs — not guessed.

## Root causes

- **Billing:** `billing.request`'s `returnUrl` was
  `${SHOPIFY_APP_URL}/app/billing`. Shopify redirects the TOP-LEVEL
  window there after approval; our host loads outside the admin with no
  host/shop params, `authenticate.admin` can't recover, merchant
  dead-ends on `/auth/login`'s fallback card. The official pattern (and
  the SDK's own default) is
  `https://admin.shopify.com/store/{handle}/apps/{client-id}/...`.
- **Save bar:** App Bridge's host-side bar state is synced ONLY by a
  bubbling "update" CustomEvent from the in-iframe `<ui-save-bar>`
  element. On a Remix redirect the route unmounts and React removes the
  element BEFORE any hide runs: the element's own disconnectedCallback
  dispatches the event on a detached node (never reaches `document`),
  and `shopify.saveBar.hide(id)` throws "SaveBar with ID … not found".
  Host keeps a frozen bar wired to dead buttons and blocks navigation.
  All six SaveBar users shared the pattern.

## Changes

- **NEW `app/lib/use-managed-save-bar.ts`** — `useManagedSaveBar(id,
  isDirty)`: shows while dirty, hides when
  `navigation.state === "loading"` (the last moment the element is still
  mounted), swallows the harmless post-unmount rejection. Applied in all
  6 SaveBar users: `app.volume-pricing.new`, `app.volume-pricing.$id`,
  `app.pricing.new`, `app.pricing.$id`, `app.settings.pricing`,
  `RegistrationFormEditor` (modal chrome keeps the bar hidden).
- **`app/routes/app.billing.tsx`** — returnUrl now
  `https://admin.shopify.com/store/{handle}/apps/{SHOPIFY_API_KEY}/app/billing`;
  loader's `checkActiveSubscription` guarded (degrades to "no active
  subscription" instead of crashing the page — the likely source of the
  13 Aug "Application Error" on this route).
- **Dead Delete buttons fixed** in both `$id` editors: `window.confirm()`
  is inert in the sandboxed admin iframe → replaced with the Polaris
  confirm Modal pattern from `RegistrationFormList`'s DeleteCell.
- **Save-bar baseline (`initial`) made pristine** in both `.new` routes
  (was derived from `actionData.values`, so failed validation hid the
  bar and broke Discard); `volume-pricing.$id` baseline now uses the
  loader-hydrated scopeItems (kills a phantom-dirty bar on legacy
  single-target rules).
- **`app/root.tsx`** — root ErrorBoundary (styled full-document page; no
  more raw "Application Error" anywhere). **`app/routes/app.tsx`** —
  ErrorBoundary renders styled 4xx pages for thrown Responses, falls
  through to `boundary.error` otherwise.
- Test updated: `app/services/app-billing-route.test.ts` asserts the
  admin.shopify.com returnUrl shape.

## Verification

- `verify.sh` green (lint, app tests, extension fixtures, both builds).
- Adversarial verification workflow (3 independent skeptics) — see
  session notes; defects it surfaced were fixed before commit.
- GDPR check against production DB: today's reviewer uninstall
  (`mif8ed-fv.myshopify.com`) deleted its Session on `app/uninstalled`
  (the 14 Aug webhook fix confirmed again with real traffic); Shop row
  correctly awaits the 48h `shop/redact`.

## Next step

Deploy to Railway, verify prod, re-test billing + volume pricing on
`adspubli-wholesale-test`, record proof-of-resolution screencast, mark
both issues resolved in the Partner Dashboard, resubmit. Deadline
2026-09-03.
