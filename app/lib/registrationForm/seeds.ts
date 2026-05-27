/**
 * Hardcoded seed forms for the Registration Form Builder (ADR-013).
 *
 * Three merchant-facing TEMPLATES (Standard / Modern / Samita-B2B) plus
 * a fourth BACK-COMPAT DEFAULT that mirrors Stockly's legacy 8-field
 * wholesale form 1:1. The back-compat default uses the SAME snake_case
 * field keys the legacy storefront block POSTs (`first_name`,
 * `company_name`, `tax_id`, ...) so any storefront that has not yet
 * been recompiled keeps submitting successfully during the soak.
 *
 * Mutating these snake_case keys is a breaking change for in-flight
 * submissions — see `seeds.test.ts` for the guardrail asserting all 9
 * legacy keys are present in the back-compat default.
 */
import type {
  FormAppearance,
  FormSettings,
  RegistrationFormDefinition,
  SeedTemplateId,
} from "./types";
import { DEFAULT_ERROR_MESSAGES } from "./validate";

/** Default appearance — neutral, Polaris-ish, safe across themes. */
export const DEFAULT_APPEARANCE: FormAppearance = {
  layout: "default",
  width: 600,
  colors: {
    main: "#0F172A",
    heading: "#0F172A",
    label: "#1F2937",
    description: "#4B5563",
    option: "#1F2937",
    paragraph: "#1F2937",
    paragraphBg: "#FFFFFF",
  },
  background: { type: "color", color: "#FFFFFF" },
  customCss: "",
};

/** Default settings — minimal, English-only error copy. */
export const DEFAULT_SETTINGS: FormSettings = {
  titleEn: "Apply for a wholesale account",
  errorMessages: { ...DEFAULT_ERROR_MESSAGES },
};

// ---------------------------------------------------------------------------
// Back-compat default (snake_case keys mirror legacy storefront POST)
// ---------------------------------------------------------------------------

/**
 * The seed default applied to every freshly-installed shop AND every
 * existing shop on first request to the App Proxy GET endpoint. Field
 * keys MUST stay snake_case to match `proxy.apply.tsx`'s legacy body
 * parsing — see `seeds.test.ts` for the guardrail.
 */
