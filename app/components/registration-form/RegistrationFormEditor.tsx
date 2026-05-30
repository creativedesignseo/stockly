/**
 * RegistrationFormEditor — the 3-pane form builder body, extracted from
 * the per-form route so it can render in TWO chromes from one source:
 *
 *   - `chrome="page"`  → standalone deep-link route
 *     (`/app/registration-form/:id`). Wraps itself in a Polaris `<Page>`
 *     with a back action and drives the global App Bridge SaveBar.
 *
 *   - `chrome="modal"` → inside the App Bridge `variant="max"` modal the
 *     list opens. Renders only the editor content (no `<Page>`, no global
 *     SaveBar); the parent owns the modal's `<ui-title-bar>` Save/Discard
 *     buttons and calls into this component through the imperative ref.
 *
 * Sub-editors (add type / edit field / delete confirm / reset template)
 * are INLINE PANELS that swap the middle pane, NOT floating Polaris
 * modals. A Polaris modal portals to `document.body`, which renders
 * BEHIND the App Bridge max-modal overlay — so it opened invisibly and
 * looked dead. See `docs/patterns/shopify-app-bridge-max-modal-editor.md`
 * gotcha #1.
 */
import { useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  TextField,
  Badge,
  Button,
  BlockStack,
  InlineStack,
  InlineGrid,
  Icon,
  Text,
  Box,
} from "@shopify/polaris";
import { SaveBar, TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";

import type {
  EditorState,
  FieldType,
  FormField,
  SeedTemplateId,
} from "../../lib/registrationForm/types";
import {
  TEMPLATES,
  TEMPLATE_META,
} from "../../lib/registrationForm/seeds";
import { FIELD_ICON, FIELD_TYPE_LABEL } from "./field-icons";

import { LeftRail, type LeftRailSection } from "./LeftRail";
import { FieldList } from "./FieldList";
import { FieldEditForm } from "./FieldEditForm";
import { AppearancePanel } from "./AppearancePanel";
import { SettingsPanel } from "./SettingsPanel";
import { FormPreview } from "./FormPreview";

const SAVE_BAR_ID = "registration-form-save-bar";

const PICKER_TYPES: FieldType[] = [
  "text",
  "email",
  "password",
  "phone",
  "select",
  "country",
  "textarea",
];

/** Middle-pane mode for the "elements" section. */
type Panel =
  | { kind: "list" }
  | { kind: "type" }
  | { kind: "edit"; field: FormField | null; type: FieldType }
  | { kind: "delete"; field: FormField }
  | { kind: "template" };

/** Imperative handle the modal chrome uses to drive Save/Discard. */
export interface RegistrationFormEditorHandle {
  save(): void;
  discard(): void;
}

export interface RegistrationFormEditorProps {
  /** Initial editor state (from the route loader or the list loader). */
  initialForm: EditorState;
  /** Form id — the fetcher POSTs to `/app/registration-form/:id`. */
  formId: string;
  /** Which chrome to render. Defaults to the standalone page. */
  chrome?: "page" | "modal";
  /** Called after a successful save (modal chrome closes itself). */
  onSaved?: () => void;
  /** Called whenever the dirty flag changes (modal chrome enables Save). */
  onDirtyChange?: (dirty: boolean) => void;
}

export const RegistrationFormEditor = forwardRef<
  RegistrationFormEditorHandle,
  RegistrationFormEditorProps
>(function RegistrationFormEditor(
  { initialForm, formId, chrome = "page", onSaved, onDirtyChange },
  ref,
) {
  const fetcher = useFetcher<
    { ok: true; savedAt: string } | { ok: false; error: string }
  >();
  const shopify = useAppBridge();
  const isModal = chrome === "modal";

  const [form, setForm] = useState<EditorState>(() =>
    structuredClone(initialForm),
  );
  const [section, setSection] = useState<LeftRailSection>("elements");
  const [panel, setPanel] = useState<Panel>({ kind: "list" });

  const [savedSnapshot, setSavedSnapshot] = useState<string>(() =>
    JSON.stringify(initialForm),
  );
  const currentSnapshot = useMemo(() => JSON.stringify(form), [form]);
  const isDirty = currentSnapshot !== savedSnapshot;
  const submitting = fetcher.state !== "idle";

  /* ---- save / discard ---- */

  const handleSave = () => {
    fetcher.submit(
      { payload: JSON.stringify(form) },
      { method: "post", action: `/app/registration-form/${formId}` },
    );
  };

  const handleDiscard = () => {
    setForm(structuredClone(JSON.parse(savedSnapshot)));
    setPanel({ kind: "list" });
  };

  useImperativeHandle(ref, () => ({ save: handleSave, discard: handleDiscard }));

  // Page chrome only: drive the global App Bridge SaveBar.
  useEffect(() => {
    if (isModal) return;
    if (isDirty) shopify.saveBar.show(SAVE_BAR_ID);
    else shopify.saveBar.hide(SAVE_BAR_ID);
    return () => {
      shopify.saveBar.hide(SAVE_BAR_ID);
    };
  }, [isDirty, isModal, shopify]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    const data = fetcher.data;
    if (data && "ok" in data && data.ok) {
      setSavedSnapshot(currentSnapshot);
      onSaved?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data]);

  /* ---- field mutations ---- */

  const updateField = <K extends keyof EditorState>(
    key: K,
    value: EditorState[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleReorderFields = (next: FormField[]) => {
    setForm((prev) => {
      const cloned = structuredClone(prev);
      cloned.definition.steps[0].fields = next;
      return cloned;
    });
  };

  const handleSaveField = (next: FormField) => {
    setForm((prev) => {
      const cloned = structuredClone(prev);
      const fields = cloned.definition.steps[0].fields;
      const existingIdx = fields.findIndex((f) => f.id === next.id);
      if (existingIdx >= 0) fields[existingIdx] = next;
      else fields.push(next);
      return cloned;
    });
    setPanel({ kind: "list" });
  };

  const confirmDeleteField = (id: string) => {
    setForm((prev) => {
      const cloned = structuredClone(prev);
      cloned.definition.steps[0].fields =
        cloned.definition.steps[0].fields.filter((f) => f.id !== id);
      return cloned;
    });
    setPanel({ kind: "list" });
  };

  const handlePickTemplate = (id: SeedTemplateId) => {
    setForm((prev) => ({
      ...prev,
      definition: structuredClone(TEMPLATES[id]),
    }));
    setPanel({ kind: "list" });
  };

  // Switching rail sections always returns the middle pane to its list.
  const handleSelectSection = (next: LeftRailSection) => {
    setSection(next);
    setPanel({ kind: "list" });
  };

  const openTemplatePicker = () => {
    setSection("elements");
    setPanel({ kind: "template" });
  };

  const existingKeys = form.definition.steps[0].fields.map((f) => f.key);

  /* ---- middle pane ---- */

  const elementsPane = (() => {
    switch (panel.kind) {
      case "type":
        return (
          <FieldTypePicker
            onPick={(type) => setPanel({ kind: "edit", field: null, type })}
            onCancel={() => setPanel({ kind: "list" })}
          />
        );
      case "edit":
        return (
          <FieldEditForm
            key={panel.field?.id ?? "new-field"}
            field={panel.field}
            initialType={panel.type}
            existingKeys={existingKeys}
            onSave={handleSaveField}
            onCancel={() => setPanel({ kind: "list" })}
          />
        );
      case "delete":
        return (
          <DeleteConfirm
            label={panel.field.label}
            onConfirm={() => confirmDeleteField(panel.field.id)}
            onCancel={() => setPanel({ kind: "list" })}
          />
        );
      case "template":
        return (
          <TemplatePicker
            onPick={handlePickTemplate}
            onCancel={() => setPanel({ kind: "list" })}
          />
        );
      case "list":
      default:
        return (
          <FieldList
            fields={form.definition.steps[0].fields}
            onReorder={handleReorderFields}
            onEdit={(id) => {
              const f = form.definition.steps[0].fields.find((x) => x.id === id);
              if (f) setPanel({ kind: "edit", field: f, type: f.type });
            }}
            onDelete={(id) => {
              const f = form.definition.steps[0].fields.find((x) => x.id === id);
              if (f) setPanel({ kind: "delete", field: f });
            }}
            onAdd={() => setPanel({ kind: "type" })}
          />
        );
    }
  })();

  /* ---- shared body (identical in both chromes) ---- */

  const saveError =
    fetcher.data && "ok" in fetcher.data && !fetcher.data.ok
      ? fetcher.data.error
      : undefined;

  const body = (
    <>
      <Box paddingBlockEnd="400">
        <Card>
          <InlineStack
            gap="400"
            align="space-between"
            blockAlign="center"
            wrap={false}
          >
            <Box minWidth="320px">
              <TextField
                label="Form name"
                labelHidden
                value={form.name}
                onChange={(v) => updateField("name", v.slice(0, 80))}
                maxLength={80}
                autoComplete="off"
                placeholder="Form name"
              />
            </Box>
            <InlineStack gap="300" blockAlign="center" wrap={false}>
              {isModal && (
                <Button onClick={openTemplatePicker}>Reset to template</Button>
              )}
              <Badge tone={form.status === "active" ? "success" : undefined}>
                {form.status === "active" ? "Active" : "Draft"}
              </Badge>
              <Button
                onClick={() =>
                  updateField(
                    "status",
                    form.status === "active" ? "draft" : "active",
                  )
                }
              >
                {form.status === "active" ? "Switch to draft" : "Activate"}
              </Button>
            </InlineStack>
          </InlineStack>
        </Card>
      </Box>

      {saveError && (
        <Box paddingBlockEnd="400">
          <Card>
            <Text as="p" variant="bodyMd" tone="critical">
              Save failed: {saveError}
            </Text>
          </Card>
        </Box>
      )}

      <Layout>
        <Layout.Section variant="oneThird">
          <InlineStack gap="0" wrap={false} blockAlign="stretch">
            <LeftRail active={section} onSelect={handleSelectSection} />
            <Box paddingInlineStart="400" minWidth="0" width="100%">
              <Card>
                {section === "elements" && (
                  <BlockStack gap="400">{elementsPane}</BlockStack>
                )}
                {section === "appearance" && (
                  <AppearancePanel
                    appearance={form.appearance}
                    onChange={(next) => updateField("appearance", next)}
                  />
                )}
                {section === "settings" && (
                  <SettingsPanel
                    settings={form.settings}
                    onChange={(next) => updateField("settings", next)}
                  />
                )}
              </Card>
            </Box>
          </InlineStack>
        </Layout.Section>

        <Layout.Section>
          <FormPreview
            definition={form.definition}
            appearance={form.appearance}
            settings={form.settings}
          />
        </Layout.Section>
      </Layout>
    </>
  );

  if (isModal) {
    return <Box padding="400">{body}</Box>;
  }

  return (
    <Page
      fullWidth
      backAction={{
        content: "Registration forms",
        url: "/app/registration-form",
      }}
    >
      <TitleBar title="Registration form">
        <button onClick={openTemplatePicker}>Reset to template</button>
      </TitleBar>

      <SaveBar id={SAVE_BAR_ID}>
        <button
          variant="primary"
          onClick={handleSave}
          loading={submitting ? "" : undefined}
        >
          Save
        </button>
        <button onClick={handleDiscard}>Discard</button>
      </SaveBar>

      {body}
    </Page>
  );
});

/* -------------------------------------------------------------------------- */
/*                          Inline middle-pane panels                         */
/* -------------------------------------------------------------------------- */

/** Field-type chooser — inline replacement for TypePickerModal. */
function FieldTypePicker({
  onPick,
  onCancel,
}: {
  onPick: (type: FieldType) => void;
  onCancel: () => void;
}) {
  return (
    <BlockStack gap="400">
      <InlineStack align="space-between" blockAlign="center">
        <Text as="h2" variant="headingMd">
          Choose a field type
        </Text>
        <Button variant="tertiary" onClick={onCancel}>
          Back
        </Button>
      </InlineStack>
      <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
        {PICKER_TYPES.map((t) => {
          const IconComp = FIELD_ICON[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => onPick(t)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                border: "1px solid var(--p-color-border)",
                borderRadius: "var(--p-border-radius-200)",
                background: "var(--p-color-bg-surface)",
                padding: "var(--p-space-300)",
                cursor: "pointer",
              }}
            >
              <BlockStack gap="200">
                <Box>
                  <Icon source={IconComp} tone="primary" />
                </Box>
                <Text as="span" variant="bodyMd" fontWeight="medium">
                  {FIELD_TYPE_LABEL[t]}
                </Text>
              </BlockStack>
            </button>
          );
        })}
      </InlineGrid>
    </BlockStack>
  );
}

/** Reset-to-template chooser — inline replacement for TemplatePickerModal. */
function TemplatePicker({
  onPick,
  onCancel,
}: {
  onPick: (id: SeedTemplateId) => void;
  onCancel: () => void;
}) {
  return (
    <BlockStack gap="400">
      <InlineStack align="space-between" blockAlign="center">
        <Text as="h2" variant="headingMd">
          Pick a starting template
        </Text>
        <Button variant="tertiary" onClick={onCancel}>
          Back
        </Button>
      </InlineStack>
      <Text as="p" variant="bodySm" tone="subdued">
        Replaces the current draft&apos;s fields. You can still tweak any field
        afterwards.
      </Text>
      <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
        {TEMPLATE_META.map((meta) => {
          const tmpl = TEMPLATES[meta.id];
          const count = tmpl.steps[0]?.fields.length ?? 0;
          return (
            <button
              key={meta.id}
              type="button"
              onClick={() => onPick(meta.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                border: "1px solid var(--p-color-border)",
                borderRadius: "var(--p-border-radius-200)",
                background: "var(--p-color-bg-surface)",
                padding: "var(--p-space-400)",
                cursor: "pointer",
              }}
            >
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  {meta.name}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {meta.description}
                </Text>
                <Box paddingBlockStart="100">
                  <Text as="p" variant="bodySm">
                    {count} field{count === 1 ? "" : "s"}
                  </Text>
                </Box>
              </BlockStack>
            </button>
          );
        })}
      </InlineGrid>
    </BlockStack>
  );
}

/** Inline delete confirmation — replaces the floating Polaris confirm. */
function DeleteConfirm({
  label,
  onConfirm,
  onCancel,
}: {
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <BlockStack gap="400">
      <Text as="h2" variant="headingMd">
        Delete field?
      </Text>
      <Box padding="300" background="bg-surface-critical" borderRadius="200">
        <Text as="p" variant="bodyMd">
          Delete field &quot;{label}&quot;? This cannot be undone.
        </Text>
      </Box>
      <InlineStack gap="300">
        <Button variant="primary" tone="critical" onClick={onConfirm}>
          Delete field
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </InlineStack>
    </BlockStack>
  );
}
