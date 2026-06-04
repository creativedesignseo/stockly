# 2026-06-04 — Camino B Fase 3: prod-state verification + doc realignment + E2E setup (reverted)

## Objective

Jonatan suspected the opening-order checkout gate (Camino B Fase 3) was
ALREADY working, contradicting the HANDOFF which said "still needs fpqMode
set + Save before it gates". Goal: stop trusting the docs, verify the real
state against code + production, correct the docs, then attempt the E2E
checkout-block test.

## Files inspected (no code changed)

- `app/services/opening-order-sync.server.ts` — the Validation sync.
- `app/routes/app.customers.applications.tsx` (`:229` release, `:475`
  approve) and `app/routes/app.settings.pricing.tsx` (`:165`) — the three
  call sites of `syncOpeningOrderValidation`.
- `extensions/stockly-opening-order/src/cart_validations_generate_run.ts`
  + its `.graphql` input — the Validation Function itself.
- `prisma/schema.prisma` — Shop FPQ fields, Session, Application,
  WholesaleCustomer.

## Findings (verified, not assumed)

1. **Fase 3 code is complete and correct.** Nothing left to build.
2. **Mechanism correction:** the Validation is (re)created/refreshed by
   `syncOpeningOrderValidation` on ANY of approve / release / settings-save
   — NOT only the settings Save, as the HANDOFF claimed. That note was an
   unverified guess.
3. **Prod is fully CONFIGURED** (read-only `fly ssh` Prisma query on
   `desarrollo-adspubli.myshopify.com`): `fpqMode='amount'`,
   `fpqAmount=200`, `wholesaleBaselinePct=60`, `onboarded=true`. The
   offline Session scope includes `write_validations`. So the "set fpqMode
   + save" pre-condition the HANDOFF listed was ALREADY done — the HANDOFF
   was simply stale. Jonatan's intuition was right.
4. **But nothing blocks at checkout today:** `pendingOpeningOrder = 0` of 3
   wholesale customers. All 3 (adspublioficial, creativedesignseo,
   globalnetworkprime) already have `qualifiedAt != null` (qualified), so
   the Validation's pending list is empty. The gate only bites a customer
   approved AFTER the Camino B change who hasn't placed their opening order.
5. **The threshold is measured on `cart.cost.subtotalAmount`** = the
   subtotal AFTER the wholesale discount (what they actually pay), per
   ADR-016 and the function (line 71). With baseline 60%, paid subtotal =
   retail × 0.40, so blocking requires retail < ~€500 and passing requires
   retail ≥ ~€500.
6. **Cannot query Shopify cold:** the offline Session token in the DB is
   `shpca_…` but expired (`expires` 2026-06-03T18:56Z) — Stockly uses token
   exchange (managed install), so the stored token is ephemeral and only
   refreshed inside an app request. A Shopify Admin GraphQL call from
   `fly ssh` returned "Invalid API key or access token". Consequence: the
   existence/active-state of the `stockly-opening-order` Validation object
   in Shopify is STILL UNVERIFIED — confirmable only via a fresh-token call
   from within the running app.
7. **Side finding — duplicate pending applications:** `globalnetworkprime`
   and `creativedesignseo` appear as `pending` Applications yet are already
   qualified WholesaleCustomers. Stale duplicates worth cleaning up later
   (not addressed here).

## Actions taken

- **Docs corrected (the real work):**
  - `HANDOFF.md` — fixed the self-contradiction (header said "NOT DEPLOYED"
    while the body said "DEPLOYED"); rewrote the gate note with the
    verified prod state + the mechanism correction.
  - `tasks/current.md` — same correction on the Fase 3 entry.
  - Memory `feedback-cierre-means-save-and-align` — added **step 0: verify
    against reality (code + read-only prod) BEFORE writing docs**. This was
    the root cause of the drift.
- **E2E attempt (set up, then reverted):** to test the block I de-qualified
  the test customer `creativedesignseo` (GID `10103069901128`) →
  `qualifiedAt=null` (pending=1) as the guinea pig. Jonatan did not complete
  the storefront steps, so at closure I **restored** `qualifiedAt` to its
  exact original value `2026-06-01T20:55:34.365Z` (pending back to 0). Net
  prod data change = zero.

## Verification

- Read-only queries throughout; the only write (de-qualify) was reverted to
  the original value. Final prod state: test customer qualified, pending=0
  — identical to session start.
- `git`: only `HANDOFF.md` + `tasks/current.md` modified (+ this progress
  entry). No code touched, so no `verify.sh` / deploy needed.

## Open / next steps

- **E2E checkout-block test NOT done.** To resume (one merchant + one CLI
  step):
  1. De-qualify the guinea pig:
     ```bash
     fly ssh console -a stockly-lustrous-forest-4364 -C \
       "node -e \"const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.wholesaleCustomer.updateMany({where:{shopifyCustomerId:'10103069901128'},data:{qualifiedAt:null}}).then(()=>process.exit(0))\""
     ```
  2. In the app: Wholesale Pricing → Edit pricing settings → **Save** (fires
     the sync with a fresh token → creates the Validation + adds the GID to
     the pending list).
  3. Storefront as `creativedesignseo`: cart with **paid subtotal < €200**
     (retail < ~€500) → checkout must block; **≥ €200** → passes.
  4. App → **Release from opening order** → checkout free again AND restores
     the account.
- **Verify the `stockly-opening-order` Validation object** exists+active in
  Shopify (needs a fresh-token GraphQL `validations` call from the app).
- **Clean up duplicate pending Applications** (globalnetworkprime,
  creativedesignseo) that are already qualified.
