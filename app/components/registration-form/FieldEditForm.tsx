/**
 * FieldEditForm — INLINE field create/edit form (no modal wrapper).
 *
 * This replaces the old `FieldEditModal` inside the builder. A floating
 * Polaris modal portals to `document.body`, which sits BEHIND the App
 * Bridge `variant="max"` modal overlay — so the dialog opened but was
 * invisible/unclickable. Rendering the form inline in the editor's middle
 * pane sidesteps portals entirely. See
 * `docs/patterns/shopify-app-bridge-max-modal-editor.md` gotcha #1.
 *
 * Mode is implicit: `field` provided → edit it; `field` null → create a
 * new field of `initialType`. The component is mounted fresh per edit
 * (the parent keys it), so initial state comes from the props directly —
 * no reset-on-open effect needed.
 */
import { useEffect, useMemo, useState } from "react";
import {
  TextField,
  Select,
  Checkbox,
  BlockStack,
  InlineStack,
  Button,
  Text,
  Box,
} from "@shopify/polaris";
import { DeleteIcon, PlusIcon } from "@shopify/polaris-icons";

import type {
  FieldType,
  FormField,
  FieldWidth,
} from "../../lib/registrationForm/types";
import { FIELD_TYPE_LABEL } from "./field-icons";
import { isValidFieldKey, slugifyKey } from "./keys";

const TYPE_OPTIONS: Array<{ label: string; value: FieldType }> = (
  ["text", "email", "password", "phone", "select", "country", "textarea"] as FieldType[]
).map((t) => ({ value: t, label: FIELD_TYPE_LABEL[t] }));

const WIDTH_OPTIONS: Array<{ label: string; value: FieldWidth }> = [
  { label: "Full width", value: "full" },
  { label: "Half width", value: "half" },
];

