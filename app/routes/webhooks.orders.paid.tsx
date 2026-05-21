/**
 * Webhook handler: orders/paid.
 *
 * Promotes a wholesale customer from `approved_pre_fpq` to `qualified`
 * when their payment completes and the order meets the shop's FPQ.
 *
 * Once promoted, a customer-level metafield is written so the Discount
 * Function (which can't query Stockly's DB) reads it at checkout and
 * skips the FPQ gate for all subsequent carts.
 *
 * Idempotent: if the customer is already qualified, this is a no-op.
 * Safe under webhook retries (Shopify can deliver the same event
 * multiple times).
 */
import type { ActionFunctionArgs } from "@remix-run/node";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const METAFIELD_NAMESPACE = "$app:stockly-volume-discount";
const METAFIELD_KEY = "wholesale-status";

interface OrdersPaidPayload {
  id?: number;
  admin_graphql_api_id?: string;
  customer?: {
    id?: number;
    admin_graphql_api_id?: string;
    tags?: string;
  };
  total_price?: string;
  current_total_price?: string;
  line_items?: Array<{
    quantity?: number;
  }>;
}

interface FpqRule {
  mode: string; // 'none' | 'amount' | 'quantity' | 'combined'
  amount: number | null;
  quantity: number | null;
  combinedLogic: string; // 'and' | 'or'
}

function evaluateFpq(
  rule: FpqRule,
  orderAmount: number,
  orderQty: number,
): boolean {
  if (rule.mode === "none") return true;

  const amountOk =
    rule.amount && rule.amount > 0 ? orderAmount >= rule.amount : true;
  const quantityOk =
    rule.quantity && rule.quantity > 0 ? orderQty >= rule.quantity : true;

  if (rule.mode === "amount") return amountOk;
  if (rule.mode === "quantity") return quantityOk;
  if (rule.mode === "combined") {
    return rule.combinedLogic === "or"
      ? amountOk || quantityOk
      : amountOk && quantityOk;
  }
  return true;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, admin, topic } =
    await authenticate.webhook(request);
  // eslint-disable-next-line no-console
  console.log(`[Stockly webhook] ${topic} for ${shop}`);

  if (!admin) {
    // Without admin context we can't write the customer metafield;
    // return 200 so Shopify doesn't retry endlessly.
    return new Response();
  }

  const order = payload as OrdersPaidPayload;
  const customerGid = order.customer?.admin_graphql_api_id;
  if (!customerGid) {
    return new Response();
  }

  // Extract the Shopify numeric customer ID — our WholesaleCustomer
  // table stores this as a String (matches what App Proxy gives us).
  const customerId = customerGid.split("/").pop() ?? "";

  const shopRow = await prisma.shop.findUnique({ where: { id: shop } });
  if (!shopRow) return new Response();

  const fpqRule: FpqRule = {
    mode: shopRow.fpqMode,
    amount: shopRow.fpqAmount,
    quantity: shopRow.fpqQuantity,
    combinedLogic: shopRow.fpqCombinedLogic,
  };

  // Find or create the WholesaleCustomer row. If they paid an order
  // and the shop's wholesale tag check passed when they viewed the
  // store, they're already implicitly approved; we just need to know
  // whether they're qualified yet.
  let wholesale = await prisma.wholesaleCustomer.findUnique({
    where: {
      shopId_shopifyCustomerId: {
        shopId: shopRow.id,
        shopifyCustomerId: customerId,
      },
    },
  });

  // If they already have a qualifiedAt, nothing to do (idempotent).
  if (wholesale?.qualifiedAt) {
    return new Response();
  }

  // Compute order metrics from the payload.
  const orderAmount = Number(
    order.current_total_price ?? order.total_price ?? 0,
  );
  const orderQty = (order.line_items ?? []).reduce(
    (sum, li) => sum + (li.quantity ?? 0),
    0,
  );

  // Does this order qualify?
  const meets = evaluateFpq(fpqRule, orderAmount, orderQty);
  if (!meets) {
    return new Response();
  }

  // Mark qualified. If no WholesaleCustomer row exists yet, create one.
  const qualifiedAt = new Date();
  if (!wholesale) {
    wholesale = await prisma.wholesaleCustomer.create({
      data: {
        shopId: shopRow.id,
        shopifyCustomerId: customerId,
        qualifiedAt,
        qualifyingOrderId: order.admin_graphql_api_id,
        qualifyingOrderAmount: orderAmount,
      },
    });
  } else {
    wholesale = await prisma.wholesaleCustomer.update({
      where: { id: wholesale.id },
      data: {
        qualifiedAt,
        qualifyingOrderId: order.admin_graphql_api_id,
        qualifyingOrderAmount: orderAmount,
      },
    });
  }

  // Write the customer metafield so the Discount Function reads
  // qualification status at checkout time. The value is a JSON
  // string with the qualifying timestamp; the Function only checks
  // "is it present and non-empty" for the gate decision.
  await admin.graphql(
    `#graphql
    mutation SetCustomerWholesaleStatus($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId: customerGid,
            namespace: METAFIELD_NAMESPACE,
            key: METAFIELD_KEY,
            type: "json",
            value: JSON.stringify({
              qualifiedAt: qualifiedAt.toISOString(),
              qualifyingOrderId: order.admin_graphql_api_id,
            }),
          },
        ],
      },
    },
  );

  // eslint-disable-next-line no-console
  console.log(
    `[Stockly webhook] Qualified customer ${customerId} via order ${order.admin_graphql_api_id} (€${orderAmount}, ${orderQty} units)`,
  );

  return new Response();
};
