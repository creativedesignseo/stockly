/**
 * Admin route: Registration Form Builder (per-form editor).
 *
 * URL: /app/registration-form/:id
 *
 * Phase 3 (N-forms): the editor now loads and saves ONE form of the
 * shop's collection, addressed by `params.id`. The list lives at
 * /app/registration-form (app.registration-form._index.tsx); clicking a
 * row navigates here.
 *
 * 3-pane UI (unchanged from the singleton editor):
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Top toolbar — title, status, save bar                        │
 *   ├──────┬────────────────────────┬──────────────────────────────┤
 *   │ Left │  Middle panel          │  Right canvas — live preview │
 *   │ rail │  (Elements/Appearance/ │                              │
 *   │      │   Settings)            │                              │
 *   └──────┴────────────────────────┴──────────────────────────────┘
 *
 * State management: a single `useState<EditorState>` holds the whole
 * editor state. Children receive the relevant slice + an update
 * callback. Save is via App Bridge SaveBar with dirty-tracking against
 * the last saved snapshot.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useActionData,
  useFetcher,
  useLoaderData,
} from "@remix-run/react";
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
  Modal,
} from "@shopify/polaris";
import { SaveBar, TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useMemo, useState } from "react";

import { authenticateAdmin } from "../lib/auth.server";
import type {
  FieldType,
  FormField,
  FormAppearance,
  FormSettings,
  RegistrationFormDefinition,
  SeedTemplateId,
} from "../lib/registrationForm/types";
import { TEMPLATES } from "../lib/registrationForm/seeds";
import {
  getRegistrationFormById,
  updateRegistrationForm,
} from "../services/registrationForms.server";

import { LeftRail, type LeftRailSection } from "../components/registration-form/LeftRail";
import { FieldList } from "../components/registration-form/FieldList";
import { FieldEditModal } from "../components/registration-form/FieldEditModal";
import { TypePickerModal } from "../components/registration-form/TypePickerModal";
import { AppearancePanel } from "../components/registration-form/AppearancePanel";
import { SettingsPanel } from "../components/registration-form/SettingsPanel";
import { FormPreview } from "../components/registration-form/FormPreview";
import { TemplatePickerModal } from "../components/registration-form/TemplatePickerModal";

/**
 * Editor state — exactly what the builder manipulates and POSTs back.
 * Server-side metadata (id, version, shopId, createdAt, shortCode,
 * isDefault) lives on the Prisma row and is NEVER mutated by the editor.
 * The action passes this shape straight to updateRegistrationForm; the
 * loader builds it from the row.
 */
type EditorState = {
  name: string;
  status: "active" | "draft";
  definition: RegistrationFormDefinition;
  appearance: FormAppearance;
  settings: FormSettings;
};

/* -------------------------------------------------------------------------- */
/*                                  LOADER                                    */
/* -------------------------------------------------------------------------- */

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { shop } = await authenticateAdmin(request);
  const id = params.id;
  if (!id) throw new Response("Form id is required", { status: 400 });

  // Shop-scoped read: getRegistrationFormById returns null if the id
  // doesn't exist OR belongs to another shop (tenant isolation).
  const row = await getRegistrationFormById(id, shop.id);
  if (!row) throw new Response("Registration form not found", { status: 404 });

  // Prisma JSON columns are typed as `Prisma.JsonValue` — narrow via a
  // single `as unknown as <type>` cast at the boundary. Runtime shape is
  // guaranteed identical because the same types are what
  // updateRegistrationForm accepted on write.
  const form: EditorState = {
    name: row.name,
    status: row.status as "active" | "draft",
    definition: row.definition as unknown as RegistrationFormDefinition,
    appearance: row.appearance as unknown as FormAppearance,
    settings: row.settings as unknown as FormSettings,
  };

  return json({ form, shortCode: row.shortCode, isDefault: row.isDefault });
};

/* -------------------------------------------------------------------------- */
/*                                  ACTION                                    */
/* -------------------------------------------------------------------------- */

