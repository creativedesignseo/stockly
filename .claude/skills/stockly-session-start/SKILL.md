---
description: Bootstrap a fresh Stockly session — read HANDOFF.md, tasks/current.md, recent commits, and surface the recommended next action. Use at the start of any session when context is empty or after a long gap.
---

# stockly-session-start

You are starting (or resuming) a session on Stockly. Get oriented in
under 60 seconds.

## Procedure

1. Read `HANDOFF.md` — this is the operational source of truth.
2. Read `tasks/current.md` — what is on the active queue.
3. Run `git log --oneline -10` — recent commits give the last context.
4. Run `git status --short` — uncommitted work in progress?
5. Glance at the newest file under `progress/` if any task spans more
   than one session.

## Report back

In one short message:

- Production state (one line, from HANDOFF.md)
- Last commit (hash + subject)
- Top P0 recommended next action (from `tasks/current.md`)
- Anything uncommitted or in a worktree that needs decision

Then ask the user: "¿Qué quieres atacar hoy?"

## Do not

- Start editing code before the user confirms direction.
- Run any deploy or Shopify CLI command.
- Spawn subagents for this skill — it is a quick orientation.
