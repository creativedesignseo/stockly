/**
 * Admin route: wholesale application queue (Sprint 4 P0 — ADR-008).
 *
 * URL: /app/customers/applications
 *
 * Lists every WholesaleApplication for the authenticated shop with
 * filtering by status (pending / approved / rejected). Approve and
 * Reject actions are inline on the row.
 *
 * Approve flow (the meaty part):
 *   1. Find the application row + parse its email + cached customer id
 *   2. Resolve the Shopify Customer (existing OR newly created):
 *      - If the application has a shopifyCustomerId → use it directly
 *      - Else query customers(query: "email:...") — match if exists
 *      - Else customerCreate with email + first/last/phone from the app
 *   3. customerUpdate adds the shop's wholesaleTag to the customer
 *   4. Upsert a WholesaleCustomer row (Stockly's eligibility store)
 *   5. Mark application status='approved' with audit fields
 *
 * Reject flow: just flip status='rejected'. No Shopify side-effect.
 *
 * The Shopify GraphQL mutations need the admin session — which only
 * this route's loader/action has — so the business logic lives here
 * (and the service layer stays free of Shopify SDK deps).
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData, useSearchParams } from "@remix-run/react";
import { useEffect, useState } from "react";
import {
  Page,
  Card,
  EmptyState,
  IndexTable,
  Badge,
  Text,
  Button,
  Banner,
  BlockStack,
  InlineStack,
  Tabs,
  Modal,
  TextField,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticateAdmin } from "../lib/auth.server";
import {
  listApplications,
  getApplication,
  markApplicationApproved,
  markApplicationRejected,
  normalizePhone,
} from "../services/wholesale-applications.server";
import { approveCustomer } from "../services/wholesale-customers.server";
import { syncTiersToFunction } from "../services/discount-function-sync.server";

/* -------------------------------------------------------------------------- */
/*                                  LOADER                                    */
/* -------------------------------------------------------------------------- */

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await authenticateAdmin(request);
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const status =
    statusParam === "approved" || statusParam === "rejected"
      ? statusParam
      : statusParam === "all"
        ? undefined
        : "pending";

  const apps = await listApplications(shop.id, { status });
  // Counts per status for the tab badges.
  const [pending, approved, rejected] = await Promise.all([
    listApplications(shop.id, { status: "pending" }),
    listApplications(shop.id, { status: "approved" }),
    listApplications(shop.id, { status: "rejected" }),
  ]);

  return {
    apps,
    activeStatus: status ?? "all",
    counts: {
      pending: pending.length,
      approved: approved.length,
      rejected: rejected.length,
    },
  };
};

/* -------------------------------------------------------------------------- */
/*                                  ACTION                                    */
/* -------------------------------------------------------------------------- */

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    return await actionImpl(request);
  } catch (err) {
    // Catch ALL errors — GraphQL fetch failures, unexpected Shopify
    // responses, Prisma errors — and surface a readable message to the
    // merchant via the action data instead of throwing a 500 that the
    // route-error boundary catches as a generic "Application Error".
    // eslint-disable-next-line no-console
    console.error("[applications-action] caught:", err);
    let message = "Unexpected error processing this action.";
    if (err instanceof Error) {
      // Shopify GraphQL client wraps errors in a `graphQLErrors` array
      // either on the error itself or nested under `body.errors`.
      const anyErr = err as unknown as {
        graphQLErrors?: { message: string; extensions?: { code?: string } }[];
        body?: {
          errors?: {
            graphQLErrors?: { message: string; extensions?: { code?: string } }[];
          };
        };
      };
      const gqlErrors =
        anyErr.graphQLErrors ??
        anyErr.body?.errors?.graphQLErrors ??
        [];
      if (gqlErrors.length > 0) {
        // Log structured detail so we can debug from Fly logs (util.inspect
        // collapses nested arrays/objects by default — JSON.stringify expands).
        // eslint-disable-next-line no-console
        console.error(
          "[applications-action] graphQLErrors:",
          JSON.stringify(gqlErrors, null, 2),
        );
        // If any error has extensions.code === ACCESS_DENIED, surface the
        // Protected Customer Data guidance specifically.
        const accessDenied = gqlErrors.find(
          (e) => e.extensions?.code === "ACCESS_DENIED",
        );
        if (accessDenied) {
          message =
            "Stockly needs 'Protected customer data access' approved for this app. " +
            "Run `npx shopify app deploy` from the project root to sync the access " +
            "request to Partners Dashboard, then approve it under " +
            "App → Configuration → Protected customer data. " +
            `Original Shopify message: ${accessDenied.message}`;
        } else {
          message = `Shopify rejected: ${gqlErrors.map((e) => e.message).join("; ").slice(0, 400)}`;
        }
      } else {
        message = err.message.slice(0, 400);
      }
    }
    return { ok: false, error: message } as const;
  }
};

