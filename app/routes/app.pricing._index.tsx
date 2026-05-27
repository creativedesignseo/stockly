/**
 * Admin route: Wholesale Pricing — list of rules + shop-wide setup
 * banner. This IS the pricing page (the hub abstraction was killed
 * 2026-05-27 per Jonatan's analysis of Sami's flat-URL pattern:
 * "no necesita decir List al final ya que simplemente cuando llegas
 *  allí hay una lista, se pueden crear, se pueden consultar").
 *
 * URL: /app/pricing
 *
 * Architecture:
 *   - The list is the primary content (Sami-style).
 *   - A small "Current shop setup" banner at top shows baseline +
 *     FPQ + MOQ at a glance. NOT editable inline — clicking
 *     "Settings" in the page actions takes the merchant to
 *     /app/settings/pricing for the actual edit form. Trade-off
 *     accepted: simpler URLs > inline modal edits for shop-wide
 *     settings (those don't change often anyway).
 *   - Per-customer overrides "Coming soon" card removed entirely
 *     — it lives in the roadmap, not the UI, until built.
 *
 * Sami-pattern list (validated with Jonatan 2026-05-27 — he showed
 * Sami's "Wholesale Pricing" list as the target):
 *   - Tabs filter: All / Active / Inactive. Sami has 5 tabs (All /
 *     Active / Draft / Expired / Pending) but Stockly's Tier model
 *     only has `active: boolean` — no draft / scheduling / lifecycle.
 *     Showing 3 honest tabs instead of 5 with empty fakes.
 *   - Columns: ID / Name / Status / Apply Customers / Apply Products
 *     / Apply Markets / Created. "Apply Customers" and "Apply Markets"
 *     are constant strings for now ("All wholesale" / "All markets")
 *     because Stockly doesn't segment by customer-tag or by Market yet
 *     — those are roadmap items.
 *   - Click on a row → /app/pricing/$id (Sami-style edit form).
 *   - Primary action top-right: "Create new wholesale pricing" →
 *     /app/pricing/new (the Sami-style create form).
 *
 * Legacy /app/tiers and /app/tiers/$id routes deleted 2026-05-27 —
 * /app/pricing is the only entry point.
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
  Banner,
  InlineStack,
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
 * immediately (the same call /app/pricing/$id makes on save).
 *
 * Intent = "toggle" + groupId + nextActive("on" | "off"). Triggered
 * by the per-row useFetcher in the Status column.
 *
 * ADR-012: works on groupId. Flips active on every band of the group
 * via updateMany. Legacy single-band tiers are 1-band groups after
 * back-fill, so this preserves today's behavior for them too.
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
  // /app/pricing/$id.tsx — actions can be hit directly via fetch.
  const existing = await prisma.tier.findFirst({
    where: { shopId: shop.id, groupId },
    select: { id: true },
  });
  if (!existing)
    throw new Response("Wholesale pricing not found", { status: 404 });

  await prisma.tier.updateMany({
    where: { shopId: shop.id, groupId },
    data: { active: nextActive },
  });
  try {
    await syncTiersToFunction(admin, shop.id);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[pricing._index] syncTiersToFunction failed:", err);
  }
  return json({ ok: true, groupId, active: nextActive });
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await authenticateAdmin(request);
  // Two queries in parallel: the rules to show in the table + the
  // shop-wide setup numbers shown in the banner.
  // ADR-012: list aggregates one row per groupId (multi-band rule).
  const [rules, shopRow] = await Promise.all([
    listRules(shop.id),
    prisma.shop.findUnique({
      where: { id: shop.id },
      select: {
        wholesaleBaselinePct: true,
        fpqMode: true,
        fpqAmount: true,
        fpqQuantity: true,
        fpqCombinedLogic: true,
        postQualificationMOQ: true,
        minOrderValue: true,
      },
    }),
  ]);
  return {
    rules,
    shop: shopRow,
  };
};

/**
 * Tab ids. "draft" is the user-facing label for `active=false` rules
 * (per Jonatan 2026-05-27 — "Inactive" felt wrong, "Draft" matches
 * what Sami and the rest of the Shopify admin use for rules that
 * exist but aren't live). Internally still backed by `active: boolean`.
 */
type TabId = "all" | "active" | "draft";

