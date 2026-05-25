/**
 * TEMPORARY debug endpoint — REMOVE after diagnosis.
 *
 * URL: /_debug
 *
 * Returns environment + DB + Shopify config diagnostics as JSON so we
 * can see what the runtime sees without needing live log streaming.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

export const loader = async (_args: LoaderFunctionArgs) => {
  const out: Record<string, unknown> = {
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    shopifyApiKey: maskEnv(process.env.SHOPIFY_API_KEY),
    shopifyApiSecret: maskEnv(process.env.SHOPIFY_API_SECRET),
    shopifyAppUrl: process.env.SHOPIFY_APP_URL,
    scopes: process.env.SCOPES,
    databaseUrlPresent: !!process.env.DATABASE_URL,
    databaseUrlScheme: process.env.DATABASE_URL?.split("://")[0] ?? null,
  };

  // Try DB connectivity
  try {
    const prisma = (await import("../db.server")).default;
    const count = await prisma.session.count();
    out.dbConnect = "ok";
    out.sessionCount = count;
  } catch (err) {
    out.dbConnect = "error";
    out.dbError = err instanceof Error ? err.message.slice(0, 400) : String(err);
  }

  // Try importing shopify.server (this is where the runtime usually fails)
  try {
    const mod = await import("../shopify.server");
    out.shopifyServerImport = "ok";
    out.shopifyServerExports = Object.keys(mod).slice(0, 10);
  } catch (err) {
    out.shopifyServerImport = "error";
    out.shopifyServerError = err instanceof Error ? err.message.slice(0, 600) : String(err);
    out.shopifyServerStack = err instanceof Error ? err.stack?.split("\n").slice(0, 6) : null;
  }

  return json(out, { status: 200 });
};

function maskEnv(v: string | undefined): { present: boolean; len: number; preview: string; hasNewline: boolean } {
  if (!v) return { present: false, len: 0, preview: "", hasNewline: false };
  return {
    present: true,
    len: v.length,
    preview: v.slice(0, 6) + "..." + v.slice(-3),
    hasNewline: v.includes("\n") || v.includes("\r"),
  };
}