async function actionImpl(request: Request) {
  const { admin, shop } = await authenticateAdmin(request);
  const form = await request.formData();
  const intent = (form.get("intent") ?? "").toString();
  const appId = (form.get("applicationId") ?? "").toString();
  const reviewNote = (form.get("reviewNote") ?? "").toString();

  if (!appId) {
    return { ok: false, error: "Missing applicationId." } as const;
  }

  const app = await getApplication(shop.id, appId);
  if (!app) {
    return { ok: false, error: "Application not found." } as const;
  }

  if (intent === "reject") {
    await markApplicationRejected(shop.id, appId, reviewNote);
    return {
      ok: true as const,
      action: "rejected" as const,
      email: app.email,
    };
  }

  if (intent !== "approve") {
    return { ok: false, error: `Unknown intent: ${intent}` } as const;
  }

  /* --------------------------- approve path -------------------------- */

  // Resolve the Shopify customer id:
  let shopifyCustomerId = app.shopifyCustomerId;
  let existingTags: string[] = [];

  // (1) If the application already has a customer id (logged-in flow),
  //     fetch their current tags so we can append without overwriting.
  if (shopifyCustomerId) {
    const r = await admin.graphql(
      `#graphql
      query CustomerById($id: ID!) {
        customer(id: $id) { id email tags }
      }`,
      {
        variables: {
          id: `gid://shopify/Customer/${shopifyCustomerId}`,
        },
      },
    );
    const body = (await r.json()) as {
      data?: { customer?: { id: string; email: string; tags: string[] } };
    };
    if (body.data?.customer) {
      existingTags = body.data.customer.tags ?? [];
    } else {
      // Cached id is stale (customer deleted). Fall back to email lookup.
      shopifyCustomerId = null;
    }
  }

  // (2) No customer id (or stale) — search by email.
  if (!shopifyCustomerId) {
    const r = await admin.graphql(
      `#graphql
      query CustomersByEmail($q: String!) {
        customers(query: $q, first: 1) {
          edges { node { id email tags } }
        }
      }`,
      { variables: { q: `email:${app.email}` } },
    );
    const body = (await r.json()) as {
      data?: {
        customers?: {
          edges: { node: { id: string; email: string; tags: string[] } }[];
        };
      };
    };
    const node = body.data?.customers?.edges?.[0]?.node;
    if (node) {
      shopifyCustomerId = node.id.replace("gid://shopify/Customer/", "");
      existingTags = node.tags ?? [];
    }
  }

  // (3) Still nothing → create the customer.
  if (!shopifyCustomerId) {
    const r = await admin.graphql(
      `#graphql
      mutation CustomerCreate($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer { id email tags }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          input: {
            email: app.email,
            firstName: app.firstName ?? undefined,
            lastName: app.lastName ?? undefined,
            // Shopify rejects non-E.164 phones with "Phone is invalid".
            // If the phone we have isn't clean E.164 (legacy applications
            // submitted before the frontend validator landed), skip it
            // rather than failing the whole approval — better UX.
            phone: (() => {
              const p = normalizePhone(app.phone);
              return p && /^\+[1-9]\d{7,14}$/.test(p) ? p : undefined;
            })(),
            tags: [shop.wholesaleTag],
            note: `Wholesale application approved on ${new Date().toISOString()}. Company: ${app.companyName}.`,
          },
        },
      },
    );
    const body = (await r.json()) as {
      data?: {
        customerCreate?: {
          customer: { id: string; tags: string[] } | null;
          userErrors: { field: string[]; message: string }[];
        };
      };
      // Top-level errors (different from userErrors!) appear when Shopify
      // GraphQL itself rejects the request — most commonly ACCESS_DENIED
      // when "Protected customer data access" isn't approved in Partners
      // Dashboard, but also rate limits, throttling, etc.
      errors?: { message: string; extensions?: { code: string } }[];
    };
    // Check top-level Shopify errors FIRST (these are different from
    // userErrors and indicate Shopify itself rejected the request,
    // not a validation failure).
    if (body.errors && body.errors.length > 0) {
      const e = body.errors[0];
      const code = e.extensions?.code;
      const friendlyMsg =
        code === "ACCESS_DENIED"
          ? "Stockly needs 'Protected customer data access' approved in Shopify Partners Dashboard → API access → Protected customer data. Without it, the app cannot create or read Customer records. See https://shopify.dev/docs/apps/launch/protected-customer-data"
          : e.message;
      return { ok: false, error: friendlyMsg } as const;
    }
    const created = body.data?.customerCreate;
    if (!created?.customer || (created.userErrors?.length ?? 0) > 0) {
      const msg = created?.userErrors?.[0]?.message ?? "Customer create failed.";
      return { ok: false, error: msg } as const;
    }
    shopifyCustomerId = created.customer.id.replace(
      "gid://shopify/Customer/",
      "",
    );
    existingTags = created.customer.tags ?? [];
    // customerCreate already applied the tag — no second update needed.
  } else {
    // (4) Existing customer — append the wholesale tag if missing.
    if (!existingTags.includes(shop.wholesaleTag)) {
      const r = await admin.graphql(
        `#graphql
        mutation CustomerTagsAdd($id: ID!, $tags: [String!]!) {
          tagsAdd(id: $id, tags: $tags) {
            node { id }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            id: `gid://shopify/Customer/${shopifyCustomerId}`,
            tags: [shop.wholesaleTag],
          },
        },
      );
      const body = (await r.json()) as {
        data?: {
          tagsAdd?: {
            userErrors: { field: string[]; message: string }[];
          };
        };
      };
      const errs = body.data?.tagsAdd?.userErrors ?? [];
      if (errs.length > 0) {
        return { ok: false, error: errs[0].message } as const;
      }
    }
  }

  // (5) Upsert the Stockly WholesaleCustomer row — eligibility track 2.
  //     This also sets qualifiedAt=now (admin approval bypasses FPQ).
  await approveCustomer({
    shopId: shop.id,
    shopifyCustomerId,
    email: app.email,
    notes: `Approved from application ${app.id}. Company: ${app.companyName}.`,
  });

  // (6) Flip application status.
  await markApplicationApproved(shop.id, appId, reviewNote);

  // (7) Re-sync the Discount Function's metafield so the new customer's
  //     GID lands in `qualifiedCustomers` immediately — otherwise the
  //     Function evaluates them against FPQ on their next cart and they
  //     pay retail despite being admin-approved (bug C3 / P1-8).
  //     We swallow sync errors so the approval itself doesn't fail if
  //     Shopify is having a bad minute; the merchant can manually
  //     re-trigger via /app/settings/pricing → Save. Logged for ops.
  try {
    await syncTiersToFunction(admin, shop.id);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[applications-action] syncTiersToFunction failed:", err);
  }

  return {
    ok: true as const,
    action: "approved" as const,
    email: app.email,
    customerId: shopifyCustomerId,
  };
}

