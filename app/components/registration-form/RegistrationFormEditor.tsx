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
 *     This is the Sami-style full-canvas editor.
 *
 * Both chromes save the SAME way: a fetcher POSTs the whole EditorState to
 * `/app/registration-form/:id` (the route action). The editor never talks
 * to Prisma directly.
 *
 * Layout (unchanged from the original singleton builder):
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Top toolbar — name, status toggle, (modal: reset-to-template) │
 *   ├──────┬────────────────────────┬──────────────────────────────┤
 *   │ Left │  Middle panel          │  Right canvas — live preview │
 *   │ rail │  (Elements/Appearance/ │                              │
 *   │      │   Settings)            │                              │
 *   └──────┴────────────────────────┴──────────────────────────────┘
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
  Text,
  Box,
  Modal as PolarisModal,
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
import { TEMPLATES } from "../../lib/registrationForm/seeds";

import { LeftRail, type LeftRailSection } from "./LeftRail";
import { FieldList } from "./FieldList";
import { FieldEditModal } from "./FieldEditModal";
import { TypePickerModal } from "./TypePickerModal";
import { AppearancePanel } from "./AppearancePanel";
import { SettingsPanel } from "./SettingsPanel";
import { FormPreview } from "./FormPreview";
import { TemplatePickerModal } from "./TemplatePickerModal";

