/**
 * Shop service — CRUD and initialization for the Shop model.
 *
 * The Shop row is the per-store config blob. It's created on first auth
 * via `getOrCreateShop` and updated when the store owner saves settings
 * in the admin UI.
 */
import prisma from "../db.server";
import type { Shop } from "@prisma/client";

/**
 * Default branding applied to new shops. Picked to be brand-neutral —
 * the merchant should overwrite immediately in onboarding.
 */
export const DEFAULT_BRANDING = {
  primaryColor: "#0F172A",
  accentColor: "#C9A961", // warm gold — premium-ish default
  fontFamily: "inherit", // inherit from theme by default
  logoUrl: null as string | null,
} as const;

/**
 * Default customer-facing copy. All strings are overridable in the admin.
 * Keys map to UI surfaces (storefront blocks + cart messages).
 */
export const DEFAULT_COPY = {
  errorMinQty: "Minimum order quantity: {min} units. Add {missing} more to continue.",
  errorMinValue: "Minimum order value: {min}. You need {missing} more to checkout.",
  emptyCart: "Your wholesale cart is empty. Browse the catalog to add items.",
  tierUnlockHint: "Add {missing} more to unlock {discount}% off.",
  notEligible: "Wholesale pricing is for approved accounts. Contact us to apply.",
} as const;

export type ShopBranding = typeof DEFAULT_BRANDING;
export type ShopCopy = typeof DEFAULT_COPY;

/**
 * Get or create a Shop row by its Shopify domain.
 * Called from `afterAuth` so every authenticated shop has a row.
 */
export async function getOrCreateShop(shopDomain: string): Promise<Shop> {
  const existing = await prisma.shop.findUnique({ where: { id: shopDomain } });
  if (existing) return existing;

  return prisma.shop.create({
    data: {
      id: shopDomain,
      branding: JSON.stringify(DEFAULT_BRANDING),
      copy: JSON.stringify(DEFAULT_COPY),
    },
  });
}

/**
 * Parse the stringified JSON fields into typed objects. Falls back to
 * defaults if a field is null or malformed.
 */
export function parseShop(shop: Shop): {
  shop: Shop;
  branding: ShopBranding;
  copy: ShopCopy;
} {
  return {
    shop,
    branding: safeParse<ShopBranding>(shop.branding) ?? DEFAULT_BRANDING,
    copy: safeParse<ShopCopy>(shop.copy) ?? DEFAULT_COPY,
  };
}

function safeParse<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * Update branding settings for a shop.
 */
export async function updateBranding(
  shopDomain: string,
  branding: Partial<ShopBranding>,
) {
  const shop = await getOrCreateShop(shopDomain);
  const current = safeParse<ShopBranding>(shop.branding) ?? DEFAULT_BRANDING;
  return prisma.shop.update({
    where: { id: shopDomain },
    data: { branding: JSON.stringify({ ...current, ...branding }) },
  });
}

/**
 * Update customer-facing copy for a shop.
 */
export async function updateCopy(
  shopDomain: string,
  copy: Partial<ShopCopy>,
) {
  const shop = await getOrCreateShop(shopDomain);
  const current = safeParse<ShopCopy>(shop.copy) ?? DEFAULT_COPY;
  return prisma.shop.update({
    where: { id: shopDomain },
    data: { copy: JSON.stringify({ ...current, ...copy }) },
  });
}

/**
 * Update store-level wholesale settings.
 */
export async function updateShopSettings(
  shopDomain: string,
  data: { wholesaleTag?: string; minOrderValue?: number | null; onboarded?: boolean },
) {
  return prisma.shop.update({
    where: { id: shopDomain },
    data,
  });
}
