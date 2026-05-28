/**
 * TemplatePickerModal — 3 cards (Standard / Modern / Samita-B2B).
 * Selecting one resets the current draft to the chosen template.
 *
 * Templates come from the canonical Foundation seeds module
 * (`app/lib/registrationForm/seeds.ts`). The picker only emits the
 * `SeedTemplateId` — the parent route applies the template to the
 * editor state (since it owns RegistrationFormDefinition + appearance
 * + settings as a whole).
 */
import {
  Modal,
  InlineGrid,
  BlockStack,
  Text,
  Box,
} from "@shopify/polaris";

import { TEMPLATES, TEMPLATE_META } from "../../lib/registrationForm/seeds";
import type { SeedTemplateId } from "../../lib/registrationForm/types";

export function TemplatePickerModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (id: SeedTemplateId) => void;
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
                key={meta.id}
                templateKey={meta.id}
                title={meta.name}
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
  templateKey: SeedTemplateId;
  title: string;
  description: string;
  onPick: (id: SeedTemplateId) => void;
}) {
  const tmpl = TEMPLATES[templateKey];
  const fieldCount = tmpl.steps[0]?.fields.length ?? 0;
  return (
    <button
      type="button"
      onClick={() => onPick(templateKey)}
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
