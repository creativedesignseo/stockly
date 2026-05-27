/**
 * AppearancePanel — layout / width / colors / background / custom CSS.
 */
import {
  BlockStack,
  Card,
  ChoiceList,
  InlineStack,
  RangeSlider,
  Select,
  Text,
  TextField,
  Box,
} from "@shopify/polaris";

import type {
  AppearanceColors,
  FormAppearance,
} from "../../lib/registration-form-types";

const COLOR_FIELDS: Array<{ key: keyof AppearanceColors; label: string }> = [
  { key: "main", label: "Main" },
  { key: "heading", label: "Heading" },
  { key: "label", label: "Label" },
  { key: "description", label: "Description" },
  { key: "option", label: "Option" },
  { key: "paragraph", label: "Paragraph" },
  { key: "paragraphBackground", label: "Paragraph background" },
];

/**
 * A small color row. Native <input type="color"> is intentional —
 * Polaris ships a ColorPicker but it returns HSB objects and would
 * triple the surface area; native is fine for Phase 1.
 */
function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <InlineStack align="space-between" blockAlign="center" wrap={false}>
      <Text as="span" variant="bodyMd">
        {label}
      </Text>
      <InlineStack gap="200" blockAlign="center" wrap={false}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} color`}
          style={{
            width: 36,
            height: 28,
            border: "1px solid var(--p-color-border)",
            borderRadius: "var(--p-border-radius-100)",
            background: "transparent",
            padding: 0,
            cursor: "pointer",
          }}
        />
        <Box minWidth="100px">
          <TextField
            label={`${label} hex`}
            labelHidden
            value={value}
            onChange={onChange}
            autoComplete="off"
          />
        </Box>
      </InlineStack>
    </InlineStack>
  );
}

export function AppearancePanel({
  appearance,
  onChange,
}: {
  appearance: FormAppearance;
  onChange: (next: FormAppearance) => void;
}) {
  const updateColor = (k: keyof AppearanceColors, v: string) =>
    onChange({
      ...appearance,
      colors: { ...appearance.colors, [k]: v },
    });

  return (
    <BlockStack gap="400">
      <Text as="h2" variant="headingMd">
        Appearance
      </Text>

      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">
            Layout
          </Text>
          <ChoiceList
            title="Layout"
            titleHidden
            choices={[
              { label: "Default", value: "default" },
              { label: "Boxed", value: "boxed" },
            ]}
            selected={[appearance.layout]}
            onChange={(values) =>
              onChange({
                ...appearance,
                layout: (values[0] as "default" | "boxed") ?? "default",
              })
            }
          />
          <RangeSlider
            label={`Width (${appearance.width}px)`}
            min={320}
            max={1200}
            step={10}
            value={appearance.width}
            onChange={(v) =>
              onChange({
                ...appearance,
                width: Array.isArray(v) ? v[0] : v,
              })
            }
            output
          />
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">
            Colors
          </Text>
          <BlockStack gap="200">
            {COLOR_FIELDS.map((f) => (
              <ColorRow
                key={f.key}
                label={f.label}
                value={appearance.colors[f.key]}
                onChange={(v) => updateColor(f.key, v)}
              />
            ))}
          </BlockStack>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">
            Background
          </Text>
          <Select
            label="Background type"
            options={[{ label: "Color", value: "color" }]}
            value={appearance.background.type}
            onChange={() => {
              /* Phase 1: only "color" */
            }}
            helpText="Image and gradient backgrounds arrive in Phase 2."
          />
          <ColorRow
            label="Background color"
            value={appearance.background.color}
            onChange={(v) =>
              onChange({
                ...appearance,
                background: { ...appearance.background, color: v },
              })
            }
          />
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">
            Custom CSS
          </Text>
          <TextField
            label="Custom CSS"
            labelHidden
            value={appearance.customCss}
            onChange={(v) => onChange({ ...appearance, customCss: v })}
            multiline={8}
            autoComplete="off"
            placeholder=".stockly-reg { /* your CSS */ }"
            helpText="Injected as a scoped <style> tag on the storefront. No <script> support."
          />
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
