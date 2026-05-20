# Stockly — Claude Co-Pilot Memory

> Read this file at the start of every fresh Claude session on this project.
> Last updated: May 20, 2026

---

## What is Stockly?

A Shopify App that brings enterprise-grade B2B wholesale features to Shopify Basic/Grow stores, focused on **premium luxury brands**. Working name (commercial name TBD at Month 3).

**One-liner:** "The wholesale app for brands that care about how their B2B portal looks."

---

## Origin story (why this exists)

Built on top of the work Adspubli did for Piro Jewelry (May 2026):
- Discovered the `applicationLevel: ALL` workaround that lets Basic-plan stores automate B2B catalog assignment (normally Plus-only at $2,300/mo)
- Built custom branded errors, login flows, drawer redesigns on Ella theme
- Realized the same code/concepts can be productized for the App Store
- Existing B2B apps (BSS, Bold, B2B Hub) are technically capable but visually generic — gap for a premium-positioned app

---

## Owner

- **Jonatan Montilla** — Adspubli (Barcelona, Spain). Sole founder.
- Spanish primary, English for code/docs. Tutea (Spain Spanish, not voseo).
- Direct tone, no fluff. Currency € or $ depending on market, dates DD/MM/YYYY.

---

## Tech Stack (decided)

```
Framework:   Remix + TypeScript
Shopify:     App Bridge + Polaris React + Theme App Extensions
Database:    PostgreSQL on Supabase (free tier → paid at scale)
Hosting:     Vercel (free tier 100k req/mo → paid)
APIs:        Shopify Admin GraphQL API + Storefront API
Testing:     Vitest (unit) + Playwright (E2E)
CI/CD:       GitHub Actions
Storefront:  Liquid + Web Components in Theme App Extensions
```

See [docs/04-tech-stack.md](./docs/04-tech-stack.md) and ADRs in [docs/decisions/](./docs/decisions/) for rationale.

---

## Business model (summary)

| Phase | What | Revenue target |
|---|---|---|
| Phase 1 (Months 0-4) | Custom app, 3 pilot clients | $12-15k upfront + $900-1,500/mo |
| Phase 2 (Months 4+) | Public App Store listing | $39-149/mo per client, ARPU $60 |
| 24 months | Conservative | 300 clients × $60 = $18k/mo ($216k/year) |
| 24 months | Optimistic | 1000 clients × $50 = $50k/mo ($600k/year) |

Shopify revenue share: 0% on first $1M/year, 15% above. Processing fee: 2.9%.

---

## Development environment

| Resource | Value |
|---|---|
| Dev store | **desarrollo-adspubli.myshopify.com** (chosen Sprint 0, May 20 2026) |
| Partner account | Jonatan (Adspubli) |
| Local dev command | `npm run dev` from `/Users/aimac/Documents/Workspace/Clients/stockly/` |
| Local DB | SQLite at `prisma/dev.sqlite` |
| GitHub | `creativedesignseo/stockly` (private) |

**Stores NOT to use for dev** (would touch real client data):
- ❌ `adspubli.myshopify.com` (Adspubli main store)
- ❌ `hotel-us.myshopify.com` (real client)
- ❌ `piroaccessories.myshopify.com` (real production — only for Sprint 5 beta install)

## Pilot clients

| # | Store | Status |
|---|---|---|
| 1 | Piro Jewelry (piroaccessories.myshopify.com) | ✅ Active, B2B running |
| 2 | TBD | Identify by Sprint 4 |
| 3 | TBD | Identify by Sprint 5 |

---

## Conventions for AI assistance

### When generating code
- TypeScript strict mode always
- Prefer functional components + hooks (no class components)
- Use Polaris components in admin, never custom CSS for admin layouts
- Theme App Extension blocks: vanilla JS / Web Components (no React inside themes)
- Database access: through a service layer (`app/services/`), never raw queries in route loaders

### When writing prose
- Spanish in chat with Jonatan unless he switches to English
- Code comments + documentation in English
- No emojis in code/files unless explicitly asked
- Commit messages: imperative English ("Add quick order form", not "Added")

### Security (inherited from global CLAUDE.md)
- Never commit credentials. `.gitignore` protects: `.env*`, `**/credentials/`, `**/token*.json`
- Before pushing to GitHub: run `git check-ignore` on any credential-shaped file
- Never use `gmail send` without explicit user "envía" in chat
- Always `gmail draft` first, show preview, wait for confirmation

