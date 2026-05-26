import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
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
        <Link to="/app/tiers">Tiers</Link>
        <Link to="/app/settings/pricing">Pricing</Link>
        <Link to="/app/customers/applications">Applications</Link>
        <Link to="/app/qualify-customer">Qualify customer</Link>
        <Link to="/app/additional">Additional page</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