type SaveResult =
  | { ok: true; savedAt: string }
  | { ok: false; error: string };

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const { shop } = await authenticateAdmin(request);
  const id = params.id;
  if (!id) {
    return json<SaveResult>({ ok: false, error: "Missing form id" }, { status: 400 });
  }

  const fd = await request.formData();
  const payloadRaw = fd.get("payload");
  if (typeof payloadRaw !== "string") {
    return json<SaveResult>({ ok: false, error: "Missing payload" }, { status: 400 });
  }

  let parsed: EditorState;
  try {
    parsed = JSON.parse(payloadRaw) as EditorState;
  } catch {
    return json<SaveResult>({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  // EditorState matches updateRegistrationForm's input verbatim. The
  // service auto-bumps `version` so the storefront's GET (Cache-Control:
  // no-cache, per ADR-013) refetches on next load.
  try {
    await updateRegistrationForm(id, shop.id, {
      name: parsed.name,
      status: parsed.status,
      definition: parsed.definition,
      appearance: parsed.appearance,
      settings: parsed.settings,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[app.registration-form.$id] update failed:", err);
    return json<SaveResult>(
      { ok: false, error: "Save failed — check server logs" },
      { status: 500 },
    );
  }

  return json<SaveResult>({ ok: true, savedAt: new Date().toISOString() });
};

/* -------------------------------------------------------------------------- */
/*                                    UI                                      */
/* -------------------------------------------------------------------------- */

const SAVE_BAR_ID = "registration-form-save-bar";

export default function RegistrationFormBuilder() {
  const { form: initialForm } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  // The entire editor state is one object that mirrors what we'll
  // POST back to the action. Deep clone on mount so the initial
  // reference can still be used for the "isDirty" comparison below.
  const [form, setForm] = useState<EditorState>(() =>
    structuredClone(initialForm),
  );
  // Inline-confirm modal state (replaces window.confirm — SHOULD-2).
  const [pendingDeleteFieldId, setPendingDeleteFieldId] = useState<string | null>(
    null,
  );
  const [section, setSection] = useState<LeftRailSection>("elements");

  // Modal state.
  const [editing, setEditing] = useState<{
    /** When `field` is null we're creating a new field of `type`. */
    field: FormField | null;
    type: FieldType;
    open: boolean;
  }>({ field: null, type: "text", open: false });
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  // Track the last saved snapshot so SaveBar visibility tracks
  // "dirty since last save", not "dirty since first load".
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() =>
    JSON.stringify(initialForm),
  );
  const currentSnapshot = useMemo(() => JSON.stringify(form), [form]);
  const isDirty = currentSnapshot !== savedSnapshot;

  const submitting = fetcher.state !== "idle";

  // SaveBar visibility — App Bridge handles the portal.
  useEffect(() => {
    if (isDirty) shopify.saveBar.show(SAVE_BAR_ID);
    else shopify.saveBar.hide(SAVE_BAR_ID);
    return () => {
      shopify.saveBar.hide(SAVE_BAR_ID);
    };
  }, [isDirty, shopify]);

  // After a successful save, advance savedSnapshot so the SaveBar
  // hides. The action returns { ok: true, savedAt } on success. On a
  // failure the fetcher data carries { ok: false } and isDirty stays
  // true, so the SaveBar stays visible (don't regress the validation-
  // failure fix from commit 6bb3b1f).
  useEffect(() => {
    const data = fetcher.data;
    if (data && "ok" in data && data.ok) {
      setSavedSnapshot(currentSnapshot);
    }
    // We intentionally only depend on fetcher.data — currentSnapshot
    // is read at the moment of success.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data]);

  /* ---- handlers ---- */

  const updateField = <K extends keyof EditorState>(
    key: K,
    value: EditorState[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    fetcher.submit(
      { payload: JSON.stringify(form) },
      { method: "post" },
    );
  };

  const handleDiscard = () => {
    setForm(structuredClone(JSON.parse(savedSnapshot)));
  };

  const handleReorderFields = (next: FormField[]) => {
    setForm((prev) => {
      const cloned = structuredClone(prev);
      cloned.definition.steps[0].fields = next;
      return cloned;
    });
  };

  // Foundation fields carry a stable `id` for dnd-kit + edit/delete
  // identity. We address fields by `id` here (not `key`) because the
  // merchant can rename a key in the editor and the handler shouldn't
  // race the rename.
  const handleEditField = (id: string) => {
    const target = form.definition.steps[0].fields.find((f) => f.id === id);
    if (!target) return;
    setEditing({ field: target, type: target.type, open: true });
  };

  const handleDeleteField = (id: string) => {
    // SHOULD-2: replaces window.confirm with an inline confirm modal.
    // Storing only the id keeps the modal's render decoupled from the
    // field's mutability.
    setPendingDeleteFieldId(id);
  };

  const confirmDeleteField = () => {
    if (!pendingDeleteFieldId) return;
    setForm((prev) => {
      const cloned = structuredClone(prev);
      cloned.definition.steps[0].fields = cloned.definition.steps[0].fields.filter(
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
      if (existingIdx >= 0) {
        fields[existingIdx] = next;
      } else {
        fields.push(next);
      }
      return cloned;
    });
    setEditing({ field: null, type: "text", open: false });
  };

  // Template picker emits a SeedTemplateId — apply the chosen template's
  // definition to the editor state. Status / appearance / settings stay
  // the merchant's (only the field list resets).
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

  /* ---- render ---- */

  const actionError =
    actionData && "ok" in actionData && !actionData.ok
      ? actionData.error
      : undefined;

  return (
    <Page
      fullWidth
      backAction={{ content: "Registration forms", url: "/app/registration-form" }}
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

      {/* ----- Top toolbar (title + status badge) ----- */}
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

      {actionError && (
        <Box paddingBlockEnd="400">
          <Card>
            <Text as="p" variant="bodyMd" tone="critical">
              Save failed: {actionError}
            </Text>
          </Card>
        </Box>
      )}

      {/* ----- 3-pane layout ----- */}
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

      {/* ----- Modals ----- */}
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
        onClose={() =>
          setEditing({ field: null, type: "text", open: false })
        }
        onSave={handleSaveField}
      />
      <TemplatePickerModal
        open={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        onPick={handlePickTemplate}
      />
      {/* SHOULD-2: inline delete confirm replaces window.confirm. */}
      <Modal
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
        <Modal.Section>
          <Text as="p" variant="bodyMd">
            Delete field{pendingDeleteField ? ` "${pendingDeleteField.label}"` : ""}? This cannot be undone.
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
