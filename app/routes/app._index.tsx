/**
 * Admin home — Stockly dashboard.
 *
 * URL: /app
 *
 * Two responsibilities:
 *   1. Gate to onboarding: if `Shop.onboarded === false`, redirect to
 *      `/app/onboarding`. This is the wizard's entry point on first
 *      install (Sprint 4 P0 #5 — ADR-008).
 *   2. Surface live counts (active tiers, pending applications,
 *      qualified customers) plus a "what's next" card pointing the
 *      merchant at the gap they should close first.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import {
  Link,
  useFetcher,
  useLoaderData,
  useRevalidator,
} from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Box,
  Button,
  Badge,
  List,
  Collapsible,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticateAdmin } from "../lib/auth.server";
import prisma from "../db.server";

/**
 * Strip JSONC comments (block `/* *​/` and line `//`) from a string while
 * preserving anything inside JSON string literals (e.g. `https://` in a URL
 * value). Shopify's `config/settings_data.json` is JSONC — it ships with an
 * auto-generated `/* ... *​/` header comment, so a raw `JSON.parse` throws
 * `SyntaxError: Unexpected token '/'`. This makes the theme config parseable.
 */
function stripJsonComments(input: string): string {
  let out = "";
  let inString = false;
  let inBlock = false;
  let inLine = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    const next = input[i + 1];
    if (inLine) {
      if (c === "\n") {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === "*" && next === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i++;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
    } else if (c === "/" && next === "*") {
      inBlock = true;
      i++;
    } else if (c === "/" && next === "/") {
      inLine = true;
      i++;
    } else {
      out += c;
    }
  }
  return out;
}

/**
 * Auto-detect whether the merchant has enabled the "Stockly" app embed
 * (handle `stockly-embed`) in their active theme, by reading the theme's
 * `config/settings_data.json` via the Asset REST API. Requires the
 * `read_themes` scope.
 *
 * Returns:
 *   true   — the embed exists in the live theme and is not disabled
 *   false  — readable theme, embed absent or toggled off
 *   null   — could not determine (scope not granted yet, theme
 *            unreadable, parse error) → caller shows the manual CTA
 *
 * Never throws — the dashboard must render even if this fails.
 */
async function detectStocklyEmbedEnabled(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
): Promise<boolean | null> {
  try {
    // shopify-app-remix here exposes only admin.graphql (no admin.rest).
    // Read the MAIN theme's settings_data.json via the OnlineStoreTheme
    // files API (needs read_themes).
    const resp = await admin.graphql(
      `#graphql
      query StocklyEmbedDetect {
        themes(first: 1, roles: [MAIN]) {
          nodes {
            files(filenames: ["config/settings_data.json"]) {
              nodes {
                body {
                  __typename
                  ... on OnlineStoreThemeFileBodyText { content }
                  ... on OnlineStoreThemeFileBodyBase64 { contentBase64 }
                }
              }
            }
          }
        }
      }`,
    );
    const json = (await resp.json()) as {
      data?: {
        themes?: {
          nodes?: Array<{
            files?: {
              nodes?: Array<{
                body?: { content?: string; contentBase64?: string };
              }>;
            };
          }>;
        };
      };
    };
    const body = json.data?.themes?.nodes?.[0]?.files?.nodes?.[0]?.body;
    let raw: string | null = null;
    if (body?.content) raw = body.content;
    else if (body?.contentBase64)
      raw = Buffer.from(body.contentBase64, "base64").toString("utf-8");
    if (!raw) return null;

    // settings_data.json is JSONC (ships with a /* ... */ header comment),
    // so strip comments before parsing — a raw JSON.parse throws on the `/*`.
    const data = JSON.parse(stripJsonComments(raw));
    const blocks = data?.current?.blocks ?? {};
    let found = false;
    for (const key of Object.keys(blocks)) {
      const b = blocks[key];
      if (
        typeof b?.type === "string" &&
        b.type.includes("stockly-embed") &&
        b.disabled !== true
      ) {
        found = true;
        break;
      }
    }
    // eslint-disable-next-line no-console
    console.log("[setup-guide] embed detected:", found);
    return found;
  } catch (err) {
    // read_themes may not be granted yet, or the theme is unreadable.
    // eslint-disable-next-line no-console
    console.error("[setup-guide] embed detection failed:", err);
    return null;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, admin } = await authenticateAdmin(request);

  // First-install gate — send the merchant through the wizard before
  // they ever see the dashboard.
  //
  // CRITICAL: preserve query params (shop, host, embedded, id_token) when
  // redirecting between admin routes. Without them, the destination
  // loader's authenticate.admin() can't find Shopify context and falls
  // back to /auth/login, which renders the boilerplate "Log in" form
  // instead of our app. Lost an entire afternoon to this in production.
  if (!shop.onboarded) {
    const url = new URL(request.url);
    const search = url.searchParams.toString();
    throw redirect(`/app/onboarding${search ? "?" + search : ""}`);
  }

  const [activeTiers, pendingApps, qualifiedCustomers, activeForms, embedEnabled] =
    await Promise.all([
      prisma.tier.count({ where: { shopId: shop.id, active: true } }),
      prisma.wholesaleApplication.count({
        where: { shopId: shop.id, status: "pending" },
      }),
      prisma.wholesaleCustomer.count({
        where: { shopId: shop.id, qualifiedAt: { not: null } },
      }),
      prisma.registrationForm.count({
        where: { shopId: shop.id, status: "active" },
      }),
      detectStocklyEmbedEnabled(admin),
    ]);

  return {
    shop,
    counts: { activeTiers, pendingApps, qualifiedCustomers },
    // Setup-guide step completion. pricing + form are detectable from the
    // DB; the "Activate Stockly" app-embed step is auto-detected from the
    // theme via read_themes (null = scope not granted / unreadable → CTA).
    setup: {
      pricingDone: shop.wholesaleBaselinePct > 0 || activeTiers > 0,
      formDone: activeForms > 0,
      embedEnabled,
      // Steps the merchant marked done by hand — a step is "done" if it is
      // auto-detected OR present here. Lets them override detection and
      // complete steps that have no auto-detection (e.g. the QOF).
      manualSteps: shop.setupManualSteps ?? [],
    },
  };
};

