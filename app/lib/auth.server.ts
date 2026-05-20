/**
 * Authentication helper — wraps Shopify's `authenticate.admin` and
 * guarantees a Stockly `Shop` row exists for the authenticated store.
 *
 * Use this in admin loaders/actions instead of calling
 * `authenticate.admin` directly, so we always have a hydrated Shop.
 *
 * Example:
 *   const { session, admin, shop } = await authenticateAdmin(request);
 */
import type { Shop } from "@prisma/client";
import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../services/shops.server";

export async function authenticateAdmin(request: Request) {
  const auth = await authenticate.admin(request);
  const shop: Shop = await getOrCreateShop(auth.session.shop);
  return { ...auth, shop };
}
