/**
 * FieldList — sortable list of form fields using dnd-kit.
 *
 * Each row is a SortableItem with: drag handle, type icon, label
 * preview, edit button, delete button. Reorder via dnd-kit's
 * SortableContext + verticalListSortingStrategy.
 */
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Icon,
  InlineStack,
  Text,
} from "@shopify/polaris";
import {
  DragHandleIcon,
  EditIcon,
  DeleteIcon,
  PlusIcon,
} from "@shopify/polaris-icons";

import type { FormField } from "../../lib/registrationForm/types";
import { FIELD_ICON, FIELD_TYPE_LABEL } from "./field-icons";

/* -------------------------------------------------------------------------- */
/*                              Sortable row                                  */
/* -------------------------------------------------------------------------- */

function SortableFieldRow({
  field,
  onEdit,
  onDelete,
}: {
  field: FormField;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    border: "1px solid var(--p-color-border)",
    borderRadius: "var(--p-border-radius-200)",
    background: "var(--p-color-bg-surface)",
    padding: "var(--p-space-200) var(--p-space-300)",
  };

  const IconComp = FIELD_ICON[field.type];

  return (
    <div ref={setNodeRef} style={style}>
      <InlineStack
        gap="300"
        align="space-between"
        blockAlign="center"
        wrap={false}
      >
        <InlineStack gap="300" blockAlign="center" wrap={false}>
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Drag ${field.label}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 24,
              height: 24,
              border: "none",
              background: "transparent",
              cursor: "grab",
              padding: 0,
            }}
          >
            <Icon source={DragHandleIcon} tone="subdued" />
          </button>
          <Icon source={IconComp} tone="subdued" />
          <BlockStack gap="050">
            <Text as="span" variant="bodyMd" fontWeight="medium">
              {field.label}
              {field.required ? " *" : ""}
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              {FIELD_TYPE_LABEL[field.type]} · {field.width ?? "full"}
            </Text>
          </BlockStack>
        </InlineStack>
        <ButtonGroup variant="segmented">
          <Button
            icon={EditIcon}
            accessibilityLabel={`Edit ${field.label}`}
            onClick={onEdit}
            variant="tertiary"
          />
          <Button
            icon={DeleteIcon}
            accessibilityLabel={`Delete ${field.label}`}
            onClick={onDelete}
            variant="tertiary"
            tone="critical"
          />
        </ButtonGroup>
      </InlineStack>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  List                                      */
/* -------------------------------------------------------------------------- */

export function FieldList({
  fields,
  onReorder,
  onEdit,
  onDelete,
  onAdd,
}: {
  fields: FormField[];
  onReorder: (next: FormField[]) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(fields, oldIndex, newIndex));
  };

  return (
    <BlockStack gap="300">
      <Text as="h3" variant="headingSm">
        Form elements
      </Text>
      {fields.length === 0 ? (
        <Box
          padding="400"
          background="bg-surface-secondary"
          borderRadius="200"
        >
          <Text as="p" variant="bodySm" tone="subdued">
            No fields yet. Click &ldquo;Add element&rdquo; to start.
          </Text>
        </Box>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={fields.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            <BlockStack gap="200">
              {fields.map((field) => (
                <SortableFieldRow
                  key={field.id}
                  field={field}
                  onEdit={() => onEdit(field.id)}
                  onDelete={() => onDelete(field.id)}
                />
              ))}
            </BlockStack>
          </SortableContext>
        </DndContext>
      )}
      <Button icon={PlusIcon} onClick={onAdd} variant="primary">
        Add element
      </Button>
    </BlockStack>
  );
}
