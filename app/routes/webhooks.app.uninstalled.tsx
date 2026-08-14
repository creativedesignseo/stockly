import type { ActionFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { authenticateWebhook } from "../lib/webhook-auth.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Deliberately NOT `authenticate.webhook` — see app/lib/webhook-auth.server.ts.
  // Uninstall revokes the grant, so the SDK's offline-token refresh fails and
  // it throws a silent 500 before this handler ever runs.
  const { shop, session, topic } = await authenticateWebhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    // Delete unconditionally rather than `if (session)`. `deleteMany` is
    // already idempotent — a repeat delivery is a no-op, not an error — and
    // gating on `session` meant the rows survived in exactly the case that
    // matters: when the SDK could not load or refresh the session, which is
    // the normal state at uninstall. That is how the reviewer's sessions were
    // still in the database a day later.
    void session;
    await db.session.deleteMany({ where: { shop } });
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
