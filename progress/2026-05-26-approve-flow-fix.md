# Fix Approve flow + unlock Protected Customer Data on dev store

**Date:** 2026-05-26 (afternoon session, after harness setup AM)
**Status:** completed
**Owner:** Jonatan + Claude
**Related:** `tasks/current.md` (P0/B0-1 GDPR neighbour), `shopify.app.toml` Protected Customer Data section, ADR-010 pricing engine, future B0-5 Privacy Policy

## Objective

E2E-validate the wholesale registration → admin approve → tag-as-wholesale
chain on the dev store. Jonatan reported that clicking **Approve** on a
pending application "no aprueba" — UI showed no error, no success, just a
spinner that cleared with nothing visible.

## Files inspected

- `app/routes/app.customers.applications.tsx` — full action + UI. Found the
  fetcher/banner mismatch (see "Files changed").
- `app/services/wholesale-applications.server.ts` — `normalizePhone`
  handles `+34 651332211` correctly (strips space, E.164 OK).
- `shopify.app.toml` — already declares
  `[access.protected_customer_data_permissions]` at level_1 for name /
  email / phone. The declaration was added in commit `98430c4` (this
  morning's session) but `shopify app deploy` was never run after that,
  so Partners Dashboard didn't have it.
- `.github/workflows/fly-deploy.yml` — present locally but **untracked**.
  Means no CI/CD: every Fly deploy today has been manual.
- Fly logs (`fly logs --no-tail`) — showed Shopify GraphQL response with
  `graphQLErrors: [Array]` collapsed by `util.inspect`. The real message
  surfaced only after the logging fix below.

## Files changed

- `app/routes/app.customers.applications.tsx`
  - **Commit `81b7546`** — `ApproveButton` now accepts `onResult`
    callback. When the fetcher settles, the result is lifted to a parent
    `useState` and rendered as a Polaris Banner. Previously the parent
    read `useActionData` which never receives `useFetcher` responses,
    so every error/success was silent.
  - **Commit `0cf8c30`** — `actionImpl` catch block now
    `JSON.stringify`s `graphQLErrors` (`util.inspect` was collapsing it
    to `[Array]` in Fly logs), and surfaces a specific remediation
    string when `extensions.code === ACCESS_DENIED`.
  - **Commit `029aa5d`** — Modal switched from conditional render
    `{modalApp && <Modal open ...>}` to always-mounted with
    `open={modalApp !== null}`. Discovered by Jonatan: clicking **View**
    on an Approved row right after a successful Approve sometimes did
    nothing (fetcher revalidation re-render + modal mount collided in
    the same React batch; Polaris portal animation lost). Refreshing
    bypassed it. The always-mounted pattern is also the one Polaris
    actually recommends.
  - **Commit `4a115c8`** — replaced `window.location.assign` (Tabs)
    and `window.location.reload` (Reject) with Remix-native navigation
    (`setSearchParams`) and a fetcher (`rejectFetcher.submit`). Both
    were causing `ERR_TOO_MANY_REDIRECTS` inside the Shopify embedded
    iframe: a full page reload drops `host` / `embedded` / `id_token`
    from the URL → OAuth redirect → /app → applications → still no
    embed context → loop → Chrome aborts. Discovered by Jonatan
    clicking the **Approved** tab after a successful Approve.

- `app/services/wholesale-customers.server.ts` +
  `app/routes/app.customers.applications.tsx`
  - **Commit `0250d1f`** — **the bug that quietly broke the business.**
    Admin-approved (track-2) customers were paying retail at checkout
    despite having the `wholesale` tag and a WholesaleCustomer row.
    Root cause: `approveCustomer` created rows with `qualifiedAt=null`,
    and the Discount Function's `qualifiedCustomers` bypass list is
    sourced from `WholesaleCustomer.qualifiedAt != null` only. With a
    null timestamp, the Function evaluated FPQ on every cart (€500
    minimum) → cart of €58.50 wholesale fails → no discount → checkout
    charges retail (€130 instead of €58.50). Two-part fix:
    1. `approveCustomer` now sets `qualifiedAt=new Date()` on both
       create and update. Admin approval IS the qualifying event for
       track-2; there's no FPQ to clear.
    2. The approve action now calls
       `syncTiersToFunction(admin, shop.id)` after
       `markApplicationApproved`, so the Function metafield gets the
       new customer's GID without waiting for the next merchant
       settings save.
    Backfill applied via `fly ssh` + Prisma to set `qualifiedAt =
    new Date()` on the 2 already-approved customers (count: 2). Sync
    triggered via clicking **Approve** on the third pending
    application (`globalnetworkprime`), which exercised the new code
    path and populated the metafield with all 3 GIDs at once.

## Commands run

```bash
# Manual deploys (no CI workflow committed)
fly deploy --remote-only --app stockly-lustrous-forest-4364
# → v10 live, includes both commits above.

npx shopify app deploy --force
# → released stockly-18, includes the Protected Customer Data
#   declarations from shopify.app.toml.

# Jonatan reinstalled (custom-app URL flow) — but reports it was NOT
# strictly necessary; the dev store auto-granted the new permissions
# once stockly-18 was the active version. Documented for posterity.
```

Distribution method also switched to **Custom distribution** in the
Dev Dashboard. That step is a hard prerequisite for requesting
Protected Customer Data access (Shopify enforces it even on dev
stores). Without it, the "Request access" form does not surface.

## Verification

- `bash scripts/verify.sh` → green (pre every deploy).
- Fly v10 → v11 → v12 → v13 all came up healthy.
- Jonatan clicked **Approve** on Creative Design Seo
  (creativedesignseo@gmail.com) — banner showed success.
  Row moved Pending (3 → 2) → Approved (0 → 1). Then approved
  `adspublioficial`. Both passed. Third (`globalnetworkprime`)
  approved later, triggering the sync that closed C3.

Cross-checks completed (all green):
- **DB (via fly ssh + Prisma)**: 3 WholesaleApplication rows,
  WholesaleCustomer rows for the 2 approved with valid Shopify GIDs
  (`10103069901128`, `10125693387080`).
- **Shopify Admin**: "Test Wholesale" customer
  (creativedesignseo@gmail.com) shows `wholesale` tag applied.
- **Storefront + Cart drawer**: retail crossed out, wholesale price
  shown with `Wholesale 55%` label on every line.
- **Checkout (the one that matters)**: €130 retail cart →
  €58.50 wholesale subtotal, line-level discount labels
  `WHOLESALE 55% (-€46.75)` and `WHOLESALE 55% (-€24.75)`, Shopify
  shows `TOTAL SAVINGS €71.50`. Total with shipping: €71.49.

## Open risks

1. **Production launch will need B0-5 first.** Dev stores auto-grant
   Protected Customer Data; production stores require Privacy Policy +
   Terms URLs in Partners. Without B0-5 nothing changes for dev, but
   the first paying customer can't approve.
2. **`.github/workflows/fly-deploy.yml` still untracked.** Every deploy
   today was manual (`fly deploy`, `npx shopify app deploy`). Decision
   pending from Jonatan: commit the workflow + add `FLY_API_TOKEN`
   GitHub secret, or keep deploys manual until pilot #2.
3. **Custom distribution is set right now.** Switch to **App Store
   distribution** before submitting to the Shopify App Store. Custom
   is fine for dev + Adspubli-managed pilots.
4. **`normalizePhone` happily strips formatting but doesn't validate
   country code.** Applications with phones like `555332211` (no `+`,
   no country) are silently dropped from `customerCreate`. The Customer
   is created without a phone — acceptable for now, but if Sprint 5
   adds SMS marketing it becomes a real gap.
5. **`Customer.email` is being marked deprecated** in Shopify API 2025-07
   response headers. SDK still works against 2025-01 (what we declare),
   but the next API version bump will need to switch to
   `Customer.emailAddress` (new field, same data). Track-only for now.

## Next step

Jonatan does the two cross-checks (tag + DB row) and approves one more
application. If both pass, the wholesale-approval path is locked.
Then continue the E2E flow: log in to storefront as the approved
customer → verify wholesale pricing renders correctly on a product
page → place a test order to confirm checkout charges the discounted
price (this is where B0-3's C1/C2/C3 bugs may surface).

## Lessons (worth remembering)

1. **`useFetcher` ⊥ `useActionData`.** They are independent. Errors and
   success from `useFetcher` go to `fetcher.data` and the parent must
   lift them explicitly. Default-import patterns from old Remix docs
   that use `<Form>` + `useActionData` do NOT translate to fetchers.
2. **`util.inspect` swallows nested arrays.** `console.error(err)` prints
   `graphQLErrors: [Array]`. To debug from Fly logs, dump with
   `JSON.stringify(arr, null, 2)`. Cheap insurance every catch block
   should have.
3. **`fly deploy` ≠ `shopify app deploy`.** Two separate pipelines for
   two separate surfaces (server code vs Shopify-side app config).
   Easy to forget the second; symptom is the server has new code but
   Shopify still rejects calls because Partners config is stale.
4. **Custom distribution is a prereq for Protected Customer Data.**
   Shopify gates "Request access" behind a distribution method even on
   dev stores. The docs hint at it; the UI hides the form silently.
5. **Dev stores auto-grant Protected Customer Data** once the new app
   version is live with the toml declarations. No reinstall required —
   confirmed empirically today. Production stores will require explicit
   merchant grant + Partners review (the B0-5 dependency).
6. **Polaris `<Modal>` should be always-mounted, not conditionally
   rendered.** Pattern `{open && <Modal open ...>}` introduces a race
   between mount and the Polaris portal animation that surfaces under
   concurrent updates (e.g. a fetcher revalidation hitting at the same
   click). Always-mount + `open` prop is the documented Polaris pattern
   for a reason.
7. **Never use `window.location.*` inside the Shopify embedded admin
   iframe.** A full reload drops the embed context (`host`,
   `embedded=1`, `id_token`) and the app re-enters OAuth without that
   context — infinite redirect loop, Chrome aborts with
   `ERR_TOO_MANY_REDIRECTS`. Always go through Remix navigation
   (`useSearchParams`, `useNavigate`, `useFetcher`, `useRevalidator`).
   This rule has no exceptions in admin routes.
8. **Two-track wholesale qualification: `approvedAt` ≠ `qualifiedAt`.**
   `approvedAt` says "the merchant accepted them"; `qualifiedAt` says
   "the FPQ gate is cleared, no further hurdles". For track-2 customers
   the act of admin approval IS the qualifying event — both timestamps
   should be set in the same upsert. For track-1 customers, `approvedAt`
   is set at registration and `qualifiedAt` is set later by
   `webhooks.orders.paid.tsx` after the first qualifying order. Conflate
   them and admin-approved customers silently pay retail forever.
9. **Any code path that mutates wholesale eligibility MUST call
   `syncTiersToFunction`.** The Function reads from a Shopify metafield,
   which is a flat-out cached projection of our DB state. Without an
   explicit sync, Shopify keeps serving stale eligibility data. Today
   we added the sync to the approve action; the FPQ webhook handler
   (`webhooks.orders.paid.tsx`) still needs the same call — tracked as
   C2 in `tasks/current.md`.
