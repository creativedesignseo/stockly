# Sprint 0 — Setup guide

This guide explains how to get a working dev environment from a fresh clone.

---

## Prerequisites

- Node.js `>=20.19 <22 || >=22.12` (check: `node --version`)
- npm >=10 (check: `npm --version`)
- Shopify CLI installed globally (check: `shopify version`)
- A Shopify Partner account (free: https://partners.shopify.com)
- A Shopify development store (create via Partner Dashboard)

---

## First-time setup

```bash
# 1. Clone repo
git clone https://github.com/creativedesignseo/stockly.git
cd stockly

# 2. Install deps (~5 min, ~700MB)
npm install

# 3. Generate Prisma client (creates app/.prisma/)
npx prisma generate

# 4. Apply database migrations (creates prisma/dev.sqlite locally)
npx prisma migrate deploy
```

---

## Connecting to Shopify Partner

The local `shopify.app.toml` has a `client_id` (`fbc28fda…`) that was generated during scaffold but is **not yet linked to a real Partner app**. First time you run `npm run dev`, the CLI will:

1. Open a browser to login to Shopify Partners
2. Ask you to **either** select an existing app **or** create a new one
3. Update `shopify.app.toml` with the real `client_id` and tunnel URLs
4. Create a `.env` file locally with `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`

```bash
npm run dev
# → browser opens → Partner login → select/create app → done
```

> ⚠️ The first `npm run dev` is the only interactive step. After that, `npm run dev` just starts the local server + tunnel.

---

## Project structure (from scaffold)

```
stockly/
├── app/                     # Remix routes + business logic
│   ├── routes/
│   │   ├── _index/          # Public landing
│   │   ├── app._index.tsx   # Embedded admin home
│   │   ├── app.additional.tsx
│   │   ├── app.tsx          # Layout for embedded admin
│   │   ├── auth.$.tsx       # OAuth catch-all
│   │   ├── auth.login/      # Login UI
│   │   └── webhooks.app.*.tsx
│   ├── db.server.ts         # Prisma client export
│   ├── entry.server.tsx     # Remix SSR entry
│   ├── root.tsx             # Remix root
│   ├── routes.ts            # Manual route config
│   └── shopify.server.ts    # Shopify app config (sessions, auth)
├── extensions/              # Theme App Extensions (empty for now)
├── prisma/
│   ├── schema.prisma        # SQLite default — swap to Postgres at Sprint 5
│   └── migrations/
├── public/                  # Static assets
├── shopify.app.toml         # Shopify app config (scopes, webhooks)
├── shopify.web.toml         # Remix web config
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Useful commands

```bash
npm run dev              # Start dev server + tunnel
npm run build            # Production build
npm run lint             # ESLint
npm run setup            # Prisma generate + migrate deploy

shopify app generate     # Generate new extension (e.g. theme block)
shopify app deploy       # Deploy app + extensions to Shopify
shopify app config link  # Link to existing Partner app
shopify app config use   # Switch between configs
```

---

## Database migration plan

**Current (Sprint 0-4):** SQLite via Prisma. Fast iteration, zero setup.

**Sprint 5:** Migrate to Supabase Postgres for production.

Migration checklist (do at Sprint 5):
- [ ] Create Supabase project (free tier)
- [ ] Update `prisma/schema.prisma` datasource to `postgresql`
- [ ] Change `url = "file:dev.sqlite"` → `url = env("DATABASE_URL")`
- [ ] Add `DATABASE_URL` to `.env` (Supabase pooled connection string)
- [ ] Run `npx prisma migrate dev --name init_postgres`
- [ ] Update Vercel env vars
- [ ] Test session storage in Postgres

---

## Troubleshooting

### `npm run dev` fails with "App not found"
Run `npm run config:link` first to link this repo to an existing Partner app, or create a new one in the Partner Dashboard.

### Browser doesn't open on first dev
Ensure default browser is set. Or copy the URL from terminal manually.

### "Cannot find module" errors
Re-run `npm install` and `npx prisma generate`.

### SQLite locked
Stop all running `npm run dev` instances. Delete `prisma/dev.sqlite-journal` if present.

---

## Next steps after setup

1. ✅ Repo cloned, deps installed
2. ✅ `npm run dev` works locally
3. ⏭️ Move to Sprint 1 — see [ROADMAP.md](../ROADMAP.md)
