/**
 * Seed-template integrity tests.
 *
 * Phase 1 high risk #1 in the plan: the back-compat seed must use the
 * legacy snake_case keys the storefront block already posts, or
 * in-flight applications get silently dropped. These tests are the
 * guard rail.
 */
import { describe, expect, it } from "vitest";

import {
  SEED_STANDARD,
  SEED_MODERN,
  SEED_SAMITA_B2B,
  TEMPLATES,
  TEMPLATE_META,
} from "./seed-templates";

describe("seed templates", () => {
  it("ships all three templates with at least one field", () => {
    for (const tmpl of [SEED_STANDARD, SEED_MODERN, SEED_SAMITA_B2B]) {
      expect(tmpl.definition.steps.length).toBe(1);
      expect(tmpl.definition.steps[0].fields.length).toBeGreaterThan(0);
    }
  });

  it("uses snake_case keys (back-compat with storefront)", () => {
    for (const tmpl of Object.values(TEMPLATES)) {
      for (const f of tmpl.definition.steps[0].fields) {
        expect(f.key, `${tmpl.id}.${f.label}`).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
  });

  it("SEED_STANDARD has email + password + confirm pair", () => {
    const keys = SEED_STANDARD.definition.steps[0].fields.map((f) => f.key);
    expect(keys).toContain("email");
    expect(keys).toContain("password");
    expect(keys).toContain("password_confirm");
    expect(keys).toContain("first_name");
    expect(keys).toContain("last_name");
  });

  it("SEED_MODERN extends Standard with phone", () => {
    const keys = SEED_MODERN.definition.steps[0].fields.map((f) => f.key);
    expect(keys).toContain("phone");
    expect(keys.length).toBe(
      SEED_STANDARD.definition.steps[0].fields.length + 1,
    );
  });

  it("SEED_SAMITA_B2B covers company + address fields", () => {
    const keys = SEED_SAMITA_B2B.definition.steps[0].fields.map((f) => f.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "company_name",
        "street_address",
        "apartment",
        "city",
        "postal_code",
        "country",
      ]),
    );
  });

  it("TEMPLATE_META has one entry per template", () => {
    const metaKeys = TEMPLATE_META.map((m) => m.key).sort();
    const tmplKeys = Object.keys(TEMPLATES).sort();
    expect(metaKeys).toEqual(tmplKeys);
  });

  it("every template's appearance has 7 named colors", () => {
    const required = [
      "main",
      "heading",
      "label",
      "description",
      "option",
      "paragraph",
      "paragraphBackground",
    ] as const;
    for (const tmpl of Object.values(TEMPLATES)) {
      for (const c of required) {
        expect(tmpl.appearance.colors[c]).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it("every template has all 9 error-message strings", () => {
    const required = [
      "required",
      "invalid",
      "invalidName",
      "invalidEmail",
      "invalidUrl",
      "invalidPhone",
      "invalidNumber",
      "invalidPassword",
      "passwordMismatch",
    ] as const;
    for (const tmpl of Object.values(TEMPLATES)) {
      for (const k of required) {
        expect(typeof tmpl.settings.errorMessages[k]).toBe("string");
        expect(tmpl.settings.errorMessages[k].length).toBeGreaterThan(0);
      }
    }
  });
});
