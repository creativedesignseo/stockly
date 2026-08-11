# 2026-08-11 — Stockly goes live on Piro + post-qualification minimums

## Objective

Get Stockly actually installed and running on Piro Jewelry (the pilot
merchant, a real store outside Adspubli's Partner org), then build the
feature the merchant has asked for repeatedly: a minimum on the first
order AND recurring minimums on every order after it.

Four things landed. Two corrected beliefs we had been carrying for weeks.

---

## Part 1 — Piro is LIVE

Sequence, all verified rather than assumed:

1. **Custom distribution selected on the new app** (`406994354177`,
   client_id `b530543e584cdc7d40a269134f7b4ad3`). Irreversible, so Jonatan
   did it. Critically, the "allow install across a Plus organization"
   checkbox was **unchecked** — with it checked, Shopify binds the link to
   *"the same Plus organization as piroaccessories.myshopify.com"*, which is
   the exact wording that failed for the old app. Unchecked, the confirmation
   reads *"only available to install on piroaccessories.myshopify.com"* —
   one concrete store, no organization ambiguity. That distinction is the
   whole fix.
2. **Railway credentials swapped** to the new app. Both values written with
   `--skip-deploys` first so no intermediate deploy ran with a new key and an
   old secret. Verified by SHA comparison that the secret matched the Piro
   app and differed from the previous one; confirmed `SCOPES` identical
   (same set, different order). Rollback path confirmed recoverable before
   firing: the old secret is exactly what `shopify app env show` returns for
   the base config.
3. **`railway redeploy --service stockly --yes`** — gated through
   `deployment-guardian`, which returned NO-GO on consent grounds until
   Jonatan authorized the specific command, then GO. Deploy log showed the
   `preDeployCommand` no-op (`The database is already in sync`) and a clean
   `remix-serve` start. `/healthz`, `/`, `/legal/privacy` all 200.
4. **Installed on Piro.** The consent screen rendered, Ana's store accepted,
   the app went `0 → 1 instalación`, and the Stockly onboarding wizard loaded
   inside Piro's admin — proving credentials, OAuth and the embedded iframe
   all work end-to-end.

**Known and accepted consequence:** one backend serves one app, so Stockly
no longer works on `desarrollo-adspubli.myshopify.com`. It manifests as an
auth *loop*, not a clean error. Expect ~48h of 401s on `/webhooks/*` and
`/proxy/*` from the old app's install retrying. `shopify app dev` still
works for development.

**Deliberately NOT done:** the onboarding wizard was left at "I'll do this
later". Its step 2 does not merely collect answers — it writes a
`wholesaleBaselinePct` (30–40%) and can create a Tier, then immediately
calls `syncTiersToFunction`. On Piro that would stack a Stockly discount on
top of the existing −65% Price List **and** native B2B discount stacking.
Do not complete that wizard on Piro until the pricing-engine decision is
made.

---

## Part 2 — Protected customer data: the blocker did not exist

We had this tracked as a pending Shopify approval since 2026-08-09, with
`customers/update` commented out of `shopify.app.piro.toml` because a
deploy had been rejected with *"This app is not approved to subscribe to
webhook topics containing protected customer data."*

Partners' **API access requests** page offers exactly five requests
(read-all-orders, subscriptions, payment mandates, post-purchase, network
access) — **no protected-customer-data request exists there at all**.

Hypothesis formed and then tested rather than assumed: for
custom-distribution apps the grant comes from **merchant consent at
install**, not a Partners review. Evidence for it: Piro's install screen
explicitly listed *"Ver datos de clientes — Datos sensibles"*.

Test: re-enable `customers/update` and deploy. **It succeeded → `stockly-3`
released.** Hypothesis holds. There was never a trámite to wait for.

---

## Part 3 — The corrected belief that matters most

We had been telling ourselves (and nearly told the merchant) that the
opening-order minimum was probably **inert** on Piro, on the theory that
native B2B checkout runs in a company-location context where
`buyerIdentity.customer.id` may be absent — in which case the Function's
`if (!customerId || !pending.includes(customerId)) return NO_ERRORS` would
silently pass every company buyer.

**That was an assumption, and it was wrong.** Checked read-only against
Piro's live Admin API: of 12 real orders, **all 12** carry a `customer`,
including the three whose `purchasingEntity` is a `PurchasingCompany`:

```
#2329 | customer: gid://shopify/Customer/8383447760975 | PurchasingCompany
#2328 | customer: gid://shopify/Customer/6562857091151 | PurchasingCompany
#2325 | customer: gid://shopify/Customer/6562857091151 | PurchasingCompany
```

Caveat kept deliberately: that is **Order** data, not cart `buyerIdentity`.
Different APIs. Strong evidence, not proof. A real B2B test checkout is
still the only definitive confirmation, and it remains pending.

Consequence: customer-id matching is sufficient today, and the FPQ gate
was never silently broken.

---

## Part 4 — Post-qualification minimums (built, not deployed)

The merchant wants: first order ≥ $300 (existed), **and** every subsequent
order ≥ $100 **and** ≥ 12 units (did not exist).

Prior state, verified before building: `postQualificationMOQ Int @default(1)`
existed in the schema, was written by the settings UI, displayed, and synced
into the discount function's config — but an exhaustive grep found it
appearing **exactly once** in either Function, as a TypeScript interface
field. Zero enforcement. A half-built feature.

Built via a 9-agent workflow against a contract fixed up front (so parallel
agents could own disjoint file sets):

- **Schema** — 3 additive columns: `postQualificationMode String @default("none")`,
  `postQualificationMinAmount Float?`, `postQualificationCombinedLogic String
  @default("and")`. `postQualificationMOQ` reused as the quantity leg.
- **Sync** — `buildOpeningOrderConfig` now emits a `postQualification` block
  and a `qualifiedCustomers` list. The existing flat FPQ keys are
  byte-identical, so the config is backward-compatible in both directions.
  `qualifiedCustomers` is a **fresh** query (`qualifiedAt: { not: null }`) —
  `discount-function-sync`'s same-named list is misnamed (`where: { shopId }`,
  no qualifiedAt filter) and was deliberately not reused.
