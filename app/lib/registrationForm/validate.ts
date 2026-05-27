/**
 * Server-authoritative validator for Registration Form submissions
 * (ADR-013, Phase 1A/1C).
 *
 * Walks a form definition + a responses payload and returns a list of
 * human-readable error messages, drawing on the merchant-overridable
 * `errorMessages` from FormSettings. The empty array means valid.
 *
 * Used by:
 *   - `proxy.apply.tsx` (authoritative server check)
 *   - the admin builder preview (mirror, instant feedback)
 *   - the storefront block JS (mirror, pre-POST feedback)
 *
 * Tolerance rule (decision called out in plan section 12):
 *   - Unknown keys in `responses` (e.g. a merchant just removed a field
 *     but the storefront still has it cached) are STORED, never an
 *     error. Only `required` + type-specific format checks fire.
 */
import type {
  FormErrorMessages,
  FormField,
  RegistrationFormDefinition,
} from "./types";

/** Default English error strings used if FormSettings is missing them. */
export const DEFAULT_ERROR_MESSAGES: FormErrorMessages = {
  required: "This field is required.",
  invalid: "This value is invalid.",
  invalidEmail: "Email looks invalid.",
  invalidPhone:
    "Phone must include country code in international format. Example: +34 555 44 33 22 or +1 305 555 1234.",
  tooLong: "Value is too long.",
  tooShort: "Value is too short.",
  mismatch: "Values do not match.",
  networkError: "Network error. Please try again.",
  genericError: "Something went wrong. Please try again later.",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** E.164 after stripping spaces/dashes/parens: starts with + then 8–15 digits. */
const E164_RE = /^\+[1-9]\d{7,14}$/;

/** Strip whitespace + cosmetic separators from a phone before validating. */
function cleanPhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, "");
}

function getString(responses: Record<string, unknown>, key: string): string {
  const v = responses[key];
  if (typeof v === "string") return v.trim();
  if (v == null) return "";
  return String(v).trim();
}

function validateField(
  field: FormField,
  responses: Record<string, unknown>,
  msgs: FormErrorMessages,
): string[] {
  const errs: string[] = [];
  const value = getString(responses, field.key);

  if (!value) {
    if (field.required) errs.push(`${field.label}: ${msgs.required}`);
    // Empty + optional → nothing else to check.
    return errs;
  }

  switch (field.type) {
    case "email":
      if (!EMAIL_RE.test(value)) errs.push(`${field.label}: ${msgs.invalidEmail}`);
      break;
    case "phone":
      if (!E164_RE.test(cleanPhone(value)))
        errs.push(`${field.label}: ${msgs.invalidPhone}`);
      break;
    case "select":
      if (field.options && field.options.length > 0) {
        const allowed = new Set(field.options.map((o) => o.value));
        if (!allowed.has(value)) errs.push(`${field.label}: ${msgs.invalid}`);
      }
      break;
    case "country":
      // Country list lives in the renderer; the server accepts any
      // non-empty string so storefront upgrades don't drop submissions.
      // Phase 2 may tighten this to an ISO-3166 allowlist.
      break;
    case "textarea":
      if (value.length > 2000) errs.push(`${field.label}: ${msgs.tooLong}`);
      break;
    case "password":
      if (value.length < 8) errs.push(`${field.label}: ${msgs.tooShort}`);
      break;
    case "text":
    default:
      if (value.length > 500) errs.push(`${field.label}: ${msgs.tooLong}`);
      break;
  }

  return errs;
}

/**
 * Validate a submission payload against a form definition.
 *
 * @param definition - Active form definition (steps + fields).
 * @param responses  - Raw key/value submission (form-encoded or JSON).
 * @param messages   - Merchant-overridable error strings; falls back to
 *                     `DEFAULT_ERROR_MESSAGES` per key when missing.
 * @returns          - Array of "Label: message" strings, empty if valid.
 */
export function validateResponses(
  definition: RegistrationFormDefinition,
  responses: Record<string, unknown>,
  messages?: Partial<FormErrorMessages>,
): string[] {
  const msgs: FormErrorMessages = { ...DEFAULT_ERROR_MESSAGES, ...(messages ?? {}) };
  const errors: string[] = [];
  for (const step of definition.steps) {
    for (const field of step.fields) {
      errors.push(...validateField(field, responses, msgs));
    }
  }
  return errors;
}