const SAVE_BAR_ID = "registration-form-save-bar";

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

  // The entire editor state is one object that mirrors what we POST back.
  const [form, setForm] = useState<EditorState>(() =>
    structuredClone(initialForm),
  );
  const [pendingDeleteFieldId, setPendingDeleteFieldId] = useState<
    string | null
  >(null);
  const [section, setSection] = useState<LeftRailSection>("elements");

  const [editing, setEditing] = useState<{
    field: FormField | null;
    type: FieldType;
    open: boolean;
  }>({ field: null, type: "text", open: false });
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  // Track the last saved snapshot so dirty tracks "dirty since last save".
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
  };

  // Expose Save/Discard to the modal chrome (its title-bar buttons).
  useImperativeHandle(ref, () => ({ save: handleSave, discard: handleDiscard }));

  // Page chrome only: drive the global App Bridge SaveBar. In modal chrome
  // the parent owns the title-bar buttons, so we don't show the SaveBar
  // (it would sit behind the max modal).
  useEffect(() => {
    if (isModal) return;
    if (isDirty) shopify.saveBar.show(SAVE_BAR_ID);
    else shopify.saveBar.hide(SAVE_BAR_ID);
    return () => {
      shopify.saveBar.hide(SAVE_BAR_ID);
    };
  }, [isDirty, isModal, shopify]);

  // Report dirty changes upward (modal chrome enables/disables Save).
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // After a successful save, advance the snapshot (hides SaveBar / clears
  // dirty) and notify the parent. On failure isDirty stays true so the
  // SaveBar / Save button stays available.
  useEffect(() => {
    const data = fetcher.data;
    if (data && "ok" in data && data.ok) {
      setSavedSnapshot(currentSnapshot);
      onSaved?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data]);

  /* ---- field handlers ---- */

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

  const handleEditField = (id: string) => {
    const target = form.definition.steps[0].fields.find((f) => f.id === id);
    if (!target) return;
    setEditing({ field: target, type: target.type, open: true });
  };

  const handleDeleteField = (id: string) => setPendingDeleteFieldId(id);

  const confirmDeleteField = () => {
    if (!pendingDeleteFieldId) return;
    setForm((prev) => {
      const cloned = structuredClone(prev);
      cloned.definition.steps[0].fields =
        cloned.definition.steps[0].fields.filter(
          (f) => f.id !== pendingDeleteFieldId,
        );
      return cloned;
    });
    setPendingDeleteFieldId(null);
  };

  const handleAddField = () => setTypePickerOpen(true);

  const handlePickType = (type: FieldType) => {
    setTypePickerOpen(false);
    setEditing({ field: null, type, open: true });
  };

  const handleSaveField = (next: FormField) => {
    setForm((prev) => {
      const cloned = structuredClone(prev);
      const fields = cloned.definition.steps[0].fields;
      const existingIdx = fields.findIndex((f) => f.id === editing.field?.id);
      if (existingIdx >= 0) fields[existingIdx] = next;
      else fields.push(next);
      return cloned;
    });
    setEditing({ field: null, type: "text", open: false });
  };

  const handlePickTemplate = (id: SeedTemplateId) => {
    setForm((prev) => ({
      ...prev,
      definition: structuredClone(TEMPLATES[id]),
    }));
    setTemplatePickerOpen(false);
  };

  const pendingDeleteField = pendingDeleteFieldId
    ? form.definition.steps[0].fields.find((f) => f.id === pendingDeleteFieldId)
    : null;
  const existingKeys = form.definition.steps[0].fields.map((f) => f.key);

  /* ---- shared body (identical in both chromes) ---- */

  const saveError =
    fetcher.data && "ok" in fetcher.data && !fetcher.data.ok
      ? fetcher.data.error
      : undefined;

  const body = (
    <>
      {/* Top toolbar — name + status, plus reset-to-template in modal
          chrome (page chrome puts that in the App Bridge TitleBar). */}
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
                <Button onClick={() => setTemplatePickerOpen(true)}>
                  Reset to template
                </Button>
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

      {/* 3-pane layout */}
      <Layout>
        <Layout.Section variant="oneThird">
          <InlineStack gap="0" wrap={false} blockAlign="stretch">
            <LeftRail active={section} onSelect={setSection} />
            <Box paddingInlineStart="400" minWidth="0" width="100%">
              <Card>
                {section === "elements" && (
                  <BlockStack gap="400">
                    <FieldList
                      fields={form.definition.steps[0].fields}
                      onReorder={handleReorderFields}
                      onEdit={handleEditField}
                      onDelete={handleDeleteField}
                      onAdd={handleAddField}
                    />
                  </BlockStack>
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

      {/* Sub-modals (Polaris — render in the app iframe, above the max
          modal by z-index). */}
      <TypePickerModal
        open={typePickerOpen}
        onClose={() => setTypePickerOpen(false)}
        onPick={handlePickType}
      />
      <FieldEditModal
        open={editing.open}
        field={editing.field}
        initialType={editing.type}
        existingKeys={existingKeys}
        onClose={() => setEditing({ field: null, type: "text", open: false })}
        onSave={handleSaveField}
      />
      <TemplatePickerModal
        open={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        onPick={handlePickTemplate}
      />
      <PolarisModal
        open={pendingDeleteFieldId !== null}
        onClose={() => setPendingDeleteFieldId(null)}
        title="Delete field?"
        primaryAction={{
          content: "Delete",
          destructive: true,
          onAction: confirmDeleteField,
        }}
        secondaryActions={[
          { content: "Cancel", onAction: () => setPendingDeleteFieldId(null) },
        ]}
      >
        <PolarisModal.Section>
          <Text as="p" variant="bodyMd">
            Delete field
            {pendingDeleteField ? ` "${pendingDeleteField.label}"` : ""}? This
            cannot be undone.
          </Text>
        </PolarisModal.Section>
      </PolarisModal>
    </>
  );

  /* ---- modal chrome: content only, parent owns the title bar ---- */
  if (isModal) {
    return <Box padding="400">{body}</Box>;
  }

  /* ---- page chrome: Page wrapper + App Bridge TitleBar + SaveBar ---- */
  return (
    <Page
      fullWidth
      backAction={{
        content: "Registration forms",
        url: "/app/registration-form",
      }}
    >
      <TitleBar title="Registration form">
        <button onClick={() => setTemplatePickerOpen(true)}>
          Reset to template
        </button>
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