- **Function** — shared `evaluateRule` helper used by both gates so their
  semantics can't drift; strict order (malformed → pass, pending → FPQ gate,
  qualified → post-qual gate, everything else → pass); a buyer is never
  subject to both.
- **Admin UI** — new card mirroring the FPQ card, and the `€` symbol
  de-hardcoded on the two minimums screens by reading the shop's real
  currency in the loader.
- **Storefront** — `proxy.context.tsx` exposes the new config, additively.

### What the adversarial review caught

Five reviewers ran with distinct lenses. The identity lens found a real
defect the implementation had introduced: the Function builds a candidate
set of {customer, company, location} GIDs, but the **only** producer of
those lists emits exclusively Customer GIDs — so the company candidates can
never match, and the header comment nonetheless claimed the B2B bug was
fixed. A false fix plus a comment asserting it worked.

Combined with Part 3 (customer id IS populated), the code is correct — but
the story it told about itself was not. Three corrections applied:

1. Header comment rewritten to state both verified facts: customer id is
   populated (with the evidence and its caveat), and the company candidates
   are inert defence-in-depth, not a working match.
2. `pending-company-location-no-customer-blocks.json` tested a config the
   app cannot generate — green while proving nothing. Replaced with
   `company-buyer-without-customer-id-fails-open.json`, which pins what
   would **actually** happen in production (no block, fail open). The old one
   kept, renamed `unused-capability-…` so its status is legible at a glance.
3. Latent precedence risk documented **at the site that would activate it**
   (the GID emitter in the sync), not buried in a doc: if Company/Location
   GIDs are ever emitted, identity becomes two-level and "pending wins"
   would block an already-qualified buyer because a colleague at the same
   location still owes their opening order — a legitimate sale blocked by
   design, against the fail-open golden rule.

Other reviewers: schema migration verified safe by generating the actual SQL
(3 × `ADD COLUMN`, no `--accept-data-loss` needed); the config contract
verified key-by-key between emitter and consumer; no FPQ regression.

---

## Verification

`PATH="$(pwd)/node_modules/.bin:$PATH" bash scripts/verify.sh` → green.
**137 app tests** (was 129) across 13 files; **14 opening-order fixtures**
(was 5); volume-discount still 8. Both builds pass.

The `PATH` prefix is mandatory — the globally-installed Shopify CLI hangs
downloading javy; the project-local one is already warm.

---

## Open risks / not done

- **Nothing in Part 4 is deployed or was deployed by the workflow.** It
  needs BOTH `railway up` (backend + schema columns via preDeployCommand)
  and `shopify app deploy --config=piro` (the Function), each through
  `deployment-guardian`.
- **The definitive B2B checkout test is still pending.** No fixture can
  substitute for it.
- **Currency**: fixed only on the two minimums screens. ~50 more hardcoded
  `€` sites remain in `app.volume-pricing.*`, `app.pricing.new`,
  `app.pricing.$id` and three storefront bundles. `Shop` has no currency
  column; the fix reads it per-request in the loader.
- **Piro pricing-engine decision still open** — Stockly's discount engine
  vs. the existing −65% Price List. Until decided, configure minimums only,
  never tiers or baseline.
- ADR-017 (native B2B on all plans) still reframes the product strategy and
  is unaddressed.

## Next step

Deploy decision, then the real B2B checkout test on Piro before telling Ana
the minimum is live.
