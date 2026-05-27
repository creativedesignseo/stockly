/**
 * App Proxy endpoint — receives wholesale application submissions
 * from the storefront registration form.
 *
 * Storefront URL: POST /apps/stockly/apply
 * Shopify forwards to: POST /proxy/apply (this route)
 *
 * Returns JSON:
 *   { ok: true, id: <applicationId> }
 *   { ok: false, errors: [<string>, ...] }
 *
 * Auth: Shopify signs the proxy request with HMAC; we verify via
 * authenticate.public.appProxy which throws 401 on tampering.
 *
 * No CAPTCHA / rate limiting in v1 — App Proxy already gives us
 * HMAC-authenticated origin (only requests originating from the
 * merchant's storefront reach us). Spam protection can layer on
 * top in Sprint 5 if needed.
 */
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../services/shops.server";
import {
  submitApplication,
  validateApplication,
} from "../services/wholesale-applications.server";
// RF Phase 1C — dual-write path. Validates against the shop's
// active form definition and persists a row in the new Application
// table alongside the legacy WholesaleApplication. Both tables
// receive writes during the soak; legacy is dropped in Phase 1G.
import {
  ensureDefaultRegistrationForm,
  parseDefinition,
  parseSettings,
} from "../services/registrationForms.server";
import { validateResponses } from "../lib/registrationForm/validate";
import { submitApplication as submitGenericApplication } from "../services/applications.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json(
      { ok: false, errors: ["Method not allowed"] },
      { status: 405, headers: corsHeaders() },
    );
  }

  // HMAC-verified by Shopify before we ever see the request body.
  const { session } = await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shopDomain = session?.shop ?? url.searchParams.get("shop");
  if (!shopDomain) {
    return json(
      { ok: false, errors: ["Missing shop parameter"] },
      { status: 400, headers: corsHeaders() },
    );
  }

  const shopRow = await getOrCreateShop(shopDomain);

  // Parse the body — accept either form-encoded (default for
  // <form method="post">) or JSON.
  let body: Record<string, string>;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = (await request.json()) as Record<string, string>;
  } else {
    const form = await request.formData();
    body = Object.fromEntries(form.entries()) as Record<string, string>;
  }

  const loggedInCustomerId =
    url.searchParams.get("logged_in_customer_id") || undefined;

  const input = {
    shopId: shopRow.id,
    email: body.email ?? "",
    firstName: body.first_name || body.firstName,
    lastName: body.last_name || body.lastName,
    phone: body.phone,
    companyName: body.company_name || body.companyName || "",
    taxId: body.tax_id || body.taxId,
    website: body.website,
    country: body.country,
    notes: body.notes,
    shopifyCustomerId: loggedInCustomerId,
  };

  // Authoritative validation: the legacy validator gates the response
  // (back-compat — same error strings the storefront block already
  // surfaces). Phase 1C-7 (proxy rewrite in 1D) will swap this for
  // `validateResponses` once the storefront block ships the dynamic
  // renderer. Until then we keep the legacy gate AND mirror the
  // schema-driven validator in dev to surface drift early.
  const errors = validateApplication(input);
  if (errors.length > 0) {
    return json(
      { ok: false, errors },
      { status: 422, headers: corsHeaders() },
    );
  }

  // Schema-driven mirror: run the new validator against the shop's
  // active form definition, log any divergence. Non-blocking — the
  // legacy validator is still authoritative during the soak. When the
  // logs show zero divergence we cut over.
  try {
    const form = await ensureDefaultRegistrationForm(shopRow.id);
    const definition = parseDefinition(form);
    const settings = parseSettings(form);
    const newErrors = validateResponses(
      definition,
      body,
      settings.errorMessages,
    );
    if (newErrors.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        "[Stockly RF] schema-driven validator caught extra issues (logged only)",
        { shop: shopRow.id, newErrors },
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[Stockly RF] schema-driven mirror validation failed (non-blocking)",
      err,
    );
  }

  try {
    // Legacy write — still the source of truth for the queue + approve
    // flow until Phase 1F lands.
    const app = await submitApplication(input);

    // RF Phase 1C — dual write into the new generic Application
    // table. Non-blocking from the storefront's perspective: if this
    // fails we still return 201 because the legacy write succeeded.
    try {
      await submitGenericApplication({
        shopId: shopRow.id,
        responses: body,
        shopifyCustomerId: loggedInCustomerId ?? null,
      });
    } catch (mirrorErr) {
      // eslint-disable-next-line no-console
      console.error(
        "[Stockly RF] dual-write to Application table failed",
        mirrorErr,
      );
    }

    return json(
      { ok: true, id: app.id },
      { status: 201, headers: corsHeaders() },
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[Stockly] application submit failed", err);
    return json(
      {
        ok: false,
        errors: ["Something went wrong. Please try again later."],
      },
      { status: 500, headers: corsHeaders() },
    );
  }
};

// GET is unused — App Proxy expects a response on the path it forwards
// to, but our form only POSTs. Return 405 so anyone curl'ing this URL
// gets a clear signal.
export const loader = async () =>
  json(
    { ok: false, errors: ["Use POST to submit an application."] },
    { status: 405, headers: corsHeaders() },
  );

function corsHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
  };
}

// No default export — resource route (loader+action only).
