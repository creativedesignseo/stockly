import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    // Webhook requests can trigger multiple times and after an app has already been uninstalled.
    // If this webhook already ran, the session may have been deleted previously.
    if (session) {
      await db.session.deleteMany({ where: { shop } });
    }
  } catch (error) {
    // A 5xx is the correct answer here — it tells Shopify to retry, which is
    // what we want for a transient failure. What was missing is the reason.
    // On 2026-08-13 this handler returned 500 eighteen times for a reviewer's
    // store, Shopify exhausted its retries, and the shop's rows were left
    // behind with nothing in the logs explaining why. Never swallow this.
    console.error(
      "[Stockly webhook app/uninstalled] FAILED",
      JSON.stringify({
        shop,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }),
    );
    throw error;
  }

  return new Response();
};
