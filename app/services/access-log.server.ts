/**
 * Protected customer data access log.
 *
 * Closes Shopify's Level 2 protected-customer-data requirement — "Keep an
 * access log to protected customer data" — which is a hard blocker for App
 * Store submission. See
 * https://shopify.dev/docs/apps/launch/protected-customer-data
 *
 * Every code path that reads, writes, exports or deletes protected customer
 * data (name, email, phone, address, and anything else Shopify classifies as
 * protected) calls `logProtectedDataAccess` so there is an auditable record
 * of who touched what, when, and why.
 *
 * ---------------------------------------------------------------------------
 * TWO INVARIANTS. Both are load-bearing; do not relax either.
 * ---------------------------------------------------------------------------
 *
 * 1. NEVER STORE PERSONAL DATA IN THE LOG ITSELF.
 *    `fields` takes field CATEGORIES ("email", "phone", "name"), never
 *    values ("ana@example.com"). `subjectRef` takes an opaque record
 *    identifier — a Shopify customer id or a local Application id — never a
 *    name, email or address.
 *
 *    This is the whole reason the log is safe to keep after a
 *    customers/redact request: once the personal data is deleted, the audit
 *    trail that survives contains no personal data to redact. If you ever
 *    pass a real value into `fields` or `subjectRef`, the log becomes
 *    personal data itself and the redaction webhooks become non-compliant.
 *
 * 2. NEVER BREAK THE CALLER.
 *    Every write is wrapped in try/catch and errors are swallowed (logged to
 *    console only). An audit-log failure must never block a merchant
 *    approving a customer or a storefront submission succeeding. Same
 *    fail-safe posture as `syncOpeningOrderValidation` in
 *    `opening-order-sync.server.ts`, and for the same reason.
 *
 *    A common and entirely expected failure here is the shopId foreign key:
 *    webhooks can arrive for a shop whose row is gone (uninstalled, already
 *    redacted, or never fully installed). That insert fails, gets logged,
 *    and the webhook still returns 200. Correct behaviour.
 *
 * Retention: rows cascade-delete with their Shop (`onDelete: Cascade`). On
 * shop/redact the shop's entire audit trail disappears along with the shop —
 * intended, because nothing about a redacted shop should survive.
 */
import prisma from "../db.server";

/** Who triggered the access. */
export type AccessLogActor = "merchant" | "storefront" | "webhook" | "system";

/** What was done to the protected data. */
export type AccessLogAction = "create" | "read" | "update" | "delete" | "export";

export interface ProtectedDataAccessEntry {
  /** Shop domain — the `Shop.id` primary key. */
  shopId: string;
  actor: AccessLogActor;
  action: AccessLogAction;
  /**
   * Opaque record reference: Shopify customer id when known, else the local
   * Application id. NEVER personal data (no emails, no names).
   */
  subjectRef?: string | null;
  /**
   * Field CATEGORIES touched, e.g. `["name", "email", "phone"]`. Persisted
   * as a comma-separated string. NEVER the field values.
   */
  fields?: string[] | null;
  /** Short machine-readable context, e.g. `"application.approve"`. */
  context?: string | null;
}

/**
 * Record one access to protected customer data.
 *
 * Fire-and-forget by contract: this never throws and never rejects, so
 * callers can `await` it inline without a try/catch of their own and without
 * risking the operation they are auditing.
 *
 * @param entry Categories and identifiers only — see the invariants above.
 */
export async function logProtectedDataAccess(
  entry: ProtectedDataAccessEntry,
): Promise<void> {
  try {
    await prisma.protectedDataAccessLog.create({
      data: {
        shopId: entry.shopId,
        actor: entry.actor,
        action: entry.action,
        subjectRef: entry.subjectRef ?? null,
        // Empty array collapses to null so "no fields recorded" and "fields
        // recorded, but none" are not two different-looking states in SQL.
        fields:
          entry.fields && entry.fields.length > 0
            ? entry.fields.join(",")
            : null,
        context: entry.context ?? null,
      },
    });
  } catch (err) {
    // Swallowed on purpose — see invariant 2. Logged so an audit-log
    // outage is still visible in the host's logs.
    // eslint-disable-next-line no-console
    console.error("[access-log] failed to record protected data access:", {
      shopId: entry.shopId,
      actor: entry.actor,
      action: entry.action,
      context: entry.context,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
