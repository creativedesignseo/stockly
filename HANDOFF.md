# 🤝 HANDOFF — Resume work hands-off

> **Read this file first** if you're starting a fresh session on Stockly.
> This is the single source of truth for current state and resume instructions.

**Last updated:** May 20, 2026 — Sprint 1 in progress
**Last commit:** `4ac6a9d` — "feat(sprint-1): App Proxy context endpoint"
**GitHub:** https://github.com/creativedesignseo/stockly
**CI:** ✅ Passing (lint + typecheck + build)

---

## 🎯 What is this project?

**Stockly** — a premium-positioned Shopify App for B2B wholesale on Basic/Grow stores. Working name (commercial brand TBD at Month 3).

If you're confused on context, read in this order:
1. [README.md](./README.md) — 60-second overview
2. [PROJECT.md](./PROJECT.md) — full plan
3. [CLAUDE.md](./CLAUDE.md) — AI co-pilot conventions
4. [ROADMAP.md](./ROADMAP.md) — 10-week sprint plan

---

## 📍 Current state — Sprint 1 🟡 IN PROGRESS

### Sprint 0 ✅ done (foundation)
- Repo + GitHub + CI (lint + typecheck + build all green)
- Shopify Remix scaffold integrated
- App installed on `desarrollo-adspubli.myshopify.com`
- OAuth + GraphQL Admin API verified

### Sprint 1 — what's shipped so far
- ✅ Domain models (`Shop`, `Tier`, `WholesaleCustomer`) + migration applied
- ✅ Service layer (`tiers`, `shops`, `wholesale-customers`)
- ✅ Auth wrapper that auto-creates Shop row on first install
- ✅ Admin UI: `/app/tiers` list + `/app/tiers/new` create form (Polaris)
- ✅ App Proxy endpoint `/apps/stockly/context` (eligibility + branding + copy + tiers in one call)
- ✅ Dependency conflict fix (pinned `@shopify/shopify-api` to 13.0.0)
- ✅ GitHub Actions CI (lint + typecheck + build)

### Sprint 1 — what's still needed (next steps)
1. **Theme App Extension scaffold** — run `shopify app generate extension` (interactive CLI)
2. **Quick Order Form block** — Liquid + Web Component, calls App Proxy + Storefront API
3. **Edit tier route** (`/app/tiers/:id`) + delete action
4. **Seed dev store** — 10 products + 1 wholesale-tagged customer + page with block
5. **Unit tests for `resolveTier`** — core business logic deserves coverage

---

## ⏯️ Resume marker — pick up here

The session that left this handoff (May 20, 2026 evening) was working
in a different repo folder (Piro Jewelry) and just moved to this one
to keep the project context properly scoped.

**Immediate next action when you resume:**

```bash
cd /Users/aimac/Documents/Workspace/Clients/stockly
# If npm run dev is not running:
npm run dev
# Then in another terminal:
shopify app generate extension
#   → choose: Theme app extension
#   → name: quick-order-form
```

After the extension is scaffolded, you (or the next Claude session)
should:
1. Implement the Liquid block in `extensions/quick-order-form/blocks/`
2. Add a Web Component asset that fetches `/apps/stockly/context`
3. Render the table with tier-aware totals
4. Seed the dev store with test products + a customer tagged `wholesale`
5. Embed the block on a page `/pages/wholesale-order`

See [docs/sprints/sprint-1-log.md](./docs/sprints/sprint-1-log.md)
for the full deliverable checklist.

---

## 🔌 Resume from a fresh terminal (zero state)

```bash
# 1. Clone (if on a new machine)
git clone https://github.com/creativedesignseo/stockly.git
cd stockly

# 2. Install deps (~5 min, ~700MB)
npm install

# 3. Generate Prisma client
npx prisma generate

# 4. Apply migrations
npx prisma migrate deploy

# 5. Start dev — opens browser for Partner login on first run
npm run dev
```

When prompted:
- **Store:** select `desarrollo-adspubli.myshopify.com` (NEVER pick adspubli or hotel-us — those are real)
- **App link:** select existing app "Stockly" in Partner Dashboard (if it already exists)

After it's running, press `p` in the terminal to open the app preview in the dev store admin.

---

## 🔐 Where the secrets live (NOT in this repo)

Nothing sensitive is committed. The Shopify CLI manages secrets locally:

