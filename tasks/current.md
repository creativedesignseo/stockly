# tasks/current.md — Stockly active task queue

> Single page of what's being worked on **right now**. Keep it short.
> Older completed tasks live in `progress/`. Strategic plan lives in
> `ROADMAP.md`. Operational truth lives in `HANDOFF.md`.

**Last updated:** 2026-08-14 — **🚀 SUBMITTED TO THE SHOPIFY APP STORE, status "Enviada", visibility LIMITED (unlisted), reviewer being assigned.** Then a hardening pass fixed the two defects the reviewer actually hit on 13 Aug plus four more found by audit. Verified this session: `verify.sh` green (**155 app tests**, 14 + 8 fixtures, both builds); production `/healthz`, `/`, `/legal/privacy`, `/legal/terms`, `/auth/login` all **200**; App Bridge served from Shopify's CDN; **no "Shop domain" field**; `/auth/login` resolves in **1 hop**; all four mandatory webhooks **200** and a forged HMAC **401**. Full detail in HANDOFF.md's two 2026-08-14 entries.

## P0 — Waiting on Shopify. Do not touch the app.

Nothing here needs doing. Shopify emails `info@adspubli.com`; realistic
window is **2–4 weeks** from 2026-08-13.

**Frozen until there is a verdict** — a broken install while a reviewer is
active is a guaranteed rejection:

- Do NOT press "Make fully visible". Limited→full is one click at any time;
  App Store reviews are permanent and weigh heavily in ranking. On Basic
  plans Stockly always renders struck-through retail + discount rather than a
  clean wholesale price (Cart Transform `update` is Plus-only), and only
  Starter is deliverable — both are reasons to stay unlisted through the
  first real merchants.
- Do NOT change access scopes (three are declared but unused —
  `write_products`, `write_publications`, `read_orders`). Changing them forces
  re-consent on every install.
- Do NOT edit the listing or ship a large refactor.

### ✅ Done — the billing button is proven

Pressed on `adspubli-wholesale-test` 2026-08-14. Reaches Shopify's approval
screen: *Stockly de Adspubli · Plan: Starter · 39,00 $ USD cada 30 días · 14-day
free trial*. Not approved on purpose — reaching the screen is the proof.

⚠️ On that screen **"Aprobar" is greyed out**: *"No tienes ninguna forma de pago
guardada"*, on a dev store, because `isTestBillingEnvironment()` returns
`NODE_ENV !== "production"` and the container is always production. A reviewer
lands on this same screen. Left alone deliberately: forcing `test: true` in
production would mean no real merchant is ever charged. One line and one env
var if the reviewer reports it.

### When the verdict arrives

- If **changes requested**: fix, then resubmit. Nothing is lost.
- If **approved**: (1) reinstall on `piroaccessories` — Piro has been down
  since the credential switch; (2) rotate the client secret (see below);
  (3) re-enable `customers/update` in `shopify.app.public.toml`.

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
