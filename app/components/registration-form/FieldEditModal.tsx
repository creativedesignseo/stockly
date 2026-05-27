/**
 * FieldEditModal — Polaris Modal used to create or edit a FormField.
 *
 * Mode is implicit: if `field` is provided, edit it; otherwise create
 * a new field of `initialType` (used by the type-picker flow).
 */
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
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
  SelectField,
} from "../../lib/registration-form-types";
import { FIELD_TYPE_LABEL } from "./field-icons";
import { isValidFieldKey, slugifyKey } from "./keys";

const TYPE_OPTIONS: Array<{ label: string; value: FieldType }> = (
  ["text", "email", "password", "phone", "select", "country", "textarea"] as FieldType[]
).map((t) => ({ value: t, label: FIELD_TYPE_LABEL[t] }));

const WIDTH_OPTIONS: Array<{ label: string; value: FieldWidth }> = [
  { label: "Full width", value: "full" },
  { label: "Half width", value: "half" },
];

export function FieldEditModal({
  open,
  field,
  initialType,
  existingKeys,
  onClose,
  onSave,
}: {
  open: boolean;
  /** When provided: edit mode. When null: create mode. */
  field: FormField | null;
  /** Defaults to "text" when creating from the + button. */
  initialType?: FieldType;
  /** Used to detect duplicate keys; excludes the field being edited. */
  existingKeys: string[];
  onClose: () => void;
  onSave: (next: FormField) => void;
}) {
  const isEdit = field !== null;

  const [type, setType] = useState<FieldType>(initialType ?? "text");
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [required, setRequired] = useState(false);
  const [width, setWidth] = useState<FieldWidth>("full");
  const [placeholder, setPlaceholder] = useState("");
  const [helpText, setHelpText] = useState("");
  const [options, setOptions] = useState<Array<{ value: string; label: string }>>(
    [],
  );
  const [error, setError] = useState<string | null>(null);

  // Reset state every time the modal opens. Without this, switching
  // from edit field A -> edit field B without closing would show A's
  // values bleed into B.
  useEffect(() => {
    if (!open) return;
    if (field) {
      setType(field.type);
      setLabel(field.label);
      setKey(field.key);
      setKeyTouched(true); // existing keys are sacred — never auto-rewrite
      setRequired(field.required);
      setWidth(field.width);
      setPlaceholder(field.placeholder ?? "");
      setHelpText(field.helpText ?? "");
      if (field.type === "select") {
        setOptions(field.options.map((o) => ({ ...o })));
      } else {
        setOptions([]);
      }
    } else {
      setType(initialType ?? "text");
      setLabel("");
      setKey("");
      setKeyTouched(false);
      setRequired(false);
      setWidth("full");
      setPlaceholder("");
      setHelpText("");
      setOptions([]);
    }
    setError(null);
  }, [open, field, initialType]);

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

    const base = {
      key: trimmedKey,
      label: trimmedLabel,
      required,
      width,
      placeholder: placeholder.trim() || undefined,
      helpText: helpText.trim() || undefined,
    };

    let next: FormField;
    switch (type) {
      case "select":
        next = {
          ...base,
          type: "select",
          options: options.map((o) => ({
            value: o.value.trim() || slugifyKey(o.label),
            label: o.label.trim(),
          })),
        } satisfies SelectField;
        break;
      case "textarea":
        next = { ...base, type: "textarea", rows: 4 };
        break;
      case "password":
        next = { ...base, type: "password" };
        break;
      case "text":
      case "email":
      case "phone":
      case "country":
        next = { ...base, type } as FormField;
        break;
    }
    onSave(next);
  };

  const addOption = () =>
    setOptions((prev) => [...prev, { value: "", label: "" }]);
  const updateOption = (
    idx: number,
    patch: Partial<{ value: string; label: string }>,
  ) =>
    setOptions((prev) =>
      prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)),
    );
  const removeOption = (idx: number) =>
    setOptions((prev) => prev.filter((_, i) => i !== idx));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit field — ${field?.label}` : "Add field"}
      primaryAction={{
        content: isEdit ? "Save" : "Add",
        onAction: handleSave,
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {error && (
            <Box
              padding="300"
              background="bg-surface-critical-subdued"
              borderRadius="200"
            >
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
          <Checkbox
            label="Required"
            checked={required}
            onChange={setRequired}
          />
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
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