/** Step keys the setup guide knows about; guards the manual-override action. */
const SETUP_STEP_KEYS = new Set(["embed", "pricing", "form", "qof"]);

/**
 * Manual setup-guide override. The merchant can mark a step done (or undo
 * it) regardless of auto-detection — persisted on `Shop.setupManualSteps`.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticateAdmin(request);
  const form = await request.formData();
  const stepKey = String(form.get("stepKey") ?? "");
  const intent = String(form.get("intent") ?? "");

  if (!SETUP_STEP_KEYS.has(stepKey)) {
    return { ok: false, error: "unknown step" };
  }

  const current = new Set(shop.setupManualSteps ?? []);
  if (intent === "mark-done") current.add(stepKey);
  else if (intent === "mark-undone") current.delete(stepKey);
  else return { ok: false, error: "unknown intent" };

  await prisma.shop.update({
    where: { id: shop.id },
    data: { setupManualSteps: Array.from(current) },
  });

  return { ok: true };
};

export default function Dashboard() {
  const { shop, counts, setup } = useLoaderData<typeof loader>();

  const tips = buildTips(shop, counts);

  return (
    <Page
      title="Dashboard"
      subtitle={shop.id}
      primaryAction={{
        content: "Re-run setup",
        url: "/app/onboarding?force=1",
      }}
    >
      <TitleBar title="Stockly" />
      <BlockStack gap="400">
        <Layout>
          <Layout.Section>
            <SetupGuide
              pricingDone={setup.pricingDone}
              formDone={setup.formDone}
              embedEnabled={setup.embedEnabled}
              manualSteps={setup.manualSteps}
            />
          </Layout.Section>
          <Layout.Section>
            <InlineStack gap="400" wrap>
              <StatCard
                title="Active pricing rules"
                value={counts.activeTiers}
                href="/app/pricing"
                cta={
                  counts.activeTiers === 0
                    ? "Create your first wholesale pricing"
                    : "Manage Wholesale Pricing"
                }
              />
              <NavCard
                title="Volume Pricing"
                body="Quantity-break discounts for your customers."
                href="/app/volume-pricing"
                cta="Manage Volume Pricing"
              />
              <StatCard
                title="Pending applications"
                value={counts.pendingApps}
                href="/app/customers/applications"
                cta={counts.pendingApps === 0 ? "Open queue" : "Review now"}
                attention={counts.pendingApps > 0}
              />
              <StatCard
                title="Qualified customers"
                value={counts.qualifiedCustomers}
                href="/app/qualify-customer"
                cta="View"
              />
            </InlineStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Suggested next steps
                </Text>
                {tips.length === 0 ? (
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Your setup looks complete. Keep an eye on incoming
                    applications and qualifying orders.
                  </Text>
                ) : (
                  <List>
                    {tips.map((tip) => (
                      <List.Item key={tip.id}>
                        <InlineStack gap="200" align="start" blockAlign="center">
                          {tip.tone && <Badge tone={tip.tone}>{tip.badge ?? "Tip"}</Badge>}
                          <Text as="span" variant="bodyMd">
                            {tip.body}{" "}
                            {tip.cta && (
                              <Link to={tip.cta.url}>{tip.cta.label}</Link>
                            )}
                          </Text>
                        </InlineStack>
                      </List.Item>
                    ))}
                  </List>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

/* -------------------------------------------------------------------------- */
/*                                helpers                                      */
/* -------------------------------------------------------------------------- */

