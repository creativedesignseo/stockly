/**
 * Company qualification — the state behind company-first B2B minimums.
 *
 * The architecture (2026-08-21, replaces list-based identity for
 * native-B2B shops): a buyer whose cart carries
 * `buyerIdentity.purchasingCompany` IS wholesale, and which minimum
 * applies to them is decided by ONE bit of state that lives on the
 * company itself — an app-owned metafield:
 *
 *     namespace `$app:stockly`, key `qualified`, value = ISO timestamp
 *
 *   - metafield absent → the company still owes its OPENING order; the
 *     Validation Function applies the first-purchase minimum.
 *   - metafield present → established; the recurring minimum applies.
 *
 * Both checkout Functions (validation + discount) read this metafield
 * directly from their input query. Nothing is synced, nothing can go
 * stale, no list can outgrow a metafield size limit, and a company
 * approved in Shopify is covered from its very first cart.
 *
 * Writers:
 *   1. `orders/paid` webhook — the payload carries `company.id` for B2B
 *      orders; the first qualifying paid order flips the flag.
 *   2. `backfillEstablishedCompanies` — one-off per shop: companies
 *      with prior orders are grandfathered as qualified, so installing
 *      Stockly never puts an opening-order gate in front of a merchant's
 *      long-standing buyers. Runs behind `Shop.companiesBackfilledAt`.
 *
 * Scopes: metafieldsSet requires the same access as mutating the owner;
 * `companyUpdate` accepts write_customers OR write_companies, and the
 * app has write_customers — no new scope, no re-consent (verified
 * against shopify.dev 2026-08-21).
 */
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

import prisma from "../db.server";

const QUALIFIED_NAMESPACE = "$app:stockly";
const QUALIFIED_KEY = "qualified";

/** Write the qualification flag on one company. Idempotent. */
export async function markCompanyQualified(
  admin: AdminApiContext,
  companyGid: string,
  qualifiedAt: Date = new Date(),
): Promise<void> {
  const response = await admin.graphql(
    `#graphql
    mutation MarkCompanyQualified($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId: companyGid,
            namespace: QUALIFIED_NAMESPACE,
            key: QUALIFIED_KEY,
            type: "single_line_text_field",
            value: qualifiedAt.toISOString(),
          },
        ],
      },
    },
  );
  const json = (await response.json()) as {
    data?: {
      metafieldsSet?: {
        userErrors?: Array<{ field?: string[]; message: string }>;
      };
    };
  };
  const errors = json.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(
      `markCompanyQualified(${companyGid}) failed: ${errors
        .map((e) => e.message)
        .join("; ")}`,
    );
  }
}

/**
 * Idempotent wrapper for hot paths (webhooks): reads the flag first and
 * only writes when absent, preserving the FIRST qualification timestamp
 * against webhook retries and repeat qualifying orders.
 */
export async function ensureCompanyQualified(
  admin: AdminApiContext,
  companyGid: string,
): Promise<"already" | "written"> {
  const response = await admin.graphql(
    `#graphql
    query CompanyQualified($id: ID!) {
      company(id: $id) {
        metafield(namespace: "$app:stockly", key: "qualified") {
          value
        }
      }
    }`,
    { variables: { id: companyGid } },
  );
  const json = (await response.json()) as {
    data?: { company?: { metafield?: { value?: string } | null } | null };
  };
  const existing = json.data?.company?.metafield?.value;
  if (typeof existing === "string" && existing.trim().length > 0) {
    return "already";
  }
  await markCompanyQualified(admin, companyGid);
  return "written";
}

interface CompanyNode {
  id: string;
  name: string;
  ordersCount: { count: number } | null;
}

export interface BackfillResult {
  scanned: number;
  qualified: number;
  skipped: number;
  errors: number;
}

/**
 * One-off per shop: mark every company that has ALREADY placed orders
 * as qualified, so existing buyers keep buying under the recurring
 * minimum instead of being sent back through an opening-order gate
 * they cleared before Stockly existed. Companies with zero orders are
 * left pending on purpose — their first order IS their opening order.
 *
 * Gated by `Shop.companiesBackfilledAt`: runs once, then never again
 * (re-running would be harmless — the write is idempotent — but it is
 * paged Admin API work that does not belong in hot paths).
 */
export async function backfillEstablishedCompanies(
  admin: AdminApiContext,
  shopId: string,
): Promise<BackfillResult | null> {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop || shop.companiesBackfilledAt) return null;

  const result: BackfillResult = {
    scanned: 0,
    qualified: 0,
    skipped: 0,
    errors: 0,
  };

  let cursor: string | null = null;
  let pagesFetched = 0;
  // 10 pages × 50 = 500 companies — far beyond any Basic/Grow roster
  // (Plus is where thousands of companies live, and those shops use
  // native direct catalogs anyway). Bounded so a webhook-triggered
  // backfill can never run away.
  for (let page = 0; page < 10; page++) {
    let json: {
      data?: {
        companies?: {
          nodes: CompanyNode[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      };
      errors?: Array<{ message: string }>;
    };
    try {
      const response = await admin.graphql(
        `#graphql
        query CompaniesForBackfill($first: Int!, $after: String) {
          companies(first: $first, after: $after) {
            nodes {
              id
              name
              ordersCount { count }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { variables: { first: 50, after: cursor } },
      );
      json = (await response.json()) as typeof json;
    } catch (error) {
      // The real SDK client THROWS on GraphQL errors (throttle,
      // ACCESS_DENIED, shop without B2B). Treat any throw as "this
      // attempt failed": no stamp below, so the next trigger retries.
      console.warn(
        "[company-backfill] companies query threw:",
        error instanceof Error ? error.message : String(error),
      );
      break;
    }
    const conn = json.data?.companies;
    if (!conn) {
      // Body-level errors (our lightweight ops runner surfaces them
      // this way). Same treatment: fail the attempt, retry later.
      console.warn(
        "[company-backfill] companies query returned no data:",
        json.errors?.map((e) => e.message).join("; ") ?? "empty",
      );
      break;
    }
    pagesFetched++;

    for (const node of conn.nodes) {
      result.scanned++;
      const orders = node.ordersCount?.count ?? 0;
      if (orders <= 0) {
        result.skipped++;
        continue;
      }
      try {
        await markCompanyQualified(admin, node.id);
        result.qualified++;
        // Pace the serial mutation loop well under the API's leak rate
        // (~16 writes/s vs 100 cost-points/s restore) so a large
        // roster cannot drain the throttle bucket mid-backfill.
        await new Promise((resolve) => setTimeout(resolve, 60));
      } catch (error) {
        result.errors++;
        console.error(
          `[company-backfill] failed for ${node.id} (${node.name}):`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  // Stamp ONLY a clean, complete run: at least one page actually
  // fetched and zero failed writes. A transient API failure must not
  // become a permanent "backfill done" — that would leave established
  // buyers facing the opening-order gate forever (adversarial-review
  // find). Re-runs are cheap and idempotent; the next settings save or
  // install retries until one run completes cleanly.
  if (pagesFetched > 0 && result.errors === 0) {
    await prisma.shop.update({
      where: { id: shopId },
      data: { companiesBackfilledAt: new Date() },
    });
  }

  console.log(
    `[company-backfill] shop=${shopId} scanned=${result.scanned} qualified=${result.qualified} skipped=${result.skipped} errors=${result.errors}`,
  );
  return result;
}