/* -------------------------------------------------------------------------- */
/*                                    UI                                      */
/* -------------------------------------------------------------------------- */

type ApproveResult =
  | { ok: true; email: string }
  | { ok: false; error: string }
  | null;

export default function ApplicationsQueue() {
  const { apps, activeStatus, counts } = useLoaderData<typeof loader>();
  // approveResult replaces useActionData for approve: useFetcher responses
  // don't flow through useActionData (that only sees navigation submissions).
  const [approveResult, setApproveResult] = useState<ApproveResult>(null);
  // setSearchParams (not window.location.assign) — inside a Shopify
  // embedded iframe a full page reload drops host/embedded/id_token from
  // the URL and triggers an OAuth redirect loop (ERR_TOO_MANY_REDIRECTS).
  // setSearchParams updates via History API + re-runs loaders, keeping
  // the embed context intact.
  const [, setSearchParams] = useSearchParams();

  const [modalApp, setModalApp] = useState<(typeof apps)[number] | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  // Reject runs through its own fetcher: same as Approve, we cannot
  // use window.location.reload() inside the Shopify embedded iframe
  // because that drops host/embedded/id_token and triggers an OAuth
  // redirect loop. fetcher.submit + Remix's automatic loader
  // revalidation keeps us inside the embed.
  const rejectFetcher = useFetcher<typeof action>();
  useEffect(() => {
    if (rejectFetcher.state !== "idle" || !rejectFetcher.data) return;
    if (rejectFetcher.data.ok) {
      // Reject succeeded — close the modal. Loader revalidation handles
      // moving the row from Pending to Rejected automatically.
      setModalApp(null);
      setReviewNote("");
    }
  }, [rejectFetcher.state, rejectFetcher.data]);

  const tabs = [
    { id: "pending", content: `Pending (${counts.pending})`, status: "pending" },
    { id: "approved", content: `Approved (${counts.approved})`, status: "approved" },
    { id: "rejected", content: `Rejected (${counts.rejected})`, status: "rejected" },
    { id: "all", content: "All", status: "all" },
  ];
  const activeIdx = Math.max(0, tabs.findIndex((t) => t.status === activeStatus));

  const resourceName = { singular: "application", plural: "applications" };

  return (
    <Page backAction={{ content: "App", url: "/app" }}>
      <TitleBar title="Wholesale applications" />
      <BlockStack gap="400">
        {approveResult?.ok && (
          <Banner tone="success" title="Application approved">
            <p>
              {approveResult.email} was tagged as <code>wholesale</code> in
              Shopify and added to the eligibility list. They&apos;ll see
              wholesale pricing on their next storefront visit.
            </p>
          </Banner>
        )}
        {approveResult && !approveResult.ok && (
          <Banner tone="critical" title="Could not approve">
            <p>{approveResult.error}</p>
          </Banner>
        )}

        <Card padding="0">
          <Tabs
            tabs={tabs.map((t) => ({ id: t.id, content: t.content }))}
            selected={activeIdx}
            onSelect={(idx) => {
              const status = tabs[idx].status;
              setSearchParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  if (status === "pending") {
                    next.delete("status");
                  } else {
                    next.set("status", status);
                  }
                  return next;
                },
                { replace: true },
              );
            }}
          />

          {apps.length === 0 ? (
            <Box padding="600">
              <EmptyState
                heading={
                  activeStatus === "pending"
                    ? "No pending applications"
                    : "Nothing here yet"
                }
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <Text as="p" variant="bodyMd">
                  {activeStatus === "pending"
                    ? "When a visitor submits the storefront registration form, it will appear here."
                    : "Try switching tabs."}
                </Text>
              </EmptyState>
            </Box>
          ) : (
            <IndexTable
              resourceName={resourceName}
              itemCount={apps.length}
              selectable={false}
              headings={[
                { title: "Company" },
                { title: "Contact" },
                { title: "Tax ID / Country" },
                { title: "Submitted" },
                { title: "Status" },
                { title: "Actions" },
              ]}
            >
              {apps.map((app, idx) => (
                <IndexTable.Row id={app.id} key={app.id} position={idx}>
                  <IndexTable.Cell>
                    <BlockStack gap="050">
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {app.companyName}
                      </Text>
                      {app.website && (
                        <Text as="span" variant="bodySm" tone="subdued">
                          {app.website}
                        </Text>
                      )}
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <BlockStack gap="050">
                      <Text as="span" variant="bodyMd">
                        {[app.firstName, app.lastName].filter(Boolean).join(" ") ||
                          "—"}
                      </Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {app.email}
                      </Text>
                      {app.phone && (
                        <Text as="span" variant="bodySm" tone="subdued">
                          {app.phone}
                        </Text>
                      )}
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <BlockStack gap="050">
                      <Text as="span" variant="bodyMd">
                        {app.taxId || "—"}
                      </Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {app.country || ""}
                      </Text>
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodySm" tone="subdued">
                      {new Date(app.createdAt).toLocaleDateString()}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <StatusBadge status={app.status} />
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {app.status === "pending" ? (
                      <InlineStack gap="200">
                        <ApproveButton applicationId={app.id} onResult={setApproveResult} />
                        {/* Reject + View are below, share a modal */}
                        <Button
                          tone="critical"
                          size="slim"
                          onClick={() => {
                            setModalApp(app);
                            setReviewNote("");
                          }}
                        >
                          Reject
                        </Button>
                        <Button
                          variant="tertiary"
                          size="slim"
                          onClick={() => {
                            setModalApp(app);
                            setReviewNote("");
                          }}
                        >
                          View
                        </Button>
                      </InlineStack>
                    ) : (
                      <Button
                        variant="tertiary"
                        size="slim"
                        onClick={() => {
                          setModalApp(app);
                          setReviewNote(app.reviewNote ?? "");
                        }}
                      >
                        View
                      </Button>
                    )}
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </Card>
      </BlockStack>

      {/*
        Polaris Modal pattern: keep it always mounted in the React tree
        and toggle the `open` prop. The previous conditional render
        ({modalApp && <Modal open ... />}) caused intermittent failures
        where the modal wouldn't open on the first click after an
        Approve action — the fetcher revalidation re-render and the
        modal mount/unmount happened in the same React batch, and
        Polaris's portal animation occasionally lost. Always-mounted
        means setModalApp(app) just toggles `open`; no remount risk.
       */}
      <Modal
        open={modalApp !== null}
        onClose={() => setModalApp(null)}
        title={
          modalApp ? `Application — ${modalApp.companyName}` : "Application"
        }
        primaryAction={
          modalApp?.status === "pending"
            ? {
                content: "Reject",
                destructive: true,
                loading: rejectFetcher.state !== "idle",
                onAction: () => {
                  const fd = new FormData();
                  fd.append("intent", "reject");
                  fd.append("applicationId", modalApp.id);
                  fd.append("reviewNote", reviewNote);
                  rejectFetcher.submit(fd, { method: "POST" });
                },
              }
            : undefined
        }
        secondaryActions={[
          {
            content: "Close",
            onAction: () => setModalApp(null),
          },
        ]}
      >
        {modalApp && (
          <Modal.Section>
            <BlockStack gap="300">
              <Field label="Company" value={modalApp.companyName} />
              <Field
                label="Contact"
                value={
                  [modalApp.firstName, modalApp.lastName]
                    .filter(Boolean)
                    .join(" ") || "—"
                }
              />
              <Field label="Email" value={modalApp.email} />
              {modalApp.phone && <Field label="Phone" value={modalApp.phone} />}
              {modalApp.taxId && (
                <Field label="Tax / VAT ID" value={modalApp.taxId} />
              )}
              {modalApp.country && (
                <Field label="Country" value={modalApp.country} />
              )}
              {modalApp.website && (
                <Field label="Website" value={modalApp.website} />
              )}
              {modalApp.notes && (
                <Field label="Notes from applicant" value={modalApp.notes} />
              )}
              {modalApp.status !== "pending" && modalApp.reviewNote && (
                <Field label="Merchant review note" value={modalApp.reviewNote} />
              )}
              {modalApp.status === "pending" && (
                <TextField
                  label="Review note (optional, internal)"
                  autoComplete="off"
                  multiline={3}
                  value={reviewNote}
                  onChange={setReviewNote}
                />
              )}
            </BlockStack>
          </Modal.Section>
        )}
      </Modal>
    </Page>
  );
}

function ApproveButton({
  applicationId,
  onResult,
}: {
  applicationId: string;
  onResult: (r: ApproveResult) => void;
}) {
  const fetcher = useFetcher<typeof action>();
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    const d = fetcher.data;
    if (!d.ok) {
      onResult({ ok: false, error: (d as { error: string }).error });
    } else {
      onResult({ ok: true, email: (d as { email: string }).email });
    }
  // onResult is a setState setter — stable ref, safe to omit from deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="approve" />
      <input type="hidden" name="applicationId" value={applicationId} />
      <Button submit variant="primary" size="slim" loading={isSubmitting}>
        Approve
      </Button>
    </fetcher.Form>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <BlockStack gap="050">
      <Text as="span" variant="bodySm" tone="subdued">
        {label}
      </Text>
      <Text as="span" variant="bodyMd">
        {value}
      </Text>
    </BlockStack>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge tone="success">Approved</Badge>;
  if (status === "rejected") return <Badge tone="critical">Rejected</Badge>;
  return <Badge tone="attention">Pending</Badge>;
}
