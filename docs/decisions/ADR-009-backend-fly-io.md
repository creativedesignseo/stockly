# ADR-009 — Backend choice: Fly.io (supersedes ADR-005 Vercel)

**Date:** 2026-05-26
**Status:** Accepted
**Supersedes:** [ADR-005 — Backend choice: Vercel](./ADR-005-backend-choice.md)
**Deciders:** Jonatan Montilla
**Migration date:** 2026-05-26 (live in production)

---

## Context

ADR-005 picked **Vercel + Vercel Postgres** for solo-founder simplicity. After ~8 hours of fighting structural friction during the actual deploy, we migrated to **Fly.io + Fly Managed Postgres**.

This ADR documents WHY the original choice was wrong for Shopify Remix apps, and why Fly.io is the right home for Stockly going forward.

## What forced the change

ADR-005 assumed Vercel would be the same low-effort "deploy and forget" experience for a Shopify Remix app that it is for a Next.js marketing site. It is not. Shopify Remix apps are NOT serverless-friendly because:

1. **Persistent connection pool needed.** Prisma + Postgres in serverless = pool exhaustion on every cold start (each Vercel Function opens new connections). We hit `PrismaClientInitializationError: Timed out fetching a new connection from the connection pool` on every iframe load.

2. **Cold starts break Shopify OAuth.** App Bridge token exchange completes in ~500ms in a warm container. In a serverless cold start (~1.5s), the request handler returns 410/redirect before App Bridge has a chance to exchange the token → infinite redirect loop → user sees the boilerplate "Log in / Shop domain" form.

3. **`@vercel/remix` adapter compatibility tax.** Vercel requires `vercelPreset()` in `vite.config.ts` + imports from `@vercel/remix` instead of `@remix-run/node`. Peer dep conflict with our pinned `@shopify/shopify-api@13.0.0` forced `legacy-peer-deps=true` in `.npmrc`. Build output goes to a different path (`build/server/nodejs-<base64>/index.js`) which broke `remix-serve` start.

4. **Env vars contaminated with newlines.** `echo "..." | vercel env add` adds `\n` that Vercel stores as part of the value. SHOPIFY_API_KEY ending in `\n` made every Shopify Auth call fail. Pattern documented as feedback to never use `echo`, always `printf`.

5. **The Shopify template stopped supporting Vercel.** The successor `shopify-app-template-react-router` (template Remix is deprecated since 2025-10-01) **removed Vercel from its hosting section entirely**. Official docs at shopify.dev/docs/apps/launch/deployment only list **Fly.io, Google Cloud Run, Render** — Vercel never had an official guide.

6. **Zero of the top 10 Shopify apps run on Vercel.** Researched: Klaviyo, Recharge, Judge.me, Yotpo, Bold, Smile.io, PageFly — all on AWS/GCP/Heroku. None on Vercel. Not coincidence.

## Decision

**Backend host:** Fly.io
**Region:** `iad` (us-east, Washington DC — closest Managed Postgres region to Miami)
**Database:** Fly Managed Postgres (`stockly-db` cluster, plan basic, pgbouncer pooled connection)
**Container:** `node:20-bookworm-slim` (Debian glibc for Prisma `rhel-openssl-3.0.x` binary compatibility)
**App handle:** `stockly-lustrous-forest-4364` (auto-assigned because `stockly` was taken globally)
**Production URL:** `https://stockly-lustrous-forest-4364.fly.dev`

## Why Fly.io specifically (vs Railway, Cloud Run, Render)

| Criterion | Fly.io | Cloud Run | Railway | Render |
|---|---|---|---|---|
| Region near US-East | ✅ iad, mia | ✅ us-east1 | ❌ (us-west only) | ❌ Frankfurt EU |
| Multi-region scaling | ✅ `fly machine clone --region X` (1 cmd) | ⚠️ Multi-project | ❌ Limited | ❌ Single region |
| Postgres integration | ✅ `fly mpg create` + auto DATABASE_URL | ❌ Cloud SQL separate | ✅ Add-on | ✅ Add-on |
| Cold starts | ❌ (always-on machines) | ✅ Yes (mitigable $$) | ❌ | ✅ Free tier sleep |
| Shopify docs | ✅ Dedicated tutorial at fly.io/docs/js/shopify/ | ✅ Most comprehensive | ❌ None | ⚠️ Brief mention |
| Cost MVP (3 pilots) | $5-10/mo | $0-15/mo | $5-10/mo | $14/mo (sleep on free) |
| Solo-founder friendly | ✅ | ❌ (GCP IAM burocracy) | ✅ | ✅ |
| Docker portability | ✅ | ✅ | ✅ | ✅ |

