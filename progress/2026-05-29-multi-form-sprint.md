# 2026-05-29 — Registration Form multi-form sprint (SHIPPED + DEPLOYED)

## Objective

Replicate Sami's **list → editor** structure for the Registration Form:
N forms per shop, an admin LIST where each created form appears, create
from template, and storefront embed by **shortcode**. Plus a canonical
design-system doc. Plan: `~/.claude/plans/tingly-scribbling-babbage.md`.

## Result

LIVE in production: **Fly v62** (admin) + **Shopify stockly-26**
(storefront). 4 commits on `main`, pushed:

- `49fcd45` docs(design-system) — Phase 0
- `e25ef10` feat(registration-form) — Phase 1 N-forms data model + service
- `ba6ae0c` feat(registration-form) — Phases 2+3 list→editor + shortcode
  (SHOULD-1 confirm() → Polaris Modal folded in)

## How it was built (agents)

User explicitly asked to use specialist subagents.

- **docs-curator** → Phase 0 (`docs/design-system.md`), prose only.
- **stockly-implementer** → Phase 1 (schema + service + tests), atomic,
  verify green, left uncommitted.
- **stockly-implementer** → Phases 2+3 (storefront shortcode + admin
  split + RegistrationFormList), verify green.
- **stockly-reviewer** → verdict APPROVE-WITH-NITS. Cross-shop shortcode
  isolation verified + tested (PASS). SHOULD-1 (window.confirm) fixed by
  main agent before commit. SHOULD-2 (proxy.apply validates non-default
  forms against the default) left as a tracked follow-up.

## Files changed

- `prisma/schema.prisma` — RegistrationForm: drop `shopId @unique` →
  `@@index([shopId])`; add `name` / `shortCode @unique cuid` /
  `isDefault`; Shop relation → one-to-many.
- `app/services/registrationForms.server.ts` (+ `.test.ts`) — singleton
  → collection (list / getById / createFromTemplate / update / delete /
  setStatus / resolveStorefrontForm) + back-compat getRegistrationForm /
  ensureDefault / upsert kept (target the shop's isDefault form).
- `app/routes/app.registration-form._index.tsx` (new list),
  `app/routes/app.registration-form.$id.tsx` (editor by id),
  deleted `app/routes/app.registration-form.tsx`.
- `app/components/registration-form/RegistrationFormList.tsx` (new).
- `extensions/quick-order-form/blocks/registration-form.liquid` +
  `registration-form.src.js` + recompiled `registration-form.js`.
- `app/routes/proxy.registration-form.tsx` — resolveStorefrontForm.
- `docs/design-system.md` (new).

## Deploy journal (the non-obvious part worth recording)

The `db push` release_command failed on the FIRST deploy (Fly v61):

> A unique constraint covering the columns `[shortCode]` will be added.
> Use the `--accept-data-loss` flag…

Prisma classifies *adding a UNIQUE* as potential data loss and demands
`--accept-data-loss`, even though there were **no duplicates** (1 row).
The `release_command` (`npx prisma db push --skip-generate`) has no such
flag and we did NOT want it permanent.

**Resolution without touching fly.toml or a double deploy:**
1. Pre-filled `shortCode` on the single prod row (the `@default(cuid())`
   is app-side, so `db push` can't backfill it).
2. Pre-created the UNIQUE index manually with Prisma's exact name
   `RegistrationForm_shortCode_key` — the ONLY change that required the
   flag. Everything else (drop shopId unique, add name/isDefault columns,
   SET NOT NULL) is non-data-loss and `db push` applies it without a flag.
3. Re-deployed → Fly v62 clean (db push reported in-sync for the unique,
   applied the rest).
4. Post-deploy set `isDefault=true` on the row.

Prod row now: `name='Registration form'`,
`shortCode='rfmpqd344201poil'`, `isDefault=true`, `status='draft'`.

## Open risks / follow-ups

- **status='draft'** on the only form — it was already draft before the
  sprint. Storefront resolver falls back to the default regardless, but
  flip to active in the editor when the merchant wants it served live.
- **SHOULD-2**: `proxy.apply.tsx:118` validates submissions against the
  default form definition only — spurious `[rf.validation.diverged]` log
  noise for non-default forms. Fix before the Phase 1F validator cutover
  (needs the storefront `apply` POST to send the shortcode — a contract
  change).
- **`registration-form.js` 12.9 KB** > 10 KB app-block threshold —
  non-blocking, trim in a separate pass.
- NIT: stale doc comments still name `app.registration-form.tsx` in
  `app/lib/registrationForm/types.ts:10` and
  `registrationForms.server.ts` header.

## Next step

Jonatan validates with his own eyes (see HANDOFF "Pending validation"):
admin list → create 2nd form → edit → storefront serves it by shortcode,
default still served without one.
