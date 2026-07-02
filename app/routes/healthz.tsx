/**
 * Liveness endpoint for the hosting platform (any future monitoring).
 *
 * GET /healthz → 200 with a tiny JSON payload.
 *
 * No Shopify auth, no DB query, no app-bridge bootstrap. The goal is
 * to confirm the Node process is alive and the HTTP layer routes —
 * NOT to confirm Shopify is reachable or Prisma can talk to Postgres.
 *
 * Why a dedicated route instead of pointing the health check at `/`:
 *   - `/` runs Shopify embedded-app auth bootstrap. A transient
 *     Shopify outage would mark the machine unhealthy and the host
 *     would restart it, making the outage worse for our users.
 *   - `/healthz` is intentionally boring: if it returns 500 the
 *     container itself is broken, not its dependencies.
 *
 * Used by:
 *   - Manual `curl -sI` smoke tests
 *   - (historical) Fly.io `[[http_service.checks]]` in fly.toml, back
 *     when Fly was the host — see HANDOFF.md for the current host.
 *
 * If you ever need a richer readiness probe (DB ping, Shopify ping),
 * add a separate /readyz endpoint and keep this one cheap.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = (_args: LoaderFunctionArgs) => {
  return new Response(
    JSON.stringify({
      ok: true,
      service: "stockly",
      time: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
};
