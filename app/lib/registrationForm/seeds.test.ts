/**
 * Guardrail tests for the hardcoded Registration Form seeds.
 *
 * The back-compat default's field keys are LOAD-BEARING: the legacy
 * storefront block still POSTs `first_name`, `company_name`, `tax_id`,
 * etc. Renaming any of these silently breaks every in-flight submission
 * during the soak. These tests fail loudly on accidental drift.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_APPEARANCE,
  DEFAULT_FORM_DEFINITION,
  DEFAULT_SETTINGS,
  TEMPLATES,
  TEMPLATE_META,
} from "./seeds";
import type { SeedTemplateId } from "./types";

/** The 9 legacy snake_case keys the storefront block has been POSTing. */
const LEGACY_KEYS = [
  "email",
  "first_name",
  "last_name",
  "phone",
  "company_name",
  "tax_id",
  "website",
  "country",
  "notes",
] as const;

describe("DEFAULT_FORM_DEFINITION (back-compat seed)", () => {
  it("has exactly one step (Phase 1 = single step)", () => {
    expect(DEFAULT_FORM_DEFINITION.steps).toHaveLength(1);
  });

  it("contains every legacy snake_case field key", () => {
    const keys = DEFAULT_FORM_DEFINITION.steps[0].fields.map((f) => f.key);
    for (const expected of LEGACY_KEYS) {
      expect(keys, `missing legacy key: ${expected}`).toContain(expected);
    }
  });

  it("marks email and company_name required (legacy contract)", () => {
    const byKey = Object.fromEntries(
      DEFAULT_FORM_DEFINITION.steps[0].fields.map((f) => [f.key, f]),
    );
    expect(byKey.email?.required).toBe(true);
    expect(byKey.company_name?.required).toBe(true);
  });

  it("uses email/phone/textarea types for the right keys", () => {
    const byKey = Object.fromEntries(
      DEFAULT_FORM_DEFINITION.steps[0].fields.map((f) => [f.key, f]),
    );
    expect(byKey.email?.type).toBe("email");
    expect(byKey.phone?.type).toBe("phone");
    expect(byKey.country?.type).toBe("country");
    expect(byKey.notes?.type).toBe("textarea");
  });
});

describe("merchant-facing TEMPLATES", () => {
  const ids: SeedTemplateId[] = ["standard", "modern", "samitaB2B"];

  it("exposes exactly 3 templates", () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual(ids.slice().sort());
  });

  it.each(ids)("template %s has at least one field", (id) => {
    const def = TEMPLATES[id];
    expect(def.steps).toHaveLength(1);
    expect(def.steps[0].fields.length).toBeGreaterThan(0);
  });

  it("Modern adds a phone field that Standard does not have", () => {
    const stdKeys = TEMPLATES.standard.steps[0].fields.map((f) => f.key);
    const modKeys = TEMPLATES.modern.steps[0].fields.map((f) => f.key);
    expect(stdKeys).not.toContain("phone");
    expect(modKeys).toContain("phone");
  });

  it("Samita-B2B requires company_name and tax_id", () => {
    const byKey = Object.fromEntries(
      TEMPLATES.samitaB2B.steps[0].fields.map((f) => [f.key, f]),
    );
    expect(byKey.company_name?.required).toBe(true);
    expect(byKey.tax_id?.required).toBe(true);
  });

  it("TEMPLATE_META covers every template id", () => {
    const metaIds = TEMPLATE_META.map((t) => t.id).sort();
    expect(metaIds).toEqual(ids.slice().sort());
  });

  it("snapshot — full template shape (catches accidental drift)", () => {
    expect(TEMPLATES).toMatchSnapshot();
  });
});

describe("DEFAULT_APPEARANCE / DEFAULT_SETTINGS", () => {
  it("appearance has all 7 named colors", () => {
    expect(Object.keys(DEFAULT_APPEARANCE.colors).sort()).toEqual(
      [
        "description",
        "heading",
        "label",
        "main",
        "option",
        "paragraph",
        "paragraphBg",
      ].sort(),
    );
  });

  it("settings exposes all 9 error-message keys", () => {
    expect(Object.keys(DEFAULT_SETTINGS.errorMessages).sort()).toEqual(
      [
        "genericError",
        "invalid",
        "invalidEmail",
        "invalidPhone",
        "mismatch",
        "networkError",
        "required",
        "tooLong",
        "tooShort",
      ].sort(),
    );
  });
});
