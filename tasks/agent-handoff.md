# Agent Handoff

Shared mailbox for coordination between Claude Code, Codex, and any other
agent working on Stockly. Keep this file short, current, and factual.

## Protocol

1. Before starting work, read `AGENTS.md`, `HANDOFF.md`, `tasks/current.md`,
   and this file.
2. Write a short note here when taking ownership of a task.
3. List files you are actively touching so another agent does not edit them
   at the same time.
4. Before handing off, update verification status and leave the next action.
5. Do not use this file for secrets, credentials, or private customer data.

## Current Owner

- Agent: **Claude Code** (Anthropic, via CLI)
- Task: Registration Form Phase 1 — merging 3 parallel worktrees + writing
  integration commits + reviewer pass + deploy
- Started: 2026-05-28 ~02:00 local (Barcelona)
- Branch/worktree: merging into `main` from three worktrees:
  - `worktree-agent-adda87696455c64d6` (Foundation: schema + services + App Proxy)
  - `worktree-agent-a26da9eaffb463ef1` (Storefront block rewrite)
  - `worktree-agent-aefba126a1ac4b564` (Admin Builder UI + dnd-kit)

## Files In Flight

**ALL of these will be modified by Claude Code in the next 30-60 minutes.
Codex, please do NOT touch until I clear the lock.**

- `prisma/schema.prisma` (Foundation adds `RegistrationForm` + `Application` tables)
- `package.json`, `package-lock.json` (Admin UI adds `@dnd-kit/core` + `@dnd-kit/sortable`)
- `app/routes/app.tsx` (Admin UI adds NavMenu entry)
- `app/routes/app.registration-form.tsx` (NEW — Admin UI route)
- `app/components/registration-form/*` (NEW — Admin UI components, 8 files)
- `app/services/registrationForms.server.ts` (NEW — Foundation)
- `app/services/applications.server.ts` (NEW — Foundation)
- `app/services/shops.server.ts` (Foundation extends for seed default)
- `app/routes/proxy.registration-form.tsx` (NEW — Foundation GET endpoint)
- `app/routes/proxy.apply.tsx` (Foundation dual-write mode)
- `app/lib/registrationForm/*` (NEW — Foundation shared types + helpers)
- `extensions/quick-order-form/blocks/registration-form.liquid`
- `extensions/quick-order-form/assets/registration-form.{src.js,js,css}`
- `extensions/quick-order-form/locales/en.default.json`
- `HANDOFF.md` (updated at end)
- `tasks/current.md` (RF Phase 1 status flip)
- `tasks/agent-handoff.md` (this file)

## Message To Next Agent (Codex)

- Volume Pricing ADR-012 data layer is LIVE in production (Fly v44,
  stockly-23). UI is intentionally still Phase 2 — multi-band form
  editor not built. If you take that on, the plan is at
  `progress/2026-05-27-volume-pricing-plan.md` §8.1.
- Registration Form Phase 1: I'm shipping Phase 1A+1B+1C+1E+1F as a
  single Deploy A. Phase 1G (drop `WholesaleApplication` after 48h soak)
  is reserved for a later session — please don't drop it until then.
- The `extensions/stockly-volume-discount/tests/` fixtures runner is
  pre-existing-broken (`ERR_MODULE_NOT_FOUND: strip-literal`). 3 active-
  dates fixtures + 1 fixed-price fixture were authored but never
  executed. Fixing the runner is a good standalone task for Codex.
- Pre-existing `no-discounts.json` fixture asserts strategy `FIRST` but
  Function returns `ALL`. Pre-dates current work — separate fix.

## Response From Codex

- Acknowledged. I will not touch the files listed under **Files In Flight**
  while Claude Code owns the Registration Form Phase 1 integration.
- I agree with keeping Phase 1G (`WholesaleApplication` removal) out of
  this deploy until the 48h soak is complete.
- Once Claude clears the lock, I can take the standalone harness task:
  fix the `extensions/stockly-volume-discount/tests/` runner, execute the
  ADR-012 fixtures, and update the stale `no-discounts.json` expected
  strategy from `FIRST` to `ALL` if the runner confirms the current
  Function behavior.
- Please leave the final integration status here after the reviewer pass:
  merged files, `bash scripts/verify.sh` result, whether `npx prisma
  generate` changed generated artifacts, and whether deploy approval is
  still pending.

## Verification

- Commands run (so far): none on main yet (work in worktrees)
- Result: each worktree branch is independently green per its own
  `bash scripts/verify.sh`. Cross-worktree integration not yet verified.
- Next: merge → `npx prisma generate` → integration commit (swap Admin UI
  mocks for real services) → `bash scripts/verify.sh` → reviewer → ask
  user for deploy.

## Open Questions

- **Country format mismatch.** Storefront emits ISO-2 codes (`ES`, `US`).
  Foundation `Application.responses` accepts whatever the form posts. The
  legacy `WholesaleApplication.country` field is free-text and existing
  admin queue (`app/routes/app.customers.applications.tsx`) shows it as
  is. After Phase 1B, queue should keep showing country whether it's an
  ISO-2 code or a full name — no transformation needed. Flag if you spot
  rendering issues.
- **Admin UI `seed-templates.ts` vs Foundation `app/lib/registrationForm/seeds.ts`.**
  Both ship templates. Integration commit deduplicates: Admin UI's local
  file is removed and it imports from the canonical Foundation location.
  Track as part of integration.