export default function PricingList() {
  const { rules, shop } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  /* ----- Tab filter (driven by ?status= query param) -----
   * setSearchParams (not window.location.assign) — same reason as
   * /app/customers/applications: a full reload inside the Shopify
   * embed iframe loses host / embedded / id_token and we'd hit
   * ERR_TOO_MANY_REDIRECTS. (See commit 4a115c8 and lesson 7 in
   * progress/2026-05-26-approve-flow-fix.md.)
   */
  // Back-compat: ?status=inactive used to be the query param for the
  // "non-active" tab. Map it to the new "draft" id so old bookmarks
  // still land on the right tab.
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

  /* ----- Empty state — no rules at all yet ----- */
  if (rules.length === 0) {
    return (
      <Page
        primaryAction={{
          content: "Create new wholesale pricing",
          url: "/app/pricing/new",
        }}
        secondaryActions={[
          { content: "Settings", url: "/app/settings/pricing" },
        ]}
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
      <BlockStack gap="400">
        {/* ----- Shop-wide setup banner (read-only) -----
         * At-a-glance status of the 3 shop-wide pricing decisions
         * (baseline, FPQ, MOQ). Not editable inline — the "Settings"
         * secondary action above takes the merchant to the full
         * /app/settings/pricing form. We preserve visibility of the
         * setup without forcing a separate hub page.
         */}
        {shop && (
          <Banner tone="info" title="Shop-wide pricing setup">
            <InlineStack gap="400" wrap>
              <SetupChip
                label="Baseline"
                value={
                  shop.wholesaleBaselinePct > 0
                    ? `${shop.wholesaleBaselinePct}% off retail`
                    : "Disabled"
                }
              />
              <SetupChip label="FPQ" value={formatFpq(shop)} />
              <SetupChip
                label="MOQ"
                value={
                  shop.postQualificationMOQ > 1
                    ? `${shop.postQualificationMOQ} units/order`
                    : "No minimum"
                }
              />
              {shop.minOrderValue && shop.minOrderValue > 0 ? (
                <SetupChip
                  label="Min order"
                  value={`€${shop.minOrderValue}`}
                />
              ) : null}
            </InlineStack>
          </Banner>
        )}
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
                onClick={() => navigate(`/app/pricing/${rule.groupId}`)}
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
                    Inline status toggle. ADR-012: now operates on
                    groupId, flipping every band of the rule at once.
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
 * scoped to /app/pricing — so each row submits independently and the
 * page doesn't have to re-render the whole list. Optimistic UI:
 * while the request is in flight we render the pending state from
 * fetcher.formData so the switch feels instant.
 *
 * The wrapping <span> with stopPropagation prevents the row's onClick
 * (which navigates to /app/pricing/$id) from firing when the merchant
 * just wanted to flip the switch. Without it, clicking the toggle
 * would also open the edit form — confusing.
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
    fetcher.submit(fd, { method: "POST", action: "/app/pricing" });
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
 * One stat in the Shop-wide setup banner: "Baseline: 60% off retail".
 * Label is rendered with low-emphasis tone, value next to it bold.
 */
function SetupChip({ label, value }: { label: string; value: string }) {
  return (
    <Text as="span" variant="bodyMd">
      <Text as="span" variant="bodyMd" tone="subdued">
        {label}:
      </Text>{" "}
      <Text as="span" variant="bodyMd" fontWeight="semibold">
        {value}
      </Text>
    </Text>
  );
}

/** Human-readable summary of the shop's FPQ configuration. */
function formatFpq(shop: {
  fpqMode: string;
  fpqAmount: number | null;
  fpqQuantity: number | null;
  fpqCombinedLogic: string;
}): string {
  if (shop.fpqMode === "none") return "Disabled";
  if (shop.fpqMode === "amount")
    return `First order ≥ €${shop.fpqAmount ?? "?"}`;
  if (shop.fpqMode === "quantity")
    return `First order ≥ ${shop.fpqQuantity ?? "?"} units`;
  return `€${shop.fpqAmount ?? "?"} ${shop.fpqCombinedLogic.toUpperCase()} ${shop.fpqQuantity ?? "?"} units`;
}

/**
 * Map a Tier.customerEligibility value to the merchant-facing label
 * used in the `Apply Customers` column. Mirrors the option titles in
 * /app/pricing/new + /app/pricing/:id so the list and forms agree.
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
