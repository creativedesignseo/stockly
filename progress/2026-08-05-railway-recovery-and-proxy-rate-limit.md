# 2026-08-05 — Railway outage recovery + `/proxy/apply` rate limiting

## Objective

Answer "what is missing for the client to have the app in production",
then unblock whatever was blocking it. Two outcomes: production came back
online, and the last outstanding code item on the App Store pre-launch
list got built.

## Verified reality at session start

- `curl -sI https://stockly-production-5ccf.up.railway.app/` → `HTTP/2 404`
  with `x-railway-fallback: true` — Railway's edge saying nothing runs there.
- `railway status` → `stockly: ○ Offline`, `Postgres: ○ Offline`.
- Railway dashboard (via Chrome, logged-in session): banner *"Trial Ended —
  Upgrade now to continue using the platform"*, one project listed as
  "No services".

The project was NOT lost — `railway status` still showed both services and
the `postgres-volume` at 116 MB. The dashboard's "No services" was just how
it renders an offline project.

## What changed

### 1. Railway plan activated (Jonatan)

Confirmed by API rather than by dashboard screenshot:

```
POST https://backboard.railway.com/graphql/v2
Authorization: Bearer <accessToken from ~/.railway/config.json>
User-Agent: railway-cli/5.20.0     # without this, Cloudflare returns 1010
```

```
workspace.plan            = "HOBBY"
customer.state            = "ACTIVE"
customer.isTrialing       = false
customer.isUsageSubscriber= true
```

Gotcha for future sessions: the CLI's `accessToken` expires hourly. Run
`railway whoami` first to refresh it, then re-read `~/.railway/config.json`.
An expired token returns `Not Authorized` on `me`, which reads like a
permissions problem but is not.

Hobby limits pulled from `subscriptionPlanLimit`: 50 projects, 50 services
per project, 5 GB volumes, 6 replicas, 2 custom domains, 7-day log
retention, Railway Agent capped at `agent.defaultUsageLimitCents: 500`.

Activating the plan **auto-triggered a rebuild** — no `railway up` was run
from here. Result: `stockly: ● Online`, `Postgres: ● Online`, prod
`HTTP/2 200`, clean startup log.

### 2. Rate limiting on `/proxy/apply`

Files: `app/lib/rate-limit.server.ts` (new), `app/lib/rate-limit.test.ts`
(new), `app/routes/proxy.apply.tsx` (wired in).

`/proxy/apply` is the only public write endpoint. App Proxy's HMAC
authenticates the *origin* of a request but says nothing about volume, and
each submission costs one form read plus two writes.

Two sliding windows:

- **5/min per shop+IP** — a single abusive visitor cannot consume the
  merchant's whole quota and lock out genuine applicants.
- **60/min per shop** — backstop for a distributed flood where every
  request carries a different IP.

Over either → `429` with `Retry-After`, plus a `[rf.rate_limited]`
structured log line.

Decisions worth recording:

- **Check runs before `getOrCreateShop`**, which is itself a write.
  Checking after it would leave the cheapest attack — hammering an unknown
  shop domain — unprotected.
- **Sliding window, not fixed** — a fixed window lets a caller land 2× the
  limit across a boundary.
- **In-memory, not DB-backed** — a counter write per request defeats the
  purpose of protecting against write volume.
- **Injectable clock** so tests drive time instead of sleeping.
- **Unattributable requests bucket under `"unknown"`** — sharing one tight
  quota is the conservative failure mode.

Known limitation, documented in the module: state is process-local. Hobby
runs 1 replica so today's limits are the real limits; past that, each
replica enforces its own window and the effective limit multiplies by the
replica count. Degrades, does not fail.

## Verification

- `bash scripts/verify.sh` → green.
- `npx vitest run` → **129/129 passing** (was 119; +10 new).
- Prod live check → `HTTP/2 200`.

One test was written with a wrong bound (`size() < 300`, actual 300) — the
limiter behaved correctly, the assertion was miscalculated. Fixed to assert
the real invariant (bounded, not "exactly one window's worth") rather than
loosening it to whatever the code happened to produce.

## Open risks

- **`prisma db push` against live prod remains unverified.** The rebuild was
  triggered by Railway on plan activation, so it never went through
  `deployment-guardian`, and neither the build nor deploy logs show the
  `railway.json` `preDeployCommand` running. (The `prisma generate` lines in
  the build log are the Dockerfile's, a different thing.) Harmless while the
  schema is unchanged; the first schema change rides on an untested hook.
- **No usage limit set on Railway.** Recommended: hard limit ~$15-20 + soft
  alert ~$10, so the worst case is "services stop" rather than a surprise
  bill. Egress ($0.05/GB) is the line item that scales with real traffic.
- **Distribution path undecided.** Custom distribution cannot reach a store
  outside Adspubli's Partner org. Blocked on: which store, and who owns it
  in Partners.
- **`stocklygo.site` not wired up.** Must land before the first real
  merchant install, not after.

## Next step

Commit the rate-limiting work + these doc updates. Then either the custom
domain or the distribution decision, depending on Jonatan's answer about
the client store.
