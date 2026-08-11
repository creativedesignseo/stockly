# Test / Production Data Separation — Stockly

**Owner:** Jonatan Montilla, Adspubli
**Version:** 1.0 — 2026-08-11

Satisfies Shopify's Level 2 protected-customer-data requirement
*"Keep test and production data separate"*
([requirements](https://shopify.dev/docs/apps/launch/protected-customer-data)).

---

## Current state — COMPLIANT as of 2026-08-11

Two separate Railway PostgreSQL services. Verified by querying production
directly after the migration:

```
Production database — Shop rows:
  piroaccessories.myshopify.com       ← the only shop. Real merchant.
  (wholesale customers: 5, intact)
```

Development runs against its own database (`Postgres-v-W2`, reachable through
a dedicated TCP proxy) configured in the local, git-ignored `.env`.

### How it was before, and why it mattered

Until 2026-08-11 a single database served both. The development store's data
sat alongside a live merchant's customer records — the exact condition this
requirement exists to prevent.

Nobody chose it: development ran against a Partner development store for
months, and when the pilot merchant was installed the app pointed at the same
backend and therefore the same database. It was inherited, then found while
answering Shopify's declaration honestly.

### What the migration actually removed

Small, and verified before deleting: 1 registration form and 1 session
belonging to `desarrollo-adspubli.myshopify.com`. **Zero customer records** —
that store had no wholesale customers or applications. Piro's 5 wholesale
customers were counted before and after and were untouched.

---

## Target state

Two separate PostgreSQL databases, never sharing a connection string:

| Environment | Shopify app | Database | Store |
|---|---|---|---|
| Development | `stockly` custom app (`fbc28fda…`) or `shopify app dev` | **New** dev Postgres | `desarrollo-adspubli.myshopify.com` |
| Production | Public app (`40128ca5…`) once approved; Piro custom app (`b530543e…`) meanwhile | Existing Postgres | Real merchant stores |

## Migration plan

Ordered so production is never at risk. Each step is reversible until step 4.

**1. Create the development database.**
Railway dashboard → project `adequate-learning` → **+ New** → Database →
PostgreSQL. Name it distinguishably (e.g. `Postgres-dev`). This is additive:
it does not touch the existing service.

**2. Point local development at it.**
Put the new database's `DATABASE_PUBLIC_URL` in the local `.env` as
`DATABASE_URL`. Never commit it — `.gitignore` already covers `.env*`.
Initialise the schema:
```bash
npx prisma db push
```
Against the **development** database only. Confirm the target before running:
a `db push` aimed at the wrong database is exactly the accident this whole
document exists to prevent.

**3. Remove the development store's data from production.**
Once development runs on its own database, `desarrollo-adspubli.myshopify.com`
has no business being in the production one. Delete that `Shop` row; the
cascade removes its tiers, customers and applications.

⚠️ **Take a snapshot first** (see `data-loss-prevention.md` §3) and verify
afterwards that only real merchant shops remain. This is the one destructive
step in the plan, and it touches the same database as a live merchant.
It must be done deliberately, not casually.

**4. Update the declaration.**
Partners → Stockly (public app) → Solicitudes de acceso a la API → Acceso a
datos protegidos del cliente → change *"¿Separas los datos de prueba y de
producción?"* to **Sí**, and save.

Do not change that answer before step 3 is done and verified. The answer must
be true when it is given.

## Ongoing rule

**Development never connects to the production database.** Not "just to
check", not read-only. If production data is genuinely needed for debugging,
query it through a deliberate, read-only, logged path — never by pointing the
development environment at it.

## Status

- [x] Step 1 — development database created (`Postgres-v-W2`, TCP proxy enabled)
- [x] Step 2 — local `.env` repointed, schema initialised with `prisma db push`
- [x] Step 3 — development store's data removed from production, verified
- [x] Step 4 — Shopify declaration updated to "Sí"

Completed 2026-08-11. The answer given to Shopify is now true.
