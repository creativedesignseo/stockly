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
 * `shop` — an App Store install or an admin link both do — and
 * `login(request)` starts OAuth from that param inside the loader. The form
 * was only ever reachable by someone typing a domain by hand, exactly the
 * flow the requirement prohibits. What renders now is a dead end that tells
 * the merchant where to go instead.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
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

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // There is deliberately NO shop-recovery redirect here any more.
  //
  // It used to resolve the shop from Referer/cookie and bounce through
  // `/?shop=X` → `/app?shop=X`, betting that `/app` could re-bootstrap. It
  // cannot: the SDK only recovers when `embedded=1` AND `host` are present,
  // and this route can fabricate neither. Verified against production —
  // `/app?shop=X` 302s straight back here, so the detour was structurally
  // incapable of succeeding and simply cycled:
  //
  //   /auth/login → /?shop=X → /app?shop=X → /auth/login → …
  //
  // A Shopify reviewer hit that loop on 2026-08-13. A short-lived guard
  // cookie was tried first, but it is a third-party cookie inside the
  // admin.shopify.com iframe with no `Partitioned` attribute — Safari's ITP
  // drops it outright, so the loop survived there. Removing the redirect
  // fixes it in every browser and loses nothing that ever worked.
  //
  // With a `shop` present, `login()` starts OAuth and never returns. Without
  // one there is nothing to authenticate, and the page below explains where
  // to go — no shop-domain field, per App Store requirement 2.3.1.
  await login(request);

  return json({ polarisTranslations });
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
