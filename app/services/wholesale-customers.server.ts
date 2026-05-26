/**
 * Wholesale customer service.
 *
 * Source of truth for who is allowed to see wholesale pricing.
 * Two-track eligibility (either grants access):
 *   1. Customer has the shop's `wholesaleTag` (managed in Shopify admin).
 *   2. Customer has a row in `WholesaleCustomer` (managed in Stockly admin).
 *
 * Track 1 is the default Shopify-native flow. Track 2 lets the merchant
 * approve customers from inside Stockly without touching the Shopify admin.
 */
import prisma from "../db.server";

export interface EligibilityCheckInput {
  shopId: string;
  shopifyCustomerId: string;
  customerTags?: string[];
  /** The shop's configured wholesale tag, e.g. "wholesale". */
  shopWholesaleTag: string;
}

/**
 * Check if a customer is eligible for wholesale pricing.
 * Returns true if either track grants access.
 */
export async function isEligible(input: EligibilityCheckInput): Promise<boolean> {
  // Track 1 — tag match (cheap, no DB hit).
  if (input.customerTags?.includes(input.shopWholesaleTag)) {
    return true;
  }

  // Track 2 — Stockly-managed approval list.
  const row = await prisma.wholesaleCustomer.findUnique({
    where: {
      shopId_shopifyCustomerId: {
        shopId: input.shopId,
        shopifyCustomerId: input.shopifyCustomerId,
      },
    },
  });
  return row !== null;
}

export interface CustomerStatus {
  eligible: boolean;
  /**
   * Whether the customer has completed their FPQ (ADR-004). null
   * means either not eligible OR eligible but not yet qualified.
   * Used by the App Proxy + storefront blocks to drive the
   * "Add €X more to unlock wholesale" banner.
   */
  qualifiedAt: Date | null;
}

/**
 * Resolve full customer status: eligibility + qualification.
 * Encapsulates the two-track eligibility (tag or DB) plus the FPQ
 * qualification state stored on the WholesaleCustomer row.
 */
export async function resolveCustomerStatus(
  input: EligibilityCheckInput,
): Promise<CustomerStatus> {
  const row = await prisma.wholesaleCustomer.findUnique({
    where: {
      shopId_shopifyCustomerId: {
        shopId: input.shopId,
        shopifyCustomerId: input.shopifyCustomerId,
      },
    },
  });

  const tagMatch =
    input.customerTags?.includes(input.shopWholesaleTag) ?? false;

  return {
    eligible: tagMatch || row !== null,
    qualifiedAt: row?.qualifiedAt ?? null,
  };
}

export async function listWholesaleCustomers(shopId: string) {
  return prisma.wholesaleCustomer.findMany({
    where: { shopId },
    orderBy: { approvedAt: "desc" },
  });
}

export async function approveCustomer(data: {
  shopId: string;
  shopifyCustomerId: string;
  email?: string;
  notes?: string;
}) {
  // Admin approval implies wholesale qualification — the customer
  // bypasses the FPQ gate (the FPQ is for track-1 self-registered
  // customers who must first prove themselves with a qualifying order;
  // track-2 admin-approved customers are qualified by the act of
  // approval itself).
  //
  // Setting qualifiedAt is essential because discount-function-sync
  // populates the Function's `qualifiedCustomers` list ONLY from rows
  // where qualifiedAt IS NOT NULL. A customer with qualifiedAt=null is
  // invisible to the Function's bypass list and gets evaluated against
  // FPQ on every cart — meaning admin-approved customers were silently
  // paying retail at checkout (bug C3 / P1-8 in tasks/current.md).
  const now = new Date();
  return prisma.wholesaleCustomer.upsert({
    where: {
      shopId_shopifyCustomerId: {
        shopId: data.shopId,
        shopifyCustomerId: data.shopifyCustomerId,
      },
    },
    create: { ...data, qualifiedAt: now },
    // Re-approve refreshes the qualification timestamp. Idempotent.
    update: { email: data.email, notes: data.notes, qualifiedAt: now },
  });
}

export async function revokeCustomer(shopId: string, shopifyCustomerId: string) {
  return prisma.wholesaleCustomer.delete({
    where: {
      shopId_shopifyCustomerId: { shopId, shopifyCustomerId },
    },
  });
}
