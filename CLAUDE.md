# CLAUDE.md — Stockly (Claude Code-specific)

> Claude Code reads this file at session start. The portable harness
> contract lives in `AGENTS.md` and is imported below. Keep this file
> short — Claude Code-specific tips only. Everything else goes in
> AGENTS.md.

@AGENTS.md

---

## Claude Code session start

When a fresh Claude Code session opens this repo:

1. Invoke the `stockly-session-start` skill (under `.claude/skills/`).
   It reads HANDOFF.md + tasks/current.md + recent commits and reports
   back in ~60 seconds.
2. Ask Jonatan: "¿Qué quieres atacar hoy?" — do not invent tasks.

If the skill is unavailable, do the manual equivalent: read
`HANDOFF.md`, then `tasks/current.md`, then `git log --oneline -10`.

---

## Verification

After any meaningful change, run the `stockly-verify` skill or:

```bash
bash scripts/verify.sh
```

Do not commit on red. Do not deploy without going through the
`stockly-deploy-check` skill and the `deployment-guardian` agent.

---

## Subagents available under `.claude/agents/`

- `stockly-orchestrator` — plan a multi-step change
- `stockly-implementer` — write the code per the plan
- `stockly-reviewer` — review a diff before commit
- `shopify-b2b-specialist` — pricing engine / Markets / Companies
- `deployment-guardian` — gates anything deploy-shaped
- `docs-curator` — keeps README/ROADMAP/HANDOFF/ADRs aligned

Default to the main agent. Spawn a subagent only when the task
matches one of the above and you have a self-contained brief for it.

---

## Skills available under `.claude/skills/`

- `stockly-session-start` — orient at session start
- `stockly-verify` — run the local verification pipeline
- `stockly-docs-sync` — find and fix doc/reality drift
- `stockly-deploy-check` — pre-deploy safety checklist

---

## Jonatan's working preferences

- Spanish (Spain) in chat; tutea, no "usted".
- Direct tone, no fluff. Move fast, don't over-engineer.
- "Ship first, optimize later" — but never ship pricing or auth code
  without tests.
- Never `gmail send` without explicit "envía" in the same message.
  Always `gmail draft` first. (Global rule, inherited from
  `~/.claude/CLAUDE.md`.)
- Never delete, archive, or modify existing emails. Direct the user
  to do it themselves.
