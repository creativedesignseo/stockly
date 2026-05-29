# 2026-05-29 — RF polish + SaveBar fix LIVE, and Registration-Form multi-form sprint kickoff

## Objective

Two things in one session: (1) ship requested UX fixes to production,
(2) plan + begin the big "Registration Form like Sami" sprint.

## Shipped to production today (all on `main`, deployed)

- **Fly v59 / `stockly-25`** — Registration Form polish (commit `0703f48`):
  - `FormPreview.tsx` rewritten to be a faithful WYSIWYG (same markup +
    `--rf-color-*` + scoped CSS as the storefront, applies appearance
    colors, shows the Submit button).
  - `registration-form.css` modernized (radius 8/12px, soft shadows,
    brand-color focus ring, labels no longer ALL-CAPS).
- **Fly v60** — SaveBar validation-failure fix (commit `6bb3b1f`):
  - The 4 pricing editors (`app.pricing.new/$id`, `app.volume-pricing.new/$id`)
    no longer hide the App Bridge SaveBar optimistically. Root cause of the
    user-reported "saving a Volume Pricing does nothing" — it WAS saving
    when a name was present; with an empty name the action returned json
    (no redirect), isDirty didn't change, and the manually-hidden bar never
    re-showed, so it looked saved but wasn't. Now the bar stays on failure
    and the error banner lists the actual messages ("Name is required").
- **Deploy gating** (commit `7ad8434`): `fly-deploy.yml` is now
  `workflow_dispatch` only — push to main no longer auto-deploys.
- **`docs/competitive/sami-registration-form.md` §9** — measured design
  system of Sami (reverse-engineered live via Claude browser): admin is
  pure Polaris; storefront is a "boxed-form" template. Source for the
  design-system doc in the sprint below.

## Verified

- Live repro on `desarrollo-adspubli`: creating a volume rule WITH a name
  saves and lists correctly (`#3bb41a`). The test rule `DIAG volume rule`
  was left in **draft** (harmless) — delete it from the editor when convenient.

## In flight — Registration Form multi-form sprint (APPROVED, not yet built)

Plan approved via ExitPlanMode; full detail in
`~/.claude/plans/tingly-scribbling-babbage.md`. Goal: replicate Sami's
**list → editor** structure (today Stockly goes straight to the editor;
the model is one form per shop).

Phases:
0. `docs/design-system.md` — canonical tokens + list→editor pattern (ref
   `app.pricing._index.tsx`). No risk, independent.
1. **Model N-forms** — `prisma/schema.prisma`: drop `shopId @unique`, add
   `name` / `shortCode @unique` / `isDefault` / index `[shopId]`. Service
   `registrationForms.server.ts`: singleton → collection (list / getById /
   createFromTemplate / update / delete / setStatus) + `resolveStorefrontForm`.
   **Back-compat is load-bearing**: `getRegistrationForm`, `ensureDefault`,
   `proxy.apply.tsx`, `proxy.registration-form.tsx`, `shops.server.ts` all
   consume the singleton today — rewrite `getRegistrationForm` to return the
   `isDefault` form so they keep working.
2. **Storefront shortcode (dual-serve)** — block `form_shortcode` setting →
   `src.js` adds `?shortcode=` → proxy resolves by shortcode, falls back to
   default when absent (blocks already placed keep working).
3. **Admin split** — move editor to `app.registration-form.$id.tsx`; new
   `app.registration-form._index.tsx` list (IndexTable + tabs + banner +
   "Add new" → `TemplatePickerModal` → `navigate($id)`); new
   `RegistrationFormList.tsx`.
4. Polish + verify + deploy.

### Where I stopped

Started Phase 1: edited the schema model, then **reverted it** at session
close because the schema change alone (without the service/route rewrites
in the same step) leaves `getRegistrationForm`'s `findUnique({shopId})` —
and the build — broken. Re-apply the schema edit from the plan (§Fase 1)
and land the service + consumer rewrites in the SAME commit so verify stays
green. Nothing partial is committed; `main` is clean at `68f593b`.

## Next step

Resume Phase 1 as an atomic change: schema + `registrationForms.server.ts`
+ the 5 consumers + `prisma db push` (additive: dropping a unique + adding
defaulted columns is safe) + verify, then Phase 3 (list) so the user can
finally SEE the list → editor flow, then deploy.
