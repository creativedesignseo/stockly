/**
 * RegistrationFormList — the IndexTable + tabs + banner + "Add new"
 * modal for /app/registration-form. Split out of the route so the
 * loader/action file stays thin, mirroring how the pricing list is
 * structured. The route wires loader data + the create-from-template
 * navigation; this component renders it.
 *
 * Admin = Polaris (design-system Golden Rule). The only hand-rolled bit
 * is the status switch, copied from app.pricing._index.tsx's
 * StatusToggleCell (Polaris v12 ships no first-class switch).
 */
import {
  useFetcher,
  useLoaderData,
  useNavigate,
  useSearchParams,
} from "@remix-run/react";
import { useEffect, useMemo, useState } from "react";
import {
  Page,
  Card,
  EmptyState,
  IndexTable,
  Text,
  Tabs,
  Tooltip,
  BlockStack,
  Banner,
  Button,
  InlineStack,
  Modal,
  useIndexResourceState,
} from "@shopify/polaris";
import { ClipboardIcon, DeleteIcon } from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";

import { TemplatePickerModal } from "./TemplatePickerModal";
import type { SeedTemplateId } from "../../lib/registrationForm/types";

export interface RegistrationFormListItem {
  id: string;
  name: string;
  shortCode: string;
  status: "active" | "draft";
  isDefault: boolean;
  /** ISO string — the loader serializes Date for JSON transport. */
  createdAt: string;
}

type LoaderShape = { forms: RegistrationFormListItem[] };

type TabId = "all" | "active" | "draft";

