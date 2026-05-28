/**
 * Admin route: Volume Pricing — list of quantity-break rules.
 *
 * URL: /app/volume-pricing
 *
 * ADR-014: Volume Pricing is a separate admin area, sibling to
 * Wholesale Pricing (/app/pricing). This list is filtered to
 * `kind: "volume"` rules only — the multi-band "buy more, save more"
 * quantity breaks. Wholesale Pricing (flat single discounts) lives at
 * /app/pricing.
 *
 * Sami-pattern list:
 *   - Tabs filter: All / Active / Draft (backed by `active: boolean`).
 *   - Columns: ID / Name / Status / Apply Customers / Volume bands /
 *     Apply Products / Apply Markets / Created.
 *   - Click on a row → /app/volume-pricing/$id (the rich editor).
 *   - Primary action top-right: "Create volume pricing" →
 *     /app/volume-pricing/new.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useFetcher,
  useLoaderData,
  useNavigate,
  useSearchParams,
} from "@remix-run/react";
import { useMemo } from "react";
import {
  Page,
  Card,
  EmptyState,
  IndexTable,
  Text,
  Tabs,
  BlockStack,
  useIndexResourceState,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticateAdmin } from "../lib/auth.server";
import prisma from "../db.server";
import { listRules } from "../services/tiers.server";
import { syncTiersToFunction } from "../services/discount-function-sync.server";

/* -------------------------------------------------------------------------- */
/*                                  ACTION                                    */
/* -------------------------------------------------------------------------- */

/**
 * Inline toggle from the list — flips a rule's `active` flag without
 * forcing the merchant to open the edit form. After the DB write we
 * re-sync the Discount Function so checkout reflects the change
 * immediately (the same call /app/volume-pricing/$id makes on save).
 *
 * Intent = "toggle" + groupId + nextActive("on" | "off"). Triggered
 * by the per-row useFetcher in the Status column.
 *
 * ADR-012: works on groupId. Flips active on every band of the group
 * via updateMany.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, shop } = await authenticateAdmin(request);
  const form = await request.formData();
  const intent = (form.get("intent") ?? "").toString();
  if (intent !== "toggle") {
    throw new Response(`Unknown form intent: ${intent}`, { status: 400 });
  }
  const groupId = (form.get("groupId") ?? "").toString();
  const nextActive = form.get("nextActive") === "on";

  // Verify ownership before mutating. Same defensive pattern as
  // /app/volume-pricing/$id.tsx — actions can be hit directly via fetch.
  const existing = await prisma.tier.findFirst({
    where: { shopId: shop.id, groupId },
    select: { id: true },
  });
  if (!existing)
    throw new Response("Volume pricing not found", { status: 404 });

  await prisma.tier.updateMany({
    where: { shopId: shop.id, groupId },
    data: { active: nextActive },
  });
  try {
    await syncTiersToFunction(admin, shop.id);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[volume-pricing._index] syncTiersToFunction failed:", err);
  }
  return json({ ok: true, groupId, active: nextActive });
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await authenticateAdmin(request);
  // ADR-014: list only the volume rules (quantity breaks). Wholesale
  // rules live at /app/pricing.
  const rules = await listRules(shop.id, { kind: "volume" });
  return { rules };
};

/**
 * Tab ids. "draft" is the user-facing label for `active=false` rules
 * (per Jonatan 2026-05-27 — "Inactive" felt wrong, "Draft" matches
 * what Sami and the rest of the Shopify admin use for rules that
 * exist but aren't live). Internally still backed by `active: boolean`.
 */
type TabId = "all" | "active" | "draft";

