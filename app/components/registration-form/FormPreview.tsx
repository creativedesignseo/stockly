/**
 * FormPreview — Polaris-themed renderer of the same definition that
 * the storefront would render with vanilla DOM.
 *
 * NOTE: This component intentionally uses Polaris primitives for the
 * admin context. The Storefront implementer's renderer in
 * `extensions/quick-order-form/assets/registration-form.src.js` is a
 * different renderer of the *same* definition shape — keep the field
 * layout / labels / required indicators visually equivalent.
 */
import {
  BlockStack,
  Card,
  InlineGrid,
  Select,
  Text,
  TextField,
  Box,
} from "@shopify/polaris";

import type {
  FormAppearance,
  FormField,
  FormSettings,
  RegistrationFormDefinition,
} from "../../lib/registrationForm/types";
import { layoutFieldsIntoRows } from "./layout";

const COUNTRY_OPTIONS = [
  { label: "Select a country…", value: "" },
  { label: "United States", value: "US" },
  { label: "Canada", value: "CA" },
  { label: "United Kingdom", value: "GB" },
  { label: "Spain", value: "ES" },
  { label: "France", value: "FR" },
  { label: "Germany", value: "DE" },
  { label: "Italy", value: "IT" },
  { label: "Other", value: "OTHER" },
];

function PreviewField({ field }: { field: FormField }) {
  const label = field.required ? `${field.label} *` : field.label;
  const common = {
    label,
    placeholder: field.placeholder,
    helpText: field.helpText,
    autoComplete: "off",
    value: "",
    onChange: () => {
      /* preview only — no state */
    },
  };

  switch (field.type) {
    case "text":
      return <TextField {...common} />;
    case "email":
      return <TextField {...common} type="email" />;
    case "password":
      return <TextField {...common} type="password" />;
    case "phone":
      return <TextField {...common} type="tel" />;
    case "textarea":
      return <TextField {...common} multiline={4} />;
    case "select":
      return (
        <Select
          label={label}
          helpText={field.helpText}
          options={[
            { label: field.placeholder ?? "Select…", value: "" },
            ...(field.options ?? []).map((o) => ({ label: o.label, value: o.value })),
          ]}
          value=""
          onChange={() => {
            /* preview only */
          }}
        />
      );
    case "country":
      return (
        <Select
          label={label}
          helpText={field.helpText}
          options={COUNTRY_OPTIONS}
          value=""
          onChange={() => {
            /* preview only */
          }}
        />
      );
  }
}

export function FormPreview({
  definition,
  appearance,
  settings,
}: {
  definition: RegistrationFormDefinition;
  appearance: FormAppearance;
  settings: FormSettings;
}) {
  const step = definition.steps[0];
  const fields = step?.fields ?? [];

  // Layout fields into rows. A "half" field pairs with the next "half"
  // (if any); otherwise stays on its own row. "full" fields are always
  // standalone. Logic extracted to `./layout.ts` for unit testing.
  const rows = layoutFieldsIntoRows(fields);

  const wrapperStyle: React.CSSProperties = {
    background: appearance.background.color,
    padding:
      appearance.layout === "boxed"
        ? "var(--p-space-600)"
        : "var(--p-space-400)",
    borderRadius:
      appearance.layout === "boxed"
        ? "var(--p-border-radius-300)"
        : undefined,
    border:
      appearance.layout === "boxed"
        ? "1px solid var(--p-color-border)"
        : undefined,
    maxWidth: appearance.width,
    margin: "0 auto",
    color: appearance.colors.paragraph,
  };

  return (
    <Box padding="400">
      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm" tone="subdued">
            Live preview
          </Text>
          <div style={wrapperStyle}>
            <BlockStack gap="400">
              <Text as="h2" variant="headingLg">
                {settings.titleEn || "Wholesale registration"}
              </Text>
              {fields.length === 0 ? (
                <Text as="p" variant="bodySm" tone="subdued">
                  Add a field on the left to see it here.
                </Text>
              ) : (
                <BlockStack gap="300">
                  {rows.map((row, idx) => (
                    <InlineGrid
                      key={idx}
                      columns={row.length === 2 ? 2 : 1}
                      gap="300"
                    >
                      {row.map((f) => (
                        <PreviewField key={f.key} field={f} />
                      ))}
                    </InlineGrid>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </div>
          {appearance.customCss && (
            // Custom CSS in the admin preview is inert by design —
            // we deliberately don't inject it so a typo can't break
            // the admin chrome. The storefront renderer is the one
            // that applies it (in a scoped <style>).
            <Text as="p" variant="bodySm" tone="subdued">
              Custom CSS will be applied on the storefront only.
            </Text>
          )}
        </BlockStack>
      </Card>
    </Box>
  );
}
