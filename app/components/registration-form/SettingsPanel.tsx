/**
 * SettingsPanel — title, redirect URL, error message overrides.
 *
 * Status (active/draft) lives as a row-level Prisma column, not inside
 * settings — it's edited from the top toolbar of the route, not here.
 */
import {
  BlockStack,
  Card,
  Text,
  TextField,
} from "@shopify/polaris";

import type {
  FormErrorMessages,
  FormSettings,
} from "../../lib/registrationForm/types";

const ERROR_FIELDS: Array<{ key: keyof FormErrorMessages; label: string }> = [
  { key: "required", label: "Required" },
  { key: "invalid", label: "Invalid" },
  { key: "invalidEmail", label: "Invalid email" },
  { key: "invalidPhone", label: "Invalid phone" },
  { key: "tooLong", label: "Too long" },
  { key: "tooShort", label: "Too short" },
  { key: "mismatch", label: "Values do not match" },
  { key: "networkError", label: "Network error" },
  { key: "genericError", label: "Generic error" },
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
            value={settings.titleEn}
            onChange={(v) => onChange({ ...settings, titleEn: v.slice(0, 50) })}
            autoComplete="off"
            maxLength={50}
            showCharacterCount
            helpText="Shown above the form on the storefront."
          />
          <TextField
            label="After-submit redirect URL"
            value={settings.redirectUrl ?? ""}
            onChange={(v) =>
              onChange({
                ...settings,
                redirectUrl: v.trim() || undefined,
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
