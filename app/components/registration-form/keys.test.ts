/**
 * Tests for slugifyKey / isValidFieldKey — pure string helpers used
 * by the FieldEditModal.
 */
import { describe, expect, it } from "vitest";

import { slugifyKey, isValidFieldKey } from "./keys";

describe("slugifyKey", () => {
  it("converts spaces to underscores", () => {
    expect(slugifyKey("First name")).toBe("first_name");
  });

  it("strips punctuation", () => {
    expect(slugifyKey("Company / Brand!")).toBe("company_brand");
  });

  it("collapses runs of separators", () => {
    expect(slugifyKey("A  --  B")).toBe("a_b");
  });

  it("strips leading and trailing underscores", () => {
    expect(slugifyKey("  __ hi __  ")).toBe("hi");
  });

  it("caps at 50 chars", () => {
    const long = "x".repeat(80);
    expect(slugifyKey(long).length).toBe(50);
  });

  it("returns empty for all-punctuation input", () => {
    expect(slugifyKey("!!!")).toBe("");
  });
});

describe("isValidFieldKey", () => {
  it("accepts snake_case", () => {
    expect(isValidFieldKey("first_name")).toBe(true);
    expect(isValidFieldKey("password_confirm")).toBe(true);
    expect(isValidFieldKey("a")).toBe(true);
    expect(isValidFieldKey("addr_line_2")).toBe(true);
  });

  it("rejects leading digit", () => {
    expect(isValidFieldKey("1st_name")).toBe(false);
  });

  it("rejects empty / whitespace / uppercase", () => {
    expect(isValidFieldKey("")).toBe(false);
    expect(isValidFieldKey("FirstName")).toBe(false);
    expect(isValidFieldKey("first name")).toBe(false);
  });

  it("rejects dashes and dots", () => {
    expect(isValidFieldKey("first-name")).toBe(false);
    expect(isValidFieldKey("first.name")).toBe(false);
  });
});
