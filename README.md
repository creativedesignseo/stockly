# Stockly

> The B2B wholesale app for Shopify stores that don't pay for Plus.

**Status:** 🚧 Pre-MVP — Sprint 0 (Foundation)
**Started:** May 20, 2026
**Target MVP:** August 2026 (10 weeks)

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
Shopify:      App Bridge + Polaris + Theme App Extensions
Database:     PostgreSQL (Supabase)
Hosting:      Vercel
APIs:         Shopify Admin GraphQL + Storefront API
Testing:      Vitest + Playwright
CI/CD:        GitHub Actions
```

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
