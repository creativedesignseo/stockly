# Test / Production Data Separation — Stockly

**Owner:** Jonatan Montilla, Adspubli
**Version:** 1.0 — 2026-08-11

Satisfies Shopify's Level 2 protected-customer-data requirement
*"Keep test and production data separate"*
([requirements](https://shopify.dev/docs/apps/launch/protected-customer-data)).

---

## Current state — NOT COMPLIANT (2026-08-11)

One Railway PostgreSQL database serves both environments. Verified by
querying production directly:

```
Shop rows:
  desarrollo-adspubli.myshopify.com   ← development store
  piroaccessories.myshopify.com       ← REAL merchant, real customers
```

The development store's data sits in the same database as a live merchant's
customer records. That is the exact condition the requirement exists to
prevent, and it is why the protected-customer-data declaration currently
answers "No" to this question.

**How it happened:** development ran against a Partner development store for
months. When the pilot merchant was installed on 2026-08-11, the app pointed
at the same backend and therefore the same database. Nobody chose this; it
was inherited.

**Risk today, stated plainly:** low but real. A destructive query or migration
run "against dev" hits the same database that holds a real merchant's data.
There is no technical barrier — only care.

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

- [ ] Step 1 — development database created
- [ ] Step 2 — local environment repointed and schema initialised
- [ ] Step 3 — development store's data removed from production
- [ ] Step 4 — Shopify declaration updated to "Sí"

Until every box is ticked, the honest answer to Shopify's question remains
**No**.
