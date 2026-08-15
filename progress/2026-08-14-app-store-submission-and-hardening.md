# 2026-08-13/14 — Submitted to the App Store, then hardened under live review

## Objective

Get Stockly submitted, then make sure it survives being tested. Halfway
through, the reviewer started testing — which changed the job from "finish
the listing" to "fix what the reviewer is hitting, right now".

## Outcome

**Submitted.** Status "Enviada", visibility limited (unlisted), reviewer
being assigned. Listing went from **14 outstanding issues to 0**. Six
rejection-grade defects were found and fixed afterwards, four of them by
audit rather than by symptom.

## What the reviewer actually did (13 Aug, from the Dev Dashboard logs)

```
14:04–14:17  OK   GraphQL admin                    store r73294
14:38–14:39  OK   GraphQL admin                    store r73295
14:40–14:46  OK   purchase.product-discount.run    ×10
~16:04       ERR  app/uninstalled + shop/redact    ×18 each, both stores
```

**The pricing engine ran in front of a Shopify reviewer and worked.** That
is the single most important line in this document. The failures came at
uninstall.

## The bug that mattered, and why it hid

`app/uninstalled` and `shop/redact` returned HTTP 500 eighteen times each
and logged nothing. Shopify exhausted its retries and **both reviewer shops
survived a redaction request by more than 24 hours** — found by querying the
production database, not from any log. Deleted by hand.

The cause was not in the handlers. Chain, verified in `node_modules`:

- `app/shopify.server.ts` sets `expiringOfflineAccessTokens: true` → the
  offline token has a ~1h TTL
- `authenticate.webhook` calls `ensureValidOfflineSession()` **before**
  returning, which POSTs to `/admin/oauth/access_token` when the token is
  within 5 minutes of expiry
- that helper re-throws only `InvalidJwtError` and a 400 whose body is
  exactly `invalid_subject_token`. **Everything else becomes
  `throw new Response(undefined, { status: 500 })`** — no body, no log

Uninstalling revokes the grant, so the refresh runs against a permission
Shopify has just destroyed. The reviewer used the admin until 14:46 and
uninstalled at 16:04: 78 minutes, token long expired. Guaranteed 500.

**Two failures of method on my side, worth keeping:**

1. The logging shipped on 13 Aug sat *one line below* `authenticate.webhook`
   and could never have caught it. I wrote a comment asserting "the reason
   must be in the logs" that was false when I wrote it.
2. I concluded it was unreproducible after testing two cases — a never-seen
   shop and a freshly seeded one. Those are precisely the two cases that
   cannot enter the failing branch: no session to refresh, and not expired.
   Two negative results felt like evidence and were not.

Fix: `app/lib/webhook-auth.server.ts` verifies the HMAC itself when the SDK
throws and proceeds without a session — none of the four mandatory webhooks
need an admin client. Forged webhooks still get 401 (verified). This also
defuses the refresh token's own **2026-09-22 expiry**, which would have
500'd every webhook until someone reopened the app.

Confirmed in the wild: `14 Aug 17:25 — OK — shop/redact — xbbf0y-vp`, a
store that had been failing since the 12th.

## The other five

| Defect | Why it mattered |
|---|---|
| `/auth/login` rendered a "Shop domain" form | Requirement 2.3.1 prohibits it outright. Most likely rejection reason. |
| Infinite redirect loop | `/auth/login` → `/?shop=X` → `/app?shop=X` → back. The recovery could never succeed: it cannot supply `embedded=1` or `host`. A guard cookie was tried first and only masked it in Chrome — a third-party cookie with no `Partitioned` attribute is dropped by Safari's ITP. Removed the redirect instead of the symptom. |
| Billing `returnUrl: "/app/billing"` | Shopify binds it to a `URL!` scalar (RFC-3986 absolute), so a bare path fails coercion and "Start 14-day trial" threw instead of redirecting. The unit test asserted the broken value. |
| Growth $79 / Plus $149 | 3-of-4 and 5-of-6 bullets marked "(coming soon)". Removed from both the code and the listing; `Public plans (1/4)`. |
| 43 hardcoded `€` | Including the first screen after install, on a USD store. The mechanism already existed on two other routes; now shared in `app/lib/currency*.ts`. |

Plus merchant-facing copy: "this is a placeholder", "run `npx shopify app
deploy` from the project root", "(Sprint 5)", links to shopify.dev developer
docs, database jargon on a nav screen, and the dashboard subtitle showing the
bare myshopify domain.

## Also fixed along the way

`railway up` had been failing silently for hours — nothing excluded `Promo/`
(851 MB of screencast footage), so the upload timed out and two deployments
sat in `INITIALIZING` while production kept serving the old release. Added
`.railwayignore`.

## Files changed

`app/lib/webhook-auth.server.ts` (new), `app/lib/currency.ts` +
`currency.server.ts` (new, extracted), `app/root.tsx`,
`app/routes/_index/route.tsx`, `app/routes/auth.login/route.tsx`
(`error.server.tsx` deleted), all four `webhooks.*`, `app.billing.tsx`,
`app._index.tsx`, `app.onboarding.tsx`, `app.qualify-customer.tsx`,
`app.customers.applications.tsx`, the four pricing routes,
`RegistrationFormList.tsx`, `band-range-table.tsx`, `billing-plans.ts`,
`billing.server.ts`, `.railwayignore`, `.dockerignore`, plus tests.

## Verification

`verify.sh` green — 155 app tests (was 149), 14 + 8 fixtures, both builds.

Production, checked live rather than assumed:

```
/healthz /  /legal/privacy  /legal/terms  /auth/login   all 200
App Bridge from Shopify's CDN                            present
"Shop domain" field                                      0
/auth/login                                              1 hop
app/uninstalled shop/redact customers/redact
  customers/data_request                                 200
forged HMAC on both redact topics                        401
```

## Open risks

1. **Nobody has ever pressed "Start 14-day trial" against real Shopify** —
   before or after the returnUrl fix. Correct per spec and asserted by a
   test, but unproven. Dev stores are never charged, so this test is free.
2. **Real B2B checkout on Piro** — outstanding since July, blocked until
   Piro is reinstalled after approval.
3. Piro is down; the client secret is unrotated. Both deliberate, both
   documented in `tasks/current.md` with their reasons.

## Next step

Wait. Shopify emails `info@adspubli.com`, 2–4 weeks. Do not touch visibility,
scopes, or the listing while a reviewer is active.
