# 🤝 HANDOFF — Resume work hands-off

> **Read this file first** if you're starting a fresh session on Stockly.
> This is the single source of truth for current state and resume instructions.

**Last updated:** May 20, 2026 — End of Sprint 0
**Last commit:** `d1f0666` — "docs: close Sprint 0 — foundation complete"
**GitHub:** https://github.com/creativedesignseo/stockly

---

## 🎯 What is this project?

**Stockly** — a premium-positioned Shopify App for B2B wholesale on Basic/Grow stores. Working name (commercial brand TBD at Month 3).

If you're confused on context, read in this order:
1. [README.md](./README.md) — 60-second overview
2. [PROJECT.md](./PROJECT.md) — full plan
3. [CLAUDE.md](./CLAUDE.md) — AI co-pilot conventions
4. [ROADMAP.md](./ROADMAP.md) — 10-week sprint plan

---

## 📍 Current state — Sprint 0 ✅ COMPLETE

### What's working right now
- ✅ Repo + GitHub remote
- ✅ Shopify Remix scaffold integrated (Remix 2.x + TypeScript + Polaris + Prisma SQLite)
- ✅ App installed on dev store `desarrollo-adspubli.myshopify.com`
- ✅ OAuth + GraphQL Admin API verified (productCreate mutation tested → "Red Snowboard" created)
- ✅ Cloudflare tunnel + HMR + webhooks all green

### What's next — Sprint 1 (Quick Order Form, weeks 2-3)
See [docs/03-features-mvp.md F1](./docs/03-features-mvp.md#f1--quick-order-form) for full spec.

Suggested order of work for Sprint 1:
1. Extend `prisma/schema.prisma` with custom models: `Shop`, `Tier`, `WholesaleCustomer`
2. Run `shopify app generate extension` → Theme App Extension named `quick-order-form`
3. Create API endpoint `app/routes/api.products.tsx` (returns customer-eligible products)
4. Build Liquid block + Web Component for the table UI
5. Seed dev store: 10 test products + 1 customer tagged `wholesale`

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