export const DEFAULT_FORM_DEFINITION: RegistrationFormDefinition = {
  steps: [
    {
      id: "step-default",
      titleEn: "Wholesale application",
      fields: [
        {
          id: "f-email",
          key: "email",
          type: "email",
          label: "Email",
          required: true,
          width: "half",
          placeholder: "you@company.com",
        },
        {
          id: "f-phone",
          key: "phone",
          type: "phone",
          label: "Phone",
          width: "half",
          placeholder: "+34 555 44 33 22",
          helpText: "Include country code.",
        },
        {
          id: "f-first-name",
          key: "first_name",
          type: "text",
          label: "First name",
          width: "half",
        },
        {
          id: "f-last-name",
          key: "last_name",
          type: "text",
          label: "Last name",
          width: "half",
        },
        {
          id: "f-company-name",
          key: "company_name",
          type: "text",
          label: "Company name",
          required: true,
          width: "full",
        },
        {
          id: "f-tax-id",
          key: "tax_id",
          type: "text",
          label: "Tax ID (VAT / EIN / CIF)",
          width: "half",
        },
        {
          id: "f-website",
          key: "website",
          type: "text",
          label: "Website",
          width: "half",
          placeholder: "https://",
        },
        {
          id: "f-country",
          key: "country",
          type: "country",
          label: "Country",
          width: "half",
        },
        {
          id: "f-notes",
          key: "notes",
          type: "textarea",
          label: "Tell us about your business",
          width: "full",
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Merchant-facing templates (3 picks from the admin template chooser)
// ---------------------------------------------------------------------------

/** Standard — simplest B2C-style account: name + email + password. */
const STANDARD_TEMPLATE: RegistrationFormDefinition = {
  steps: [
    {
      id: "step-standard",
      titleEn: "Create your account",
      fields: [
        {
          id: "f-first-name",
          key: "first_name",
          type: "text",
          label: "First name",
          required: true,
          width: "half",
        },
        {
          id: "f-last-name",
          key: "last_name",
          type: "text",
          label: "Last name",
          required: true,
          width: "half",
        },
        {
          id: "f-email",
          key: "email",
          type: "email",
          label: "Email",
          required: true,
          width: "full",
        },
        {
          id: "f-password",
          key: "password",
          type: "password",
          label: "Password",
          required: true,
          width: "full",
          helpText: "At least 8 characters.",
        },
      ],
    },
  ],
};

/** Modern — Standard + Phone. */
const MODERN_TEMPLATE: RegistrationFormDefinition = {
  steps: [
    {
      id: "step-modern",
      titleEn: "Create your account",
      fields: [
        {
          id: "f-first-name",
          key: "first_name",
          type: "text",
          label: "First name",
          required: true,
          width: "half",
        },
        {
          id: "f-last-name",
          key: "last_name",
          type: "text",
          label: "Last name",
          required: true,
          width: "half",
        },
        {
          id: "f-email",
          key: "email",
          type: "email",
          label: "Email",
          required: true,
          width: "half",
        },
        {
          id: "f-phone",
          key: "phone",
          type: "phone",
          label: "Phone",
          required: true,
          width: "half",
          placeholder: "+34 555 44 33 22",
        },
        {
          id: "f-password",
          key: "password",
          type: "password",
          label: "Password",
          required: true,
          width: "full",
          helpText: "At least 8 characters.",
        },
      ],
    },
  ],
};

/** Samita-B2B — Stockly's bread-and-butter wholesale form. */
const SAMITA_B2B_TEMPLATE: RegistrationFormDefinition = {
  steps: [
    {
      id: "step-samita",
      titleEn: "Apply for wholesale access",
      fields: [
        {
          id: "f-company-name",
          key: "company_name",
          type: "text",
          label: "Company name",
          required: true,
          width: "full",
        },
        {
          id: "f-tax-id",
          key: "tax_id",
          type: "text",
          label: "Tax ID (VAT / EIN / CIF)",
          required: true,
          width: "half",
        },
        {
          id: "f-website",
          key: "website",
          type: "text",
          label: "Website",
          width: "half",
          placeholder: "https://",
        },
        {
          id: "f-first-name",
          key: "first_name",
          type: "text",
          label: "First name",
          required: true,
          width: "half",
        },
        {
          id: "f-last-name",
          key: "last_name",
          type: "text",
          label: "Last name",
          required: true,
          width: "half",
        },
        {
          id: "f-email",
          key: "email",
          type: "email",
          label: "Email",
          required: true,
          width: "half",
        },
        {
          id: "f-phone",
          key: "phone",
          type: "phone",
          label: "Phone",
          required: true,
          width: "half",
          placeholder: "+34 555 44 33 22",
        },
        {
          id: "f-country",
          key: "country",
          type: "country",
          label: "Country",
          required: true,
          width: "half",
        },
        {
          id: "f-notes",
          key: "notes",
          type: "textarea",
          label: "Tell us about your business",
          width: "full",
          helpText: "Volume estimate, target categories, etc.",
        },
      ],
    },
  ],
};

/**
 * Templates exposed to the admin builder's "Select template" modal.
 * Keyed by `SeedTemplateId`. The admin clones one of these into
 * `RegistrationForm.definition` when the merchant picks a starting point.
 */
export const TEMPLATES: Record<SeedTemplateId, RegistrationFormDefinition> = {
  standard: STANDARD_TEMPLATE,
  modern: MODERN_TEMPLATE,
  samitaB2B: SAMITA_B2B_TEMPLATE,
};

/** Convenience metadata for the template picker UI (admin). */
export const TEMPLATE_META: Array<{
  id: SeedTemplateId;
  name: string;
  description: string;
}> = [
  {
    id: "standard",
    name: "Standard",
    description: "Name, email, password — the bare minimum.",
  },
  {
    id: "modern",
    name: "Modern",
    description: "Standard plus phone with country code.",
  },
  {
    id: "samitaB2B",
    name: "Samita Wholesale",
    description: "Full B2B form: company, tax ID, contact, notes.",
  },
];
