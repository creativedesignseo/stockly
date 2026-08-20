# Drafts — Partner Dashboard "Show resolved state" responses (EN)

> One per issue. Paste into the feedback form when marking each issue
> resolved. "Proof of resolution" wants a URL — record ONE screencast
> covering both flows (see script below), upload unlisted (YouTube, like
> the listing screencast), and use the same URL for both issues.

## Issue 1 — 1.2.2 Implement Shopify App Pricing / Billing API correctly

Thank you for the detailed screencast — it made the root cause clear.

Fixed. The `returnUrl` we passed to the Billing API pointed at our app
host instead of the embedded admin URL, so after approving the charge
the merchant landed outside the Shopify admin. It now uses the
documented pattern
(`https://admin.shopify.com/store/{store}/apps/{client-id}/app/billing`),
and after approving the subscription the merchant is redirected straight
back into the embedded app on the Billing page, which shows the new plan
as "Current plan". We also hardened the billing page loader so a
transient subscription-status read failure can no longer render an
error page (the "Application Error" you saw on the embedded billing
page earlier in the review).

Proof: [SCREENCAST URL] — shows Choose plan → Shopify's approval page →
approve → redirected back into the app with the active plan visible.

## Issue 2 — 2.1.1 Build apps without critical errors

Thank you for the screencast. Two defects were involved and both are
fixed:

1. After creating a volume pricing rule, the "Unsaved changes" save bar
   could persist after the redirect back to the list, with Save/Discard
   unresponsive and admin navigation blocked. Cause: the save bar was
   dismissed only after the form unmounted, which is too late for the
   admin to be notified. All forms in the app now dismiss the save bar
   before navigation completes, so it can no longer outlive its page.
2. The "Delete this volume pricing" action relied on a browser
   `confirm()` dialog, which the embedded admin iframe suppresses — so
   the created rule could not be discarded/deleted. It now uses a
   proper confirmation modal.

Proof: [SCREENCAST URL] — shows creating a volume pricing rule, saving
(bar disappears, navigation works), editing it, and deleting it via the
new confirmation modal.

## Screencast script (record on adspubli-wholesale-test, ~90s, one take)

1. Open Stockly → Billing → "Start 14-day trial" → Shopify approval
   page → Approve → land back inside the app on Billing with
   "Current plan" badge visible. Pause 2s.
2. Volume Pricing → Create volume pricing → type a name → Save (from
   the save bar) → list loads, NO "Unsaved changes" bar, click another
   nav item to show navigation works. Pause 2s.
3. Open the created rule → Danger zone → Delete → confirmation modal →
   Delete → back on the list, rule gone, no stuck bar.
4. Upload unlisted to YouTube → paste URL into both proofs.

> After both proofs are in: the sidebar shows 2/2 → go back → press
> "Enviar correcciones" (resubmit). Deadline: 2026-09-03.