---

## Naming history (don't relitigate)

These names were considered and discarded:
- **Tradeflow** — domain taken (tradeflow.com active)
- **Wholeflow** — wholeflow.com.au taken (different sector, risky brand collision)
- **Stockly** — ✅ chosen as working name (May 20, 2026). Final commercial name decision deferred to Month 3 when MVP is ready and brand identity work begins.

Decision logged in [docs/decisions/ADR-001-naming.md](./docs/decisions/ADR-001-naming.md).

---

## Key technical decisions (don't relitigate)

1. **Remix over Next.js** — Shopify officially recommends Remix; better App Bridge integration. See ADR-002.
2. **Supabase over self-hosted Postgres** — faster setup, free tier, branching for staging. See ADR-003.
3. **Vercel over Railway/Fly** — best DX for Remix, generous free tier. See ADR-003.
4. **Polaris React in admin, Liquid + Web Components in storefront** — Shopify's recommended split.
5. **`applicationLevel: ALL` is core IP** — the technical insight from Piro work is the foundation. Document and protect it.

---

## What's IN scope for MVP (v1.0)

1. Quick Order Form (bulk SKU table)
2. Volume Pricing display (tiers in real-time)
3. Branded Cart (replace generic Shopify cart for B2B)
4. Admin Configuration UI (tiers, branding, copy)
5. Custom Error Messages (replace Shopify generic errors)

## What's OUT of scope for MVP

- Multi-currency (use Shopify Markets)
- Multi-language i18n (English only v1)
- Mobile native apps
- Custom payment integrations
- Inventory management
- Quote system (Phase 2)
- Net 30/60 (Phase 2)
- Analytics (Phase 2)

---

## How to work on this project

### Starting a session
1. Read this file (CLAUDE.md)
2. Read [ROADMAP.md](./ROADMAP.md) — find current sprint
3. Check git status for in-progress work
4. Ask Jonatan: "¿Qué quieres atacar hoy?" if no clear direction

### Commits
- Conventional commits style: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
- One logical change per commit
- Push to `main` for now (solo founder, no branching ceremony until team grows)

### Documentation
- ADRs for any decision that's expensive to reverse → `docs/decisions/ADR-NNN-*.md`
- Sprint retros → `docs/sprints/sprint-N.md`
- User guides → `docs/user-guide/`

---

## Pointers to deeper docs

- [PROJECT.md](./PROJECT.md) — full plan, scope, market analysis
- [ROADMAP.md](./ROADMAP.md) — 10-week sprint plan
- [docs/01-market-research.md](./docs/01-market-research.md)
- [docs/02-positioning.md](./docs/02-positioning.md)
- [docs/03-features-mvp.md](./docs/03-features-mvp.md)
- [docs/04-tech-stack.md](./docs/04-tech-stack.md)
- [docs/05-business-model.md](./docs/05-business-model.md)
- [docs/06-competitive-landscape.md](./docs/06-competitive-landscape.md)

---

## Related work in Jonatan's filesystem

- **Piro Jewelry codebase:** `~/Documents/Workspace/Clients/pirojewelry.com/` — the source theme + customizations Stockly builds on
- **B2B auto-assign doc:** `~/Documents/Workspace/Clients/pirojewelry.com/08_wholesale/SOLUCION_AUTO_ASIGNACION_MARKET_B2B.md` — technical write-up of the `applicationLevel: ALL` solution
- **Shopify Admin CLI:** `shopify-admin` (in PATH) — for querying APIs. Store alias for Piro: `piro`.
- **Adspubli email skill:** `~/.claude/skills/adspubli-email/SKILL.md` — for sending branded client emails (use for pilot outreach)

---

## Open questions to resolve

- [ ] Final commercial name (defer to Month 3)
- [ ] Logo design (defer to Month 2)
- [ ] Pilot client #2 and #3 identification
- [ ] Pricing tiers final structure (validate with pilot interviews)
- [ ] App Store submission timeline (Month 9 vs 10)

---

**Bottom line for any Claude session:** This is a real product with real money on the line. The technical foundation exists (proven on Piro). The job now is to package it well, ship pilots fast, and prepare for App Store distribution. Move fast, don't over-engineer, ship something Heriberto + 2 more clients are paying for by Month 4.
