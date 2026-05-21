/**
 * Admin route: manually mark a wholesale customer as qualified.
 *
 * URL: /app/qualify-customer
 *
 * Workaround while the orders/paid webhook auto-qualification is
 * deferred pending Shopify's protected customer data approval flow.
 * Lets the merchant (or developer) flip a customer to "qualified"
 * state — does the same thing the webhook handler would:
 *   1. Upserts a WholesaleCustomer row with qualifiedAt = now()
 *   2. Writes the customer's wholesale-status metafield so the
 *      Discount Function picks up the qualification at checkout
 *
 * Once the protected customer data approval lands, this route can
 * stay as an admin tool for edge cases (customer paid via channel
 * the webhook didn't reach, manual approvals, etc.).
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import {
  Page,
  Card,
  FormLayout,
  TextField,
  Button,
  Banner,
  BlockStack,
  Text,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState } from "react";

import { authenticateAdmin } from "../lib/auth.server";
import prisma from "../db.server";
import { syncTiersToFunction } from "../services/discount-function-sync.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticateAdmin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, shop } = await authenticateAdmin(request);
  const form = await request.formData();

  const customerIdRaw = (form.get("customerId") ?? "").toString().trim();
  if (!customerIdRaw) {
    return {
      error: "Customer ID is required",
      lastInput: { customerId: "" },
    };
  }

  // Accept either a bare numeric ID or a full GID. Normalize.
  const numericId = customerIdRaw.replace("gid://shopify/Customer/", "");
  if (!/^\d+$/.test(numericId)) {
    return {
      error: `"${customerIdRaw}" is not a valid Shopify customer ID. Paste the numeric ID from the customer's admin URL.`,
      lastInput: { customerId: customerIdRaw },
    };
  }
  const qualifiedAt = new Date();

  // Step 1: upsert WholesaleCustomer row with qualifiedAt set.
  await prisma.wholesaleCustomer.upsert({
    where: {
      shopId_shopifyCustomerId: {
        shopId: shop.id,
        shopifyCustomerId: numericId,
      },
    },
    create: {
      shopId: shop.id,
      shopifyCustomerId: numericId,
      qualifiedAt,
      qualifyingOrderId: "manual",
      notes: "Manually qualified via /app/qualify-customer",
    },
    update: {
      qualifiedAt,
      qualifyingOrderId: "manual",
    },
  });

  // Step 2: refresh the Discount Function's shop-level metafield.
  // buildConfiguration now includes the full list of qualified
  // customer GIDs so the Function can do an O(n) membership check
  // at checkout. This avoids writing customer metafields, which are
  // protected data and require Shopify's separate approval flow.
  await syncTiersToFunction(admin, shop.id);

  return {
    ok: true,
    customerId: numericId,
    qualifiedAt: qualifiedAt.toISOString(),
  };
};

export default function QualifyCustomer() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  const initial =
    actionData && "lastInput" in actionData
      ? actionData.lastInput.customerId
      : "";
  const [customerId, setCustomerId] = useState<string>(initial);

  const errorMsg =
    actionData && "error" in actionData ? actionData.error : null;
  const success =
    actionData && "ok" in actionData && actionData.ok ? actionData : null;

  return (
    <Page backAction={{ content: "App", url: "/app" }}>
      <TitleBar title="Manually qualify customer" />
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Mark a wholesale customer as qualified
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              Use this while the orders/paid webhook auto-qualification
              is deferred (pending Shopify&apos;s protected customer
              data approval). It runs the same logic the webhook handler
              would: it upserts the WholesaleCustomer row with
              <code>qualifiedAt = now()</code> AND writes the customer
              metafield the Discount Function reads at checkout.
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              Get the customer&apos;s numeric ID from their admin URL,
              e.g. <code>.../customers/10103069901128</code> →
              paste <code>10103069901128</code>.
            </Text>
          </BlockStack>
        </Card>

        <Card>
          <Form method="post">
            <FormLayout>
              {success && (
                <Banner tone="success" title="Customer qualified">
                  <p>
                    Customer <code>{success.customerId}</code> marked as
                    qualified at {success.qualifiedAt}. The Discount
                    Function will skip the FPQ gate on their next cart.
                  </p>
                </Banner>
              )}
              {errorMsg && (
                <Banner tone="critical" title="Could not qualify">
                  <p>{errorMsg}</p>
                </Banner>
              )}

              <TextField
                label="Customer ID (Shopify numeric ID or full GID)"
                name="customerId"
                autoComplete="off"
                value={customerId}
                onChange={setCustomerId}
                helpText="From the URL of the customer's admin page. E.g. 10103069901128"
                requiredIndicator
              />

              <InlineStack align="end">
                <Button submit variant="primary" loading={submitting}>
                  Mark as qualified
                </Button>
              </InlineStack>
            </FormLayout>
          </Form>
        </Card>
      </BlockStack>
    </Page>
  );
}
