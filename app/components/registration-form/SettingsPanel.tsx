/**
 * SettingsPanel — title, status, redirect URL, error message overrides.
 */
import {
  BlockStack,
  Card,
  ChoiceList,
  Text,
  TextField,
} from "@shopify/polaris";

import type {
  FormErrorMessages,
  FormSettings,
} from "../../lib/registration-form-types";

const ERROR_FIELDS: Array<{ key: keyof FormErrorMessages; label: string }> = [
  { key: "required", label: "Required" },
  { key: "invalid", label: "Invalid" },
  { key: "invalidName", label: "Invalid name" },
  { key: "invalidEmail", label: "Invalid email" },
  { key: "invalidUrl", label: "Invalid URL" },
  { key: "invalidPhone", label: "Invalid phone" },
  { key: "invalidNumber", label: "Invalid number" },
  { key: "invalidPassword", label: "Invalid password" },
  { key: "passwordMismatch", label: "Passwords don't match" },
];

export function SettingsPanel({
  settings,
  onChange,
}: {
  settings: FormSettings;
  onChange: (next: FormSettings) => void;
}) {
  const updateErrorMessage = (k: keyof FormErrorMessages, v: string) =>
    onChange({
      ...settings,
      errorMessages: { ...settings.errorMessages, [k]: v },
    });

  return (
    <BlockStack gap="400">
      <Text as="h2" variant="headingMd">
        Settings
      </Text>

      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">
            General
          </Text>
          <TextField
            label="Form title"
            value={settings.title}
            onChange={(v) => onChange({ ...settings, title: v.slice(0, 50) })}
            autoComplete="off"
            maxLength={50}
            showCharacterCount
            helpText="Shown above the form on the storefront."
          />
          <ChoiceList
            title="Status"
            choices={[
              { label: "Active — shown on storefront", value: "active" },
              { label: "Draft — hidden from storefront", value: "draft" },
            ]}
            selected={[settings.status]}
            onChange={(values) =>
              onChange({
                ...settings,
                status: (values[0] as "active" | "draft") ?? "active",
              })
            }
          />
          <TextField
            label="After-submit redirect URL"
            value={settings.afterSubmitRedirectUrl ?? ""}
            onChange={(v) =>
              onChange({
                ...settings,
                afterSubmitRedirectUrl: v.trim() || undefined,
              })
            }
            autoComplete="off"
            placeholder="https://example.com/thank-you"
            helpText="Optional. Leave blank to show the default success message."
          />
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">
            Error messages
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Override the default validation messages shown to customers.
          </Text>
          <BlockStack gap="200">
            {ERROR_FIELDS.map((f) => (
              <TextField
                key={f.key}
                label={f.label}
                value={settings.errorMessages[f.key]}
                onChange={(v) => updateErrorMessage(f.key, v)}
                autoComplete="off"
              />
            ))}
          </BlockStack>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