export function RegistrationFormList() {
  const { forms } = useLoaderData<LoaderShape>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  /* ----- create-from-template fetcher -----
   * Submits intent=create; the action returns the new form's id. On
   * success we navigate into the editor. A fetcher (not useSubmit) so
   * the in-flight state can disable the modal button.
   */
  const createFetcher = useFetcher<
    | { ok: true; intent: "create"; id: string }
    | { ok: true; intent: "toggle" | "delete" }
    | { ok: false; error: string }
  >();
  const creating = createFetcher.state !== "idle";

  useEffect(() => {
    const data = createFetcher.data;
    if (data && data.ok && "intent" in data && data.intent === "create") {
      navigate(`/app/registration-form/${data.id}`);
    }
  }, [createFetcher.data, navigate]);

  const handlePickTemplate = (templateId: SeedTemplateId) => {
    setTemplatePickerOpen(false);
    const fd = new FormData();
    fd.append("intent", "create");
    fd.append("templateId", templateId);
    createFetcher.submit(fd, { method: "POST" });
  };

  // Surface a delete/toggle/create error (e.g. "can't delete default").
  const actionError =
    createFetcher.data && !createFetcher.data.ok
      ? createFetcher.data.error
      : undefined;

  /* ----- Tab filter (driven by ?status= query param) ----- */
  const rawStatus = searchParams.get("status");
  const filterParam: TabId =
    rawStatus === "active" ? "active" : rawStatus === "draft" ? "draft" : "all";
  const activeCount = forms.filter((f) => f.status === "active").length;
  const draftCount = forms.length - activeCount;

  const tabs = [
    { id: "all", content: `All (${forms.length})`, panelID: "all" },
    { id: "active", content: `Active (${activeCount})`, panelID: "active" },
    { id: "draft", content: `Draft (${draftCount})`, panelID: "draft" },
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

  const filteredForms = useMemo(() => {
    if (filterParam === "active")
      return forms.filter((f) => f.status === "active");
    if (filterParam === "draft")
      return forms.filter((f) => f.status === "draft");
    return forms;
  }, [forms, filterParam]);

  const resourceName = { singular: "form", plural: "forms" };
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(
      filteredForms.map((f) => ({ id: f.id })) as { id: string }[],
    );

  const protectBanner = (
    <Banner tone="info" title="Protect your B2B registration page">
      <p>
        Lock the registration page behind a password so only invited
        buyers can apply. (Coming soon — this is a placeholder for the
        upcoming page-lock feature.)
      </p>
    </Banner>
  );

  /* ----- Empty state — should not happen (default is seeded) ----- */
  if (forms.length === 0) {
    return (
      <Page
        primaryAction={{
          content: "Add new registration form",
          onAction: () => setTemplatePickerOpen(true),
        }}
      >
        <TitleBar title="Registration forms" />
        <BlockStack gap="400">
          {actionError && (
            <Banner tone="critical" onDismiss={() => undefined}>
              <p>{actionError}</p>
            </Banner>
          )}
          {protectBanner}
          <Card>
            <EmptyState
              heading="No registration forms yet"
              action={{
                content: "Add new registration form",
                onAction: () => setTemplatePickerOpen(true),
              }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <Text as="p" variant="bodyMd">
                Build a wholesale application form from a template. Customers
                fill it in on your storefront; you review and approve.
              </Text>
            </EmptyState>
          </Card>
        </BlockStack>
        <TemplatePickerModal
          open={templatePickerOpen}
          onClose={() => setTemplatePickerOpen(false)}
          onPick={handlePickTemplate}
        />
      </Page>
    );
  }

  return (
    <Page
      primaryAction={{
        content: "Add new registration form",
        onAction: () => setTemplatePickerOpen(true),
        loading: creating,
      }}
    >
      <TitleBar title="Registration forms" />
      <BlockStack gap="400">
        {actionError && (
          <Banner tone="critical">
            <p>{actionError}</p>
          </Banner>
        )}
        {protectBanner}
        <Card padding="0">
          <Tabs tabs={tabs} selected={tabIndex} onSelect={onTabSelect} />
          <IndexTable
            resourceName={resourceName}
            itemCount={filteredForms.length}
            selectedItemsCount={
              allResourcesSelected ? "All" : selectedResources.length
            }
            onSelectionChange={handleSelectionChange}
            emptyState={
              <EmptyState
                heading={
                  filterParam === "active"
                    ? "No active forms"
                    : filterParam === "draft"
                      ? "No draft forms"
                      : "Nothing here"
                }
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <Text as="p" variant="bodyMd">
                  Try a different tab or add a new form.
                </Text>
              </EmptyState>
            }
            headings={[
              { title: "ID" },
              { title: "Name" },
              { title: "Short code" },
              { title: "Status" },
              { title: "Created" },
              { title: "" },
            ]}
          >
            {filteredForms.map((form, index) => (
              <IndexTable.Row
                id={form.id}
                key={form.id}
                position={index}
                selected={selectedResources.includes(form.id)}
                onClick={() => navigate(`/app/registration-form/${form.id}`)}
              >
                <IndexTable.Cell>
                  <Text as="span" variant="bodySm" tone="subdued">
                    #{form.id.slice(0, 6)}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <InlineStack gap="200" blockAlign="center" wrap={false}>
                    <Text variant="bodyMd" fontWeight="semibold" as="span">
                      {form.name}
                    </Text>
                    {form.isDefault && (
                      <Text as="span" variant="bodySm" tone="subdued">
                        (default)
                      </Text>
                    )}
                  </InlineStack>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <ShortCodeChip shortCode={form.shortCode} />
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <StatusToggleCell id={form.id} status={form.status} />
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {new Date(form.createdAt).toLocaleDateString()}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <DeleteCell name={form.name} id={form.id} isDefault={form.isDefault} />
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        </Card>
      </BlockStack>

      <TemplatePickerModal
        open={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        onPick={handlePickTemplate}
      />
    </Page>
  );
}

// Default export so the route can `export default RegistrationFormList`.
export default RegistrationFormList;

/**
 * Copyable short-code chip. Clicking copies the code to the clipboard
 * without navigating the row (stopPropagation). The merchant pastes it
 * into the theme block's "Form short code" setting.
 */
function ShortCodeChip({ shortCode }: { shortCode: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(shortCode).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  };

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Tooltip content={copied ? "Copied!" : "Copy short code"}>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            border: "1px solid var(--p-color-border)",
            borderRadius: "var(--p-border-radius-200)",
            background: "var(--p-color-bg-surface-secondary)",
            padding: "2px 8px",
            cursor: "pointer",
            font: "inherit",
          }}
        >
          <Text as="span" variant="bodySm">
            {shortCode.slice(0, 10)}…
          </Text>
          <span
            style={{
              width: "16px",
              height: "16px",
              display: "inline-flex",
              color: "var(--p-color-icon-subdued)",
            }}
          >
            <ClipboardIcon />
          </span>
        </button>
      </Tooltip>
    </span>
  );
}

/**
 * Inline Active/Draft toggle for the Status column. A per-row useFetcher
 * submits intent=toggle so the row updates independently. Optimistic UI
 * mirrors app.pricing._index.tsx's StatusToggleCell.
 */
function StatusToggleCell({
  id,
  status,
}: {
  id: string;
  status: "active" | "draft";
}) {
  const fetcher = useFetcher();
  const pendingNext = fetcher.formData?.get("nextStatus");
  const displayActive =
    pendingNext === "active"
      ? true
      : pendingNext === "draft"
        ? false
        : status === "active";
  const submitting = fetcher.state !== "idle";

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const fd = new FormData();
    fd.append("intent", "toggle");
    fd.append("id", id);
    fd.append("nextStatus", displayActive ? "draft" : "active");
    fetcher.submit(fd, { method: "POST" });
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
 * Per-row delete. The default form cannot be deleted (the service
 * refuses + it's the storefront fallback), so the button is disabled
 * for it with an explanatory tooltip. For other forms it opens a Polaris
 * confirm Modal (mirrors the editor's field-delete modal — no
 * window.confirm) then submits intent=delete via a fetcher.
 */
function DeleteCell({
  name,
  id,
  isDefault,
}: {
  name: string;
  id: string;
  isDefault: boolean;
}) {
  const fetcher = useFetcher();
  const deleting = fetcher.state !== "idle";
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleConfirm = () => {
    const fd = new FormData();
    fd.append("intent", "delete");
    fd.append("id", id);
    fetcher.submit(fd, { method: "POST" });
    setConfirmOpen(false);
  };

  if (isDefault) {
    return (
      <span onClick={(e) => e.stopPropagation()}>
        <Tooltip content="The default form can't be deleted">
          <Button
            icon={DeleteIcon}
            variant="tertiary"
            disabled
            accessibilityLabel="Delete (disabled for default form)"
          />
        </Tooltip>
      </span>
    );
  }

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Button
        icon={DeleteIcon}
        variant="tertiary"
        tone="critical"
        loading={deleting}
        onClick={() => setConfirmOpen(true)}
        accessibilityLabel={`Delete ${name}`}
      />
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Delete "${name}"?`}
        primaryAction={{
          content: "Delete",
          destructive: true,
          loading: deleting,
          onAction: handleConfirm,
        }}
        secondaryActions={[
          { content: "Cancel", onAction: () => setConfirmOpen(false) },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            This cannot be undone. To keep it but hide it from the storefront,
            switch it to Draft instead.
          </Text>
        </Modal.Section>
      </Modal>
    </span>
  );
}
