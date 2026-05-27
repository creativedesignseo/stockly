---
description: Run the Stockly local verification pipeline (lint, tests, extension build, Remix build). Use after any meaningful code change and before committing. Does not deploy.
---

# stockly-verify

Run `bash scripts/verify.sh` from the repo root. Then interpret the
result for the user.

## Procedure

```bash
bash scripts/verify.sh
```

Read its output. Map findings to next actions.

## Interpret results

- **Exit 0** — green. You may proceed to commit.
- **Exit 1** — one or more checks failed. Do NOT commit, do NOT
  deploy. For each failure:
  - Re-run that specific npm script in isolation for the full output.
  - Decide: is this failure caused by the current change, or
    pre-existing?
  - If pre-existing and unrelated, capture as a blocker in
    `tasks/current.md` and surface to the user.
- **Exit 2** — repo invariant broken (a required file is missing).
  This is structural; investigate immediately, do not patch over.

## Do not

- Re-run automatically in a loop. Diagnose first.
- Modify tests to make them pass without understanding the failure.
- Skip the script with `--no-verify` style bypass on commit. If you
  cannot run verification, say so explicitly to the user.
