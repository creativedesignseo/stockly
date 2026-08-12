import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "@remix-run/react";

// The App Bridge script tag has to be served from every document of the
// app, so the API key is exposed here rather than only in the embedded
// admin layout (app/routes/app.tsx). This is the app's client_id — the
// public half of the OAuth pair, already visible in the embedded frame.
// The secret never leaves the server.
export const loader = async (_args: LoaderFunctionArgs) => {
  return json({ apiKey: process.env.SHOPIFY_API_KEY || "" });
};

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
