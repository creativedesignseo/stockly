/**
 * Admin route: Registration Form Builder.
 *
 * URL: /app/registration-form
 *
 * Single form per shop (decision 1 in the Phase 1 plan). 3-pane UI:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Top toolbar — title, status, save bar                        │
 *   ├──────┬────────────────────────┬──────────────────────────────┤
 *   │ Left │  Middle panel          │  Right canvas — live preview │
 *   │ rail │  (Elements/Appearance/ │                              │
 *   │      │   Settings)            │                              │
 *   └──────┴────────────────────────┴──────────────────────────────┘
 *
 * Mocks `getRegistrationForm` / `upsertRegistrationForm` —
 * to integrate after Foundation PR lands. The TODOs below point to
 * the integration seams.
 *
 * State management: a single `useState<RegistrationForm>` holds the
 * whole editor state. Children receive the relevant slice + an
 * update callback. Save is via App Bridge SaveBar (same pattern as
 * `app/routes/app.pricing.new.tsx`).
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
} from "@shopify/polaris";
import { SaveBar, TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useMemo, useState } from "react";

import { authenticateAdmin } from "../lib/auth.server";
import type {
  FieldType,
  FormField,
  RegistrationForm,
} from "../lib/registration-form-types";

import { LeftRail, type LeftRailSection } from "../components/registration-form/LeftRail";
import { FieldList } from "../components/registration-form/FieldList";
import { FieldEditModal } from "../components/registration-form/FieldEditModal";
import { TypePickerModal } from "../components/registration-form/TypePickerModal";
import { AppearancePanel } from "../components/registration-form/AppearancePanel";
import { SettingsPanel } from "../components/registration-form/SettingsPanel";
import { FormPreview } from "../components/registration-form/FormPreview";
import { TemplatePickerModal } from "../components/registration-form/TemplatePickerModal";
import { SEED_STANDARD } from "../components/registration-form/seed-templates";

/* -------------------------------------------------------------------------- */
/*                                  LOADER                                    */
/* -------------------------------------------------------------------------- */

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticateAdmin(request);

  // TODO(integration): swap for real getRegistrationForm(shopId) from
  // app/services/registrationForms.server.ts when the Foundation
  // implementer's PR merges. Until then we return SEED_STANDARD so
  // the UI is fully functional without the service layer.
  // const form = await getRegistrationForm(shop.id);
  const form = SEED_STANDARD;

  return json({ form });
};

/* -------------------------------------------------------------------------- */
/*                                  ACTION                                    */
/* -------------------------------------------------------------------------- */

type SaveResult =
  | { ok: true; savedAt: string }
  | { ok: false; error: string };

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticateAdmin(request);

  const fd = await request.formData();
  const payloadRaw = fd.get("payload");
  if (typeof payloadRaw !== "string") {
    return json<SaveResult>({ ok: false, error: "Missing payload" }, { status: 400 });
  }

  let parsed: RegistrationForm;
  try {
    parsed = JSON.parse(payloadRaw) as RegistrationForm;
  } catch {
    return json<SaveResult>({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  // TODO(integration): swap for real upsertRegistrationForm(shop.id, {
  //   definition: parsed.definition,
  //   appearance: parsed.appearance,
  //   settings: parsed.settings,
  //   status: parsed.status,
  // }) once the Foundation service exists. For now we just echo back
  // a savedAt timestamp so the SaveBar transitions out of the dirty
  // state and the merchant gets visible feedback.
  void parsed;

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
  const [form, setForm] = useState<RegistrationForm>(() =>
    structuredClone(initialForm),
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
  // hides. The action returns { ok: true, savedAt } on success.
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

  const updateField = <K extends keyof RegistrationForm>(
    key: K,
    value: RegistrationForm[K],
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

  const handleEditField = (key: string) => {
    const target = form.definition.steps[0].fields.find((f) => f.key === key);
    if (!target) return;
    setEditing({ field: target, type: target.type, open: true });
  };

  const handleDeleteField = (key: string) => {
    if (typeof window !== "undefined") {
      const target = form.definition.steps[0].fields.find((f) => f.key === key);
      if (!target) return;
      const ok = window.confirm(
        `Delete field "${target.label}"? This cannot be undone.`,
      );
      if (!ok) return;
    }
    setForm((prev) => {
      const cloned = structuredClone(prev);
      cloned.definition.steps[0].fields = cloned.definition.steps[0].fields.filter(
        (f) => f.key !== key,
      );
      return cloned;
    });
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
      const existingIdx = fields.findIndex((f) => f.key === editing.field?.key);
      if (existingIdx >= 0) {
        fields[existingIdx] = next;
      } else {
        fields.push(next);
      }
      return cloned;
    });
    setEditing({ field: null, type: "text", open: false });
  };

  const handlePickTemplate = (tmpl: RegistrationForm) => {
    setForm({
      ...tmpl,
      id: form.id,
      shopId: form.shopId,
    });
    setTemplatePickerOpen(false);
  };

  const existingKeys = form.definition.steps[0].fields.map((f) => f.key);

  /* ---- render ---- */

  const actionError =
    actionData && "ok" in actionData && !actionData.ok
      ? actionData.error
      : undefined;

  return (
    <Page fullWidth>
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
                label="Form title"
                labelHidden
                value={form.settings.title}
                onChange={(v) =>
                  updateField("settings", {
                    ...form.settings,
                    title: v.slice(0, 50),
                  })
                }
                maxLength={50}
                showCharacterCount
                autoComplete="off"
                placeholder="Form title"
              />
            </Box>
            <InlineStack gap="300" blockAlign="center" wrap={false}>
              <Badge tone={form.settings.status === "active" ? "success" : undefined}>
                {form.settings.status === "active" ? "Active" : "Draft"}
              </Badge>
              <Button
                onClick={() =>
                  updateField("settings", {
                    ...form.settings,
                    status:
                      form.settings.status === "active" ? "draft" : "active",
                  })
                }
              >
                {form.settings.status === "active"
                  ? "Switch to draft"
                  : "Activate"}
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
    </Page>
  );
}
