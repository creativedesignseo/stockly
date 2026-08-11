# Security Incident Response Policy — Stockly

**Owner:** Jonatan Montilla, Adspubli (Barcelona, Spain)
**Contact:** info@adspubli.com
**Version:** 1.0 — 2026-08-11
**Review cadence:** annually, or after any incident

Satisfies Shopify's Level 2 protected-customer-data requirement
*"Implement a security incident response policy"*
([requirements](https://shopify.dev/docs/apps/launch/protected-customer-data)).

---

## 1. Scope

This policy covers any event that compromises, or may compromise, the
confidentiality, integrity or availability of personal data belonging to
merchants' customers that Stockly processes.

Personal data in scope, and nothing beyond it: **name, email address, phone
number**, plus merchant-defined business fields submitted through the
wholesale registration form (company name, tax ID, country). Stockly does
not process payment details, addresses, or order contents.

Systems in scope:

| System | Role | Provider |
|---|---|---|
| Stockly application | Processes and serves the data | Railway (region `sfo`) |
| PostgreSQL database | Stores it | Railway managed Postgres |
| Shopify Admin API | Source and destination of customer records | Shopify |
| GitHub repository | Source code (no personal data) | GitHub |

## 2. What counts as an incident

Anything on this list is an incident and starts the process in §4:

- Unauthorised access to the production database or the Railway account.
- Leak or exposure of `SHOPIFY_API_SECRET`, `DATABASE_URL`, or any Railway
  or Shopify Partner credential.
- Personal data sent to an unintended recipient.
- Data loss or corruption not recoverable from the latest backup.
- A vulnerability in Stockly's code that exposes one merchant's customer
  data to another merchant (cross-tenant leakage).
- A dependency vulnerability with a known exploit affecting a path that
  touches personal data.
- Prolonged unavailability caused by a suspected attack.

A merchant uninstalling, a failed deploy, or ordinary downtime is **not** an
incident under this policy.

## 3. Roles

Adspubli is a one-person operation. Jonatan Montilla is the sole responder
and the decision-maker for merchant and authority notification. There is no
on-call rotation; response begins when the incident is noticed.

This is stated plainly rather than dressed up: the practical consequence is
that detection depends on monitoring and merchant reports, not on 24/7
staffing. Section 8 addresses that limitation honestly.

## 4. Response procedure

**Step 1 — Contain (immediately, before investigating).**
- Suspected credential leak → rotate it now. `SHOPIFY_API_SECRET` rotates in
  the Shopify Dev Dashboard (app → Configuración → Rotar); the new value must
  be written to Railway's `stockly` service variables and the service
  redeployed. Database credentials rotate from the Railway dashboard.
- Suspected active intrusion → take the service offline rather than leave it
  serving. Availability loss is preferable to continued exposure.

**Step 2 — Assess (same day).**
Determine and write down: what data, whose data, how many people, when it
started, whether it is still ongoing, and how it was discovered.

**Step 3 — Notify.**
- **Merchants affected** — without undue delay, and no later than **72
  hours** from becoming aware. Merchants are the data controllers; they need
  this to meet their own obligations to their customers.
- **Shopify** — through the Partner Dashboard, for any incident involving
  protected customer data obtained through Shopify APIs.
- **Supervisory authority** — under GDPR Art. 33, within **72 hours** of
  becoming aware, unless the breach is unlikely to result in a risk to the
  rights and freedoms of the individuals. Adspubli is established in Spain,
  so the authority is the **AEPD** (Agencia Española de Protección de Datos).
- **Affected individuals** — under GDPR Art. 34, when the breach is likely to
  result in a **high** risk to them. The merchant, as controller, normally
  makes this communication; Adspubli supports it with the facts.

**Step 4 — Remediate.**
Fix the root cause. Ship the fix through the normal verification pipeline
(`scripts/verify.sh`) — an incident is not a reason to skip tests, and rushed
fixes cause second incidents.

**Step 5 — Record.**
Write an entry in `progress/YYYY-MM-DD-incident-<slug>.md` with: timeline,
data affected, root cause, actions taken, notifications made and when, and
what changes prevent a recurrence. This record is what turns an incident into
an improvement.

## 5. Detection

- Railway service logs and deploy logs (7-day retention on the current Hobby
  plan — a known limitation, see §8).
- Railway's own alerting on service failure.
- Shopify Partner Dashboard webhook error rates and API health.
- Merchant reports through info@adspubli.com.

## 6. Evidence preservation

Do not delete logs, database rows, or deployments while an incident is open,
even when they look like the problem. Take a database snapshot before any
remediation that changes data.

## 7. Related controls

- **Access log** — `docs/security/data-loss-prevention.md` §4 and the
  `ProtectedDataAccessLog` records who read or wrote personal data and when.
- **Backups and restore** — `docs/security/data-loss-prevention.md`.
- **Data subject rights** — handled automatically by the mandatory Shopify
  privacy webhooks (`customers/data_request`, `customers/redact`,
  `shop/redact`), all HMAC-verified. See `app/routes/webhooks.customers.*`.

## 8. Known limitations, stated honestly

These are real and are recorded rather than hidden, so they can be closed:

1. **No 24/7 monitoring.** A single operator. An incident starting overnight
   may not be detected until the next working day.
2. **7-day log retention** on Railway's Hobby plan. An incident discovered
   later than a week after it began may not be fully reconstructable from
   logs. Raising this requires a plan upgrade.
3. **No third-party security audit.** Stockly has not undergone SOC 2 or an
   equivalent external assessment.

None of these prevent compliance with the requirement, but a merchant
evaluating Stockly is entitled to know them.