export function FieldEditForm({
  field,
  initialType,
  existingKeys,
  onSave,
  onCancel,
}: {
  /** When provided: edit mode. When null: create mode. */
  field: FormField | null;
  /** Defaults to "text" when creating from the + button. */
  initialType?: FieldType;
  /** Used to detect duplicate keys; excludes the field being edited. */
  existingKeys: string[];
  onSave: (next: FormField) => void;
  onCancel: () => void;
}) {
  const isEdit = field !== null;

  const [type, setType] = useState<FieldType>(field?.type ?? initialType ?? "text");
  const [label, setLabel] = useState(field?.label ?? "");
  const [key, setKey] = useState(field?.key ?? "");
  // Existing keys are sacred — never auto-rewrite them.
  const [keyTouched, setKeyTouched] = useState(isEdit);
  const [required, setRequired] = useState(field?.required ?? false);
  const [width, setWidth] = useState<FieldWidth>(field?.width ?? "full");
  const [placeholder, setPlaceholder] = useState(field?.placeholder ?? "");
  const [helpText, setHelpText] = useState(field?.helpText ?? "");
  const [options, setOptions] = useState<Array<{ value: string; label: string }>>(
    field?.type === "select" ? (field.options ?? []).map((o) => ({ ...o })) : [],
  );
  const [error, setError] = useState<string | null>(null);

  // Auto-derive the key from the label until the user edits it manually.
  useEffect(() => {
    if (!keyTouched) setKey(slugifyKey(label));
  }, [label, keyTouched]);

  const otherKeys = useMemo(
    () => new Set(existingKeys.filter((k) => k !== field?.key)),
    [existingKeys, field],
  );

  const handleSave = () => {
    const trimmedLabel = label.trim();
    const trimmedKey = key.trim();
    if (!trimmedLabel) {
      setError("Label is required.");
      return;
    }
    if (!trimmedKey) {
      setError("Field key is required.");
      return;
    }
    if (!isValidFieldKey(trimmedKey)) {
      setError("Key must be lowercase letters, numbers, or underscores.");
      return;
    }
    if (otherKeys.has(trimmedKey)) {
      setError(`Key "${trimmedKey}" is already used by another field.`);
      return;
    }
    if (type === "select" && options.length === 0) {
      setError("Select fields need at least one option.");
      return;
    }

    const next: FormField = {
      id: field?.id ?? crypto.randomUUID(),
      key: trimmedKey,
      label: trimmedLabel,
      type,
      required,
      width,
      placeholder: placeholder.trim() || undefined,
      helpText: helpText.trim() || undefined,
      ...(type === "select"
        ? {
            options: options.map((o) => ({
              value: o.value.trim() || slugifyKey(o.label),
              label: o.label.trim(),
            })),
          }
        : {}),
    };
    onSave(next);
  };

  const addOption = () =>
    setOptions((prev) => [...prev, { value: "", label: "" }]);
  const updateOption = (
    idx: number,
    patch: Partial<{ value: string; label: string }>,
  ) =>
    setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  const removeOption = (idx: number) =>
    setOptions((prev) => prev.filter((_, i) => i !== idx));

  return (
    <BlockStack gap="400">
      <InlineStack align="space-between" blockAlign="center">
        <Text as="h2" variant="headingMd">
          {isEdit ? `Edit field — ${field?.label}` : "Add field"}
        </Text>
        <Button variant="tertiary" onClick={onCancel}>
          Back
        </Button>
      </InlineStack>

      {error && (
        <Box padding="300" background="bg-surface-critical" borderRadius="200">
          <Text as="p" variant="bodySm" tone="critical">
            {error}
          </Text>
        </Box>
      )}

      <Select
        label="Field type"
        options={TYPE_OPTIONS}
        value={type}
        onChange={(v) => setType(v as FieldType)}
        disabled={isEdit}
        helpText={
          isEdit
            ? "Type cannot change after creation — delete and re-add to change."
            : undefined
        }
      />
      <TextField
        label="Label"
        value={label}
        onChange={setLabel}
        autoComplete="off"
        requiredIndicator
      />
      <TextField
        label="Field key"
        value={key}
        onChange={(v) => {
          setKey(v);
          setKeyTouched(true);
        }}
        autoComplete="off"
        helpText="Lowercase letters, numbers, underscores. Used as the JSON response key on submission — change with care."
      />
      <Checkbox label="Required" checked={required} onChange={setRequired} />
      <Select
        label="Width"
        options={WIDTH_OPTIONS}
        value={width}
        onChange={(v) => setWidth(v as FieldWidth)}
      />
      {type !== "country" && type !== "select" && (
        <TextField
          label="Placeholder"
          value={placeholder}
          onChange={setPlaceholder}
          autoComplete="off"
        />
      )}
      {type !== "country" && (
        <TextField
          label="Help text"
          value={helpText}
          onChange={setHelpText}
          autoComplete="off"
          multiline={2}
        />
      )}
      {type === "select" && (
        <BlockStack gap="200">
          <Text as="p" variant="headingSm">
            Options
          </Text>
          {options.map((opt, idx) => (
            <InlineStack key={idx} gap="200" wrap={false} blockAlign="end">
              <Box minWidth="220px">
                <TextField
                  label="Label"
                  value={opt.label}
                  onChange={(v) => updateOption(idx, { label: v })}
                  autoComplete="off"
                />
              </Box>
              <Box minWidth="160px">
                <TextField
                  label="Value"
                  value={opt.value}
                  onChange={(v) => updateOption(idx, { value: v })}
                  autoComplete="off"
                />
              </Box>
              <Button
                icon={DeleteIcon}
                accessibilityLabel={`Remove option ${idx + 1}`}
                onClick={() => removeOption(idx)}
                variant="tertiary"
                tone="critical"
              />
            </InlineStack>
          ))}
          <InlineStack>
            <Button icon={PlusIcon} onClick={addOption}>
              Add option
            </Button>
          </InlineStack>
        </BlockStack>
      )}

      <Box borderColor="border" borderBlockStartWidth="025" paddingBlockStart="400">
        <InlineStack gap="300">
          <Button variant="primary" onClick={handleSave}>
            {isEdit ? "Save field" : "Add field"}
          </Button>
          <Button onClick={onCancel}>Cancel</Button>
        </InlineStack>
      </Box>
    </BlockStack>
  );
}
