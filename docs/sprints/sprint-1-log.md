# Sprint 1 — Quick Order Form — Setup log

**Sprint dates:** May 20, 2026 → ~June 3, 2026 (2 weeks)
**Status:** 🟡 In progress

This log captures every meaningful commit and decision in Sprint 1.

---

## Goal

Build the Quick Order Form storefront block: a wholesale-only page where
buyers can add multiple SKUs to cart in one screen, with tier-aware
pricing and branded UI.

By end of sprint, a wholesale customer on `desarrollo-adspubli.myshopify.com`
should be able to:
1. Visit `/pages/wholesale-order`
2. See a table of all eligible products with B2B prices
3. Type quantities and see live total + tier hints
4. Click "Add all to cart" and proceed to a branded checkout

---

## Commits

### `e14baa1` — Domain models + service layer

Added to `prisma/schema.prisma`:
- `Shop` — per-store config (branding/copy as JSON, eligibility settings)
- `Tier` — volume pricing tier (scope: product/collection/all)
- `WholesaleCustomer` — Stockly-managed approval list

Service layer in `app/services/`:
- `shops.server.ts` — `getOrCreateShop`, branding/copy/settings updates
- `tiers.server.ts` — `resolveTier` with scope precedence, `applyDiscount`,
  CRUD operations
- `wholesale-customers.server.ts` — dual-track eligibility (tag OR list)

Auth wrapper `app/lib/auth.server.ts`:
- `authenticateAdmin` — wraps Shopify auth + auto-bootstraps Shop row
- Wired into `app.tsx` so every admin page hydrates the Shop

Dependency fix:
- Pin `@shopify/shopify-api` to `13.0.0` via package.json overrides
  (was: two parallel versions 12.3.0 + 13.0.0, causing TypeScript
  signature mismatch on PrismaSessionStorage)

### `e68eee8` — CI workflow

`.github/workflows/ci.yml`:
- Stage 1: lint + tsc (parallel-safe)
- Stage 2: Remix build (depends on stage 1)
- Concurrency cancels in-progress runs on new push to same branch
- Verified passing on Node 20

### `809f25c` — Admin UI for tiers

Polaris-native admin routes:
- `/app/tiers` — `IndexTable` of all tiers with empty state
- `/app/tiers/new` — Form to create a tier, scope-aware UI

NavMenu updated with "Tiers" link.

Known gap: scope ID is entered manually. Resource picker lands in Sprint 2.

### `4ac6a9d` — App Proxy context endpoint

`shopify.app.toml`:
- `[app_proxy]` config added (subpath "stockly", prefix "apps")

`app/routes/proxy.context.tsx`:
- Returns eligibility + branding + copy + tiers + settings in one call
- HMAC-verified via `authenticate.public.appProxy`
- 60s private cache (admin changes propagate within a minute)
- Eligibility = tag match OR WholesaleCustomer row
- Guests get `eligible: false` + empty tiers (saves payload)

---

## Architecture today

```
┌──────────────────────────────────────────────────────────────┐
│ Storefront (theme)                                            │
│   • Theme App Extension block (TBD — Sprint 1 next)          │
│   • Calls /apps/stockly/context once on page load            │
└─────────────────────────┬─────────────────────────────────────┘
                          │  (signed HMAC, App Proxy)
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ Stockly Remix backend                                         │
│   /proxy/context  ◄── theme calls                            │
│       │                                                       │
│       ├── authenticate.public.appProxy (HMAC verify)         │
│       ├── parseShop → branding + copy                        │
│       ├── isEligible → tag check + DB check                  │
│       └── listTiers → tier rules                             │
│                                                               │
│   /app/tiers           ◄── store owner (Polaris admin)       │
│   /app/tiers/new                                             │
│       │                                                       │
│       ├── authenticateAdmin → getOrCreateShop                │
│       └── createTier / listTiers                             │
└─────────────────────────┬─────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ SQLite (Prisma) — dev only                                    │
│   Shop  •  Tier  •  WholesaleCustomer  •  Session            │
└──────────────────────────────────────────────────────────────┘
```

---

## What's still needed for Sprint 1 to close

- [ ] **Theme App Extension scaffold** (`shopify app generate extension`)
  - Needs interactive CLI prompts
  - Will create `extensions/stockly-storefront/`
- [ ] **Quick Order Form block** (Liquid + Web Component)
  - Fetches products via Storefront API
  - Fetches Stockly context via App Proxy
  - Renders table with live tier-aware totals
- [ ] **Customer tag gate** (block visibility)
- [ ] **Seed dev store**
  - 10 test products
  - 1 customer tagged `wholesale`
  - 1 page `/pages/wholesale-order` with the block embedded
- [ ] **Edit tier route** (`/app/tiers/:id`) — currently link points to it but route doesn't exist
- [ ] **Delete tier action** (from list page)
- [ ] **First unit tests** for `resolveTier` (core business logic)

---

## Lessons learned (sprint in progress)

1. **Pin Shopify packages explicitly** — npm's natural resolution gave us
   two parallel versions of `@shopify/shopify-api`. Always override.
2. **Polaris TextField is controlled** — no `defaultValue` prop; must use
   `value` + `onChange` state.
3. **App Proxy is the right primitive** — one round-trip from theme to
   backend, signed, scoped to merchant's storefront. Cleaner than CORS.
4. **JSON in SQLite is fine for config blobs** — `branding` + `copy` as
   stringified JSON works well, easy to migrate to PostgreSQL JSONB later.

---

**Next:** Open the CLI (you, interactively) → `shopify app generate extension` → choose Theme App Extension → name it `quick-order-form`.
