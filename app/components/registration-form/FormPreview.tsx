/**
 * FormPreview — faithful admin render of the SAME definition the
 * storefront renders.
 *
 * Earlier this used Polaris TextField/Select, which ignored the
 * appearance colors and didn't show the submit button, so the merchant
 * had no real idea what the customer would see. It now renders plain
 * markup with the SAME `stockly-reg__*` class names and `--rf-color-*`
 * custom properties as the storefront renderer
 * (`extensions/quick-order-form/assets/registration-form.{css,src.js}`),
 * applying the merchant's appearance live.
 *
 * The scoped <style> below mirrors registration-form.css (scoped under
 * `.rf-preview-scope` instead of the `stockly-registration` host).
 * KEEP THE TWO IN SYNC — if you change spacing/radius/shadows here,
 * change them there too. Phase 2 can dedupe by importing the raw CSS.
 */
import * as React from "react";
import { BlockStack, Box, Card, Text } from "@shopify/polaris";

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

/** Scoped copy of the storefront CSS — see file header for the sync note. */
const PREVIEW_CSS = `
.rf-preview-scope { --rf-color-error: rgb(170,50,50); }
.rf-preview-scope .stockly-reg__root { max-width: var(--rf-form-max-width); margin: 0 auto; }
.rf-preview-scope.layout-default .stockly-reg__inner { background: var(--rf-color-background); }
.rf-preview-scope.layout-boxed .stockly-reg__inner {
  padding: 2rem; border: 1px solid var(--rf-color-border); border-radius: 12px;
  background: var(--rf-color-background);
  box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
}
.rf-preview-scope .stockly-reg__heading {
  margin: 0 0 0.5rem; font-size: 1.5rem; font-weight: 600; color: var(--rf-color-heading);
}
.rf-preview-scope .stockly-reg__grid {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.875rem 1rem;
}
.rf-preview-scope .stockly-reg__field { display: flex; flex-direction: column; gap: 0.375rem; }
.rf-preview-scope .stockly-reg__field--full { grid-column: 1 / -1; }
.rf-preview-scope .stockly-reg__field--half { grid-column: span 1; }
.rf-preview-scope .stockly-reg__label {
  font-size: 0.85rem; font-weight: 600; color: var(--rf-color-label);
}
.rf-preview-scope .stockly-reg__field--required .stockly-reg__label::after {
  content: " *"; color: var(--rf-color-error);
}
.rf-preview-scope .stockly-reg__field input,
.rf-preview-scope .stockly-reg__field textarea,
.rf-preview-scope .stockly-reg__field select {
  width: 100%; padding: 0.7rem 0.8rem; font: inherit; border: 1px solid var(--rf-color-border);
  border-radius: 8px; background: #fff; color: var(--rf-color-option); box-sizing: border-box;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.rf-preview-scope .stockly-reg__field textarea { resize: vertical; min-height: 5rem; }
.rf-preview-scope .stockly-reg__hint {
  display: block; margin-top: 0.25rem; font-size: 0.75rem; color: var(--rf-color-description);
}
.rf-preview-scope .stockly-reg__actions { margin-top: 1.25rem; }
.rf-preview-scope .stockly-reg__submit {
  appearance: none; background: var(--rf-color-main); color: var(--rf-color-button-text, #fff);
  border: 0; padding: 0.85rem 1.75rem; font: inherit; font-weight: 600; font-size: 0.95rem;
  letter-spacing: 0.01em; border-radius: 8px; cursor: default;
  box-shadow: 0 1px 2px rgba(0,0,0,0.12);
}
`;

function PreviewField({ field }: { field: FormField }) {
  const id = `rf-preview-${field.id}`;
  const cls = `stockly-reg__field stockly-reg__field--${field.width ?? "full"}${
    field.required ? " stockly-reg__field--required" : ""
  }`;

  let control: React.ReactNode;
  switch (field.type) {
    case "textarea":
      control = <textarea id={id} placeholder={field.placeholder} readOnly />;
      break;
    case "select":
      control = (
        <select id={id} defaultValue="" disabled>
          <option value="">{field.placeholder ?? "Select…"}</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case "country":
      control = (
        <select id={id} defaultValue="" disabled>
          {COUNTRY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    default: {
      const inputType =
        field.type === "email"
          ? "email"
          : field.type === "password"
            ? "password"
            : field.type === "phone"
              ? "tel"
              : "text";
      control = (
        <input id={id} type={inputType} placeholder={field.placeholder} readOnly />
      );
    }
  }

  return (
    <div className={cls}>
      <label className="stockly-reg__label" htmlFor={id}>
        {field.label}
      </label>
      {control}
      {field.helpText && <span className="stockly-reg__hint">{field.helpText}</span>}
    </div>
  );
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
  const rows = layoutFieldsIntoRows(fields);

  const scopeStyle = {
    "--rf-color-main": appearance.colors.main,
    "--rf-color-heading": appearance.colors.heading,
    "--rf-color-label": appearance.colors.label,
    "--rf-color-description": appearance.colors.description,
    "--rf-color-option": appearance.colors.option,
    "--rf-color-paragraph": appearance.colors.paragraph,
    "--rf-color-paragraph-bg": appearance.colors.paragraphBg,
    "--rf-color-background": appearance.background.color,
    "--rf-color-border": "rgba(0, 0, 0, 0.12)",
    "--rf-form-max-width": `${appearance.width}px`,
    color: appearance.colors.paragraph,
  } as React.CSSProperties;

  return (
    <Box padding="400">
      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm" tone="subdued">
            Live preview
          </Text>
          <style dangerouslySetInnerHTML={{ __html: PREVIEW_CSS }} />
          <div className={`rf-preview-scope layout-${appearance.layout}`} style={scopeStyle}>
            <div className="stockly-reg__root">
              <div className="stockly-reg__inner">
                <h2 className="stockly-reg__heading">
                  {settings.titleEn || "Wholesale registration"}
                </h2>
                {fields.length === 0 ? (
                  <Text as="p" variant="bodySm" tone="subdued">
                    Add a field on the left to see it here.
                  </Text>
                ) : (
                  <>
                    <div className="stockly-reg__grid">
                      {rows.map((row, idx) => (
                        <React.Fragment key={idx}>
                          {row.map((f) => (
                            <PreviewField key={f.key} field={f} />
                          ))}
                        </React.Fragment>
                      ))}
                    </div>
                    <div className="stockly-reg__actions">
                      <button className="stockly-reg__submit" type="button" disabled>
                        Submit application
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          {appearance.customCss && (
            // Custom CSS in the admin preview is inert by design — we
            // deliberately don't inject it so a typo can't break the
            // admin chrome. The storefront renderer applies it (scoped).
            <Text as="p" variant="bodySm" tone="subdued">
              Custom CSS will be applied on the storefront only.
            </Text>
          )}
        </BlockStack>
      </Card>
    </Box>
  );
}
