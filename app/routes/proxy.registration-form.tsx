/**
 * App Proxy endpoint — public read for the storefront's Registration
 * Form definition (ADR-013, Phase 1C).
 *
 * Storefront URL: GET /apps/stockly/registration-form
 * Shopify forwards to: GET /proxy/registration-form (this route)
 *
 * Contract — load-bearing for the storefront block. The renderer in
 * `extensions/quick-order-form/assets/registration-form.src.js`
 * destructures THIS exact shape:
 *
 *   {
 *     ok: true,
 *     definition: { steps: [{ id, titleEn, fields: FormField[] }] },
 *     appearance: {
 *       layout: 'default' | 'boxed',
 *       width: number,
 *       colors: { main, heading, label, description, option,
 *                 paragraph, paragraphBg },
 *       background: { type: 'color', color: string },
 *       customCss: string
 *     },
 *     settings: {
 *       titleEn: string,
 *       redirectUrl?: string,
 *       errorMessages: { required, invalid, invalidEmail, invalidPhone,
 *                        tooLong, tooShort, mismatch, networkError,
 *                        genericError }
 *     },
 *     version: number   // monotonic; bumped on every admin save
 *   }
 *
 * Error shape:  { ok: false, error: string }
 *
 * Auth: Shopify HMAC-signs every App Proxy request; we verify via
 * `authenticate.public.appProxy` (throws 401 on tamper). No additional
 * CSRF token needed — see progress/2026-05-28-app-proxy-contract.md.
 *
 * Caching: Cache-Control: no-cache, private. Reviewer SHOULD-5 — a
 * 60s window between merchant save and storefront preview is bad UX
 * (the merchant clicks Save then refreshes the storefront and sees
 * stale data for up to a minute). `version` integer on the row is the
 * cache-bust hint for any future client-side de-duping.
 *
 * Defense in depth: if a shop predates the Phase 1A schema, the GET
 * loader calls `ensureDefaultRegistrationForm` to seed the back-compat
 * default on the fly. The storefront block never sees a 404.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import { authenticate } from "../shopify.server";
import {
  ensureDefaultRegistrationForm,
  parseAppearance,
  parseDefinition,
  parseSettings,
} from "../services/registrationForms.server";
import type { RegistrationFormPayload } from "../lib/registrationForm/types";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // HMAC-verified before we ever see the request body. `session` may
  // be null for anonymous storefront visitors — fall back to the
  // `shop` query param Shopify always attaches.
  const { session } = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const shopDomain = session?.shop ?? url.searchParams.get("shop");

  if (!shopDomain) {
    return json(
      { ok: false, error: "Missing shop parameter" },
      { status: 400, headers: jsonHeaders() },
    );
  }

  // Lazily seed: any shop that predates Phase 1A acquires a working
  // back-compat form here. Idempotent — re-reads the row if present.
  const row = await ensureDefaultRegistrationForm(shopDomain);

  // If the merchant flipped status=draft we still serve a form so the
  // storefront never breaks. Phase 1's chosen semantics: draft ==
  // continue serving the most recent active definition. (Decision
  // recorded in ADR-013 risk section.)
  const payload: RegistrationFormPayload = {
    ok: true,
    definition: parseDefinition(row),
    appearance: parseAppearance(row),
    settings: parseSettings(row),
    version: row.version,
  };

  return json(payload, {
    status: 200,
    headers: { ...jsonHeaders(), "Cache-Control": "no-cache, private" },
  });
};

function jsonHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
  };
}

// No default export — resource route (loader only).
