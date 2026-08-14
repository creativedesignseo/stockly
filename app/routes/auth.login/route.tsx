import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import {
  AppProvider as PolarisAppProvider,
  Button,
  Card,
  FormLayout,
  Page,
  Text,
  TextField,
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

import { loginErrorMessage } from "./error.server";

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
  // redirects us here. Before falling back to the boilerplate "Log in"
  // form, try to recover the shop from the Referer header or our
  // long-lived "last shop" cookie, then redirect through `/` so the
  // root loader can re-bootstrap (which triggers a fresh id_token
  // exchange via App Bridge — no manual login needed).
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

  const errors = loginErrorMessage(await login(request));

  // Clear the guard on the way out so a later genuine refresh — one where
  // the session does exist — still gets its single recovery attempt.
  return json(
    { errors, polarisTranslations },
    looping ? { headers: { "Set-Cookie": clearRecoveryGuardCookie() } } : undefined,
  );
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return {
    errors,
  };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;

  return (
    <PolarisAppProvider i18n={loaderData.polarisTranslations}>
      <Page>
        <Card>
          <Form method="post">
            <FormLayout>
              <Text variant="headingMd" as="h2">
                Log in
              </Text>
              <TextField
                type="text"
                name="shop"
                label="Shop domain"
                helpText="example.myshopify.com"
                value={shop}
                onChange={setShop}
                autoComplete="on"
                error={errors.shop}
              />
              <Button submit>Log in</Button>
            </FormLayout>
          </Form>
        </Card>
      </Page>
    </PolarisAppProvider>
  );
}
