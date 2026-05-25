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
  return {
    tiers,
    // Used to compute the "Effective %" column — the multiplicative
    // composition of baseline × tier, which is what the customer
    // actually sees at checkout. See ADR-006.
    wholesaleBaselinePct: shop.wholesaleBaselinePct,
  };
};

/**
 * Multiplicative composition of baseline + tier discount (ADR-006).
 *   final % off retail = 1 - (1 - baseline/100) × (1 - tier/100)
 * Returns a number 0–100 rounded to 2 decimals.
 */
function composeEffectivePct(baseline: number, tier: number): number {
  const b = Math.min(100, Math.max(0, baseline));
  const t = Math.min(100, Math.max(0, tier));
  const factor = (1 - b / 100) * (1 - t / 100);
  return Math.round((1 - factor) * 10000) / 100;
}

export default function TiersIndex() {
  const { tiers, wholesaleBaselinePct } = useLoaderData<typeof loader>();
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
              { title: "Effective" },
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
                  <EffectiveCell
                    baseline={wholesaleBaselinePct}
                    tier={tier.discountPct}
                    scope={tier.scope}
                  />
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
        {wholesaleBaselinePct > 0 ? (
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Cómo se calcula el Effective %
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Stockly aplica el baseline wholesale primero, luego el descuento
                del tier sobre el precio ya rebajado. Por ejemplo, baseline 50%
                + tier 10% = customer paga 45% del retail (55% off, no 60%).
                Esto evita que las composiciones puedan superar el 100% off.
              </Text>
            </BlockStack>
          </Card>
        ) : null}
      </BlockStack>
    </Page>
  );
}

/**
 * Renders the multiplicative effective % cell.
 * - When baseline is 0, shows an em-dash in a subdued tone because the
 *   effective discount would equal the tier discount (redundant).
 * - When the tier is collection-scoped, appends an asterisk to flag that
 *   enforcement is storefront-only (no Shopify-native discount applies).
 */
function EffectiveCell({
  baseline,
  tier,
  scope,
}: {
  baseline: number;
  tier: number;
  scope?: string;
}) {
  if (baseline === 0) {
    return (
      <Text as="span" variant="bodyMd" tone="subdued">
        —
      </Text>
    );
  }
  const effective = composeEffectivePct(baseline, tier).toFixed(2) + "%";
  const suffix = scope === "collection" ? "*" : "";
  return (
    <Text as="span" variant="bodyMd" fontWeight="semibold" tone="success">
      {effective}
      {suffix}
    </Text>
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