export default function VolumePricingList() {
  const { rules } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  /* ----- Tab filter (driven by ?status= query param) -----
   * setSearchParams (not window.location.assign) — a full reload
   * inside the Shopify embed iframe loses host / embedded / id_token
   * and we'd hit ERR_TOO_MANY_REDIRECTS.
   */
  const rawStatus = searchParams.get("status");
  const filterParam: TabId =
    rawStatus === "active"
      ? "active"
      : rawStatus === "draft" || rawStatus === "inactive"
        ? "draft"
        : "all";
  const activeCount = rules.filter((r) => r.active).length;
  const draftCount = rules.length - activeCount;

  const tabs = [
    { id: "all", content: `All (${rules.length})`, panelID: "all" },
    { id: "active", content: `Active (${activeCount})`, panelID: "active" },
    {
      id: "draft",
      content: `Draft (${draftCount})`,
      panelID: "draft",
    },
  ];
  const tabIndex =
    filterParam === "active" ? 1 : filterParam === "draft" ? 2 : 0;

  const onTabSelect = (idx: number) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (idx === 0) next.delete("status");
        else if (idx === 1) next.set("status", "active");
        else next.set("status", "draft");
        return next;
      },
      { replace: true },
    );
  };

  const filteredRules = useMemo(() => {
    if (filterParam === "active") return rules.filter((r) => r.active);
    if (filterParam === "draft") return rules.filter((r) => !r.active);
    return rules;
  }, [rules, filterParam]);

  const resourceName = { singular: "rule", plural: "rules" };
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(
      filteredRules.map((r) => ({ id: r.groupId })) as { id: string }[],
    );

  /* ----- Empty state — no volume rules at all yet ----- */
  if (rules.length === 0) {
    return (
      <Page
        primaryAction={{
          content: "Create volume pricing",
          url: "/app/volume-pricing/new",
        }}
      >
        <TitleBar title="Volume pricing" />
        <Card>
          <EmptyState
            heading="No volume pricing rules yet"
            action={{
              content: "Create volume pricing",
              url: "/app/volume-pricing/new",
            }}
            secondaryAction={{
              content: "Learn how it works",
              url: "https://shopify.dev/docs/apps/build/discount-functions",
              external: true,
            }}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <Text as="p" variant="bodyMd">
              Volume pricing rewards customers who buy more: define
              quantity breaks (e.g. 1–9 → 10% off, 10–19 → 20% off,
              20+ → 30% off) and the discount deepens automatically as
              the cart grows. They stack on top of the shop-wide
              baseline.
            </Text>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  return (
    <Page
      primaryAction={{
        content: "Create volume pricing",
        url: "/app/volume-pricing/new",
      }}
    >
      <TitleBar title="Volume pricing" />
      <BlockStack gap="400">
        <Card padding="0">
          <Tabs tabs={tabs} selected={tabIndex} onSelect={onTabSelect} />
          <IndexTable
            resourceName={resourceName}
            itemCount={filteredRules.length}
            selectedItemsCount={
              allResourcesSelected ? "All" : selectedResources.length
            }
            onSelectionChange={handleSelectionChange}
            emptyState={
              <EmptyState
                heading={
                  filterParam === "active"
                    ? "No active rules"
                    : filterParam === "draft"
                      ? "No draft rules"
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
              { title: "Volume bands" },
              { title: "Apply Products" },
              { title: "Apply Markets" },
              { title: "Created" },
            ]}
          >
            {filteredRules.map((rule, index) => (
              <IndexTable.Row
                id={rule.groupId}
                key={rule.groupId}
                position={index}
                selected={selectedResources.includes(rule.groupId)}
                onClick={() => navigate(`/app/volume-pricing/${rule.groupId}`)}
              >
                <IndexTable.Cell>
                  <Text as="span" variant="bodySm" tone="subdued">
                    #{rule.groupId.slice(0, 6)}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text variant="bodyMd" fontWeight="semibold" as="span">
                    {rule.name}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  {/*
                    Inline status toggle. ADR-012: operates on groupId,
                    flipping every band of the rule at once.
                   */}
                  <StatusToggleCell
                    groupId={rule.groupId}
                    active={rule.active}
                  />
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" variant="bodyMd">
                    {formatCustomerEligibility(rule.customerEligibility)}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" variant="bodyMd">
                    {formatBandSummary(rule.bandCount, rule.minQty, rule.maxQty)}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <ScopeCell scope={rule.scope} />
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" variant="bodyMd">
                    All markets
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {new Date(rule.createdAt).toLocaleDateString()}
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

/**
 * Inline Active/Draft toggle for the Status column. Uses a useFetcher
 * scoped to /app/volume-pricing — so each row submits independently
 * and the page doesn't have to re-render the whole list. Optimistic
 * UI: while the request is in flight we render the pending state from
 * fetcher.formData so the switch feels instant.
 *
 * The wrapping <span> with stopPropagation prevents the row's onClick
 * (which navigates to /app/volume-pricing/$id) from firing when the
 * merchant just wanted to flip the switch.
 */
function StatusToggleCell({
  groupId,
  active,
}: {
  groupId: string;
  active: boolean;
}) {
  const fetcher = useFetcher<typeof action>();
  // Optimistic: while the toggle request is in flight, render what
  // the merchant just picked instead of what's still in the loader data.
  const pendingNext = fetcher.formData?.get("nextActive");
  const displayActive =
    pendingNext === "on" ? true : pendingNext === "off" ? false : active;
  const submitting = fetcher.state !== "idle";

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const fd = new FormData();
    fd.append("intent", "toggle");
    fd.append("groupId", groupId);
    fd.append("nextActive", displayActive ? "off" : "on");
    fetcher.submit(fd, { method: "POST", action: "/app/volume-pricing" });
  };

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        role="switch"
        aria-checked={displayActive}
        aria-label={displayActive ? "Set to draft" : "Set to active"}
        onClick={handleToggle}
        disabled={submitting}
        style={{
          width: "44px",
          height: "24px",
          borderRadius: "12px",
          border: "none",
          background: displayActive
            ? "var(--p-color-bg-fill-success)"
            : "var(--p-color-bg-fill-tertiary)",
          position: "relative",
          cursor: submitting ? "wait" : "pointer",
          transition: "background 0.15s ease",
          padding: 0,
          opacity: submitting ? 0.7 : 1,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "2px",
            left: displayActive ? "22px" : "2px",
            width: "20px",
            height: "20px",
            background: "white",
            borderRadius: "50%",
            transition: "left 0.15s ease",
            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
          }}
        />
      </button>
    </span>
  );
}

/**
 * Map a Tier.customerEligibility value to the merchant-facing label
 * used in the `Apply Customers` column. Mirrors the option titles in
 * the volume-pricing forms so the list and forms agree.
 */
function formatCustomerEligibility(value: string | null | undefined): string {
  switch (value) {
    case "all_customers":
      return "All customers";
    case "logged_in":
      return "Logged-in customers";
    case "specific_customers":
      return "Specific customers";
    case "wholesale_tagged":
    default:
      // Pre-migration rows have null; render the default mode label.
      return "Wholesale customers";
  }
}

/**
 * ADR-012: render the "Volume bands" column. One band keeps the
 * single-band copy ("10+ units") so legacy rules look unchanged.
 * Multi-band rules show "N bands · X-Y units" (∞ when open-ended).
 */
function formatBandSummary(
  bandCount: number,
  minQty: number,
  maxQty: number | null,
): string {
  if (bandCount <= 1) {
    return maxQty != null
      ? `${minQty}–${maxQty} units`
      : `${minQty}+ units`;
  }
  const upper = maxQty != null ? `${maxQty}` : "∞";
  return `${bandCount} bands · ${minQty}–${upper} units`;
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
