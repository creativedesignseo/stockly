# tasks/current.md — Stockly active task queue

> Single page of what's being worked on **right now**. Keep it short.
> Older completed tasks live in `progress/`. Strategic plan lives in
> `ROADMAP.md`. Operational truth lives in `HANDOFF.md`.

**Last updated:** 2026-08-20 — **📩 VERDICT: CHANGES REQUESTED (ref 129441), and both issues are already FIXED AND DEPLOYED (`7466026`).** Issue 1 (1.2.2): billing `returnUrl` sent the merchant outside the admin after approving — now the documented `admin.shopify.com/...` pattern. Issue 2 (2.1.1): zombie "Unsaved changes" bar after creating a volume pricing rule (+ dead Delete via `window.confirm`) — fixed via `useManagedSaveBar` in all six forms + Polaris confirm Modals. `verify.sh` green (159 app tests), adversarial 3-agent review passed. **Deadline: respond before 2026-09-03 or the submission is paused.**

## P0 — Close the review loop (human steps, ~15 min)

1. **Record the proof-of-resolution screencast** on
   `adspubli-wholesale-test` — the exact 90-second script is in
   `progress/2026-08-20-reviewer-response-drafts.md`. Upload unlisted to
   YouTube.
2. **Mark both issues resolved** in Partner Dashboard → Revisión App
   Store → Ver comentarios ("Show resolved state" + the screencast URL +
   the drafted English responses in the same file).
3. **Press "Enviar correcciones"** (resubmit).

Also verify while recording: after approving the (test) subscription you
land back INSIDE the app on Billing with "Current plan" visible, and after
saving a volume pricing rule the "Unsaved changes" bar is gone and admin
navigation works.

**Still frozen while a reviewer is active:**

- Do NOT press "Make fully visible" (limited→full is one click later; on
  Basic plans the storefront shows struck-through retail + discount, and
  only Starter is deliverable — stay unlisted through the first merchants).
- Do NOT change access scopes (`write_products`, `write_publications`,
  `read_orders` declared-but-unused; changing forces re-consent).
- Do NOT edit the listing or ship a large refactor.

### When the next verdict arrives

- If **changes requested again**: same loop — read, fix, resubmit.
- If **approved**: (1) reinstall on `piroaccessories` — Piro has been down
  since the credential switch; (2) rotate the client secret (see below);
  (3) re-enable `customers/update` in `shopify.app.public.toml`.

### Retired 2026-08-20 — the greyed-out "Aprobar" fear

The reviewer APPROVED a Starter test charge on their dev store (Partner
activity log: activated 15:26, cancelled 16:34, "Testing multiple apps").
The missing-payment-method dead end never materialized;
`isTestBillingEnvironment()` stays as is.

### Deferred on purpose, with reasons

- [ ] **Rotate the client secret.** It was printed into this session's
  transcript on 2026-08-12 (a masking `sed` failed) and sits in
  `~/.claude/projects/…/*.jsonl` on Jonatan's Mac — local, never pushed.
  Deferred because rotating is only half the job: webhooks keep being signed
  with the OLD secret until it is revoked, `shopify-app-remix` accepts only
  one secret (`apiSecretKey: string`), and Shopify warns that revoking one
  with live tokens can leave merchants unable to open the app. Do it after
  approval: generate → put in Railway → revoke old → reinstall where needed.
- [ ] **Real B2B checkout test on Piro.** Outstanding since July. The 22
  fixtures prove the Function's logic against synthetic input; they cannot
  prove Shopify hands it a buyer identifier in a real native-B2B checkout.
  Blocked until Piro is reinstalled.

## Known and NOT fixed (audited 2026-08-14, deliberately left)

- `app/root.tsx` has no `ErrorBoundary`, so an unexpected throw outside
  `/app/*` renders Remix's unstyled "Application Error".
- No Prisma `connection_limit` on the Railway `DATABASE_URL`; `new
  PrismaClient()` sizes its pool from the *host's* core count inside a
  container.
- `app/routes/app.onboarding.tsx` redirects drop the query string
  (`throw redirect("/app")`), contradicting the warning in `app._index.tsx`.
- Legal pages are Spanish-only against an English listing.
- `syncTiersToFunction` swallows every error and returns void, so a failed
  discount sync shows the merchant a green success. All its call sites have
  dead error handling.

---

Older completed and superseded items — the whole submission checklist, the
May/June sprints, and the pre-pilot backlog — moved to **`tasks/archive.md`**
on 2026-08-14. Per-session journals remain in `progress/`.
