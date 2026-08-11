# Data Loss Prevention Strategy — Stockly

**Owner:** Jonatan Montilla, Adspubli (Barcelona, Spain)
**Version:** 1.0 — 2026-08-11
**Review cadence:** annually, or after any restore

Satisfies Shopify's Level 2 protected-customer-data requirements
*"Have a data loss prevention strategy"*, *"Encrypt your data backups"* and
*"Keep an access log to protected customer data"*
([requirements](https://shopify.dev/docs/apps/launch/protected-customer-data)).

---

## 1. What we are protecting

| Data | Where | Sensitivity |
|---|---|---|
| Wholesale applications (name, email, phone, company, tax ID) | `Application.responses` + `Application.email`, PostgreSQL | **Personal data** |
| Wholesale customers (Shopify customer id, email) | `WholesaleCustomer`, PostgreSQL | **Personal data** |
| Shopify OAuth sessions (access + refresh tokens) | `Session`, PostgreSQL | **Credentials** |
| Shop configuration, pricing tiers, registration forms | PostgreSQL | Business data |
| Application source code | GitHub | No personal data |

Stockly does not store payment details, shipping addresses, or order
contents.

## 2. Preventing loss

**Encryption.** Railway encrypts all stored data at rest at the storage
layer, and all connections use TLS in transit. Backups inherit the same
storage-level encryption. The database is reachable only over Railway's
private network (`postgres.railway.internal`); the public URL is used solely
for administrative operations from a trusted machine.

**Destructive-change protection.** Railway's pre-deploy hook
(`railway.json`) runs `npx prisma db push --skip-generate` **without**
`--accept-data-loss`. This is deliberate: any schema change that would drop
or truncate data aborts the deploy instead of executing. The old deployment
keeps serving. This has been exercised in production — see HANDOFF's
2026-08-05 entry.

**Cascade deletes are scoped, not global.** `Shop` deletion cascades to its
own `Tier`, `WholesaleCustomer`, `Application` and session rows only. One
merchant's data cannot be removed by another's uninstall.

**Verification before deploy.** `scripts/verify.sh` (lint, typecheck, unit
tests, extension fixtures, both builds) must pass before any deploy. Pricing
and checkout code additionally requires passing fixtures.

**Least-privilege access.** Production database credentials live only in
Railway's service variables and are never committed. `.gitignore` covers
`.env*`, credential files and tokens.

## 3. Backup and restore

**Backups.** Railway automatically snapshots the attached volume before every
deployment of the Postgres service. Snapshots reside on encrypted storage.

**Restore procedure** (from the Railway dashboard → project
`adequate-learning` → service `Postgres` → volume `postgres-volume`):

1. Stop the `stockly` service so nothing writes during the restore.
2. Select the snapshot to restore from and confirm.
3. Verify integrity before resuming traffic:
   ```bash
   railway run --service Postgres -- sh -c \
     'npx prisma migrate diff --from-url "$DATABASE_PUBLIC_URL" \
      --to-schema-datamodel prisma/schema.prisma --script'
   ```
   An empty result means the restored schema matches the code.
4. Restart `stockly` and confirm `/healthz` returns 200.
5. Record the restore in `progress/` with the reason and the snapshot used.

**⚠️ Restore drill — OUTSTANDING.** The restore path above is documented from
Railway's behaviour but has **not yet been exercised** on this project. A
backup you have never restored is a hypothesis, not a control. Schedule one
drill against a non-production database and record the result here. Until
that is done, this document states the intent accurately but the control is
unproven.

## 4. Access logging

Every read and write of protected customer data is recorded in
`ProtectedDataAccessLog` (see `prisma/schema.prisma` and
`app/services/access-log.server.ts`). Each entry captures: the shop, the
actor, the action, which customer record, which field categories, and when.

Entries are written for: wholesale application submissions, merchant views of
the application queue, approvals and releases, GDPR data-request and
redaction webhooks, and the customer-update webhook.

The log never stores the personal data itself — only the fact of access, the
record's identifier, and the field categories touched. It is therefore safe
to retain past a redaction request, which is what makes it usable as an audit
trail.

## 5. Retention

Personal data is retained only while the app is installed on the merchant's
store. Deletion is automatic and immediate through the three mandatory
Shopify privacy webhooks, all HMAC-verified:

| Webhook | Effect |
|---|---|
| `customers/data_request` | Returns the stored records for the data subject |
| `customers/redact` | Hard-deletes the customer's rows in a transaction |
| `shop/redact` | Deletes the `Shop` row, cascading to all related data |

There is no soft-delete and no archive: redaction removes the rows.

## 6. Environment separation

Development and production **must not** share a database. Configuration and
current state are tracked in `docs/security/environment-separation.md`.

## 7. Known limitations, stated honestly

1. **The restore drill has not been performed** (§3). This is the most
   important open item in this document.
2. **7-day log retention** on Railway's Hobby plan limits how far back a
   forensic reconstruction can go. The `ProtectedDataAccessLog` table is not
   subject to this limit — it lives in the database — but Railway's service
   and deploy logs are.

   **One deliberate exception:** the `gdpr.shop_redact` entry cascades away
   with the `Shop` row it belongs to. That is correct — nothing about a
   redacted shop should survive — but it means the only durable record of a
   shop redaction is the host console log, which *is* subject to the 7-day
   limit. Accepted as the price of honouring the redaction fully.
3. **Single region, single replica.** No geographic redundancy. A prolonged
   Railway `sfo` outage means downtime, not data loss (the volume persists),
   but it is a real availability limitation.
