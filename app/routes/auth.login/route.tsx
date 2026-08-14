/**
 * Fallback entry point when a request reaches the app without Shopify's
 * auth context.
 *
 * App Store requirement 2.3.1: *"Your app must not request the manual entry
 * of a myshopify.com URL or a shop's domain during the installation or
 * configuration flow."* The Remix template ships this route with a
 * "Shop domain" text field and a Log in button — a well-known rejection
 * cause. It is gone.
 *
 * Nothing is lost by removing it. Every legitimate arrival carries a
 * `shop`: an App Store install, an admin link, and the recovery redirect
 * below all do. `login(request)` sees that param in the loader and starts
 * OAuth on its own, so the form was only ever reachable by someone typing
 * a domain by hand — exactly the flow the requirement prohibits. What
 * renders now is a dead end that tells the merchant where to go instead.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  AppProvider as PolarisAppProvider,
  Card,
  Layout,
  Page,
  Text,
  BlockStack,
} from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { login } from "../../shopify.server";
import {
  buildRecoveryGuardCookie,
  clearRecoveryGuardCookie,
  hasRecoveryGuard,
  isValidShopDomain,
  readShopCookie,
  shopFromReferer,
} from "../../lib/shop-cookie.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

/**
 * Try every available signal to figure out which shop the request
 * belongs to, in order of trust:
 *
 *   1. `?shop=` query param        — explicit, just trust it
 *   2. `Referer` header            — the embedded admin always sends one
 *   3. `stockly_last_shop` cookie  — set by /app loader on every auth
 *
 * All three sources are validated against the strict `*.myshopify.com`
 * shape, so a forged referer/cookie cannot redirect us to an arbitrary
 * host.
 */
function resolveShopHint(request: Request): string | null {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("shop");
  if (isValidShopDomain(fromQuery)) return fromQuery;

  const fromReferer = shopFromReferer(request.headers.get("referer"));
  if (fromReferer) return fromReferer;

  const fromCookie = readShopCookie(request);
  if (fromCookie) return fromCookie;

  return null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // When a merchant refreshes a deep admin route (e.g.
  // /app/customers/applications) the iframe reloads without Shopify's
  // search params, authenticate.admin() can't recover, and the SDK
  // redirects us here. Recover the shop from the Referer header or our
  // long-lived "last shop" cookie, then redirect through `/` so the root
  // loader can re-bootstrap (which triggers a fresh id_token exchange via
  // App Bridge — no manual login needed).
  //
  // The recovery is attempted AT MOST ONCE per short window. `/app` only
  // resolves this if it can authenticate the shop; when it cannot (no
  // session — e.g. a store that never finished installing) it redirects
  // back here and the three hops become an infinite loop. A Shopify
  // reviewer hit exactly that on 2026-08-13. The guard cookie makes the
  // second arrival fall through to the page instead of redirecting again.
  const url = new URL(request.url);
  const hint = resolveShopHint(request);
  const looping = hasRecoveryGuard(request);

  if (hint && !url.searchParams.get("shop") && !looping) {
    const params = new URLSearchParams(url.searchParams);
    params.set("shop", hint);
    throw redirect(`/?${params.toString()}`, {
      headers: { "Set-Cookie": buildRecoveryGuardCookie() },
    });
  }

  // With a `shop` present this starts OAuth and never returns a value.
  // Without one there is nothing to authenticate, and we fall through to
  // the informational page below.
  await login(request);

  // Clear the guard on the way out so a later genuine refresh — one where
  // the session does exist — still gets its single recovery attempt.
  return json(
    { polarisTranslations },
    looping ? { headers: { "Set-Cookie": clearRecoveryGuardCookie() } } : undefined,
  );
};

export default function Auth() {
  const { polarisTranslations: translations } = useLoaderData<typeof loader>();

  return (
    <PolarisAppProvider i18n={translations}>
      <Page>
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  Open Stockly from your Shopify admin
                </Text>
                <Text as="p" variant="bodyMd">
                  Stockly runs inside the Shopify admin. Open it from
                  Settings &rsaquo; Apps and sales channels, or from the Apps
                  menu in your admin sidebar.
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  If you have not installed Stockly yet, install it from its
                  Shopify App Store listing.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </PolarisAppProvider>
  );
}
