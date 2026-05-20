# ADR-003 — Hosting: Vercel + Supabase

**Date:** May 20, 2026
**Status:** Accepted
**Deciders:** Jonatan Montilla

---

## Context

We need:
1. **Application hosting** for the Remix app (admin + storefront API endpoints)
2. **Database** for shop settings, tiers, customer eligibility rules

Constraints:
- Solo founder, no DevOps time budget
- Must scale to 1000+ shops on Phase 2 conservative target
- Free tier preferred for Phase 1
- Must support serverless/edge for low latency
- GitHub-based deploy pipeline

---

## Application hosting

### Options considered

| Option | Free tier | Pros | Cons |
|---|---|---|---|
| **Vercel** ✅ | 100GB bandwidth/mo, 100k func invocations | Best Remix DX, edge functions, preview deploys | Function timeout limits (10s hobby, 60s pro) |
| Fly.io | ~$5/mo always-on | Long-running processes, regions | More DevOps overhead, no preview deploys |
| Railway | $5/mo credit | Easy deploy, persistent process | No edge runtime, pricier at scale |
| Render | Free tier with cold starts | Simple, free Postgres included | Cold starts on free tier |
| Cloudflare Pages + Workers | Generous free tier | Best edge perf | Workers KV/D1 still maturing, less mature Remix story |

### Decision: Vercel

**Reasons:**
1. Best Remix experience (Remix runs serverless or edge on Vercel without config)
2. Free tier covers Phase 1 fully (100k function invocations = ~3,333/day, way more than 3 pilots need)
3. Preview deploys per PR (when we move beyond solo)
4. Easy custom domain + SSL
5. Built-in analytics
6. Vercel Edge Functions for low-latency storefront API

---

## Database

### Options considered

| Option | Free tier | Pros | Cons |
|---|---|---|---|
| **Supabase** ✅ | 500MB DB, 2GB bandwidth, 50k MAU | Postgres + extras (auth, storage), branching, generous free | Vendor lock-in to platform features (we'll only use Postgres) |
| Neon | 3GB storage, branching | Pure Postgres, serverless, branching | Less integrated tooling |
| PlanetScale | Hobby tier removed 2024 | Branching, scaling | MySQL only (we want Postgres), more expensive |
| Vercel Postgres | 256MB storage | Tight Vercel integration | Vendor lock-in, smaller free tier |
| Railway Postgres | Included with $5/mo plan | Easy | Tied to Railway |
| Self-hosted on Fly | Free 256MB volume | Full control | Operational burden |

### Decision: Supabase

**Reasons:**
1. **Free tier covers Phase 1** (500MB is enough for 100+ shops with tier configs)
2. **Postgres** — industry standard, well-documented, Prisma-compatible
3. **Branching** — staging environments via database branches
4. **Built-in connection pooling** — important for serverless functions
5. **Optional features we may use later** — Storage (for logo uploads), Realtime (for live admin updates)
6. **Adspubli has agency-wide preference** — already use Supabase for other projects

We will **not** use Supabase Auth (Shopify OAuth handles that) or Supabase Edge Functions (we use Vercel for app code).

---

## Architecture diagram

```
┌─────────────────────────────────────────────┐
│ DEVELOPER                                    │
│  - Local dev: shopify CLI + Remix dev server│
│  - Commit to GitHub                          │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ GITHUB                                       │
│  - main → triggers Vercel deploy             │
│  - PRs → trigger Vercel preview deploys     │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ VERCEL                                       │
│  - Remix app (admin + API routes)            │
│  - Edge Functions (storefront block API)    │
│  - Custom domain: stockly.app (eventually)  │
└──────────────────┬───────────────────────────┘
                   │
       ┌───────────┴─────────────┐
       │                          │
       ▼                          ▼
┌──────────────┐         ┌─────────────────┐
│  SUPABASE    │         │  SHOPIFY APIs   │
│  (Postgres)  │         │  - Admin GraphQL│
│              │         │  - Storefront   │
└──────────────┘         └─────────────────┘
```

---

## Cost projection

### Phase 1 (Months 0-4, up to 3 shops)
- Vercel: $0 (free tier)
- Supabase: $0 (free tier)
- Total: **$0/month**

### Phase 2 early (Months 4-12, up to 100 shops)
- Vercel: $0-20/month (likely still free tier until ~50k function calls/day)
- Supabase: $0-25/month (Pro tier if we exceed 500MB)
- Total: **$0-45/month**

### Phase 2 scale (Months 12-24, 300-1000 shops)
- Vercel Pro: $20/month (covers higher limits)
- Supabase Pro: $25/month
- Total: **$45/month** for ~$216k+ ARR

Cost as % of revenue at conservative scale: **0.025%**. Essentially nothing.

---

## Migration paths (if we ever outgrow)

- **Vercel → AWS / Fly:** straightforward (Remix is portable, just adapter swap)
- **Supabase → AWS RDS / self-hosted Postgres:** pg_dump + restore, no schema changes needed
- **Both at once:** ~1-2 weeks of work, not blocking until $1M+ ARR

---

## Revisit trigger

Revisit if:
- Vercel function timeouts become limiting (need long-running jobs)
- Supabase free tier becomes binding constraint before Phase 2 revenue justifies upgrade
- Edge function cold starts hurt UX in storefront blocks
- We need data residency (EU customers requiring EU-only data hosting)
