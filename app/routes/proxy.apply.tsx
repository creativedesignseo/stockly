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

  const errors = validateApplication(input);
  if (errors.length > 0) {
    return json(
      { ok: false, errors },
      { status: 422, headers: corsHeaders() },
    );
  }

  try {
    const app = await submitApplication(input);
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
