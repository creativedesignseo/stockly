/**
 * Wholesale application service.
 *
 * Owns the lifecycle of a B2B account application:
 *   pending → approved | rejected
 *
 * Submission path (storefront → App Proxy):
 *   - Anonymous or logged-in customer fills the registration form
 *   - We create a row in 'pending' state; merchant gets a queue entry
 *
 * Approval path (admin queue → Stockly admin):
 *   - Merchant clicks Approve
 *   - We tag the Shopify customer with the shop's wholesaleTag
 *     (creating the customer first if the application was anonymous)
 *   - We upsert a WholesaleCustomer row (Stockly-managed eligibility)
 *   - We flip the application to 'approved' with audit trail
 *
 * Rejection is a soft state flip — no Shopify side-effect.
 */
import prisma from "../db.server";

export interface SubmitApplicationInput {
  shopId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  companyName: string;
  taxId?: string;
  website?: string;
  country?: string;
  notes?: string;
  /** Numeric Shopify customer id, if the applicant was logged in. */
  shopifyCustomerId?: string;
}

/**
 * Field-level validation for a submitted application. Returns an
 * array of human-readable errors (empty when valid). Mirrored in the
 * storefront block so the customer gets instant feedback, but the
 * server check is authoritative.
 */
export function validateApplication(
  input: Partial<SubmitApplicationInput>,
): string[] {
  const errors: string[] = [];
  const email = (input.email ?? "").trim();
  if (!email) errors.push("Email is required.");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.push("Email looks invalid.");

  const company = (input.companyName ?? "").trim();
  if (!company) errors.push("Company name is required.");
  else if (company.length > 200)
    errors.push("Company name is too long.");

  if (input.notes && input.notes.length > 2000) {
    errors.push("Notes are too long (2000 char max).");
  }

  // Phone: optional, but if provided must be E.164 format (Shopify
  // requirement for customerCreate mutation). Accept variations the
  // user might type and we normalize/reject at the boundary.
  const phone = (input.phone ?? "").trim();
  if (phone) {
    // Strip spaces, dashes, parens before validating
    const cleaned = phone.replace(/[\s\-().]/g, "");
    // E.164: starts with + and 8-15 digits
    if (!/^\+[1-9]\d{7,14}$/.test(cleaned)) {
      errors.push(
        "Phone must include country code in international format. Example: +34 555 44 33 22 or +1 305 555 1234.",
      );
    }
  }

  return errors;
}

/**
 * Normalize a phone to E.164 (strips spaces/dashes/parens, keeps +).
 * Caller should already have validated with validateApplication.
 */
export function normalizePhone(phone: string | undefined | null): string | undefined {
  if (!phone) return undefined;
  const cleaned = phone.trim().replace(/[\s\-().]/g, "");
  return cleaned || undefined;
}

/**
 * Create a new application. Coalesces multiple submissions from the
 * same email + shop into a single pending row to avoid queue spam —
 * if a pending application already exists for this email, we update
 * it in place instead of stacking duplicates.
 */
export async function submitApplication(input: SubmitApplicationInput) {
  const errors = validateApplication(input);
  if (errors.length > 0) {
    throw new Error(`Invalid application: ${errors.join(" ")}`);
  }

  const normalized = {
    email: input.email.trim().toLowerCase(),
    firstName: input.firstName?.trim() || null,
    lastName: input.lastName?.trim() || null,
    phone: input.phone?.trim() || null,
    companyName: input.companyName.trim(),
    taxId: input.taxId?.trim() || null,
    website: input.website?.trim() || null,
    country: input.country?.trim() || null,
    notes: input.notes?.trim() || null,
    shopifyCustomerId: input.shopifyCustomerId || null,
  };

  // Coalesce: if there's an existing pending application for this
  // email, update it in place. Otherwise create a new row. Approved
  // or rejected past applications are not touched — the merchant has
  // already made a decision on those.
  const existing = await prisma.wholesaleApplication.findFirst({
    where: {
      shopId: input.shopId,
      email: normalized.email,
      status: "pending",
    },
  });

  if (existing) {
    return prisma.wholesaleApplication.update({
      where: { id: existing.id },
      data: normalized,
    });
  }

  return prisma.wholesaleApplication.create({
    data: { shopId: input.shopId, status: "pending", ...normalized },
  });
}

export async function listApplications(
  shopId: string,
  opts: { status?: "pending" | "approved" | "rejected" } = {},
) {
  return prisma.wholesaleApplication.findMany({
    where: {
      shopId,
      ...(opts.status ? { status: opts.status } : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

export async function countPendingApplications(shopId: string) {
  return prisma.wholesaleApplication.count({
    where: { shopId, status: "pending" },
  });
}

export async function getApplication(shopId: string, id: string) {
  return prisma.wholesaleApplication.findFirst({
    where: { shopId, id },
  });
}

/**
 * Mark an application as approved. Caller is responsible for the
 * Shopify side-effects (creating the customer if needed, tagging,
 * upserting the WholesaleCustomer) — this function only updates the
 * application row's audit trail.
 *
 * Why split: the Shopify GraphQL mutations need the authenticated
 * admin session, which only the route loader has. Keeping the DB
 * write separate lets us share this code path between the manual
 * Approve button and any future bulk operations.
 */
export async function markApplicationApproved(
  shopId: string,
  id: string,
  reviewNote?: string,
) {
  return prisma.wholesaleApplication.update({
    where: { id },
    data: {
      status: "approved",
      reviewNote: reviewNote?.trim() || null,
      reviewedAt: new Date(),
    },
  });
}

export async function markApplicationRejected(
  shopId: string,
  id: string,
  reviewNote?: string,
) {
  return prisma.wholesaleApplication.update({
    where: { id },
    data: {
      status: "rejected",
      reviewNote: reviewNote?.trim() || null,
      reviewedAt: new Date(),
    },
  });
}
