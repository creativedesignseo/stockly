# Set up minimal Claude Code harness for Stockly

**Date:** 2026-05-26
**Status:** completed
**Owner:** Jonatan + Claude
**Related:** AGENTS.md, CLAUDE.md, HANDOFF.md, scripts/verify.sh

## Objective

Stand up a minimal, portable engineering harness so future Claude Code
sessions (and any other agent tool) start with the right context, write
verifiable changes, and journal multi-step work consistently. No app
logic touched.

## Files inspected

- `README.md` — found stale: claims Pre-MVP / Supabase / Vercel
- `HANDOFF.md` — current and accurate; designated as source of truth
- `CLAUDE.md` — bloated (~215 lines) and missing `@AGENTS.md` import
- `PROJECT.md` — strategic plan, no contradiction with current stack
  after the ADR-010 update
- `ROADMAP.md` — Sprint 0 listed as pending; in reality Sprints 0-4
  are done
- `package.json` — confirmed scripts: `lint`, `test`, `build`,
  `build:extensions` all exist (verify.sh can call them)
- `fly.toml` — production config; not modified
- `shopify.app.toml` — production app config; not modified
- `prisma/schema.prisma` — comment still references "Vercel Postgres"
  (left for a separate sweep)
- `docs/decisions/` — 10 ADRs present including the new ADR-010 from
  the previous session

## Files changed

Created:
- `AGENTS.md` — portable harness contract (<200 lines)
- `scripts/verify.sh` — strict bash verification runner (lint, test,
  build:extensions, build); does NOT deploy
- `tasks/current.md` — P0/P1 queue distilled from the multi-agent audit
- `progress/README.md` — journal conventions + template
- `progress/2026-05-26-harness-setup.md` — this file
- `.claude/agents/stockly-orchestrator.md`
- `.claude/agents/stockly-implementer.md`
- `.claude/agents/stockly-reviewer.md`
- `.claude/agents/shopify-b2b-specialist.md`
- `.claude/agents/deployment-guardian.md`
- `.claude/agents/docs-curator.md`
- `.claude/skills/stockly-session-start/SKILL.md`
- `.claude/skills/stockly-verify/SKILL.md`
- `.claude/skills/stockly-docs-sync/SKILL.md`
- `.claude/skills/stockly-deploy-check/SKILL.md`

Modified:
- `CLAUDE.md` — trimmed to Claude Code-specific instructions and
  imports `AGENTS.md` via `@AGENTS.md`
- `README.md` — stack and status corrected to reflect Fly.io / Fly
  Managed Postgres / live production; points at HANDOFF.md
- `ROADMAP.md` — Sprints 0-4 marked historical with a banner; Sprint 5+
  retained as the active plan

## Commands run

```bash
chmod +x scripts/verify.sh
bash scripts/verify.sh   # run at the end of phase 2
```

No deploys, no DB writes, no Fly commands, no Shopify CLI calls.

## Verification

See the "FASE 3" section in the session transcript for the full output
of `bash scripts/verify.sh`.

## Open risks

- `verify.sh` runs `npm run build` which compiles the whole Remix app;
  on a clean machine this depends on `node_modules` being installed.
  Script warns explicitly if `node_modules/` is missing.
- The 6 subagents under `.claude/agents/` are project-scoped. Other
  agent tools that don't read that directory will fall back to
  `AGENTS.md` content — which is the intended portability path.
- `prisma/schema.prisma` still has a comment referencing "Vercel
  Postgres". Left untouched in this commit to keep the harness commit
  focused on harness scaffolding; tracked as a small docs sweep.

## Next step

User picks the next P0 from `tasks/current.md`. Recommended first hit:
**B0-4 (rotate `DATABASE_URL`)** — 30 minutes, lowest risk, no
dependencies.
