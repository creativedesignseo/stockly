/**
 * Admin route: list all wholesale pricing rules for the shop.
 *
 * URL: /app/pricing/list
 *
 * Sami-pattern reskin of the legacy /app/tiers list (validated with
 * Jonatan 2026-05-27 — he showed Sami's "Wholesale Pricing" list as
 * the target):
 *   - Tabs filter: All / Active / Inactive. Sami has 5 tabs (All /
 *     Active / Draft / Expired / Pending) but Stockly's Tier model
 *     only has `active: boolean` — no draft / scheduling / lifecycle.
 *     Showing 3 honest tabs instead of 5 with empty fakes.
 *   - Columns: ID / Name / Status / Apply Customers / Apply Products
 *     / Apply Markets / Created. "Apply Customers" and "Apply Markets"
 *     are constant strings for now ("All wholesale" / "All markets")
 *     because Stockly doesn't segment by customer-tag or by Market yet
 *     — those are roadmap items mirrored on the Pricing hub
 *     ("Per-customer overrides" Coming soon card).
 *   - Click on a row → /app/tiers/$id (legacy edit form, still
 *     functional). Migrating the edit form to /app/pricing/$id with
 *     the same Sami-style layout is the natural follow-up task.
 *   - Primary action top-right: "Create new wholesale pricing" →
 *     /app/pricing/new (the new Sami-style create form).
 *
 * The legacy /app/tiers route stays alive so any bookmarks /
 * external links keep working. We just stopped surfacing it in
 * navigation (the hub points here instead).
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import { useMemo } from "react";
import {
  Page,
  Card,
  EmptyState,
  IndexTable,
  Badge,
  Text,
  Tabs,
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
    baselinePct: shop.wholesaleBaselinePct,
  };
};

type TabId = "all" | "active" | "inactive";

export default function PricingList() {
  const { tiers } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  /* ----- Tab filter (driven by ?status= query param) -----
   * setSearchParams (not window.location.assign) — same reason as
   * /app/customers/applications: a full reload inside the Shopify
   * embed iframe loses host / embedded / id_token and we'd hit
   * ERR_TOO_MANY_REDIRECTS. (See commit 4a115c8 and lesson 7 in
   * progress/2026-05-26-approve-flow-fix.md.)
   */
  const filterParam = (searchParams.get("status") as TabId | null) ?? "all";
  const activeCount = tiers.filter((t) => t.active).length;
  const inactiveCount = tiers.length - activeCount;

  const tabs = [
    { id: "all", content: `All (${tiers.length})`, panelID: "all" },
    { id: "active", content: `Active (${activeCount})`, panelID: "active" },
    {
      id: "inactive",
      content: `Inactive (${inactiveCount})`,
      panelID: "inactive",
    },
  ];
  const tabIndex =
    filterParam === "active" ? 1 : filterParam === "inactive" ? 2 : 0;

  const onTabSelect = (idx: number) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (idx === 0) next.delete("status");
        else if (idx === 1) next.set("status", "active");
        else next.set("status", "inactive");
        return next;
      },
      { replace: true },
    );
  };

  const filteredTiers = useMemo(() => {
    if (filterParam === "active") return tiers.filter((t) => t.active);
    if (filterParam === "inactive") return tiers.filter((t) => !t.active);
    return tiers;
  }, [tiers, filterParam]);

  const resourceName = { singular: "rule", plural: "rules" };
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(
      filteredTiers.map((t) => ({ id: t.id })) as { id: string }[],
    );

  /* ----- Empty state — no rules at all yet ----- */
  if (tiers.length === 0) {
    return (
      <Page
        backAction={{ content: "Pricing", url: "/app/pricing" }}
        primaryAction={{
          content: "Create new wholesale pricing",
          url: "/app/pricing/new",
        }}
      >
        <TitleBar title="Wholesale pricing" />
        <Card>
          <EmptyState
            heading="No wholesale pricing rules yet"
            action={{
              content: "Create new wholesale pricing",
              url: "/app/pricing/new",
            }}
            secondaryAction={{
              content: "Learn how it works",
              url: "https://shopify.dev/docs/apps/build/discount-functions",
              external: true,
            }}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <Text as="p" variant="bodyMd">
              Wholesale pricing rules reward B2B customers with automatic
              discounts based on volume — by quantity or by mixing products
              to hit a cart total. They stack on top of the shop-wide
              baseline.
            </Text>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  return (
    <Page
      backAction={{ content: "Pricing", url: "/app/pricing" }}
      primaryAction={{
        content: "Create new wholesale pricing",
        url: "/app/pricing/new",
      }}
    >
      <TitleBar title="Wholesale pricing" />
      <BlockStack gap="0">
        <Card padding="0">
          <Tabs tabs={tabs} selected={tabIndex} onSelect={onTabSelect} />
          <IndexTable
            resourceName={resourceName}
            itemCount={filteredTiers.length}
            selectedItemsCount={
              allResourcesSelected ? "All" : selectedResources.length
            }
            onSelectionChange={handleSelectionChange}
            emptyState={
              <EmptyState
                heading={
                  filterParam === "active"
                    ? "No active rules"
                    : filterParam === "inactive"
                      ? "No inactive rules"
                      : "Nothing here"
                }
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <Text as="p" variant="bodyMd">
                  Try a different tab or create a new rule.
                </Text>
              </EmptyState>
            }
            headings={[
              { title: "ID" },
              { title: "Name" },
              { title: "Status" },
              { title: "Apply Customers" },
              { title: "Apply Products" },
              { title: "Apply Markets" },
              { title: "Created" },
            ]}
          >
            {filteredTiers.map((tier, index) => (
              <IndexTable.Row
                id={tier.id}
                key={tier.id}
                position={index}
                selected={selectedResources.includes(tier.id)}
                onClick={() => navigate(`/app/tiers/${tier.id}`)}
              >
                <IndexTable.Cell>
                  <Text as="span" variant="bodySm" tone="subdued">
                    #{tier.id.slice(0, 6)}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text variant="bodyMd" fontWeight="semibold" as="span">
                    {tier.name}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge tone={tier.active ? "success" : undefined}>
                    {tier.active ? "Active" : "Inactive"}
                  </Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" variant="bodyMd">
                    All wholesale
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <ScopeCell scope={tier.scope} />
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" variant="bodyMd">
                    All markets
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {new Date(tier.createdAt).toLocaleDateString()}
                  </Text>
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        </Card>
      </BlockStack>
    </Page>
  );
}

function ScopeCell({ scope }: { scope: string }) {
  if (scope === "all")
    return (
      <Text as="span" variant="bodyMd">
        All products
      </Text>
    );
  if (scope === "product")
    return (
      <Text as="span" variant="bodyMd">
        Specific product
      </Text>
    );
  if (scope === "variant")
    return (
      <Text as="span" variant="bodyMd">
        Specific variant
      </Text>
    );
  if (scope === "collection")
    return (
      <Text as="span" variant="bodyMd">
        Collection
      </Text>
    );
  return (
    <Text as="span" variant="bodyMd">
      {scope}
    </Text>
  );
}
