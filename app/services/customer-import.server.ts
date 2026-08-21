/**
 * Import a shop's PRE-EXISTING wholesale customers into Stockly.
 *
 * Why this exists (onboarding gap found 2026-08-21): a merchant who
 * already runs wholesale — tagged customers, a B2B catalog, years of
 * buyers — installs Stockly and Stockly knows none of them. On Piro that
 * meant 5 of 50 B2B companies were enrolled, so the checkout order
 * minimum silently covered ~10% of their wholesale buyers.
 *
 * That gap is worse than "some data is missing", because eligibility is
 * two-track and the tracks disagree:
 *
 *   - PRICING (`isEligible`, and the Discount Function's
 *     `wholesale_tagged` rule) accepts the shop's wholesale TAG on its
 *     own. A tagged customer gets wholesale prices with no row here.
 *   - ORDER MINIMUMS for TAG-BASED buyers (the Validation Function's
 *     fallback path) only see GIDs that `opening-order-sync` reads out
 *     of `WholesaleCustomer`, and fail open on anyone unrecognised —
 *     deliberately, so a bug can never block a legitimate sale. (Buyers
 *     purchasing through a native-B2B company are handled by the
 *     company-first path and need no import — see
 *     company-qualification.server.ts.)
 *
 * So a tagged-but-unimported customer gets the discount and skips the
 * minimum: the worst possible half of each. Importing them is what makes
 * the two tracks agree.
 *
 * `customers/update` cannot fix this on its own — it fires on CHANGE, so
 * it never sees customers who were already tagged before the install.
 * This is the one-off backfill that pairs with it.
 */
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

import prisma from "../db.server";

/** One customer Shopify knows about that Stockly may not. */
export interface ImportableCustomer {
  /** Numeric id, no GID prefix — matches WholesaleCustomer storage. */
  shopifyCustomerId: string;
  email: string | null;
  displayName: string | null;
  /** Already has a WholesaleCustomer row → import would be a no-op. */
  alreadyImported: boolean;
}

export interface ImportPreview {
  customers: ImportableCustomer[];
  /** Tag the search ran against, echoed back for the UI. */
  wholesaleTag: string;
  /** True when Shopify had more pages than we fetched (see PAGE_CAP). */
  truncated: boolean;
}

/**
 * How a backfilled customer should land.
 *
 *  - "qualified"  → `qualifiedAt = now`. They are an established buyer;
 *    do NOT send them back through an opening-order gate they already
 *    earned years ago. Only the post-qualification minimum applies.
 *  - "pending"    → `qualifiedAt = null`. Their next order must clear the
 *    first-purchase minimum.
 *
 * There is no safe default here, so callers must choose: guessing
 * "pending" would slap a $300 gate on a merchant's existing customers,
 * and guessing "qualified" would waive a gate the merchant may want.
 */
export type ImportMode = "qualified" | "pending";

/**
 * Shopify caps `customers(first:)` at 250 per page. Ten pages = 2,500
 * customers, which comfortably covers any Basic/Grow wholesale roster and
 * bounds a single admin request. Beyond that we report `truncated` rather
 * than looping forever inside a loader — silently importing "some" of a
 * merchant's customers is exactly the kind of half-done state that makes
 * a minimum look broken later.
 */
const PAGE_SIZE = 250;
const PAGE_CAP = 10;

interface CustomerNode {
  id: string;
  email: string | null;
  displayName: string | null;
}

/**
 * Find every Shopify customer carrying the shop's wholesale tag, and mark
 * which of them Stockly already knows.
 *
 * Read-only: this previews the import, it does not write anything.
 */
export async function previewWholesaleCustomerImport(
  admin: AdminApiContext,
  shopId: string,
  wholesaleTag: string,
): Promise<ImportPreview> {
  const nodes: CustomerNode[] = [];
  let cursor: string | null = null;
  let truncated = false;

  for (let page = 0; page < PAGE_CAP; page++) {
    const res = await admin.graphql(
      `#graphql
      query WholesaleTaggedCustomers($q: String!, $first: Int!, $after: String) {
        customers(query: $q, first: $first, after: $after) {
          edges { node { id email displayName } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      {
        variables: {
          // Quoted so multi-word tags ("wholesale partner") still match.
          q: `tag:'${wholesaleTag.replace(/'/g, "")}'`,
          first: PAGE_SIZE,
          after: cursor,
        },
      },
    );
    const body = (await res.json()) as {
      data?: {
        customers?: {
          edges: { node: CustomerNode }[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      };
    };
    const conn = body.data?.customers;
    if (!conn) break;

    nodes.push(...conn.edges.map((e) => e.node));

    if (!conn.pageInfo.hasNextPage) {
      cursor = null;
      break;
    }
    cursor = conn.pageInfo.endCursor;
    if (page === PAGE_CAP - 1) truncated = true;
  }

  const ids = nodes.map((n) => n.id.replace("gid://shopify/Customer/", ""));
  const existing = await prisma.wholesaleCustomer.findMany({
    where: { shopId, shopifyCustomerId: { in: ids } },
    select: { shopifyCustomerId: true },
  });
  const known = new Set(existing.map((r) => r.shopifyCustomerId));

  return {
    wholesaleTag,
    truncated,
    customers: nodes.map((n) => {
      const id = n.id.replace("gid://shopify/Customer/", "");
      return {
        shopifyCustomerId: id,
        email: n.email,
        displayName: n.displayName,
        alreadyImported: known.has(id),
      };
    }),
  };
}

export interface ImportResult {
  imported: number;
  skipped: number;
}

/**
 * Create the missing `WholesaleCustomer` rows.
 *
 * Idempotent by construction: customers Stockly already knows are
 * skipped, never rewritten. Re-running after a partial failure, or after
 * the merchant tags ten more customers, is always safe — and must stay
 * that way, because an "update" branch here could silently reset a
 * customer's `qualifiedAt` and drop them back behind the opening-order
 * gate they had already cleared.
 */
export async function importWholesaleCustomers(
  shopId: string,
  customers: ImportableCustomer[],
  mode: ImportMode,
): Promise<ImportResult> {
  const fresh = customers.filter((c) => !c.alreadyImported);
  if (fresh.length === 0) {
    return { imported: 0, skipped: customers.length };
  }

  const qualifiedAt = mode === "qualified" ? new Date() : null;

  const result = await prisma.wholesaleCustomer.createMany({
    data: fresh.map((c) => ({
      shopId,
      shopifyCustomerId: c.shopifyCustomerId,
      email: c.email ?? undefined,
      qualifiedAt,
      notes: "Imported from Shopify wholesale tag",
    })),
    // A row created between preview and submit (e.g. by the
    // customers/update webhook firing on the same customer) must not
    // abort the whole import.
    skipDuplicates: true,
  });

  return {
    imported: result.count,
    skipped: customers.length - result.count,
  };
}
