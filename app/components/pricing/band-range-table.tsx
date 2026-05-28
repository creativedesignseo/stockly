/**
 * Discount Range table — the multi-band editor shared by
 * /app/pricing/new and /app/pricing/:id (ADR-012 Volume Pricing).
 *
 * Sami "Discount Range" pattern: one row per quantity band —
 *   Quantity from · Quantity to · Discount type · Value · remove.
 *
 * State is intentionally string-based (raw text-input values); callers
 * convert to/from the numeric `RawBandValue` only at submit + dirty-check
 * time via the exported helpers. `id` is a React key, never persisted.
 */
import {
  BlockStack,
  Box,
  Button,
  InlineGrid,
  InlineStack,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { XSmallIcon, PlusIcon } from "@shopify/polaris-icons";

import type { TierDiscountType } from "../../services/tiers.server";

/** One editor row. All values are strings (raw text-input state). */
export type Band = {
  id: string;
  minQty: string;
  quantityTo: string; // "" = open-ended ("and above")
  discountType: TierDiscountType;
  discountValue: string;
};

/** Numeric shape POSTed in the hidden `bands` input + echoed back on error. */
export type RawBandValue = {
  minQty: number;
  quantityTo: number | null;
  discountType: TierDiscountType;
  discountValue: number;
};

export function newBandId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `band-${Math.random().toString(36).slice(2)}`;
}

export function defaultBand(): Band {
  return {
    id: newBandId(),
    minQty: "1",
    quantityTo: "",
    discountType: "percentage",
    discountValue: "10",
  };
}

export function defaultBandRaw(): RawBandValue {
  return { minQty: 1, quantityTo: null, discountType: "percentage", discountValue: 10 };
}

export function rawBandToEditorBand(b: RawBandValue): Band {
  return {
    id: newBandId(),
    minQty: String(b.minQty ?? ""),
    quantityTo: b.quantityTo == null ? "" : String(b.quantityTo),
    discountType: b.discountType ?? "percentage",
    discountValue: String(b.discountValue ?? ""),
  };
}

export function editorBandToRawBand(b: Band): RawBandValue {
  return {
    minQty: Number(b.minQty),
    quantityTo: b.quantityTo.trim() === "" ? null : Number(b.quantityTo),
    discountType: b.discountType,
    discountValue: Number(b.discountValue),
  };
}

/**
 * Convert a persisted Tier band row (from the DB) into an editor Band.
 * Used by the edit form's loader-derived state.
 */
export function tierRowToEditorBand(row: {
  minQty: number;
  quantityTo: number | null;
  discountType: string;
  discountPct: number;
  discountAmount: number | null;
  discountFixedPrice?: number | null;
}): Band {
  const type = (row.discountType ?? "percentage") as TierDiscountType;
  const value =
    type === "fixed_amount"
      ? (row.discountAmount ?? 0)
      : type === "fixed_price"
        ? (row.discountFixedPrice ?? 0)
        : row.discountPct;
  return {
    id: newBandId(),
    minQty: String(row.minQty),
    quantityTo: row.quantityTo == null ? "" : String(row.quantityTo),
    discountType: type,
    discountValue: String(value),
  };
}

const DISCOUNT_TYPE_OPTIONS = [
  { label: "Percentage off", value: "percentage" },
  { label: "Amount off / unit", value: "fixed_amount" },
  { label: "Fixed price / unit", value: "fixed_price" },
];

const GRID_COLUMNS = { xs: 1, sm: "1fr 1fr 1.3fr 1fr auto" };

export function BandRangeTable({
  bands,
  onChange,
  currency,
}: {
  bands: Band[];
  onChange: (next: Band[]) => void;
  currency: string;
}) {
  const update = (id: string, patch: Partial<Band>) =>
    onChange(bands.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const remove = (id: string) => onChange(bands.filter((b) => b.id !== id));

  const addRange = () => {
    const last = bands[bands.length - 1];
    const nextFrom =
      last && last.quantityTo.trim() !== ""
        ? String(Number(last.quantityTo) + 1)
        : last
          ? String(Number(last.minQty) + 1)
          : "1";
    onChange([
      ...bands,
      {
        id: newBandId(),
        minQty: nextFrom,
        quantityTo: "",
        discountType: last?.discountType ?? "percentage",
        discountValue: "",
      },
    ]);
  };

  return (
    <BlockStack gap="300">
      <Box>
        <InlineGrid columns={GRID_COLUMNS} gap="200">
          <Text as="span" variant="bodySm" tone="subdued">Quantity from</Text>
          <Text as="span" variant="bodySm" tone="subdued">Quantity to</Text>
          <Text as="span" variant="bodySm" tone="subdued">Discount type</Text>
          <Text as="span" variant="bodySm" tone="subdued">Value</Text>
          <Box minWidth="32px"><span /></Box>
        </InlineGrid>
      </Box>

      {bands.map((band, idx) => {
        const isLast = idx === bands.length - 1;
        const valuePrefix = band.discountType === "percentage" ? undefined : currency;
        const valueSuffix = band.discountType === "percentage" ? "%" : undefined;
        return (
          <InlineGrid key={band.id} columns={GRID_COLUMNS} gap="200">
            <TextField
              label="Quantity from"
              labelHidden
              type="number"
              min={1}
              autoComplete="off"
              value={band.minQty}
              onChange={(v) => update(band.id, { minQty: v })}
            />
            <TextField
              label="Quantity to"
              labelHidden
              type="number"
              min={1}
              autoComplete="off"
              value={band.quantityTo}
              placeholder={isLast ? "and above" : ""}
              onChange={(v) => update(band.id, { quantityTo: v })}
            />
            <Select
              label="Discount type"
              labelHidden
              options={DISCOUNT_TYPE_OPTIONS}
              value={band.discountType}
              onChange={(v) => update(band.id, { discountType: v as TierDiscountType })}
            />
            <TextField
              label="Value"
              labelHidden
              type="number"
              min={0}
              step={0.01}
              autoComplete="off"
              value={band.discountValue}
              prefix={valuePrefix}
              suffix={valueSuffix}
              onChange={(v) => update(band.id, { discountValue: v })}
            />
            <Box minWidth="32px">
              <Button
                accessibilityLabel={`Remove range ${idx + 1}`}
                icon={XSmallIcon}
                variant="tertiary"
                disabled={bands.length === 1}
                onClick={() => remove(band.id)}
              />
            </Box>
          </InlineGrid>
        );
      })}

      <InlineStack>
        <Button icon={PlusIcon} onClick={addRange} variant="tertiary">
          Add range
        </Button>
      </InlineStack>
    </BlockStack>
  );
}
