/**
 * Admin route: list all tiers for the authenticated shop.
 *
 * URL: /app/tiers
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  EmptyState,
  IndexTable,
  Badge,
  Text,
  BlockStack,
  useIndexResourceState,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticateAdmin } from "../lib/auth.server";
import { listTiers } from "../services/tiers.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await authenticateAdmin(request);
  const tiers = await listTiers(shop.id);
  return { tiers };
};

export default function TiersIndex() {
  const { tiers } = useLoaderData<typeof loader>();
  const resourceName = { singular: "tier", plural: "tiers" };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(
      tiers.map((t) => ({ id: t.id })) as { id: string }[],
    );

  if (tiers.length === 0) {
    return (
      <Page>
        <TitleBar title="Tiers" />
        <Card>
          <EmptyState
            heading="Create your first wholesale tier"
            action={{ content: "Create tier", url: "/app/tiers/new" }}
            secondaryAction={{
              content: "Learn about tiers",
              url: "https://shopify.dev/docs/apps/build/b2b",
              external: true,
            }}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <Text as="p" variant="bodyMd">
              Tiers let you reward wholesale buyers with automatic discounts
              as their order quantity grows. For example: 10 units = 5% off,
              50 units = 10% off.
            </Text>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  return (
    <Page
      primaryAction={{
        content: "Create tier",
        url: "/app/tiers/new",
      }}
    >
      <TitleBar title="Tiers" />
      <BlockStack gap="400">
        <Card padding="0">
          <IndexTable
            resourceName={resourceName}
            itemCount={tiers.length}
            selectedItemsCount={
              allResourcesSelected ? "All" : selectedResources.length
            }
            onSelectionChange={handleSelectionChange}
            headings={[
              { title: "Name" },
              { title: "Scope" },
              { title: "Min qty" },
              { title: "Discount" },
              { title: "Status" },
            ]}
          >
            {tiers.map((tier, index) => (
              <IndexTable.Row
                id={tier.id}
                key={tier.id}
                position={index}
                selected={selectedResources.includes(tier.id)}
              >
                <IndexTable.Cell>
                  <Link to={`/app/tiers/${tier.id}`}>
                    <Text variant="bodyMd" fontWeight="semibold" as="span">
                      {tier.name}
                    </Text>
                  </Link>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <ScopeBadge scope={tier.scope} scopeId={tier.scopeId} />
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" variant="bodyMd" numeric>
                    {tier.minQty}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {tier.discountPct}%
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge tone={tier.active ? "success" : undefined}>
                    {tier.active ? "Active" : "Inactive"}
                  </Badge>
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        </Card>
      </BlockStack>
    </Page>
  );
}

function ScopeBadge({
  scope,
  scopeId,
}: {
  scope: string;
  scopeId: string | null;
}) {
  if (scope === "all") return <Badge>All products</Badge>;
  if (scope === "collection") return <Badge tone="info">Collection</Badge>;
  if (scope === "product") return <Badge tone="info">Product</Badge>;
  if (scope === "variant") return <Badge tone="success">Variant</Badge>;
  return <Badge>{scope}</Badge>;
}
