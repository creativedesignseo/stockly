# tasks/current.md — Stockly active task queue

> Single page of what's being worked on **right now**. Keep it short.
> Older completed tasks live in `progress/`. Strategic plan lives in
> `ROADMAP.md`. Operational truth lives in `HANDOFF.md`.

**Last updated:** 2026-08-22 (close-out) — **Company-first minimums LIVE and proven by a real buyer on Piro (block at $291, pass at $301, re-block at $257). The never-worked Validation bug is dead. 212 tests. App version `stockly-5`, Railway `794693d8`.**

## P0 — Close the loop on the E2E test

1. **Pay the test order** (Jonatan, company `creativedesignseo`, pay-now
   checkout is enabled for it). When it lands PAID, check Railway logs for
   `orders/paid` and confirm the company metafield
   `$app:stockly/qualified` was written — the ONE link of the
   architecture still unverified in production. Then place a second-order
   cart under the recurring minimum and confirm the RECURRING message
   (not the opening one) blocks it.
2. **Rotate the client secret** — Jonatan only, steps in the prior entry.
   Still pending since 2026-08-12.
3. **Tell Ana** — Stockly is live on Piro again; minimums now genuinely
   enforced (first time ever); decide with her: (a) bulk-enable
   `editableShippingAddress` for her 98 companies, (b) review-vs-pay-now
   flow per company, (c) her $300/$300 gate amounts.

## P1 — Productize what was done by hand today

- **B2B setup check** in Stockly: detect+fix form-created companies with
  no location address and `editableShippingAddress: false` (one click, or
  auto-fix on application approval). CRITICAL lesson for the impl:
  `companyLocationUpdate` RESETS omitted `buyerExperienceConfiguration`
  fields — always read-modify-write ALL fields.
- **Gate message with amounts**: "add $X more to reach $300" (+
  `{remaining}`/`{minimum}` placeholders in the merchant's custom copy).
- **Cart-progress theme block**: "$257 of $300" before checkout.
- Catalog price-list auto-detection when `pricingSource=stockly` (warn on
  double-discount risk).

## Known and deliberately left

- `hello@stocklygo.site` missing alias; two Netlify test submissions.
- No LLM key for graphify semantic pass (code graph current, docs stale).
- No Prisma `connection_limit`; onboarding redirects drop query string;
  legal pages Spanish-only; `syncTiersToFunction` swallows errors.
- Import screen (`/app/customers/import`) is tag-based-only by design
  now; company buyers need no import.

---

Older completed items live in `tasks/archive.md`; per-session journals in
`progress/`.
