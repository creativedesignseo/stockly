import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Link,
  Outlet,
  isRouteErrorResponse,
  useLoaderData,
  useRouteError,
} from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticateAdmin } from "../lib/auth.server";
import { buildShopCookie, readShopCookie } from "../lib/shop-cookie.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // authenticateAdmin guarantees a Stockly Shop row exists for the
  // authenticated store. Every admin page loads through this layout,
  // so this is also our "post-install bootstrap" hook.
  const { shop } = await authenticateAdmin(request);

  // Drop a long-lived "last shop" cookie so a browser refresh (F5) on a
  // deep admin route (e.g. /app/customers/applications) can still
  // recover the Shopify auth context. See app/lib/shop-cookie.server.ts
  // for the full reasoning. Only rewrite the cookie when the value
  // actually changed — avoids a needless Set-Cookie on every navigation.
  const headers = new Headers();
  const existing = readShopCookie(request);
  if (existing !== shop.id) {
    const cookie = buildShopCookie(shop.id);
    if (cookie) headers.append("Set-Cookie", cookie);
  }

  return json(
    { apiKey: process.env.SHOPIFY_API_KEY || "" },
    { headers },
  );
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Home
        </Link>
        <Link to="/app/onboarding?force=1">Setup</Link>
        {/*
          Two sibling pricing areas (mirrors Sami's structure):
            - Wholesale Pricing (/app/pricing) — the hub introduced
              2026-05-27 for tiers and baseline/FPQ/MOQ settings
              (Settings button on the list links to /app/settings/pricing
              for the shop-wide knobs). Legacy /app/tiers and
              /app/tiers/$id removed 2026-05-27.
            - Volume Pricing (/app/volume-pricing) — quantity-break
              discounts, built out in a sibling effort.
        */}
        <Link to="/app/pricing">Wholesale Pricing</Link>
        <Link to="/app/volume-pricing">Volume Pricing</Link>
        <Link to="/app/registration-form">Registration form</Link>
        <Link to="/app/customers/applications">Applications</Link>
        <Link to="/app/customers/import">Import customers</Link>
        <Link to="/app/qualify-customer">Qualify customer</Link>
        <Link to="/app/billing">Billing</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers
// are included in the response. Deliberate `throw new Response(...)` errors
// from child routes ("Volume pricing not found" 404s, "Unknown form intent"
// 400s) get a styled page with a way back instead of boundary.error's raw
// dangerouslySetInnerHTML dump (App Store 2.1.1). Everything else — notably
// the SDK's auth redirect Responses — still goes through boundary.error,
// which knows how to handle them.
export function ErrorBoundary() {
  const error = useRouteError();
  if (
    isRouteErrorResponse(error) &&
    error.status >= 400 &&
    error.status < 500
  ) {
    return (
      <div
        style={{
          maxWidth: "26rem",
          margin: "15vh auto 0",
          padding: "1.5rem",
          fontFamily:
            "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          background: "#ffffff",
          border: "1px solid #e1e3e5",
          borderRadius: "0.75rem",
          color: "#202223",
        }}
      >
        <h1 style={{ fontSize: "1.05rem", margin: "0 0 0.5rem" }}>
          {error.status === 404 ? "Not found" : "Something went wrong"}
        </h1>
        <p style={{ fontSize: "0.85rem", lineHeight: 1.5, margin: "0 0 1rem" }}>
          {typeof error.data === "string" && error.data.length > 0
            ? error.data
            : "The page you asked for is not available."}
        </p>
        <Link to="/app" style={{ fontSize: "0.85rem" }}>
          Back to dashboard
        </Link>
      </div>
    );
  }
  return boundary.error(error);
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
