/**
 * Generic Application service (ADR-013, Phase 1B).
 *
 * CRUD over the new `Application` table that replaces
 * `WholesaleApplication` post-soak. The legacy service
 * (`wholesale-applications.server.ts`) stays in place during the
 * coexistence window — both tables receive writes from the App Proxy
 * POST until Phase 1G drops the legacy table.
 *
 * Submission shape:
 *   - `responses` is the full form payload, keyed by field key.
 *   - `email` is denormalized from `responses.email` (trimmed +
 *     lowercased) for GDPR webhook lookups and queue filtering.
 *
 * Validation lives in `lib/registrationForm/validate.ts` and runs
 * against the shop's active `RegistrationForm.definition`. Callers
 * MUST validate before calling `submitApplication` — this service
 * persists whatever it's given (it does NOT re-validate to keep the
 * legacy proxy write path simple during soak).
 */
import type { Application, Prisma } from "@prisma/client";
import prisma from "../db.server";

export interface SubmitApplicationInput {
  shopId: string;
  /** Full form payload, keyed by field key (e.g. `email`, `first_name`). */
  responses: Record<string, unknown>;
  /** Numeric Shopify customer id, if the applicant was logged in. */
  shopifyCustomerId?: string | null;
}

/**
 * Coerce + normalize the denormalized email column. Returns "" if the
 * payload doesn't carry an email — callers should reject upstream via
 * `validateResponses` (a real required-email field will fail there).
 */
function deriveEmail(responses: Record<string, unknown>): string {
  const raw = responses.email;
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

/**
 * Create a new Application row. Coalesces: if a pending row already
 * exists for the same shop + email, the responses are merged onto the
 * existing row (latest wins per key) rather than stacking duplicates.
 * Mirrors the legacy `submitApplication` semantics so the queue
 * doesn't double-count during the dual-write window.
 */
export async function submitApplication(
  input: SubmitApplicationInput,
): Promise<Application> {
  const email = deriveEmail(input.responses);

  const existing = email
    ? await prisma.application.findFirst({
        where: { shopId: input.shopId, email, status: "pending" },
      })
    : null;

  const responsesJson = input.responses as Prisma.InputJsonValue;

  if (existing) {
    const merged = {
      ...(existing.responses as Record<string, unknown>),
      ...input.responses,
    } as Prisma.InputJsonValue;
    return prisma.application.update({
      where: { id: existing.id },
      data: {
        responses: merged,
        email,
        shopifyCustomerId: input.shopifyCustomerId ?? existing.shopifyCustomerId,
      },
    });
  }

  return prisma.application.create({
    data: {
      shopId: input.shopId,
      status: "pending",
      responses: responsesJson,
      email,
      shopifyCustomerId: input.shopifyCustomerId ?? null,
    },
  });
}

export interface ListApplicationsOptions {
  status?: "pending" | "approved" | "rejected";
  limit?: number;
}

export async function listApplications(
  shopId: string,
  opts: ListApplicationsOptions = {},
): Promise<Application[]> {
  return prisma.application.findMany({
    where: {
      shopId,
      ...(opts.status ? { status: opts.status } : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    ...(opts.limit ? { take: opts.limit } : {}),
  });
}

export async function countPendingApplications(shopId: string): Promise<number> {
  return prisma.application.count({
    where: { shopId, status: "pending" },
  });
}

export async function getApplication(
  shopId: string,
  id: string,
): Promise<Application | null> {
  return prisma.application.findFirst({ where: { shopId, id } });
}

export async function markApplicationApproved(
  id: string,
  reviewNote?: string,
): Promise<Application> {
  return prisma.application.update({
    where: { id },
    data: {
      status: "approved",
      reviewNote: reviewNote?.trim() || null,
      reviewedAt: new Date(),
    },
  });
}

export async function markApplicationRejected(
  id: string,
  reviewNote?: string,
): Promise<Application> {
  return prisma.application.update({
    where: { id },
    data: {
      status: "rejected",
      reviewNote: reviewNote?.trim() || null,
      reviewedAt: new Date(),
    },
  });
}
