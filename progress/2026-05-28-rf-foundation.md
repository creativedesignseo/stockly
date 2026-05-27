# Registration Form Builder — Phase 1A + 1B + 1C foundation

**Date:** 2026-05-28 (started)
**Status:** completed (scope = 1A+1B+1C only; 1D/E/F/G follow)
**Owner:** Claude (stockly-implementer subagent), branch
`worktree-agent-adda87696455c64d6`
**Related:** ADR-013 (to be authored), plan
`progress/2026-05-27-registration-form-plan.md`,
contract `progress/2026-05-28-app-proxy-contract.md`

## Objective

Land the additive backend foundation for the Sami-style Registration
Form Builder: schema + service layer + storefront App Proxy contract.
Storefront block rewrite, admin UI, back-fill script, and legacy table
drop are EXCLUDED — they ship in parallel workstreams (storefront +
admin agents) and a later session.

Strict back-compat invariant: the existing storefront block must keep
POSTing the same snake_case body and continue receiving 201. The seed
default mirrors the legacy 8-field form 1:1.

## Files inspected

- `progress/2026-05-27-registration-form-plan.md` — pre-approved
  decisions 1–14 and step-by-step execution order.
- `progress/2026-05-28-app-proxy-contract.md` — App Proxy contract
  authored by the storefront-block sister agent (URL, HMAC, JSON
  shape, caching).
- `prisma/schema.prisma` — current Shop/Tier/WholesaleApplication
  shape; identified Shop relations to add.
- `app/services/shops.server.ts` — `getOrCreateShop` upsert path to
  extend with `ensureDefaultRegistrationForm`.
- `app/services/wholesale-applications.server.ts` — out of scope
  (legacy, soak-window coexistence); used as a behavior reference for
  coalesce semantics in the new service.
- `app/routes/proxy.apply.tsx` — existing POST handler; legacy
  validator/writer stays authoritative during dual-write soak.
- `app/routes/proxy.context.tsx` — copied the resource-route +
  HMAC + cache-header patterns.
- `docs/competitive/sami-registration-form.md` — confirmed the 3
  templates + field types.

## Files changed

Phase 1A — schema:
- `prisma/schema.prisma` — added `RegistrationForm` (singleton per
  shop, Json definition/appearance/settings + version) and
  `Application` (responses Json + denormalized email + indexes).
  Two new relations on `Shop`. Legacy `WholesaleApplication` left
  untouched.

Phase 1B — service layer:
- `app/lib/registrationForm/types.ts` (NEW) — shared TS types for the
  storefront, proxy, admin, and validator (`FormField`, `FormStep`,
  `RegistrationFormDefinition`, `FormAppearance`, `FormSettings`,
  `RegistrationFormPayload`, `SeedTemplateId`).
- `app/lib/registrationForm/seeds.ts` (NEW) — `DEFAULT_FORM_DEFINITION`
  (back-compat 9-field, snake_case keys), `DEFAULT_APPEARANCE`,
  `DEFAULT_SETTINGS`, and `TEMPLATES` (Standard / Modern / Samita-B2B)
  + `TEMPLATE_META` for the admin picker.
- `app/lib/registrationForm/validate.ts` (NEW) — schema-driven
  `validateResponses(definition, responses, messages)`. Tolerance rule:
  unknown response keys are stored, not errored.
- `app/services/registrationForms.server.ts` (NEW) — `getRegistrationForm`,
  `ensureDefaultRegistrationForm` (idempotent), `upsertRegistrationForm`
  (bumps version), parse helpers.
- `app/services/applications.server.ts` (NEW) — generic CRUD over the
  new Application table. Coalesces same-shop+email pending rows.
- `app/services/shops.server.ts` — `getOrCreateShop` now calls
  `ensureDefaultRegistrationForm` after upsert, idempotent.

Tests:
- `app/lib/registrationForm/validate.test.ts` (NEW) — 8 tests.
- `app/lib/registrationForm/seeds.test.ts` (NEW) — 9 tests, with a
  snapshot guardrail on `TEMPLATES`.
- `app/services/registrationForms.server.test.ts` (NEW) — 5 tests
  (idempotency, version increment, partial patch merge).
- `app/services/applications.server.test.ts` (NEW) — 3 tests
  including the back-compat smoke (legacy snake_case payload →
  pending row with denormalized lowercase email and responses Json
  preserved verbatim).

Phase 1C — App Proxy:
- `app/routes/proxy.registration-form.tsx` (NEW) — `GET
  /apps/stockly/registration-form`. HMAC-verified. Returns the
  documented `RegistrationFormPayload` shape. Lazy-seeds the
  back-compat default on demand.
- `app/routes/proxy.apply.tsx` — dual-write: legacy validator +
  WholesaleApplication write stays authoritative; new
  `validateResponses` runs in shadow mode and logs divergence;
  on success the new generic `submitApplication` mirrors the row
  into the Application table, non-blocking.

## Commands run

```
npx prisma generate
npm run test --silent          # 6 files, 72 tests passing
bash scripts/verify.sh         # green at each commit boundary
git commit -m "feat(rf): add RegistrationForm + Application Prisma models (Phase 1A)"
git commit -m "feat(rf): service layer + types + seeds (Phase 1B)"
git commit -m "feat(rf): App Proxy GET endpoint + dual-write POST (Phase 1C)"
```

`prisma db push` was intentionally NOT run — local dev DB unchanged.
The orchestrator gates schema migration in Phase 1D.

## Verification

- `bash scripts/verify.sh` green after each of the 3 commits.
- 72 tests pass (was 50 before this session; +22 new).
- Snapshot test covers the full `TEMPLATES` JSON — drift fails the
  build.
- Legacy POST smoke encoded as a unit test, not an end-to-end curl
  (Vitest doesn't boot Remix). The contract holds because (a) the
  legacy validator/writer path is untouched, (b) the new write feeds
  off the same body Map already in scope, and (c) the seed default's
  field keys match the legacy `validateApplication` shape verbatim.

## Open risks

- Schema deltas have NOT been pushed to any DB. Whoever runs the
  next session (or the deployment-guardian for prod) must
  `npx prisma db push` locally before Remix loaders touch the new
  tables, otherwise `proxy.registration-form.tsx` will throw on the
  first request. Recommend wiring this into local dev bootstrap.
- The shadow-mode schema validator will start logging warnings if
  a merchant ever ends up with a definition that disagrees with the
  legacy validator (e.g. removed a "required" field). That's the
  intended early-warning signal — make sure log volume is monitored
  during soak.
- `submitApplication` (new service) deliberately does NOT call
  `validateResponses` internally — callers must validate first. The
  proxy.apply handler honors this, but any future caller must too.
- ADR-013 file not authored in this session (out of scope —
  orchestrator owns docs in Phase 1G).

## Next step

Hand back to the orchestrator for diff review + integration test
plan. The orchestrator should:

1. Review the dual-write logic in `proxy.apply.tsx` and confirm the
   "non-blocking mirror" stance matches their intent.
2. Plan an integration test (manual curl or Playwright) hitting
   `POST /apps/stockly/apply` with the legacy snake_case body and
   asserting BOTH `wholesaleApplication.count` and `application.count`
   incremented by 1.
3. Coordinate with the storefront agent: the GET payload shape is
   pinned at `{ ok, definition, appearance, settings, version }` —
   confirm their consumer matches.
4. When ready, gate Phase 1D (`prisma db push` against prod +
   back-fill script) via `deployment-guardian`.
