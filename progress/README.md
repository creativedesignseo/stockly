# progress/ — multi-step task journal

This folder is the chronological journal of non-trivial work on Stockly.
One file per task / session. Single source of "what did we do and why"
that survives across Claude sessions and across humans.

## When to create an entry

Create `progress/YYYY-MM-DD-short-slug.md` when a task:

- touches three or more files, OR
- spans more than one session, OR
- involves a non-obvious decision worth recording, OR
- changes something a future maintainer would otherwise wonder about

Trivial single-file fixes do **not** need an entry. Use commit messages
for those.

## Naming

`YYYY-MM-DD-<imperative-slug>.md`, e.g.:

- `2026-05-26-harness-setup.md`
- `2026-05-28-fix-fpq-evaluation-bug.md`
- `2026-06-02-implement-billing-api.md`

The date is the day the task started. Multi-day tasks keep their start
date; append a `Status` line inside the file to track ongoing state.

## Template

```markdown
# <imperative title matching the slug>

**Date:** YYYY-MM-DD (started)
**Status:** in-progress | completed | abandoned
**Owner:** Jonatan / Claude / both
**Related:** ADR-XXX, tasks/current.md#BX-Y, HANDOFF.md section, …

## Objective

One short paragraph: what we are trying to accomplish and why now.

## Files inspected

List of files read for context. Path + one-line "what I learned" each.

## Files changed

List of files written or edited. Path + one-line "what changed".

## Commands run

Verbatim commands. Especially anything that touches build, tests, or
infra. Skip mundane reads.

## Verification

What we ran to confirm the change works. Output summary (not full logs).
For most tasks this is `bash scripts/verify.sh` + the result.

## Open risks

Anything that remains uncertain, untested, or could bite later.
Empty section is fine.

## Next step

The single next action a future session should take. If "none", say so.
```

## Discipline

- **Keep entries short.** Five paragraphs is plenty. This is a journal,
  not a thesis.
- **Be honest about open risks.** Hiding them defeats the point of the
  journal.
- **Link, don't duplicate.** Point at HANDOFF.md / ADRs / tasks/current.md
  rather than restating their content.
- **Don't delete entries.** If a decision is reversed, write a new entry
  explaining why; leave the original.
