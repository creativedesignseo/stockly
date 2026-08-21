/**
 * Admin route: import existing wholesale customers.
 *
 * URL: /app/customers/import
 *
 * Onboarding for a TAG-BASED wholesale shop. On the tag track, order
 * minimums only apply to customers with a `WholesaleCustomer` row — the
 * Validation Function's fallback path fails open on anyone else — while
 * wholesale PRICING is granted by the tag alone. A merchant who installs
 * Stockly with 100 already-tagged customers therefore gets wholesale
 * prices for all 100 and minimums for none of them, which looks exactly
 * like a broken minimum. (Native-B2B company buyers are gated by the
 * company-first path automatically and need no import.)
 *
 * `customers/update` cannot close that gap: it fires on change, so it
 * only ever sees customers tagged AFTER the install. This screen is the
 * one-off backfill.
 *
 * The merchant picks how the imported customers land — see `ImportMode`
 * in `services/customer-import.server.ts` for why there is no safe
 * default. After writing, the Discount Function metafield and the
 * Validation Function config are both re-synced so checkout sees the new
 * roster immediately.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Banner,
  Button,
  RadioButton,
  IndexTable,
  Badge,
  EmptyState,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticateAdmin } from "../lib/auth.server";
import {
  importWholesaleCustomers,
  previewWholesaleCustomerImport,
  type ImportMode,
} from "../services/customer-import.server";
import { syncTiersToFunction } from "../services/discount-function-sync.server";
import { syncOpeningOrderValidation } from "../services/opening-order-sync.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, shop } = await authenticateAdmin(request);

  // A Shopify blip here must not render an error page — show the empty
  // state and let the merchant retry.
  const preview = await previewWholesaleCustomerImport(
    admin,
    shop.id,
    shop.wholesaleTag,
  ).catch((error) => {
    console.error("[customer-import] preview failed:", error);
    return null;
  });

  return json({
    wholesaleTag: shop.wholesaleTag,
    preview,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, shop } = await authenticateAdmin(request);
  const form = await request.formData();
  const modeRaw = String(form.get("mode") ?? "");
  const mode: ImportMode = modeRaw === "pending" ? "pending" : "qualified";

  // Re-read from Shopify rather than trusting ids posted by the browser:
  // the list is the merchant's customer roster, so it must come from the
  // API, not from whatever the form says.
  const preview = await previewWholesaleCustomerImport(
    admin,
    shop.id,
    shop.wholesaleTag,
  );

  const result = await importWholesaleCustomers(
    shop.id,
    preview.customers,
    mode,
  );

  // Push the new roster to both Functions: the Discount Function's
  // qualifiedCustomers list and the Validation Function's pending /
  // qualified lists. Without this the import is invisible at checkout
  // until some other save happens to trigger a sync.
  await syncTiersToFunction(admin, shop.id);
  await syncOpeningOrderValidation(admin, shop.id);

  return json({ ok: true as const, ...result, mode });
};

export default function ImportWholesaleCustomers() {
  const { wholesaleTag, preview } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const [mode, setMode] = useState<ImportMode>("qualified");

  const pending = preview?.customers.filter((c) => !c.alreadyImported) ?? [];
  const already = preview?.customers.filter((c) => c.alreadyImported) ?? [];

  return (
    <Page
      title="Import wholesale customers"
      backAction={{ content: "Applications", url: "/app/customers/applications" }}
    >
      <TitleBar title="Import wholesale customers" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {actionData?.ok && (
              <Banner tone="success" title="Import complete">
                <p>
                  {actionData.imported} customer
                  {actionData.imported === 1 ? "" : "s"} imported
                  {actionData.skipped > 0
                    ? `, ${actionData.skipped} already known and left untouched`
                    : ""}
                  . Checkout minimums now apply to them.
                </p>
              </Banner>
            )}

            {!preview && (
              <Banner tone="warning" title="Could not read your customers">
                <p>
                  Shopify did not answer. Reload the page to try again.
                </p>
              </Banner>
            )}

            {preview?.truncated && (
              <Banner tone="warning" title="More customers than we can list">
                <p>
                  Only the first 2,500 tagged customers are shown. Import
                  these, then reload to continue with the rest.
                </p>
              </Banner>
            )}

            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  Why this matters
                </Text>
                <Text variant="bodyMd" as="p">
                  This screen is for tag-based wholesale: customers who
                  carry your &quot;{wholesaleTag}&quot; tag see wholesale
                  prices, but until you import them their carts skip the
                  order minimums — which looks like the minimum is not
                  working. Buyers who purchase through a Shopify B2B
                  company are covered automatically and do not need
                  importing.
                </Text>
              </BlockStack>
            </Card>

            {pending.length > 0 && (
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">
                      How should these customers start?
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      This decides whether your existing buyers have to
                      clear the first-order minimum again.
                    </Text>
                  </BlockStack>
                  <BlockStack gap="200">
                    <RadioButton
                      label="They are established customers"
                      helpText="No opening-order gate — they already earned it. Only your recurring minimum applies. This is the usual choice for customers you have been selling to for a while."
                      checked={mode === "qualified"}
                      id="import-mode-qualified"
                      name="importMode"
                      onChange={() => setMode("qualified")}
                    />
                    <RadioButton
                      label="They must place an opening order first"
                      helpText="Their next order has to reach your first-purchase minimum before they count as fully wholesale."
                      checked={mode === "pending"}
                      id="import-mode-pending"
                      name="importMode"
                      onChange={() => setMode("pending")}
                    />
                  </BlockStack>
                  <Form method="post">
                    <input type="hidden" name="mode" value={mode} />
                    <InlineStack align="start">
                      <Button submit variant="primary" loading={submitting}>
                        {`Import ${pending.length} customer${pending.length === 1 ? "" : "s"}`}
                      </Button>
                    </InlineStack>
                  </Form>
                </BlockStack>
              </Card>
            )}

            <Card padding="0">
              {preview && preview.customers.length === 0 ? (
                <EmptyState
                  heading="No tagged customers found"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    No customer in your store carries the
                    &quot;{wholesaleTag}&quot; tag yet. Tag your wholesale
                    buyers in Shopify, then come back.
                  </p>
                </EmptyState>
              ) : (
                <IndexTable
                  resourceName={{ singular: "customer", plural: "customers" }}
                  itemCount={preview?.customers.length ?? 0}
                  selectable={false}
                  headings={[
                    { title: "Customer" },
                    { title: "Email" },
                    { title: "Status" },
                  ]}
                >
                  {[...pending, ...already].map((c, index) => (
                    <IndexTable.Row
                      id={c.shopifyCustomerId}
                      key={c.shopifyCustomerId}
                      position={index}
                    >
                      <IndexTable.Cell>
                        <Text as="span" fontWeight="semibold">
                          {c.displayName || "—"}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>{c.email || "—"}</IndexTable.Cell>
                      <IndexTable.Cell>
                        {c.alreadyImported ? (
                          <Badge tone="success">In Stockly</Badge>
                        ) : (
                          <Badge tone="attention">Not imported</Badge>
                        )}
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              )}
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
