/**
 * Resilient wrapper around `authenticate.webhook`.
 *
 * Why this exists
 * ---------------
 * `shopify.server.ts` sets `expiringOfflineAccessTokens: true`, so the stored
 * offline token has a ~1 hour TTL. On every webhook delivery the SDK calls
 * `ensureValidOfflineSession`, and if the token is within 5 minutes of expiry
 * it performs a live `POST /admin/oauth/access_token` to refresh it. That
 * helper re-throws only `InvalidJwtError` and a 400 whose body is exactly
 * `invalid_subject_token`. **Anything else becomes a bare
 * `Response(undefined, { status: 500 })` with no body and no log line.**
 *
 * That is a guaranteed failure for `app/uninstalled`: uninstalling revokes the
 * grant, so the refresh Shopify triggers moments later is refreshing a
 * permission Shopify itself has just destroyed. It is what happened on
 * 2026-08-13 — a reviewer used the admin until 14:46, uninstalled at 16:04
 * (78 minutes later, token long expired), and `app/uninstalled` and
 * `shop/redact` each returned 500 eighteen times in silence. The reviewer's
 * shops were never deleted. It also could not be reproduced afterwards,
 * because a never-seen shop has no session to refresh and a freshly seeded
 * one is not expired — the only two cases anyone tested.
 *
 * The insight that makes this safe to work around: **none of the four
 * mandatory webhooks need an admin API client.** They read and delete our own
 * database rows. The access token is irrelevant to them. So when the refresh
 * fails, the correct behaviour is to carry on without a session — not to
 * return 500 and let Shopify exhaust its retries.
 *
 * What we do NOT relax is authenticity. When the SDK throws we verify the
 * HMAC ourselves, against the raw body, in constant time, before trusting a
 * single field. A forged webhook still gets 401.
 *
 * Note the refresh token itself expires 2026-09-22. After that date every
 * webhook would 500 until someone reopened the app — with this wrapper they
 * degrade instead.
 */
import crypto from "node:crypto";

import { authenticate } from "../shopify.server";

export interface WebhookContext {
  shop: string;
  topic: string;
  payload: unknown;
  /** Present only on the happy path; the handlers below never need it. */
  session?: unknown;
  /**
   * True when the SDK failed (almost always an offline-token refresh) and we
   * fell back to verifying the request ourselves. The webhook is authentic
   * either way; this only tells the handler it has no Shopify session.
   */
  degraded: boolean;
}

/** Constant-time compare that tolerates length mismatch without throwing. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function authenticateWebhook(
  request: Request,
): Promise<WebhookContext> {
  // Clone up front: `authenticate.webhook` consumes the body, and we need the
  // raw bytes to verify the HMAC ourselves if it throws.
  const spare = request.clone();

  try {
    const ctx = await authenticate.webhook(request);
    return {
      shop: ctx.shop,
      topic: ctx.topic,
      payload: ctx.payload,
      session: ctx.session,
      degraded: false,
    };
  } catch (error) {
    // A 401 is the SDK telling us the HMAC did not verify. That is a real
    // rejection and must pass straight through.
    if (error instanceof Response && error.status === 401) throw error;

    const raw = await spare.text();
    const sentHmac = spare.headers.get("x-shopify-hmac-sha256") ?? "";
    const secret = process.env.SHOPIFY_API_SECRET ?? "";

    const expected = crypto
      .createHmac("sha256", secret)
      .update(raw, "utf8")
      .digest("base64");

    if (!secret || !safeEqual(sentHmac, expected)) {
      // Unverified. Refuse it exactly as the SDK would.
      throw new Response(undefined, { status: 401 });
    }

    const shop = spare.headers.get("x-shopify-shop-domain") ?? "";
    const topic = spare.headers.get("x-shopify-topic") ?? "";
    let payload: unknown = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }

    // eslint-disable-next-line no-console
    console.warn(
      "[Stockly webhook] SDK authentication failed; continuing on a verified " +
        "HMAC without a Shopify session",
      JSON.stringify({
        shop,
        topic,
        sdkStatus: error instanceof Response ? error.status : undefined,
        message: error instanceof Error ? error.message : String(error),
      }),
    );

    return { shop, topic, payload, session: undefined, degraded: true };
  }
}
