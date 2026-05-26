# Stockly

> The B2B wholesale app for Shopify stores that don't pay for Plus.

**Status:** Live in production on Fly.io · Sprint 4 complete · pre-App-Store
**Started:** May 20, 2026
**Target App Store submission:** ~September 2026 (post audit P0 closure)

> **Resuming work?** Start with [HANDOFF.md](./HANDOFF.md) — it has the
> current operational state, last commit, and the recommended next
> action. The README below is a brief overview, not the source of truth.

---

## What it does

Brings enterprise-grade wholesale features to Shopify Basic/Grow stores, focused on **premium luxury brands** that care about how their B2B portal looks:

- **Quick Order Form** — bulk SKU table for fast wholesale ordering
- **Dynamic Volume Pricing** — real-time tier display ("add 50 more, save $200")
- **Branded Cart Experience** — sticky checkout with tier upsells
- **Contextual B2B Upsells** — smart cross-sells based on order volume

---

## Positioning

```
"The wholesale app for brands that care about
 how their B2B portal looks."
```

**Target:** jewelry, beauty, fashion, home decor — premium Shopify stores
where generic B2B apps don't match their brand aesthetic.

**Pricing strategy:** premium ($79-149/mo), fewer features but pulido,
mobile-first, customizable theming.

---

## Quick Links

- 🤝 [HANDOFF.md](./HANDOFF.md) — **Start here** if resuming work (current state + resume commands)
- 📋 [PROJECT.md](./PROJECT.md) — Full project plan + scope
- 🗺️ [ROADMAP.md](./ROADMAP.md) — 10-week sprint plan
- 📊 [docs/](./docs/) — Market research, positioning, decisions
- 🤖 [CLAUDE.md](./CLAUDE.md) — AI co-pilot context

---

## Tech Stack

```
Framework:    Remix + TypeScript
Shopify:      App Bridge + Polaris + Theme App Extensions + Discount Function
Database:     PostgreSQL via Fly Managed Postgres (region iad)
Hosting:      Fly.io (region iad, Dockerfile multi-stage Debian)
APIs:         Shopify Admin GraphQL + Storefront API + App Proxy
Testing:      Vitest (unit) + Playwright (E2E, ad-hoc)
CI/CD:        GitHub Actions → auto-deploy to Fly.io on push to main
```

See [ADR-009](./docs/decisions/ADR-009-backend-fly-io.md) for why
Fly.io and not Vercel (the original 2026-05-20 choice, replaced after
the migration documented in [HANDOFF.md](./HANDOFF.md)).

---

## Team

- **Jonatan Montilla** ([Adspubli](https://adspubli.com)) — Product, Strategy, Sales
- **Claude (Anthropic)** — Engineering co-pilot

---

## Pilot Clients (Phase 1)

1. **Piro Jewelry** ([pirojewelry.com](https://www.pirojewelry.com)) — Luxury jewelry, Miami
2. _[TBD client #2]_
3. _[TBD client #3]_

---

## Business Model

```
Phase 1 (Custom App):     $4-5k × 3 pilot clients = $12-15k upfront
                          + $300-500/mo maintenance × 3 = $14k/year
Phase 2 (Public App):     $39-149/mo recurring per client
Target 24-month MRR:      $15-25k ($180-300k ARR)
Shopify revenue share:    0% on first $1M/year, 15% above
Processing fee:           2.9% (payment processors)
```

---

## Repository

`Private` — Adspubli IP. Do not distribute or fork.

© 2026 Adspubli. All rights reserved.
