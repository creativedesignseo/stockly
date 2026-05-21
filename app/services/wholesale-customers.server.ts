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
  return prisma.wholesaleCustomer.upsert({
    where: {
      shopId_shopifyCustomerId: {
        shopId: data.shopId,
        shopifyCustomerId: data.shopifyCustomerId,
      },
    },
    create: data,
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
