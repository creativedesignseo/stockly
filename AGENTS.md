# AGENTS.md — Stockly project harness

Portable instructions for any agent (Claude Code, Cursor, other) working on
this repository. If your tool reads `CLAUDE.md` it imports this file. If your
tool only reads `AGENTS.md`, this file alone is enough to work safely.

---

## What is Stockly?

A Shopify App that delivers enterprise-grade B2B wholesale features
(volume tiers, branded storefront, custom pricing) on Shopify Basic/Grow
plans — features normally locked to Shopify Plus B2B at $2,300/mo.

Owner: Jonatan Montilla (Adspubli, Barcelona). Solo founder.

Core differentiator: a Shopify Discount Function (WASM) under
`extensions/stockly-volume-discount/` is the pricing engine. See
`docs/decisions/ADR-010-b2b-pricing-engine-on-basic-plan.md`.

---

## Sources of truth (in this order)

When two documents disagree, **HANDOFF.md wins**. If HANDOFF.md is silent,
fall back to the next item.

1. **`HANDOFF.md`** — current operational state, last commit, what works
   today in production. Read first on every fresh session.
2. **`docs/decisions/ADR-NNN-*.md`** — architectural decisions. Do not
   relitigate without a new ADR.
3. **`tasks/current.md`** — what is being worked on right now, P0/P1
   queue, blockers.
4. **`progress/YYYY-MM-DD-*.md`** — what was done in past multi-step
   sessions.
5. **`CLAUDE.md`** — Claude Code-specific instructions (loads this file).
6. **`PROJECT.md` / `ROADMAP.md` / `README.md`** — strategic context.
   These may lag the production reality; trust HANDOFF.md on conflict.

---

## Read on session start

1. `HANDOFF.md` — current state
2. `tasks/current.md` — active tasks
3. `git log --oneline -10` — recent context
4. Newest file under `progress/` if a multi-step task is in flight

If those four are clear, ask the user what to work on. Do not start
inventing tasks.

---

## Do not touch without explicit permission

- `.env*` files — secrets
- `prisma/migrations/` — Prisma migration history (production uses
  `prisma db push` for now; switching to versioned migrations is a
  tracked task, not an ad-hoc edit)
- `fly.toml` — production infra config; small comment edits are fine,
  config changes need a heads-up
- `shopify.app.toml` — Shopify app config; an accidental edit + deploy
  can break OAuth on installed shops
- Anything under `extensions/stockly-volume-discount/` related to
  pricing logic — this is the revenue path; touch only with tests

---

## Do not run without explicit permission

- `fly deploy` (any variant)
- `npx shopify app deploy`
- `prisma db push` against production
- `git push --force`
- Any command that prints or transmits the contents of `.env*`

If the user asks for a deploy, repeat the command back to them and wait
for explicit "deploy" / "envía" / "ship" before executing.

---

## How to verify a change

Run `bash scripts/verify.sh` from the repo root. The script runs lint,
tests, both extensions' vitest suites (`test:extensions`), extension
build, and Remix build in that order. It does not deploy and does not
touch production data. See `scripts/verify.sh`.

For changes touching the Discount Function pricing logic, the unit
fixtures under `extensions/stockly-volume-discount/tests/fixtures/`
must pass (8 fixtures as of 2026-07: multi-band, legacy single-band,
mix-variants aggregation, fixed-price, no-discounts, and the 3
active-date-window guardrails). Shopify Functions run in a
deterministic sandbox with no real wall clock — `new Date()` /
`Date.now()` inside a Function returns a fixed epoch, never the real
time. Any code needing "now" inside a Function must read
`shop.localTime` from the GraphQL input (see
`extensions/stockly-volume-discount/src/run.ts`), not the JS `Date`
API — this bit us once (ADR-012's active-date filter shipped using
`new Date()` and silently mis-evaluated every tier's start/end window).

---

## When to use subagents

Use a single-purpose subagent (via the Claude Code Agent tool or your
tool's equivalent) when:

- The task involves searching across many files for a pattern
- The task is an independent audit (security, performance, etc.) whose
  result you will consolidate
- You want a second opinion on a non-trivial change

Do not spawn a subagent for tasks you can do in one or two tool calls.
Agents inherit no context, so brief them with file paths and goals;
never write "based on your findings, fix the bug" — synthesize yourself.

Predefined agents available under `.claude/agents/`:

- `stockly-orchestrator` — plans a multi-step change before code is touched
- `stockly-implementer` — writes the code per the plan
- `stockly-reviewer` — reviews a diff before commit
- `shopify-b2b-specialist` — domain-deep Shopify B2B questions
- `deployment-guardian` — gates any deploy-shaped action
- `docs-curator` — keeps README / ROADMAP / HANDOFF / ADRs aligned

---

## When to write in `progress/`

For any task that:

- Touches three or more files, OR
- Spans more than one session, OR
- Involves a non-obvious decision worth recording

Create `progress/YYYY-MM-DD-short-slug.md` with: objective, files
inspected, files changed, commands run, verification result, open
risks, next step. See `progress/README.md` for the template.

Trivial single-file fixes do not need a progress entry.

---

## Commit conventions

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`,
  `test:`
- One logical change per commit
- Imperative mood, English (`Add ...`, not `Added ...`)
- Co-author trailer for AI-assisted commits when applicable
- Push to `main` directly (solo founder; no branch ceremony until team
  grows)
- Never `--no-verify`, never `--no-gpg-sign`, never `--amend` on a
  pushed commit unless the user asks

---

## Documentation discipline

- ADRs for any decision expensive to reverse → `docs/decisions/ADR-NNN-*.md`
- Architecture deep-dives → `docs/architecture/`
- Sprint retros → `docs/sprints/`
- Update HANDOFF.md after any change that affects "what works in
  production today"
- Do not delete historical docs; mark them historical at the top and
  link to the current version

---

## Working language

- Chat with Jonatan in Spanish (Spain). Tutea, no "usted".
- Code, code comments, and committed documentation in English.
- No emojis in code or committed files unless the user asks. Chat is
  fine.
