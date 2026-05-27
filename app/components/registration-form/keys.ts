/**
 * Pure helpers for field keys. Extracted so the slug/validation
 * logic can be unit-tested without rendering the modal.
 */

/**
 * Convert a free-text label into a snake_case key.
 * "First name" -> "first_name". Caps at 50 chars to keep JSON
 * column keys reasonable.
 */
export function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

/** Whether a key is in the legal shape for a registration form field. */
export function isValidFieldKey(key: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(key);
}
