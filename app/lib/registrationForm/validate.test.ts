/**
 * Unit tests for the schema-driven response validator (ADR-013).
 * No DB — pure functions over JSON.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_FORM_DEFINITION } from "./seeds";
import type { RegistrationFormDefinition } from "./types";
import { validateResponses } from "./validate";

describe("validateResponses", () => {
  it("flags required fields when missing", () => {
    const errs = validateResponses(DEFAULT_FORM_DEFINITION, {});
    // email + company_name are required in the default
    expect(errs.some((e) => /Email: This field is required/.test(e))).toBe(true);
    expect(errs.some((e) => /Company name: This field is required/.test(e))).toBe(true);
  });

  it("does not require a field the form omits (the company-less bug)", () => {
    // A form whose definition has NO company field must never demand one —
    // this is the exact storefront bug: the server rejected with "Company
    // name is required" though the form didn't ask for it.
    const def: RegistrationFormDefinition = {
      steps: [
        {
          id: "s1",
          titleEn: "Apply for wholesale",
          fields: [
            { id: "f1", key: "email", type: "email", label: "Email", required: true, width: "full" },
            { id: "f2", key: "first_name", type: "text", label: "First name", required: true, width: "half" },
            { id: "f3", key: "last_name", type: "text", label: "Last name", required: true, width: "half" },
            { id: "f4", key: "password", type: "password", label: "Password", required: true, width: "full" },
          ],
        },
      ],
    };
    const errs = validateResponses(def, {
      email: "buyer@acme.com",
      first_name: "Ada",
      last_name: "Lovelace",
      password: "longenough",
    });
    expect(errs).toEqual([]);
  });

  it("rejects malformed emails with the email-specific message", () => {
    const errs = validateResponses(DEFAULT_FORM_DEFINITION, {
      email: "not-an-email",
      company_name: "Acme",
    });
    expect(errs.some((e) => /Email looks invalid/.test(e))).toBe(true);
  });

  it("rejects non-E.164 phones", () => {
    const errs = validateResponses(DEFAULT_FORM_DEFINITION, {
      email: "buyer@acme.com",
      company_name: "Acme",
      phone: "555-1234",
    });
    expect(errs.some((e) => /Phone:/.test(e))).toBe(true);
  });

  it("accepts a valid legacy snake_case submission", () => {
    const errs = validateResponses(DEFAULT_FORM_DEFINITION, {
      email: "buyer@acme.com",
      first_name: "Ada",
      last_name: "Lovelace",
      phone: "+34 555 44 33 22",
      company_name: "Acme",
      tax_id: "B12345678",
      website: "https://acme.com",
      country: "ES",
      notes: "Looking for 100+ units monthly",
    });
    expect(errs).toEqual([]);
  });

  it("ignores unknown keys in responses (tolerance rule)", () => {
    const errs = validateResponses(DEFAULT_FORM_DEFINITION, {
      email: "buyer@acme.com",
      company_name: "Acme",
      unknown_legacy_key: "noise",
    });
    expect(errs).toEqual([]);
  });

  it("rejects a select value that is not in the allowed options", () => {
    const def: RegistrationFormDefinition = {
      steps: [
        {
          id: "s1",
          titleEn: "S",
          fields: [
            {
              id: "f1",
              key: "tier",
              type: "select",
              label: "Tier",
              required: true,
              options: [
                { value: "gold", label: "Gold" },
                { value: "silver", label: "Silver" },
              ],
            },
          ],
        },
      ],
    };
    const errs = validateResponses(def, { tier: "platinum" });
    expect(errs.length).toBe(1);
    expect(errs[0]).toMatch(/Tier:/);
  });

  it("enforces an 8-char minimum on password fields", () => {
    const def: RegistrationFormDefinition = {
      steps: [
        {
          id: "s1",
          titleEn: "S",
          fields: [
            {
              id: "f1",
              key: "password",
              type: "password",
              label: "Password",
              required: true,
            },
          ],
        },
      ],
    };
    expect(validateResponses(def, { password: "short" }).length).toBe(1);
    expect(validateResponses(def, { password: "longenough" })).toEqual([]);
  });

  it("uses merchant-overridden error messages when provided", () => {
    const errs = validateResponses(
      DEFAULT_FORM_DEFINITION,
      { company_name: "Acme" }, // email missing
      { required: "Falta este campo." },
    );
    expect(errs.some((e) => /Falta este campo\./.test(e))).toBe(true);
  });
});