**Verdict:** Fly.io wins on Region+Postgres co-located, Shopify-dedicated docs, no cold starts, and DX. Cost difference vs others is negligible at solo founder scale.

## Architectural decisions on Fly

### Container strategy

- **Base image:** `node:20-bookworm-slim` (NOT alpine — alpine uses musl, Prisma binary `rhel-openssl-3.0.x` needs glibc)
- **Multi-stage build:** builder stage installs all deps + builds + prunes; runtime stage carries only production artifacts
- **`.npmrc` copied before `npm ci`** so `legacy-peer-deps=true` actually applies during install
- **`HOST=0.0.0.0`** env in container so `remix-serve` binds to all interfaces (otherwise fly-proxy can't reach it)
- **`apt-get install openssl ca-certificates`** required for Prisma query engine dynamic link

### Database access

- **DATABASE_URL** points to Fly Managed Postgres pgbouncer pool (no manual `connection_limit` needed — pgbouncer handles pooling natively)
- Schema applied via `release_command = 'npx prisma db push --skip-generate'` in `fly.toml` — runs before every deploy
- No versioned Prisma migrations yet (still using `db push`). Will revisit when there's real customer data to protect.

### Auth flow

- `unstable_newEmbeddedAuthStrategy: true` in `app/shopify.server.ts` — Shopify SDK's new token-exchange-based auth that AVOIDS the third-party cookie issue
- `getOrCreateShop` uses `prisma.shop.upsert` (NOT `findUnique + create`) — race-safe for concurrent iframe bootstrap requests
- `/app → /app/onboarding` redirect preserves `request.url.searchParams` so downstream loaders keep Shopify context (shop, host, embedded, id_token)

## What we keep from ADR-005

- **Prisma + Postgres** as the persistence layer (not Supabase, not Neon, not Prisma Postgres marketplace)
- **One vendor for compute + DB** — still true, now Fly instead of Vercel
- **Solo-founder DX priority** — Fly's CLI is simpler than AWS for one person

## What we throw away from ADR-005

- ❌ Vercel project (kept dormant, can delete after 1 week of Fly stability)
- ❌ Prisma Postgres marketplace integration (Fly Managed Postgres is plain Postgres, no Accelerate weirdness)
- ❌ `@vercel/remix` package (removed from dependencies)
- ❌ `vercel.json` (deleted)
- ❌ `vercelPreset()` in vite.config.ts (removed)

## Cost projection (Fly.io)

| Scale | Monthly cost |
|---|---|
| 3 pilots (now) | $5-10 |
| 50 merchants | $15-25 |
| 300 merchants (24m conservative) | $50-80 |
| 1000 merchants (24m optimistic) | $80-150 |

At 300 merchants × $60/mo = $18k MRR, $80 hosting = 0.4% of revenue. Irrelevant.

## What I learned (write this up as a memory)

The pattern I missed in ADR-005: **the choice of host is constrained by the FRAMEWORK pattern, not the framework name**. Vercel is perfect for Next.js sites BECAUSE Next.js is mostly stateless rendering. Shopify Remix apps have:
- Session state (cookies, DB-backed)
- Long-running OAuth handshakes
- Webhooks under sustained load
- App Proxy traffic from storefronts
- Prisma connection pools that need to persist

ALL of these favor traditional servers. The template oficial bundling a `Dockerfile` (and not a `vercel.json`) is the strongest signal Shopify gives about what they expect.

## Revisit triggers

Revisit this ADR if:
- Stockly grows past 1000 merchants and hosting cost becomes meaningful → consider AWS for fine cost control
- Fly.io platform reliability degrades (SLA, downtime)
- Shopify releases a managed app hosting service (unlikely)
- A pilot client requires hosting in a region Fly doesn't have

## Related ADRs

- ADR-002 — Framework: Remix (still valid, Remix runs on Fly identically)
- ADR-003 — Hosting: original "Vercel + Supabase" decision (superseded by ADR-005, now twice-superseded by this)
- ADR-005 — Backend choice: Vercel (superseded by this ADR)
