# Sprint 0 — Setup log

**Sprint dates:** May 20, 2026 (single day setup)
**Status:** ✅ Complete

This log captures every command, decision, and prompt during the Sprint 0 foundation setup, so it can be replicated exactly.

---

## Timeline of actions

### 1. Repository creation (✅ done)

```bash
mkdir -p /Users/aimac/Documents/Workspace/Clients/stockly
cd /Users/aimac/Documents/Workspace/Clients/stockly
git init -b main
```

### 2. Planning docs created (✅ done)

Files written at root:
- `README.md` — one-pager
- `PROJECT.md` — full project plan
- `ROADMAP.md` — 10-week sprint plan
- `CLAUDE.md` — AI co-pilot memory
- `.gitignore` — Node + Shopify + credentials

Files in `docs/`:
- `01-market-research.md`
- `02-positioning.md`
- `03-features-mvp.md`
- `04-tech-stack.md`
- `05-business-model.md`
- `06-competitive-landscape.md`

ADRs in `docs/decisions/`:
- `ADR-001-naming.md` — Stockly chosen as working name
- `ADR-002-framework.md` — Remix over Next.js
- `ADR-003-hosting.md` — Vercel + Supabase

### 3. First commit + GitHub push (✅ done)

```bash
git add .gitignore README.md PROJECT.md ROADMAP.md CLAUDE.md docs/
git commit -m "chore: initial project foundation"
# commit: ba4cead
```

```bash
gh repo create stockly --private --source=. --remote=origin \
  --description "Premium B2B wholesale Shopify app for Basic/Grow stores. Adspubli IP." \
  --push
# URL: https://github.com/creativedesignseo/stockly
```

### 4. Shopify Remix scaffold (✅ done)

Used a temp directory + selective merge to keep our planning docs intact.

```bash
mkdir -p /tmp/stockly-scaffold-workdir
cd /tmp/stockly-scaffold-workdir
npm create -y @shopify/app@latest -- \
  --name stockly \
  --template remix \
  --flavor typescript \
  --package-manager npm
```

Scaffold produced `/tmp/stockly-scaffold-workdir/stockly/` with:
- Remix 2.x + TypeScript + Vite
- @shopify/shopify-app-remix 4.1.0
- @shopify/polaris 12.0.0
- @shopify/app-bridge-react 4.1.6
- Prisma 6.2.1 + SQLite
- ESLint, Prettier, EditorConfig
- Dockerfile, .vscode/ shared settings

Merge (excluding `.git/`, `node_modules/`, `README.md`, `CHANGELOG.md`, `.shopify/`):

```bash
rsync -av \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='README.md' \
  --exclude='CHANGELOG.md' \
  --exclude='.shopify/' \
  --exclude='.gitignore' \
  /tmp/stockly-scaffold-workdir/stockly/ \
  /Users/aimac/Documents/Workspace/Clients/stockly/

# Saved scaffold README as reference
cp /tmp/stockly-scaffold-workdir/stockly/README.md \
   /Users/aimac/Documents/Workspace/Clients/stockly/docs/scaffold-reference.md
```

Merged Shopify-specific `.gitignore` patterns into ours:
- `/public/_dev`
- `/extensions/*/dist`
- `.shopify.lock`
- Allowed `.vscode/extensions.json` + `.vscode/mcp.json` (committed)

### 5. `npm install` (✅ done)

```bash
cd /Users/aimac/Documents/Workspace/Clients/stockly
npm install
```

Result: 1,131 packages installed, 731MB in `node_modules` (gitignored).
35 vulnerabilities (6 moderate, 29 high) — deep-tree deps from Shopify template, known/accepted at this stage. To revisit Sprint 5.

### 6. Second commit + push (✅ done)

```bash
git add .gitignore .dockerignore .editorconfig .eslintignore .eslintrc.cjs \
  .graphqlrc.ts .npmrc .prettierignore .vscode/ Dockerfile app/ \
  docs/00-sprint-0-setup.md docs/scaffold-reference.md env.d.ts extensions/ \
  package-lock.json package.json prisma/ public/ shopify.app.toml \
  shopify.web.toml tsconfig.json vite.config.ts

git commit -m "feat: scaffold Shopify Remix app (Sprint 0)"
# commit: 4e8bfe2

git push origin main
```

### 7. Cleanup (✅ done)

```bash
rm -rf /tmp/stockly-scaffold-workdir
```

