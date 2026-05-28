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
- Task: Registration Form Phase 1 — code complete, **awaiting user deploy approval**
- HEAD on main: `99c2905` (already pushed to `origin/main`)
- Lock status: **STILL HELD** until Deploy A completes (Fly + Shopify) +
  smoke check on Piro. Codex, please continue standing by.

## Status snapshot

| Step | Status |
|---|---|
| Merge 3 worktree branches → main | ✅ Done |
| `npm install` + `npx prisma generate` | ✅ Clean |
| Integration commit | ✅ `987c35a` |
| `stockly-reviewer` pass 1 | ✅ NEEDS-CHANGES (3 CRITs + 5 SHOULDs + 2 NITs) |
| Fix commit (all blockers addressed) | ✅ `99c2905` |
| `tsc --noEmit` added to `scripts/verify.sh` | ✅ — previously hidden 23 TS errors all fixed |
| `bash scripts/verify.sh` | ✅ Green (lint + tsc + tests + ext build + Remix build) |
| Pushed to GitHub | ✅ `origin/main` at `99c2905` |
| **Deploy A approval (`fly deploy` + `npx shopify app deploy`)** | ⏸ **Awaiting user "deploy" / "envía" / "ship"** |

## Files In Flight

**Lock STILL HELD** by Claude Code until Deploy A completes. The code is
finished and pushed, but until the production deploy is in and the smoke
on Piro confirms it works, please don't edit the RF Phase 1 surface area.

The locked surface is everything touched by HEAD `99c2905`:
- `prisma/schema.prisma`
- `app/lib/registrationForm/*`
- `app/services/registrationForms.server.ts`, `applications.server.ts`, `shops.server.ts`
- `app/routes/app.registration-form.tsx`, `proxy.registration-form.tsx`, `proxy.apply.tsx`
- `app/components/registration-form/*`
- `extensions/quick-order-form/blocks/registration-form.liquid` + assets
- `scripts/verify.sh` (the tsc step is a shared infra change — touch with care)

## Tasks unlocked for Codex (safe to start NOW)

These touch zero files in flight:

1. **Fix `extensions/stockly-volume-discount/tests/` runner** —
   `ERR_MODULE_NOT_FOUND: strip-literal`. Likely a missing dev dep in the
   extension's own `package.json`. Once green, the 7 fixtures (active-
   dates-{future,past,current}, fixed-price-discount, mix-variants, multi-
   band, legacy-single-band) finally execute and confirm/refute the
   `Date.now()`-in-WASM assumption from ADR-012.
2. **Fix `no-discounts.json` strategy mismatch** — pre-existing `FIRST` vs
   code's `ALL`. Quick fix once the runner is up.
3. **ADR-011 stub** — referenced by code (`tiers.server.ts` customer + market
   eligibility) but doc doesn't exist. Plain-text retro doc, ~150 lines.

## Tasks reserved for Claude Code (do NOT take)

- **Phase 1G**: drop `WholesaleApplication` table + remove `wholesale-
  applications.server.ts` + delete dual-write branch from `proxy.apply.tsx`.
  Reserved until 48h soak after Deploy A.
- **Volume Pricing Phase 2 UI** (multi-band form editor) — planned but not
  yet sized; depends on user prioritization.
- **Email infrastructure (Phase 3)** — Resend integration for
  admin-on-submit + customer-on-approve/reject.

## Reviewer pass 1 → Fix summary

Fix commit `99c2905` addressed all 10 reviewer findings in one pass:

- **CRIT-1** (silent JSON shape divergence — would have corrupted the first
  merchant save). Foundation types declared canonical. Deleted parallel
  type file + duplicate seeds file. Migrated all 8 Admin UI components
  (FieldEditModal, FieldList, FormPreview, AppearancePanel, SettingsPanel,
  TemplatePickerModal, TypePickerModal, field-icons) plus the route. Status
  moved row-level (not inside settings), `titleEn` / `redirectUrl` /
  `paragraphBg` aligned. New fields mint `crypto.randomUUID()`.
- **CRIT-2** (loader returned `version` on type that lacked it). Fell out
  of CRIT-1.
- **CRIT-3** (`tsc --noEmit` not in `verify.sh`). Added. Cleaned up pre-
  existing TS errors in webhooks data_request, tiers.test.ts, run.ts.
- **SHOULD-1** (proxy.apply validated raw body, not responses). Now scopes
  to the form's field keys before calling `validateResponses`.
- **SHOULD-2** (`window.confirm` violates convention). Polaris `Modal` with
  destructive primary action.
- **SHOULD-3** (double `ensureDefaultRegistrationForm` call). Dropped the
  second call — `getOrCreateShop` already covers it.
- **SHOULD-4** (dual-write log noise). Structured log keys
  `[rf.dual_write.fail]` and `[rf.validation.diverged]` for grep during
  the 48h soak.
- **SHOULD-5** (60s Cache-Control window). Changed to `no-cache, private`.
  Storefront uses the `version` integer as the cache-bust hint instead.
- **NIT-1** `corsHeaders()` → `jsonHeaders()`.
- **NIT-2** ADR-013 stub written at `docs/decisions/ADR-013-registration-form-builder.md`.

Stat: 21 files changed, +374 / -731 (net negative — eliminated duplication).
Stalled-implementer notification was a false positive — the agent had
already committed before the watchdog tripped.

## Verification snapshot

```
HEAD: 99c2905 (pushed)
Commits added since b818958 (Volume Pricing deploy): ~17
npm install: ok
npx prisma generate: clean
npx tsc --noEmit: 0 errors (was 23)
bash scripts/verify.sh: ✓ all checks passed
```

## Open Questions

- **Country format on existing rows** — storefront emits ISO-2 (`ES`),
  legacy admin queue renders `{app.country}` as-is. Pre-existing rows on
  Piro may be full names ("Spain") — cosmetic mixed view until those rows
  age out or get migrated. Not a blocker for Deploy A.
- **Smoke test on Piro after Deploy A** — most important verification.
  Storefront form must render, POST must create both legacy and new rows,
  admin `/app/registration-form` must load, saving must round-trip cleanly.
