/**
 * Pure layout helpers shared between the admin preview and tests.
 * Extracted from FormPreview so we can unit-test the row-pairing
 * logic without rendering React.
 */
import type { FormField } from "../../lib/registrationForm/types";

/**
 * Lay out fields into rows where two adjacent "half" fields share
 * a single row and "full" fields stay on their own.
 *
 *   [full]              -> [[full]]
 *   [half, half]        -> [[half, half]]
 *   [half, full, half]  -> [[half], [full], [half]]
 *   [half, half, half]  -> [[half, half], [half]]
 */
export function layoutFieldsIntoRows(fields: FormField[]): FormField[][] {
  const rows: FormField[][] = [];
  let i = 0;
  while (i < fields.length) {
    const f = fields[i];
    if (f.width === "half" && fields[i + 1]?.width === "half") {
      rows.push([f, fields[i + 1]]);
      i += 2;
    } else {
      rows.push([f]);
      i += 1;
    }
  }
  return rows;
}