### 8. First `npm run dev` — Partner login (🟡 in progress)

```bash
cd /Users/aimac/Documents/Workspace/Clients/stockly
npm run dev
```

Shopify CLI prompts:

#### Prompt 1: "Which store would you like to use to view your project?"

**Choices presented:**
- Adspubli (adspubli.myshopify.com) — production-ish, ❌ avoid
- hotel-us (hotel-us.myshopify.com) — real client store, ❌ avoid
- **desarrollo-adspubli (desarrollo-adspubli.myshopify.com)** — ✅ **chosen** (dev store)

**Decision:** Use `desarrollo-adspubli` for all Sprint 0-5 dev work.
Production install on Piro is Sprint 5 beta only.

#### Prompt 2+: completed

After selecting `desarrollo-adspubli`, the CLI:
1. Linked to existing Partner app (client_id `fbc28fda2161d2fc40037b0d211b83c9` from scaffold)
2. Auto-granted scope `write_products`
3. Created Cloudflare tunnel (random URL per session, e.g. `wine-adjustment-currently-meeting.trycloudflare.com`)
4. Ran Prisma migrations (`create_session_table` applied to fresh `dev.sqlite`)
5. Reinstalled app on `desarrollo-adspubli.myshopify.com`
6. Fired `APP_UNINSTALLED` webhook on the previous install → handler responded 200 ✅
7. Started Remix dev server on `http://localhost:60799/`
8. Showed interactive menu: (p) preview, (g) GraphiQL, (d) status, (q) quit

#### Verification on first dev run

- ✅ App admin loads in browser via Preview URL
- ✅ Webhooks handlers reachable
- ✅ Local DB seeded with session table
- ✅ Cloudflare tunnel forwarding traffic

---

## Final end-to-end test (productCreate)

Clicked "Generate a product" in the embedded admin.

**Result:**
```json
{
  "id": "gid://shopify/Product/10067333054792",
  "title": "Red Snowboard",
  "handle": "red-snowboard",
  "status": "ACTIVE",
  "variants": {
    "edges": [
      {
        "node": {
          "id": "gid://shopify/ProductVariant/53138388451656",
          "price": "0.00",
          "barcode": null,
          "createdAt": "2026-05-20T19:24:20Z"
        }
      }
    ]
  }
}
```

This proves:
- OAuth flow grants a valid token
- Admin GraphQL API call from the Remix loader succeeds
- Product mutation executes in the dev store
- Polaris UI renders the JSON response

The "Red Snowboard" product now lives in `desarrollo-adspubli.myshopify.com` → Products. Harmless to leave or delete (cleanup test data periodically).

---

## Sprint 0 exit checklist

- [x] Repo initialized + GitHub `creativedesignseo/stockly` (private)
- [x] Planning docs + ADRs committed
- [x] Shopify Remix scaffold integrated + committed
- [x] `npm install` successful (1131 packages)
- [x] Dev store `desarrollo-adspubli` selected
- [x] First `npm run dev` successful
- [x] Cloudflare tunnel active
- [x] Prisma migrations applied to `dev.sqlite`
- [x] Webhooks register + APP_UNINSTALLED handler responded 200
- [x] App appears in dev store sidebar under "Apps" → "stockly"
- [x] Embedded admin renders default Remix template page
- [x] Polaris + App Bridge confirmed working
- [x] Dev Console + Web/Mobile previews available

## Items deferred to later sprints

- [ ] Seed dev store with test products + wholesale-tagged customer (Sprint 1)
- [ ] GitHub Actions CI (lint + typecheck) — Sprint 1 nice-to-have
- [ ] Address 35 npm audit vulnerabilities (Sprint 5)
- [ ] Swap Prisma datasource SQLite → Postgres (Sprint 5)

---

## Lessons learned (for future sprint setups)

1. **Scaffold to temp first** — never directly into existing repo. Avoids `.git/` collision and README conflict.
2. **Allow `.vscode/`** — Shopify ships project-level settings worth committing.
3. **Document scaffold prompts** — they're interactive; capturing them lets next dev/Claude session reproduce.
4. **Use dev store, not production** — non-negotiable for app development.
5. **`shopify.app.toml` client_id is PUBLIC** — safe to commit. Client_secret is stored separately by CLI in OS keychain.

---

**Next:** finish `npm run dev` flow → seed test data → close Sprint 0.
