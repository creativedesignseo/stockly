/**
 * Server-only half of the currency helpers: the Admin API lookup that
 * turns an authenticated admin context into the shop's ISO 4217 code.
 *
 * Extracted 2026-08-14 from app.settings.pricing.tsx and
 * app.pricing._index.tsx, which each carried an identical copy.
 *
 * The pure symbol mapping lives in `./currency` so client components
 * can import it without dragging the server bundle along.
 */
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

/**
 * Read the shop's ISO 4217 currency code from the Admin API.
 *
 * Deliberately NOT stored on the Shop row: a merchant can change their
 * store currency at any time and a cached column would go stale
 * silently. This is a single cheap field on screens the merchant opens
 * rarely.
 *
 * Fails soft: any transport/GraphQL error returns null and the UI falls
 * back to symbol-free amounts. A currency lookup must never take a
 * screen down.
 *
 * @param logContext short route tag used in the error log line, e.g.
 *   "settings.pricing". Cosmetic only.
 */
export async function fetchShopCurrencyCode(
  admin: AdminApiContext,
  logContext = "currency",
): Promise<string | null> {
  try {
    const response = await admin.graphql(
      `#graphql
      query ShopCurrencyCode {
        shop {
          currencyCode
        }
      }`,
    );
    const body = (await response.json()) as {
      data?: { shop?: { currencyCode?: string | null } | null } | null;
    };
    return body.data?.shop?.currencyCode ?? null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[${logContext}] shop currency lookup failed:`, err);
    return null;
  }
}
