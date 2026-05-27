/**
 * Shared TypeScript types for the Registration Form Builder.
 *
 * These mirror the schema documented in
 * `progress/2026-05-27-registration-form-plan.md` (section 3).
 *
 * The Foundation implementer (running in parallel) is producing
 * `app/services/registrationForms.server.ts`. After their PR lands
 * this file should re-export from there OR be deleted in favour of
 * the canonical types — whichever wiring the integration commit
 * chooses. For now this file is the single source of truth for the
 * admin builder UI.
 */

/* -------------------------------------------------------------------------- */
/*                                  Fields                                    */
/* -------------------------------------------------------------------------- */

export type FieldType =
  | "text"
  | "email"
  | "password"
  | "phone"
  | "select"
  | "country"
  | "textarea";

export type FieldWidth = "full" | "half";

export type FieldBase = {
  key: string;
  label: string;
  required: boolean;
  width: FieldWidth;
  placeholder?: string;
  helpText?: string;
};

export type TextField = FieldBase & { type: "text" };
export type EmailField = FieldBase & { type: "email" };
export type PasswordField = FieldBase & {
  type: "password";
  /** Marks this password field as a confirm-pair partner. */
  confirmPaired?: boolean;
};
export type PhoneField = FieldBase & { type: "phone" };
export type SelectField = FieldBase & {
  type: "select";
  options: Array<{ value: string; label: string }>;
};
export type CountryField = FieldBase & { type: "country" };
export type TextareaField = FieldBase & {
  type: "textarea";
  rows?: number;
};

export type FormField =
  | TextField
  | EmailField
  | PasswordField
  | PhoneField
  | SelectField
  | CountryField
  | TextareaField;

/* -------------------------------------------------------------------------- */
/*                              Definition                                    */
/* -------------------------------------------------------------------------- */

export type FormStep = {
  id: string;
  /**
   * i18n key for the step title. Phase 1 is English-only so consumers
   * may treat this as the literal title.
   */
  titleKey: string;
  fields: FormField[];
};

/**
 * The shape stored in `RegistrationForm.definition` JSON.
 * Phase 1 invariant: `steps.length === 1` (decision 8 in the plan).
 */
export type RegistrationFormDefinition = {
  steps: FormStep[];
};

/* -------------------------------------------------------------------------- */
/*                              Appearance                                    */
/* -------------------------------------------------------------------------- */

export type AppearanceLayout = "default" | "boxed";

export type AppearanceColors = {
  main: string;
  heading: string;
  label: string;
  description: string;
  option: string;
  paragraph: string;
  paragraphBackground: string;
};

export type AppearanceBackground = {
  /** Phase 1 only supports "color". Image/gradient deferred. */
  type: "color";
  color: string;
};

export type FormAppearance = {
  layout: AppearanceLayout;
  /** Form width in pixels (320–1200 in the admin range slider). */
  width: number;
  colors: AppearanceColors;
  background: AppearanceBackground;
  /** Raw CSS injected via a scoped `<style>` tag on the storefront. */
  customCss: string;
};

/* -------------------------------------------------------------------------- */
/*                              Settings                                      */
/* -------------------------------------------------------------------------- */

export type FormStatus = "active" | "draft";

export type FormErrorMessages = {
  required: string;
  invalid: string;
  invalidName: string;
  invalidEmail: string;
  invalidUrl: string;
  invalidPhone: string;
  invalidNumber: string;
  invalidPassword: string;
  passwordMismatch: string;
};

export type FormSettings = {
  title: string;
  status: FormStatus;
  /** Optional URL to redirect to after a successful submission. */
  afterSubmitRedirectUrl?: string;
  errorMessages: FormErrorMessages;
};

/* -------------------------------------------------------------------------- */
/*                              Full form                                     */
/* -------------------------------------------------------------------------- */

/**
 * The full editor state. Mirrors the future `RegistrationForm` Prisma
 * row (definition / appearance / settings as JSON columns).
 */
export type RegistrationForm = {
  id: string;
  shopId: string;
  status: FormStatus;
  definition: RegistrationFormDefinition;
  appearance: FormAppearance;
  settings: FormSettings;
};
