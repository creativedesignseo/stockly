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
  // Camino B (supersedes the ADR-004 / C3 behavior). Approval grants
  // wholesale PRICING immediately — discount-function-sync now surfaces
  // EVERY approved customer in the Function's `qualifiedCustomers` list,
  // so they see wholesale pricing from the first unit regardless of
  // qualifiedAt (this is what keeps bug C3 fixed: the discount is gated
  // on "is approved", not on qualifiedAt).
  //
  // `qualifiedAt` now means "has completed the opening order". A fresh
  // approval leaves it null = "must still meet the opening-order minimum
  // at checkout" (enforced by the Validation Function). The merchant
  // clears it (sets qualifiedAt=now) with one click once the customer
  // has placed their opening order. Re-approving preserves an existing
  // qualifiedAt so an established customer is never sent back to the
  // opening-order gate.
  return prisma.wholesaleCustomer.upsert({
    where: {
      shopId_shopifyCustomerId: {
        shopId: data.shopId,
        shopifyCustomerId: data.shopifyCustomerId,
      },
    },
    create: { ...data, qualifiedAt: null },
    update: { email: data.email, notes: data.notes },
  });
}

export async function revokeCustomer(shopId: string, shopifyCustomerId: string) {
  return prisma.wholesaleCustomer.delete({
    where: {
      shopId_shopifyCustomerId: { shopId, shopifyCustomerId },
    },
  });
}

/**
 * Camino B: clear a customer's opening-order requirement. Sets
 * qualifiedAt=now ("has completed the opening order"), which removes them
 * from the checkout-side minimum gate (the Validation Function). The
 * merchant does this with one click once the customer has placed their
 * opening order. Idempotent — re-running is a no-op if already cleared.
 * Does NOT change the discount (every approved customer already sees
 * wholesale pricing — see discount-function-sync).
 */
export async function releaseOpeningOrder(
  shopId: string,
  shopifyCustomerId: string,
) {
  return prisma.wholesaleCustomer.update({
    where: { shopId_shopifyCustomerId: { shopId, shopifyCustomerId } },
    data: { qualifiedAt: new Date() },
  });
}