| What | Where | Notes |
|---|---|---|
| `client_secret` | macOS Keychain (managed by Shopify CLI) | Never visible in files. Persists across sessions. |
| OAuth access tokens | `prisma/dev.sqlite` (local only, gitignored) | Per-shop session storage. Regenerated on install. |
| `.shopify/` folder | Local only (gitignored) | CLI cache, tunnel state. Regenerable. |
| `client_id` | `shopify.app.toml` (committed) | **Public** identifier — safe to commit. |
| Partner account access | Browser session for Shopify Partners | Login at https://partners.shopify.com |

**If the dev machine is lost:** clone the repo, run `npm install` + `npm run dev`, log into Partners again. Everything regenerates. **Zero recovery work needed beyond a fresh Partner login.**

---

## 🚦 Safety / what NOT to do

| Don't | Why |
|---|---|
| Don't install on `adspubli.myshopify.com` | Real agency store |
| Don't install on `hotel-us.myshopify.com` | Real client store |
| Don't install on `piroaccessories.myshopify.com` until Sprint 5 | Real Piro production |
| Don't `npm audit fix --force` | Will break Shopify deps; revisit at Sprint 5 |
| Don't change `shopify.app.toml` `client_id` manually | Shopify CLI manages this; manual edits break OAuth |
| Don't commit `.env`, `.shopify/`, `dev.sqlite`, `node_modules/` | Already gitignored — keep it that way |

---

## 💼 Business context (5-second version)

- **Owner:** Jonatan Montilla (Adspubli, Barcelona)
- **Phase 1 goal:** 3 pilot clients × $4-5k setup + $300-500/mo by Month 4
- **Phase 1 pilot #1:** Piro Jewelry (already running custom B2B — they're the case study)
- **Phase 2 goal:** Public app on Shopify App Store, $39-149/mo pricing
- **24-month conservative target:** $216k ARR (300 clients × $60 ARPU)
- **Shopify revenue share:** 0% on first $1M/year, 15% above

---

## 📦 GitHub repo structure (what's backed up)

```
stockly/
├── HANDOFF.md ← you are here
├── README.md            • PROJECT.md         • ROADMAP.md         • CLAUDE.md
├── app/                 ← Remix routes + business logic
├── extensions/          ← Theme App Extensions (empty, ready)
├── prisma/              ← schema + migrations (SQLite for now)
├── public/              ← static assets
├── docs/
│   ├── 00-sprint-0-setup.md       ← setup guide
│   ├── 01-market-research.md      ← $32.1T B2B market analysis
│   ├── 02-positioning.md          ← premium luxury brand angle
│   ├── 03-features-mvp.md         ← F1-F5 with acceptance criteria
│   ├── 04-tech-stack.md           ← Remix + Polaris + Supabase + Vercel
│   ├── 05-business-model.md       ← $216k-600k ARR projections
│   ├── 06-competitive-landscape.md ← BSS, B2B Hub, SparkLayer analysis
│   ├── scaffold-reference.md      ← original Shopify Remix README
│   ├── decisions/
│   │   ├── ADR-001-naming.md      ← "Stockly" working name
│   │   ├── ADR-002-framework.md   ← Remix > Next.js
│   │   └── ADR-003-hosting.md     ← Vercel + Supabase
│   └── sprints/
│       └── sprint-0-log.md        ← every command + decision today
├── shopify.app.toml     ← Shopify app config (client_id PUBLIC, safe)
├── shopify.web.toml     ← Remix web config
├── package.json         ← deps + scripts
├── tsconfig.json        • vite.config.ts     • .eslintrc.cjs
├── .gitignore           ← protects node_modules, .env, .shopify/, *.sqlite
└── .vscode/             ← shared editor settings (extensions, MCP hints)
```

---

## 🆘 If something breaks

1. **`npm run dev` fails on first run:** delete `.shopify/` folder, retry
2. **OAuth loop:** uninstall app from dev store admin, run `npm run dev` again
3. **Prisma errors:** `npx prisma generate && npx prisma migrate deploy`
4. **Lost track of state:** read this HANDOFF.md + the most recent `docs/sprints/sprint-N-log.md`
5. **Don't know where to start:** check `git log --oneline` for the last 5 commits, then read `ROADMAP.md` for current sprint

---

## 📞 Contact

- **Owner:** Jonatan Montilla — info@adspubli.com
- **Repo:** https://github.com/creativedesignseo/stockly (private, Adspubli IP)
- **Partner Dashboard:** https://partners.shopify.com (Jonatan's login)

---

**Remember:** this is Adspubli's IP. The technical insight (`applicationLevel: ALL` workaround proven on Piro Jewelry) is the foundation of the entire product. Move fast, ship to pilots, prepare for App Store.
