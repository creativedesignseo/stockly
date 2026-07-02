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
import { submitApplication } from "../services/wholesale-applications.server";
// RF Phase 1D — schema-driven validation is now AUTHORITATIVE. We resolve
// the exact form the customer saw (by shortcode, default fallback) and
// validate the submission against ITS definition, so validation follows
// the merchant's form instead of a hardcoded field list. Still dual-writes
// the legacy WholesaleApplication + the new Application row during the soak.
import {
  resolveStorefrontForm,
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

  // Reserved key: which form the customer actually saw. Strip it so it is
  // never treated as a field response, validated, or stored.
  const shortCode = body.__shortcode || undefined;
  delete body.__shortcode;

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

  // Authoritative, schema-driven validation. Resolve the EXACT form the
  // customer saw (by shortcode; falls back to the shop default, and is
  // tenant-isolated by shopId) and validate the submission against ITS
  // definition. A field absent from the form is never required; a field
  // the merchant marked required IS enforced. This replaces the old
  // hardcoded legacy gate (which always required company name + email).
  const form = await resolveStorefrontForm(shopRow.id, shortCode);
  const definition = parseDefinition(form);
  const settings = parseSettings(form);

  // Scope responses to the form's field keys (ignore honeypot/intent keys).
  const responses: Record<string, string> = {};
  for (const step of definition.steps) {
    for (const field of step.fields) {
      if (body[field.key] !== undefined) {
        responses[field.key] = body[field.key];
      }
    }
  }

  const errors = validateResponses(
    definition,
    responses,
    settings.errorMessages,
  );

  // Email safeguard: the WholesaleApplication row and the pending-coalesce
  // logic key on email, so it must always be present + well-formed. When
  // the form has an email field, validateResponses already covers it; only
  // add the guard when the form omits one (defensive — the seed templates
  // all include a required email field).
  const hasEmailField = definition.steps.some((s) =>
    s.fields.some((f) => f.type === "email"),
  );
  if (!hasEmailField) {
    const emailVal = (body.email ?? "").trim();
    if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      errors.push("Email is required.");
    }
  }

  if (errors.length > 0) {
    return json(
      { ok: false, errors },
      { status: 422, headers: corsHeaders() },
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
      // SHOULD-4: structured log key for soak monitoring. Grep the
      // host's logs for [rf.dual_write.fail] during the 48h window.
      // eslint-disable-next-line no-console
      console.error("[rf.dual_write.fail]", {
        shop: shopRow.id,
        error: mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr),
        stack:
          mirrorErr instanceof Error ? mirrorErr.stack?.slice(0, 500) : undefined,
      });
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
