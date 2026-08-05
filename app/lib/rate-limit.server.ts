/**
 * Sliding-window rate limiter for public endpoints.
 *
 * Why this exists
 * ---------------
 * `/proxy/apply` is the only endpoint a member of the public can reach
 * without an admin session. Shopify signs App Proxy requests with an
 * HMAC, so the *origin* is authenticated (the request really did come
 * through the merchant's storefront) — but that says nothing about
 * volume. Anyone who can load the merchant's registration page can
 * replay the POST as fast as their connection allows, and every
 * submission costs us a `resolveStorefrontForm` read plus two writes.
 * Shopify's App Store review flags unprotected public write endpoints.
 *
 * Design
 * ------
 * In-memory sliding window: each key holds the timestamps of its recent
 * hits; anything older than the window is dropped on read. Chosen over a
 * fixed-window counter because a fixed window lets a caller land 2× the
 * limit across a boundary, and over a DB-backed counter because a write
 * per request defeats the point of protecting against write volume.
 *
 * KNOWN LIMITATION — process-local state. Railway's Hobby plan runs a
 * single replica, so today one process sees every request and the limits
 * below are the real limits. The moment the service scales past one
 * replica (Hobby allows up to 6), each replica enforces its own window
 * and the effective limit multiplies by the replica count. That is a
 * degradation, not a failure — the endpoint stays bounded. If we ever
 * need exact global limits, move the counter to Postgres or Redis and
 * keep this module's interface.
 *
 * Memory is bounded by `prune()`, which evicts fully-expired keys on a
 * sampled basis rather than on a timer (no interval to leak in tests).
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Requests still available in the current window. */
  remaining: number;
  /** Seconds until the window frees a slot. 0 when allowed. */
  retryAfter: number;
}

export interface RateLimiterOptions {
  /** Max requests permitted per key within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /**
   * Injectable clock — tests drive time explicitly instead of sleeping.
   * Defaults to `Date.now`. (Note: unlike a Shopify Function, this runs
   * in normal Node, so the real clock here is genuinely the real clock.)
   */
  now?: () => number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
  /** Test/ops hook — drops all state. */
  reset(): void;
  /** Number of tracked keys. Exposed for tests and debugging. */
  size(): number;
}

/** Evict expired keys roughly once every N checks. */
const PRUNE_EVERY = 500;

export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
}: RateLimiterOptions): RateLimiter {
  const hits = new Map<string, number[]>();
  let sincePrune = 0;

  function prune(cutoff: number) {
    for (const [key, timestamps] of hits) {
      const live = timestamps.filter((t) => t > cutoff);
      if (live.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, live);
      }
    }
  }

  return {
    check(key: string): RateLimitResult {
      const current = now();
      const cutoff = current - windowMs;

      if (++sincePrune >= PRUNE_EVERY) {
        sincePrune = 0;
        prune(cutoff);
      }

      const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);

      if (recent.length >= limit) {
        // The oldest hit in the window is the one that frees a slot.
        const oldest = recent[0];
        const retryAfter = Math.max(
          1,
          Math.ceil((oldest + windowMs - current) / 1000),
        );
        // Persist the pruned list so a blocked caller does not keep the
        // expired timestamps alive forever.
        hits.set(key, recent);
        return { allowed: false, remaining: 0, retryAfter };
      }

      recent.push(current);
      hits.set(key, recent);
      return {
        allowed: true,
        remaining: limit - recent.length,
        retryAfter: 0,
      };
    },

    reset() {
      hits.clear();
      sincePrune = 0;
    },

    size() {
      return hits.size;
    },
  };
}

/**
 * Per-submitter limit. Keyed on shop + client IP, so one abusive visitor
 * cannot lock out the rest of the merchant's customers. Deliberately
 * tight: a human filling in a wholesale application submits once, twice
 * if they fat-fingered something.
 */
export const applyPerClientLimiter = createRateLimiter({
  limit: 5,
  windowMs: 60_000,
});

/**
 * Per-shop backstop. Catches a distributed flood where every request
 * carries a different IP. Sized well above any plausible organic burst —
 * a merchant receiving 60 genuine applications in one minute has a very
 * good problem and should call us.
 */
export const applyPerShopLimiter = createRateLimiter({
  limit: 60,
  windowMs: 60_000,
});

/**
 * Best-effort client IP.
 *
 * App Proxy requests reach us through Shopify's edge, which appends the
 * storefront visitor's address to `X-Forwarded-For`; the leftmost entry
 * is the original client. The header is spoofable in principle, but a
 * spoofed value only ever splits an attacker's own bucket — it cannot
 * borrow another client's quota — and the per-shop limiter is the
 * backstop for exactly that case.
 *
 * Returns `"unknown"` when no address is available, which buckets all
 * such requests together. That is intentional: unattributable traffic
 * sharing one tight quota is the conservative failure mode.
 */
export function clientIpFrom(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
