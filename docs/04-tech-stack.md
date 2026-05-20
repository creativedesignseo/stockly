# 04 — Tech Stack

## At a glance

| Layer | Choice | Why |
|---|---|---|
| Framework | Remix + TypeScript | Shopify official recommendation |
| Admin UI | Polaris React + App Bridge | Native Shopify look, mandatory |
| Storefront | Liquid + Web Components | Theme App Extension constraint |
| Database | PostgreSQL on Supabase | Generous free tier, branching |
| Hosting | Vercel | Best Remix DX, generous free tier |
| Auth | Shopify OAuth | App Store requirement |
| API | Admin GraphQL + Storefront API | Shopify-native |
| Testing | Vitest + Playwright | Modern, fast |
| CI/CD | GitHub Actions | Free for public + private (within limits) |
| Monitoring | Vercel Analytics + Sentry | Free tiers cover MVP |

---

## Detailed decisions

### Framework: Remix (not Next.js)

**Decision:** Remix 2.x with TypeScript

**Why:**
- Shopify's official app template uses Remix (`npm create @shopify/app@latest`)
- Better App Bridge integration out of the box
- Server-side data loading aligns well with Shopify session management
- Vercel deploy is one click

**Trade-off:**
- Smaller ecosystem than Next.js
- Some Shopify community libs are Next.js-first

See [ADR-002](./decisions/ADR-002-framework.md).

---

### Admin UI: Polaris React

**Decision:** Polaris v12+ via App Bridge

**Why:**
- App Store reviewers expect Polaris (rejection otherwise)
- Free component library — saves weeks of design work
- Native Shopify admin look = familiar to merchants

**Trade-off:**
- All apps look similar in admin (acceptable — differentiation is in storefront)

---

### Storefront blocks: Theme App Extensions

**Decision:** Liquid + Web Components (no React in storefront)

**Why:**
- Theme App Extensions are the only sanctioned way to inject UI into themes
- Web Components are framework-agnostic and work in any theme
- Inheriting theme styling is easier with Liquid templates

**Trade-off:**
- Can't use React/Vue/Svelte components in storefront
- Web Components have a learning curve

---

### Database: PostgreSQL on Supabase

**Decision:** Supabase free tier → Pro at scale

**Why:**
- Free tier: 500MB DB, 2GB bandwidth, 50k MAUs — enough for 50+ pilot shops
- Branching for staging environments
- Built-in connection pooling (important on serverless)
- Optional row-level security if we ever expose data to merchants directly

**Alternatives considered:**
- Neon — similar pricing, less integrated
- PlanetScale — MySQL, more expensive
- Vercel Postgres — vendor lock-in to Vercel
- Self-hosted on Railway/Fly — operational overhead

See [ADR-003](./decisions/ADR-003-hosting.md).

---

### Hosting: Vercel

**Decision:** Vercel free tier → Pro at scale

**Why:**
- Best Remix DX (zero-config deploy)
- Edge functions for low-latency storefront API
- Free tier: 100GB bandwidth, 100k serverless invocations
- Preview deploys per PR (when we get to branching)

**Trade-off:**
- Serverless cold starts (mitigated by Edge runtime where possible)
- Bandwidth caps if app gets popular

---

### ORM: Prisma

**Decision:** Prisma (assumed, used by Shopify Remix template)

**Why:**
- Comes with the template
- Type-safe queries
- Migrations are predictable

**Trade-off:**
- Heavier bundle than Drizzle or Kysely
- Re-evaluate if we hit performance ceilings

---

### Authentication

**Decision:** Shopify OAuth (managed by `@shopify/shopify-app-remix`)

**Why:**
- App Store requirement
- Token rotation handled automatically
- Online + offline tokens managed

---

### Testing

**Decision:** Vitest (unit + integration), Playwright (E2E)

**Coverage target for MVP:** 50% on business logic (tiers, pricing resolution, eligibility)

---

### Folder structure (initial proposal)

```
stockly/
├── app/                          # Remix app
│   ├── routes/                   # Routes (admin + API)
│   │   ├── app._index.tsx        # Embedded admin home
│   │   ├── app.tiers._index.tsx
│   │   ├── app.settings.tsx
│   │   ├── api.shop.tsx          # Public API for storefront blocks
│   │   └── webhooks.tsx          # GDPR + uninstall
│   ├── components/               # React components
│   ├── services/                 # Business logic
│   │   ├── tiers.ts
│   │   ├── pricing.ts
│   │   └── eligibility.ts
│   ├── db/                       # Prisma client + helpers
│   └── shopify.server.ts         # Shopify config
├── extensions/                   # Theme App Extensions
│   └── stockly-storefront/
│       ├── blocks/
│       │   ├── quick-order.liquid
│       │   ├── volume-pricing.liquid
│       │   └── branded-cart.liquid
│       ├── assets/               # Web Components, CSS
│       └── locales/
├── prisma/
│   └── schema.prisma
├── public/
├── docs/                         # Project docs (this folder structure)
└── tests/
    ├── unit/
    └── e2e/
```

---

### Shopify scopes (initial)

```
read_products
read_orders
read_customers
read_companies        # B2B (Plus only — will gracefully degrade on Basic)
write_metafields      # for tier metadata
write_themes          # to install Theme App Extension
read_locales
```

We'll add more as features need them. Principle: **least privilege**, only request what we use.
