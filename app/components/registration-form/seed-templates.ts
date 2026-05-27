/**
 * Seed templates for the Registration Form Builder.
 *
 * Phase 1 ships THREE templates:
 *   - SEED_STANDARD  — first/last name + email + password + confirm
 *   - SEED_MODERN    — STANDARD + phone
 *   - SEED_SAMITA_B2B — company + full address block (Sami-style)
 *
 * All field `key`s use snake_case to stay compatible with the legacy
 * storefront block (`first_name`, `last_name`, etc.). See plan §6.2
 * and §12 high-risk note 1 for the back-compat rationale.
 *
 * TODO(integration): the Foundation implementer's
 * `app/services/registrationForms.server.ts` will export an
 * authoritative `TEMPLATES` constant. After their PR merges, this
 * file can be deleted and consumers re-pointed there. Until then
 * the admin builder uses these objects as mock data.
 */

import type {
  FormAppearance,
  FormSettings,
  RegistrationForm,
  RegistrationFormDefinition,
} from "../../lib/registration-form-types";

/* -------------------------------------------------------------------------- */
/*                              Default chrome                                */
/* -------------------------------------------------------------------------- */

const DEFAULT_APPEARANCE: FormAppearance = {
  layout: "default",
  width: 600,
  colors: {
    main: "#202223",
    heading: "#202223",
    label: "#202223",
    description: "#6d7175",
    option: "#202223",
    paragraph: "#202223",
    paragraphBackground: "#ffffff",
  },
  background: {
    type: "color",
    color: "#ffffff",
  },
  customCss: "",
};

const DEFAULT_ERROR_MESSAGES: FormSettings["errorMessages"] = {
  required: "This field is required.",
  invalid: "Invalid value.",
  invalidName: "Please enter a valid name.",
  invalidEmail: "Please enter a valid email address.",
  invalidUrl: "Please enter a valid URL.",
  invalidPhone: "Please enter a valid phone number.",
  invalidNumber: "Please enter a valid number.",
  invalidPassword: "Password must be at least 8 characters.",
  passwordMismatch: "Passwords do not match.",
};

function makeSettings(title: string): FormSettings {
  return {
    title,
    status: "active",
    afterSubmitRedirectUrl: undefined,
    errorMessages: { ...DEFAULT_ERROR_MESSAGES },
  };
}

/* -------------------------------------------------------------------------- */
/*                              Definitions                                   */
/* -------------------------------------------------------------------------- */

const STANDARD_DEFINITION: RegistrationFormDefinition = {
  steps: [
    {
      id: "step-1",
      titleKey: "registration.step.account",
      fields: [
        {
          type: "text",
          key: "first_name",
          label: "First name",
          required: true,
          width: "half",
          placeholder: "John",
        },
        {
          type: "text",
          key: "last_name",
          label: "Last name",
          required: true,
          width: "half",
          placeholder: "Doe",
        },
        {
          type: "email",
          key: "email",
          label: "Email",
          required: true,
          width: "full",
          placeholder: "you@company.com",
        },
        {
          type: "password",
          key: "password",
          label: "Password",
          required: true,
          width: "half",
          helpText: "At least 8 characters.",
        },
        {
          type: "password",
          key: "password_confirm",
          label: "Confirm password",
          required: true,
          width: "half",
          confirmPaired: true,
        },
      ],
    },
  ],
};

const MODERN_DEFINITION: RegistrationFormDefinition = {
  steps: [
    {
      id: "step-1",
      titleKey: "registration.step.account",
      fields: [
        ...STANDARD_DEFINITION.steps[0].fields,
        {
          type: "phone",
          key: "phone",
          label: "Phone",
          required: false,
          width: "full",
          placeholder: "+1 555 123 4567",
        },
      ],
    },
  ],
};

const SAMITA_B2B_DEFINITION: RegistrationFormDefinition = {
  steps: [
    {
      id: "step-1",
      titleKey: "registration.step.business",
      fields: [
        {
          type: "text",
          key: "company_name",
          label: "Company name",
          required: true,
          width: "full",
          placeholder: "Acme Inc.",
        },
        {
          type: "text",
          key: "street_address",
          label: "Street address",
          required: true,
          width: "full",
          placeholder: "123 Main St",
        },
        {
          type: "text",
          key: "apartment",
          label: "Apartment, suite, etc. (optional)",
          required: false,
          width: "full",
        },
        {
          type: "text",
          key: "city",
          label: "City",
          required: true,
          width: "half",
        },
        {
          type: "text",
          key: "postal_code",
          label: "Postal / Zip code",
          required: true,
          width: "half",
        },
        {
          type: "country",
          key: "country",
          label: "Country",
          required: true,
          width: "full",
        },
      ],
    },
  ],
};

/* -------------------------------------------------------------------------- */
/*                              Full templates                                */
/* -------------------------------------------------------------------------- */

/** Stable mock shopId used by the mocked loader/action. */
export const MOCK_SHOP_ID = "mock-shop";

export const SEED_STANDARD: RegistrationForm = {
  id: "seed-standard",
  shopId: MOCK_SHOP_ID,
  status: "active",
  definition: STANDARD_DEFINITION,
  appearance: { ...DEFAULT_APPEARANCE },
  settings: makeSettings("Wholesale registration"),
};

export const SEED_MODERN: RegistrationForm = {
  id: "seed-modern",
  shopId: MOCK_SHOP_ID,
  status: "active",
  definition: MODERN_DEFINITION,
  appearance: { ...DEFAULT_APPEARANCE },
  settings: makeSettings("Wholesale registration"),
};

export const SEED_SAMITA_B2B: RegistrationForm = {
  id: "seed-samita-b2b",
  shopId: MOCK_SHOP_ID,
  status: "active",
  definition: SAMITA_B2B_DEFINITION,
  appearance: { ...DEFAULT_APPEARANCE },
  settings: makeSettings("Wholesale account application"),
};

export type TemplateKey = "standard" | "modern" | "samitaB2B";

export const TEMPLATES: Record<TemplateKey, RegistrationForm> = {
  standard: SEED_STANDARD,
  modern: SEED_MODERN,
  samitaB2B: SEED_SAMITA_B2B,
};

export const TEMPLATE_META: Array<{
  key: TemplateKey;
  title: string;
  description: string;
}> = [
  {
    key: "standard",
    title: "Standard",
    description:
      "First name, last name, email, password, and confirm password. The minimum to create an account.",
  },
  {
    key: "modern",
    title: "Modern",
    description:
      "Standard fields plus a phone number — most B2B shops want a contact number.",
  },
  {
    key: "samitaB2B",
    title: "Samita B2B",
    description:
      "Business-focused: company name, full address, city, postal code, and country.",
  },
];
