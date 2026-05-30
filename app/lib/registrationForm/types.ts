/**
 * Registration Form Builder — shared types (ADR-013, Phase 1A/1B).
 *
 * These types describe the JSON shape stored in
 * `RegistrationForm.definition / .appearance / .settings`. They are
 * imported by:
 *   - the service layer (`app/services/registrationForms.server.ts`)
 *   - the App Proxy GET endpoint (`proxy.registration-form.tsx`)
 *   - the storefront renderer (`extensions/quick-order-form/...`)
 *   - the admin builder UI (`app/routes/app.registration-form.tsx`)
 *   - the validator (`app/lib/registrationForm/validate.ts`)
 *
 * Keep field shape backward compatible. Adding a new optional
 * property is fine; renaming a key requires a JSON migration step.
 *
 * Multi-language is OUT OF SCOPE in Phase 1 (decision #7). All label /
 * placeholder / help text strings are plain `string` for now. When
 * multi-language ships in Phase 2, those become `LocalizedString =
 * Record<string, string>` and the renderer picks `[lang] ?? en`.
 */

/**
 * Field types supported in Phase 1 (decision #9).
 * `date`, `radio_group`, `address_block` are deferred to Phase 2.
 */
export type FieldType =
  | "text"
  | "email"
  | "password"
  | "phone"
  | "select"
  | "country"
  | "textarea";

/** Width in the grid: half = side-by-side (2-col), full = one row. */
export type FieldWidth = "half" | "full";

/** Option for `select` fields (also reused by future `radio_group`). */
export interface FormFieldOption {
  /** Submission value (what lands in `responses[fieldKey]`). */
  value: string;
  /** Display label shown to the customer. English-only in Phase 1. */
  label: string;
}

/**
 * A single field in the form. `key` is the response key (the merchant
 * can edit it in the "Advanced" disclosure of the field editor) and
 * MUST be unique within a step. For back-compat with the legacy
 * storefront block, the default seed uses snake_case keys verbatim
 * (`first_name`, `company_name`, `tax_id`, ...).
 */
export interface FormField {
  /** Stable id used by dnd-kit for reorder + React keys. */
  id: string;
  /** Response key — appears in `responses[<key>]` on submit. */
  key: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  width?: FieldWidth;
  /** Only used when `type === 'select'`. */
  options?: FormFieldOption[];
}

/**
 * A single step in the form. Phase 1 always has exactly one step
 * (decision #8). The schema accommodates many so multi-step can ship
 * later without a data migration.
 */
export interface FormStep {
  id: string;
  titleEn: string;
  fields: FormField[];
}

export interface RegistrationFormDefinition {
  steps: FormStep[];
}

export type AppearanceLayout = "default" | "boxed";

export interface AppearanceColors {
  main: string;
  heading: string;
  label: string;
  description: string;
  option: string;
  paragraph: string;
  paragraphBg: string;
}

export interface AppearanceBackground {
  /** Phase 1 only supports a solid color. */
  type: "color";
  color: string;
}

export interface FormAppearance {
  layout: AppearanceLayout;
  /** Pixel width clamp for the rendered form. */
  width: number;
  colors: AppearanceColors;
  background: AppearanceBackground;
  /** Raw CSS injected into a scoped `<style>` tag on the storefront. */
  customCss: string;
}

/**
 * The 9 error message strings the validator can surface. Keys map to
 * `validateResponses` return codes. The merchant can override each in
 * the Settings panel; the seed defaults are English.
 */
export interface FormErrorMessages {
  required: string;
  invalid: string;
  invalidEmail: string;
  invalidPhone: string;
  tooLong: string;
  tooShort: string;
  mismatch: string;
  networkError: string;
  genericError: string;
}

export interface FormSettings {
  /** Heading shown above the form on the storefront. */
  titleEn: string;
  /** Optional redirect after successful submission. */
  redirectUrl?: string;
  errorMessages: FormErrorMessages;
}

/**
 * What the App Proxy GET endpoint returns. The storefront renderer
 * destructures this exact shape.
 *
 * Contract (load-bearing — storefront block depends on this):
 *   { ok: true,
 *     definition: { steps: [...] },
 *     appearance: { layout, width, colors, background, customCss },
 *     settings: { titleEn, redirectUrl?, errorMessages },
 *     version: <integer> }
 */
export interface RegistrationFormPayload {
  ok: true;
  definition: RegistrationFormDefinition;
  appearance: FormAppearance;
  settings: FormSettings;
  version: number;
}

/** Identifier for the 3 hardcoded templates exported by the service. */
export type SeedTemplateId = "standard" | "modern" | "samitaB2B";

/**
 * The mutable editor state — exactly what the builder UI manipulates and
 * POSTs back to the per-form save action (`app.registration-form.$id`).
 * Server-side metadata (id, version, shopId, createdAt, shortCode,
 * isDefault) lives on the Prisma row and is NEVER part of this shape.
 *
 * Shared so the editor can render in two chromes from one component:
 *   - `chrome="page"` — the standalone deep-link route (back-compat).
 *   - `chrome="modal"` — inside the App Bridge `variant="max"` modal that
 *     the list opens (Sami-style full-canvas editor).
 */
export interface EditorState {
  name: string;
  status: "active" | "draft";
  definition: RegistrationFormDefinition;
  appearance: FormAppearance;
  settings: FormSettings;
}
