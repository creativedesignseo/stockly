/**
 * Tests for the row-pairing layout used by the live preview and
 * (mirrored) by the storefront renderer.
 */
import { describe, expect, it } from "vitest";

import { layoutFieldsIntoRows } from "./layout";
import type { FormField } from "../../lib/registration-form-types";

function f(key: string, width: "full" | "half"): FormField {
  return {
    type: "text",
    key,
    label: key,
    required: false,
    width,
  };
}

describe("layoutFieldsIntoRows", () => {
  it("returns empty array for no fields", () => {
    expect(layoutFieldsIntoRows([])).toEqual([]);
  });

  it("puts a single full field on its own row", () => {
    const rows = layoutFieldsIntoRows([f("a", "full")]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(1);
  });

  it("pairs two adjacent half fields into one row", () => {
    const rows = layoutFieldsIntoRows([f("a", "half"), f("b", "half")]);
    expect(rows).toHaveLength(1);
    expect(rows[0].map((x) => x.key)).toEqual(["a", "b"]);
  });

  it("does not pair a half with a following full", () => {
    const rows = layoutFieldsIntoRows([
      f("a", "half"),
      f("b", "full"),
      f("c", "half"),
    ]);
    expect(rows.map((r) => r.map((x) => x.key))).toEqual([
      ["a"],
      ["b"],
      ["c"],
    ]);
  });

  it("pairs first two halves then leaves the third alone", () => {
    const rows = layoutFieldsIntoRows([
      f("a", "half"),
      f("b", "half"),
      f("c", "half"),
    ]);
    expect(rows.map((r) => r.map((x) => x.key))).toEqual([
      ["a", "b"],
      ["c"],
    ]);
  });

  it("handles all-full mix", () => {
    const rows = layoutFieldsIntoRows([
      f("a", "full"),
      f("b", "full"),
      f("c", "full"),
    ]);
    expect(rows).toHaveLength(3);
  });
});
