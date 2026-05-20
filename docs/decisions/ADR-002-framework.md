# ADR-002 — Framework: Remix (not Next.js)

**Date:** May 20, 2026
**Status:** Accepted
**Deciders:** Jonatan Montilla

---

## Context

Shopify apps need a full-stack framework that handles:
- OAuth flow with Shopify
- Embedded admin (App Bridge integration)
- GraphQL Admin API client
- Webhooks
- Server-side data loading + mutations
- Deployment to a serverless/edge platform

Two main contenders: **Remix** and **Next.js**.

---

## Options considered

### Option A: Remix (chosen)

**Pros:**
- Shopify's official `npm create @shopify/app@latest` template uses Remix
- Better App Bridge integration patterns
- Loader/action pattern aligns well with Shopify session + Admin API calls
- Vercel deploy is one-click
- `@shopify/shopify-app-remix` package handles OAuth, webhooks, session storage out of the box
- Smaller bundle, less framework overhead
- Web standards-first (Request/Response, FormData)

**Cons:**
- Smaller community than Next.js
- Fewer third-party tutorials specific to non-Shopify use cases
- Newer Shopify devs default to Next.js (mindshare issue)

---

### Option B: Next.js (App Router)

**Pros:**
- Larger ecosystem, more devs know it
- More documentation overall
- Vercel-native (built by them)
- Server Components could simplify some patterns

**Cons:**
- Shopify's official template DOESN'T use Next.js
- `@shopify/shopify-app-remix` is the most maintained Shopify framework package
- App Router still has rough edges (caching, dynamic vs static)
- More boilerplate to wire up OAuth + webhooks
- Heavier framework overhead for a relatively small admin app

---

### Option C: Nuxt / SvelteKit / Other

**Rejected outright.** No first-party Shopify package, would mean implementing OAuth + webhooks from scratch. Not worth the risk for a solo founder building to a deadline.

---

## Decision

**Use Remix 2.x with TypeScript.**

Rationale:
1. **Official Shopify support** — every breaking change in Shopify APIs gets a Remix template update first
2. **Speed to MVP** — `npm create @shopify/app` gives a working OAuth + webhook + admin shell in 5 minutes
3. **One less abstraction layer** — Remix patterns map 1:1 to Shopify needs
4. **Vercel deployment** — Remix on Vercel works perfectly (despite Vercel being Next.js's parent)

---

## Consequences

### Positive
- We benefit from every Shopify CLI update automatically
- Less framework boilerplate
- Shopify community examples mostly use Remix now
- Faster ramp-up using `@shopify/shopify-app-remix`

### Negative
- If we ever hire a junior dev who only knows Next.js, ramp-up cost
- If Shopify pivots away from Remix (low probability), we'd need to migrate

### Mitigation
- Keep business logic in framework-agnostic services (`app/services/`)
- Avoid Remix-specific patterns leaking into core logic
- If migration ever needed, it would mainly affect routes, not the heart of the app

---

## Initial Remix setup commands

```bash
cd /Users/aimac/Documents/Workspace/Clients/stockly
npm create @shopify/app@latest -- --name stockly --template remix
# Choose: TypeScript, Prisma, Supabase-compatible Postgres
```

This bootstraps:
- Remix + TypeScript
- App Bridge configured
- OAuth flow
- Prisma + SQLite (we'll swap to Postgres)
- Polaris React installed
- Theme App Extension scaffolding
- GitHub Actions example

---

## Revisit trigger

Revisit if:
- Shopify deprecates Remix template
- Performance ceiling hit that's framework-specific
- Team grows beyond 1 dev and Next.js skills are more available
