/**
 * TemplatePickerModal — 3 cards (Standard / Modern / Samita-B2B).
 * Selecting one replaces the current draft with the chosen template.
 */
import {
  Modal,
  InlineGrid,
  BlockStack,
  Text,
  Box,
} from "@shopify/polaris";

import {
  TEMPLATES,
  TEMPLATE_META,
  type TemplateKey,
} from "./seed-templates";
import type { RegistrationForm } from "../../lib/registration-form-types";

export function TemplatePickerModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (form: RegistrationForm) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pick a starting template"
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <Text as="p" variant="bodySm" tone="subdued">
            Replaces the current draft. You can still tweak any field
            afterwards.
          </Text>
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
            {TEMPLATE_META.map((meta) => (
              <TemplateCard
                key={meta.key}
                templateKey={meta.key}
                title={meta.title}
                description={meta.description}
                onPick={onPick}
              />
            ))}
          </InlineGrid>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

function TemplateCard({
  templateKey,
  title,
  description,
  onPick,
}: {
  templateKey: TemplateKey;
  title: string;
  description: string;
  onPick: (form: RegistrationForm) => void;
}) {
  const tmpl = TEMPLATES[templateKey];
  const fieldCount = tmpl.definition.steps[0]?.fields.length ?? 0;
  return (
    <button
      type="button"
      onClick={() => onPick(tmpl)}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        border: "1px solid var(--p-color-border)",
        borderRadius: "var(--p-border-radius-200)",
        background: "var(--p-color-bg-surface)",
        padding: "var(--p-space-400)",
        cursor: "pointer",
      }}
    >
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">
          {title}
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          {description}
        </Text>
        <Box paddingBlockStart="100">
          <Text as="p" variant="bodySm">
            {fieldCount} field{fieldCount === 1 ? "" : "s"}
          </Text>
        </Box>
      </BlockStack>
    </button>
  );
}