function StatCard({
  title,
  value,
  href,
  cta,
  attention,
}: {
  title: string;
  value: number;
  href: string;
  cta: string;
  attention?: boolean;
}) {
  return (
    <Box minWidth="220px">
      <Card>
        <BlockStack gap="200">
          <Text as="h3" variant="headingSm" tone="subdued">
            {title}
          </Text>
          <InlineStack align="space-between" blockAlign="center">
            <Text as="span" variant="heading2xl" fontWeight="bold">
              {value}
            </Text>
            {attention && <Badge tone="attention">Action</Badge>}
          </InlineStack>
          <Button url={href} variant="plain">
            {cta}
          </Button>
        </BlockStack>
      </Card>
    </Box>
  );
}

function NavCard({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <Box minWidth="220px">
      <Card>
        <BlockStack gap="200">
          <Text as="h3" variant="headingSm" tone="subdued">
            {title}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            {body}
          </Text>
          <Button url={href} variant="plain">
            {cta}
          </Button>
        </BlockStack>
      </Card>
    </Box>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Setup Guide                                  */
/* -------------------------------------------------------------------------- */

interface SetupStepData {
  key: string;
  title: string;
  body: string;
  /** true = done, false = to do, null = theme step (not auto-detectable). */
  done: boolean | null;
  cta: { label: string; url: string };
  /** Show a "Refresh" button that re-checks detection (theme steps). */
  refresh?: boolean;
}

function SetupGuide({
  pricingDone,
  formDone,
  embedEnabled,
  manualSteps,
}: {
  pricingDone: boolean;
  formDone: boolean;
  embedEnabled: boolean | null;
  manualSteps: string[];
}) {
  const steps: SetupStepData[] = [
    {
      key: "embed",
      title: "Activate Stockly in your store",
      body: "Turn on the Stockly app embed in your theme so wholesale content shows on your storefront. After enabling it, click Refresh.",
      // Auto-detected via read_themes. null (scope not granted yet) keeps
      // the manual CTA; once granted, true = Done, false = To do.
      done: embedEnabled,
      cta: {
        label: "Open theme editor",
        url: "shopify://admin/themes/current/editor?context=apps",
      },
      refresh: true,
    },
    {
      key: "pricing",
      title: "Set your wholesale pricing",
      body: "Define your baseline discount and pricing rules.",
      done: pricingDone,
      cta: { label: "Go to Pricing", url: "/app/pricing" },
    },
    {
      key: "form",
      title: "Create your registration form",
      body: "Let customers apply for wholesale access.",
      done: formDone,
      cta: { label: "Create form", url: "/app/registration-form" },
    },
    {
      key: "qof",
      title: "Add the Quick Order Form",
      body: "The fast bulk-order table for your wholesale buyers.",
      done: null,
      cta: {
        label: "Add to store",
        url: "shopify://admin/themes/current/editor",
      },
    },
  ];

  // A step counts as done if it is auto-detected OR marked done by hand.
  const autoDone = (s: SetupStepData) => s.done === true;
  const manualDone = (s: SetupStepData) => manualSteps.includes(s.key);
  const isDone = (s: SetupStepData) => autoDone(s) || manualDone(s);

  const total = steps.length;
  const completed = steps.filter(isDone).length;
  // Open the first step that isn't done yet (the merchant's next action).
  const firstIncomplete = steps.find((s) => !isDone(s))?.key ?? null;

  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="100">
          <Text as="h2" variant="headingMd">
            Setup guide
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Let&apos;s get started by following this guide.
          </Text>
          <Text as="span" variant="bodySm" tone="subdued">
            {completed} of {total} steps completed
          </Text>
        </BlockStack>
        <Divider />
        <BlockStack gap="0">
          {steps.map((s, i) => (
            <SetupStep
              key={s.key}
              step={s}
              autoDone={autoDone(s)}
              manualDone={manualDone(s)}
              defaultOpen={s.key === firstIncomplete}
              last={i === steps.length - 1}
            />
          ))}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

/** Circular status mark: filled black check when done, dashed ring when not. */
function StepIcon({ done }: { done: boolean | null }) {
  if (done === true) {
    return (
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "#1a1a1a",
          color: "#fff",
          flexShrink: 0,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
          <path
            d="M5 10.5l3.2 3.2L15 7"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 22,
        height: 22,
        borderRadius: "50%",
        border: "2px dashed #9a9a9a",
        boxSizing: "border-box",
        flexShrink: 0,
      }}
    />
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      style={{
        flexShrink: 0,
        transform: open ? "rotate(180deg)" : "none",
        transition: "transform 150ms ease",
      }}
    >
      <path
        d="M5 7.5l5 5 5-5"
        stroke="#6b6b6b"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SetupStep({
  step,
  autoDone,
  manualDone,
  defaultOpen,
  last,
}: {
  step: SetupStepData;
  autoDone: boolean;
  manualDone: boolean;
  defaultOpen: boolean;
  last: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const revalidator = useRevalidator();
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  const effectiveDone = autoDone || manualDone;
  return (
    <Box>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          background: "none",
          border: "none",
          padding: "12px 0",
          margin: 0,
          width: "100%",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <InlineStack
          align="space-between"
          blockAlign="center"
          gap="300"
          wrap={false}
        >
          <InlineStack gap="300" blockAlign="center" wrap={false}>
            <StepIcon done={effectiveDone} />
            <Text as="span" variant="bodyMd" fontWeight="semibold">
              {step.title}
            </Text>
          </InlineStack>
          <Chevron open={open} />
        </InlineStack>
      </button>
      <Collapsible
        open={open}
        id={`setup-${step.key}`}
        transition={{ duration: "150ms", timingFunction: "ease-in-out" }}
      >
        <Box paddingBlockEnd="300" paddingInlineStart="800">
          <BlockStack gap="300">
            <Text as="p" variant="bodySm" tone="subdued">
              {step.body}
            </Text>
            {!effectiveDone && (
              <InlineStack gap="200" blockAlign="center">
                <Button url={step.cta.url} variant="primary">
                  {step.cta.label}
                </Button>
                {step.refresh && (
                  <Button
                    onClick={() => revalidator.revalidate()}
                    loading={revalidator.state === "loading"}
                    variant="tertiary"
                  >
                    Refresh
                  </Button>
                )}
                <fetcher.Form method="post">
                  <input type="hidden" name="stepKey" value={step.key} />
                  <input type="hidden" name="intent" value="mark-done" />
                  <Button submit variant="tertiary" loading={busy}>
                    Mark as done
                  </Button>
                </fetcher.Form>
              </InlineStack>
            )}
            {/* Only the merchant can undo a *manual* completion; auto-detected
                steps reflect real store state and have no undo. */}
            {effectiveDone && manualDone && !autoDone && (
              <InlineStack gap="200" blockAlign="center">
                <Text as="span" variant="bodySm" tone="subdued">
                  Marked as done manually.
                </Text>
                <fetcher.Form method="post">
                  <input type="hidden" name="stepKey" value={step.key} />
                  <input type="hidden" name="intent" value="mark-undone" />
                  <Button submit variant="plain" loading={busy}>
                    Undo
                  </Button>
                </fetcher.Form>
              </InlineStack>
            )}
          </BlockStack>
        </Box>
      </Collapsible>
      {!last && <Divider />}
    </Box>
  );
}

interface Tip {
  id: string;
  body: string;
  tone?: "info" | "attention" | "success" | "warning";
  badge?: string;
  cta?: { label: string; url: string };
}

function buildTips(
  shop: { wholesaleBaselinePct: number },
  counts: { activeTiers: number; pendingApps: number; qualifiedCustomers: number },
): Tip[] {
  const tips: Tip[] = [];
  if (counts.pendingApps > 0) {
    tips.push({
      id: "pending",
      tone: "attention",
      badge: "Action",
      body: `${counts.pendingApps} wholesale application${counts.pendingApps === 1 ? "" : "s"} pending review.`,
      cta: { label: "Open queue", url: "/app/customers/applications" },
    });
  }
  if (counts.activeTiers === 0) {
    tips.push({
      id: "no-tiers",
      tone: "info",
      badge: "Tip",
      body:
        "You don't have any wholesale pricing rules yet. Add at least one to start offering volume discounts.",
      cta: {
        label: "Create wholesale pricing",
        url: "/app/pricing/new",
      },
    });
  }
  if (shop.wholesaleBaselinePct === 0) {
    tips.push({
      id: "no-baseline",
      tone: "info",
      badge: "Tip",
      body:
        "Your wholesale baseline is 0% — approved B2B customers will see retail prices unless a tier matches.",
      cta: { label: "Set baseline", url: "/app/settings/pricing" },
    });
  }
  return tips;
}
