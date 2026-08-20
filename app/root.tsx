import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useLoaderData,
  useRouteError,
  useRouteLoaderData,
} from "@remix-run/react";

// The App Bridge script tag has to be served from every document of the
// app, so the API key is exposed here rather than only in the embedded
// admin layout (app/routes/app.tsx). This is the app's client_id — the
// public half of the OAuth pair, already visible in the embedded frame.
// The secret never leaves the server.
export const loader = async (_args: LoaderFunctionArgs) => {
  return json({ apiKey: process.env.SHOPIFY_API_KEY || "" });
};

/**
 * Root error boundary — the last line of defence. Without it, any
 * unexpected throw outside /app/* (and any error the app.tsx boundary
 * rethrows) renders Remix's unstyled "Application Error" page, which
 * App Store rule 2.1.1 treats as a critical error. A root boundary
 * replaces the entire document, so it must render a full <html> and
 * cannot rely on loader data.
 */
export function ErrorBoundary() {
  const error = useRouteError();
  // Root loader data survives when the error came from a child route;
  // if the root loader itself threw, this is undefined and the App
  // Bridge script tag is simply omitted (the page is a static notice).
  const rootData = useRouteLoaderData<typeof loader>("root");
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const heading =
    isRouteErrorResponse(error) && error.status === 404
      ? "Page not found"
      : "Something went wrong";
  const body =
    isRouteErrorResponse(error) && error.status === 404
      ? "The page you asked for does not exist. If you followed a link from your Shopify admin, reopen Stockly from the Apps menu."
      : "An unexpected error occurred. Reload the page to try again — if it keeps happening, reopen Stockly from your Shopify admin's Apps menu.";

  return (
    <html>
      <head>
        {/* Keep App Bridge first even on the error document (2.2.3) so
            the embedded frame stays a well-behaved admin citizen. */}
        {rootData?.apiKey ? (
          <script
            src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
            data-api-key={rootData.apiKey}
          />
        ) : null}
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>
          {status} — {heading}
        </title>
        <Meta />
        <Links />
      </head>
      <body
        style={{
          margin: 0,
          fontFamily:
            "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          background: "#f6f6f7",
          color: "#202223",
        }}
      >
        <div
          style={{
            maxWidth: "26rem",
            margin: "15vh auto 0",
            padding: "1.5rem",
            background: "#ffffff",
            border: "1px solid #e1e3e5",
            borderRadius: "0.75rem",
          }}
        >
          <h1 style={{ fontSize: "1.05rem", margin: "0 0 0.5rem" }}>
            {heading}
          </h1>
          <p style={{ fontSize: "0.85rem", lineHeight: 1.5, margin: 0 }}>
            {body}
          </p>
        </div>
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <html>
      <head>
        {/*
          App Store requirement 2.2.3: the latest App Bridge must be loaded
          from Shopify's CDN via a script tag placed BEFORE any other script
          tag. Shopify's automated embedded-app check ("Use the latest App
          Bridge script loaded from Shopify's CDN") fails without it, which
          blocks submission — the @shopify/app-bridge-react package alone
          does not satisfy it. Keep this first inside <head>.
        */}
        <script
          src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
          data-api-key={apiKey}
        />
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
