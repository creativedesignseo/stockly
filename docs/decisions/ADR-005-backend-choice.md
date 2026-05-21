# ADR-005 — Backend Choice: Vercel + Vercel Postgres

**Date:** 2026-05-21
**Status:** Accepted
**Deciders:** Jonatan Montilla (validated against research)
**Supersedes:** ADR-003 (Vercel + Supabase)

---

## Context

ADR-003 (2026-05-20) chose Vercel + Supabase. After a deeper working session on 2026-05-21 including:

1. Web research on what successful Shopify apps actually use in production
2. Explicit weighting of "operational simplicity for solo founder" as a top criterion
3. Comparative analysis of Supabase, Neon, Vercel Postgres, Railway, Render, AWS

The decision shifted to **Vercel + Vercel Postgres** (which is Neon white-labeled, sold under Vercel's billing umbrella). Same technical foundation as Supabase (PostgreSQL), but consolidated under a single vendor.

## Research summary

| Reference | Finding |
|---|---|
| **Klaviyo** ($1.23B revenue 2025, most successful Shopify app) | Python + Django + AWS — but reflects 2012 origin, NOT what new apps should start with |
| **`@shopify/shopify-app-remix`** (official Shopify package) | Recommends Remix + Vercel / AWS / Render |
| **Vercel enterprise customers** | Apple, Nike, Netflix, TikTok, OpenAI, Notion, Adobe, Loom, Linear, Ramp |
| **Vercel Postgres provenance** | Powered by Neon (acquired by Snowflake in 2025); same engine, sold by Vercel |
| **Supabase enterprise customers** | Mozilla, GitHub, 1Password, Figma, Replit, PwC, J&J |
| **Industry pattern** | Most Shopify apps BORN on simple stacks (Vercel/Render/Heroku), MIGRATE to AWS at scale ($1M+ ARR) |

## Decision

Use **Vercel Pro + Vercel Postgres + Vercel Blob + Resend** for production.

```
Compute:         Vercel Pro          ($20/mo base)
Database:        Vercel Postgres     ($20/mo starter)
Storage:         Vercel Blob         ($0.15/GB, ~$0-5/mo)
Email:           Resend              ($20/mo)
Error tracking:  Sentry              ($0 free tier)
Cron jobs:       Vercel Cron         ($0 included)
─────────────────────────────────────────────────
TOTAL:           ~$60-70/mo

All Vercel-family products billed together. One dashboard. One support contact.
```

## Why this over Vercel + Supabase

Same technical core (PostgreSQL). Differences:

| Dimension | Vercel Postgres | Supabase |
|---|---|---|
| **PostgreSQL** | ✅ (Neon under the hood) | ✅ (real PostgreSQL) |
| **One bill** | ✅ Same as compute | ❌ Separate vendor |
| **One dashboard** | ✅ | ❌ Two places to look |
| **One support contact** | ✅ | ❌ |
| **Storage built-in** | ✅ Vercel Blob | ✅ Supabase Storage |
| **Branching** | ✅ (via Neon) | ✅ Mature |
| **Auth** | ❌ Don't need (Shopify handles) | ✅ Available but unused |
| **Realtime** | ❌ Don't need (App Proxy is request-response) | ✅ Available but unused |
| **Studio/dashboard** | Good | Better (more features) |
| **Branding** | "Vercel Postgres" | "Supabase" |

For solo founder priorities (simplicity > marginal features), Vercel everything wins.

## Alternatives considered

### Alt 1 — Vercel + Supabase (ADR-003 choice)
- **Pro:** Best-in-class for each (Vercel for Remix, Supabase for Postgres+features)
- **Pro:** Battle-tested by GitHub, Mozilla, 1Password
- **Con:** Two vendors, two bills, two places to look when something breaks
- **Verdict:** Excellent tech, but operational overhead exceeds value for our profile

### Alt 2 — Railway (compute + DB in one platform)
- **Pro:** Even simpler than Vercel-everything: one platform total
- **Pro:** Cheaper at small scale (~$15-30/mo all-in)
- **Con:** Less optimized for Remix than Vercel; no edge network
- **Con:** Smaller user base = fewer Shopify-app-Remix guides
- **Verdict:** Strong if cost is critical, but Vercel's Remix tooling and edge network win

### Alt 3 — Render
- **Pro:** Similar to Railway, slightly more mature
- **Con:** Cold starts on free tier (matters for storefront app proxy latency)
- **Verdict:** Comparable to Railway, Vercel still wins on Remix DX

### Alt 4 — AWS (Lambda + RDS / ECS)
- **Pro:** Where successful apps eventually migrate
- **Pro:** Infinite scale, all features
- **Con:** Premature for pre-revenue solo founder; high operational complexity
- **Con:** Expensive at small scale once you account for engineering time
- **Verdict:** Migration target for Month 18+ if 1000+ paying clients

### Alt 5 — Self-hosted (Hetzner VPS + Postgres)
- **Pro:** Very cheap at scale ($5-20/mo for substantial capacity)
- **Pro:** Full control
- **Con:** Founder becomes sysadmin — wrong use of founder time
- **Verdict:** Only if dedicated DevOps capacity exists

## Consequences

### Positive
- Single vendor for compute + DB + storage + cron + analytics = lower operational overhead
- Same technical foundation as Supabase/Neon (PostgreSQL) = future-portable
- Vercel's Remix optimization is best-in-class
- Migration path preserved: Vercel Postgres → Neon direct → AWS RDS is all PostgreSQL → PostgreSQL (trivial)

### Negative
- No built-in auth (we don't currently need it — Shopify handles auth)
- No realtime built-in (not needed for request-response App Proxy flow)
- Studio/dashboard slightly less feature-rich than Supabase
- Lock-in to Vercel's pricing model (mitigated: Postgres is portable)

## Migration plan

**Current state (Sprint 1):** SQLite local for dev (`prisma/dev.sqlite`). No production infra yet.

**Sprint 5 (Testing & Beta) — production migration:**

1. Provision Vercel Postgres in the Vercel project
2. Change `prisma/schema.prisma` datasource:
   ```diff
   - datasource db { provider = "sqlite"; url = "file:dev.sqlite" }
   + datasource db { provider = "postgresql"; url = env("DATABASE_URL") }
   ```
3. Adapt any SQLite-specific types to PostgreSQL equivalents (e.g., consider `Decimal` over `Float` for monetary values)
4. Drop the existing SQLite migration, generate a fresh PostgreSQL migration
5. Deploy to Vercel with `DATABASE_URL` from Vercel Postgres
6. Smoke tests + E2E in staging branch (Vercel preview)
7. Cut over production

**Critical**: no code changes outside Prisma config, because Sprint 1's discipline of routing all DB access through `app/services/` keeps the rest of the codebase database-agnostic.

## Cost projection

| Phase | Vercel Pro | Vercel Postgres | Vercel Blob | Resend | Total |
|---|---|---|---|---|---|
| Phase 1 (0-3 pilots, Month 0-4) | $0 (free) | $0 (free) | $0 | $0 | **$0** |
| Phase 2 early (50 clients, Month 4-12) | $20 | $20 | $1-2 | $20 | **~$60** |
| Phase 2 scale (500 clients, Month 12-18) | $20 | $20 | $2-5 | $20 | **~$65** |
| Phase 2 large (1000 clients, Month 18-24) | $20 + usage | $20 + usage | $5-10 | $20 | **~$80-100** |

At 300 clients × $60 ARPU = $18k MRR. Backend cost ~$70/mo = **0.4% of revenue**. Negligible.

## Revisit trigger

Revisit if:
- Reach 1000+ paying clients → evaluate Vercel Enterprise vs migration to AWS Aurora Serverless v2
- Latency requirements demand multi-region active-active → may need distributed DB
- Compliance (HIPAA, strict EU residency) requires specific data residency Vercel can't offer
- Vercel pricing changes substantially (low risk, but track)
- The cost of "missing Supabase features" becomes real (e.g., if we need realtime for live admin updates, reconsider hybrid Supabase Realtime)

## References

- Working session 2026-05-21 (transcript in session jsonl)
- Web research on top Shopify apps + tech stacks (session 2026-05-21)
- [Vercel Postgres docs](https://vercel.com/docs/storage/vercel-postgres)
- [Vercel customers page](https://vercel.com/blog/category/customers)
- [Klaviyo tech stack analysis](https://klaviyo.tech/tagged/django)
- [@shopify/shopify-app-remix](https://www.npmjs.com/package/@shopify/shopify-app-remix)
- Superseded: [ADR-003 — Vercel + Supabase](./ADR-003-hosting.md)
