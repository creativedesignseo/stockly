/**
 * TypePickerModal — small Polaris Modal that lets the merchant pick
 * which type of field to add. Selecting a type closes this modal and
 * opens FieldEditModal pre-populated with the chosen type.
 */
import {
  Modal,
  BlockStack,
  InlineGrid,
  Text,
  Icon,
  Box,
} from "@shopify/polaris";

import type { FieldType } from "../../lib/registration-form-types";
import { FIELD_ICON, FIELD_TYPE_LABEL } from "./field-icons";

const TYPES: FieldType[] = [
  "text",
  "email",
  "password",
  "phone",
  "select",
  "country",
  "textarea",
];

export function TypePickerModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (type: FieldType) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Choose a field type">
      <Modal.Section>
        <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
          {TYPES.map((t) => {
            const IconComp = FIELD_ICON[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => onPick(t)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  border: "1px solid var(--p-color-border)",
                  borderRadius: "var(--p-border-radius-200)",
                  background: "var(--p-color-bg-surface)",
                  padding: "var(--p-space-300)",
                  cursor: "pointer",
                }}
              >
                <BlockStack gap="200">
                  <Box>
                    <Icon source={IconComp} tone="primary" />
                  </Box>
                  <Text as="span" variant="bodyMd" fontWeight="medium">
                    {FIELD_TYPE_LABEL[t]}
                  </Text>
                </BlockStack>
              </button>
            );
          })}
        </InlineGrid>
      </Modal.Section>
    </Modal>
  );
}
