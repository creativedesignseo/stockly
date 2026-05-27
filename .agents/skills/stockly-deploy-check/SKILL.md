---
description: Pre-deploy safety checklist for Stockly. Use BEFORE any fly deploy, shopify app deploy, or prisma push against production. Does not deploy — only validates the change is safe to deploy.
---

# stockly-deploy-check

Run this before any production-shaped action. This skill validates;
it does not execute the deploy.

## Checklist

1. **Verify is green.**
   - Run `bash scripts/verify.sh`. Must exit 0.
   - If not run since the last code change, run it now.

2. **Working tree is clean (or known).**
   - `git status --short` — list any uncommitted change.
   - Confirm with the user that any uncommitted change is intentional.

3. **Diff since last deploy is reviewed.**
   - `git log --oneline <last-deployed-sha>..HEAD` — show all
     commits being deployed.
   - For each, confirm the subject describes the intent and the
     diff matches.

4. **Config files unchanged or intentionally changed.**
   - Check `git diff <last-deployed-sha>..HEAD -- fly.toml
     shopify.app.toml prisma/schema.prisma`.
   - Any change here needs explicit user awareness.

5. **HANDOFF.md will be updated post-deploy.**
   - Prepare the patch (do not commit yet): new `Last updated`,
     new `Last commit`, any new "What works" entry.

6. **Explicit deploy approval.**
   - Repeat the exact command back to the user.
   - Wait for an unambiguous "deploy" / "envía" / "ship" reply.

## Commands you may run

- `bash scripts/verify.sh`
- `git status`, `git diff`, `git log`, `git show`
- `fly status`, `fly logs --no-tail`, `fly machine list`
- `npx --yes shopify app info`

## Commands you may NOT run from this skill

- `fly deploy` (any variant)
- `npx shopify app deploy`
- `prisma db push` against production
- `git push --force`
- Anything that prints secrets

Hand the actual deploy execution to `deployment-guardian` after this
checklist is fully green and approved.
