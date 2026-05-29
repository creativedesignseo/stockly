/**
 * Admin route: Registration Forms — list of every form for the shop.
 *
 * URL: /app/registration-form
 *
 * Phase 3 (N-forms) — clones the Sami-style list → editor pattern that
 * /app/pricing already uses (app.pricing._index.tsx). The list is the
 * primary content; clicking a row opens the per-form editor at
 * /app/registration-form/:id (app.registration-form.$id.tsx).
 *
 * Columns: Id (short) / Name / Short Code (copyable chip) / Status
 * (active|draft toggle via per-row useFetcher) / Created.
 * Tabs: All / Active / Draft.
 *
 * Primary action "Add new registration form" opens the
 * TemplatePickerModal; picking a template POSTs intent=create and the
 * action creates a non-default draft, then this route navigates to the
 * new form's editor.
 *
 * The shop always has a seeded default form (Phase 1), so the empty
 * state is defensive only.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import { authenticateAdmin } from "../lib/auth.server";
import {
  createRegistrationFormFromTemplate,
  deleteRegistrationForm,
  listRegistrationForms,
  setStatus,
} from "../services/registrationForms.server";
import type { SeedTemplateId } from "../lib/registrationForm/types";
import {
  RegistrationFormList,
  type RegistrationFormListItem,
} from "../components/registration-form/RegistrationFormList";

/* -------------------------------------------------------------------------- */
/*                                  LOADER                                    */
/* -------------------------------------------------------------------------- */

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await authenticateAdmin(request);
  const forms = await listRegistrationForms(shop.id);
  const items: RegistrationFormListItem[] = forms.map((f) => ({
    id: f.id,
    name: f.name,
    shortCode: f.shortCode,
    status: f.status as "active" | "draft",
    isDefault: f.isDefault,
    createdAt: f.createdAt.toISOString(),
  }));
  return json({ forms: items });
};

/* -------------------------------------------------------------------------- */
/*                                  ACTION                                    */
/* -------------------------------------------------------------------------- */

/**
 * Three intents from the list:
 *   - create: from the TemplatePickerModal. Returns the new form's id so
 *     the client navigates into the editor.
 *   - toggle: flip a row's active/draft status (per-row useFetcher).
 *   - delete: remove a non-default form. The service refuses to delete
 *     the default; we surface that as an error the list shows in a Banner.
 */
type ActionResult =
  | { ok: true; intent: "create"; id: string }
  | { ok: true; intent: "toggle" | "delete" }
  | { ok: false; error: string };

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticateAdmin(request);
  const form = await request.formData();
  const intent = (form.get("intent") ?? "").toString();

  if (intent === "create") {
    const templateId = (form.get("templateId") ?? "").toString() as SeedTemplateId;
    if (!["standard", "modern", "samitaB2B"].includes(templateId)) {
      return json<ActionResult>(
        { ok: false, error: "Invalid template" },
        { status: 400 },
      );
    }
    const name = (form.get("name") ?? "").toString().trim() || undefined;
    const created = await createRegistrationFormFromTemplate(
      shop.id,
      templateId,
      name,
    );
    return json<ActionResult>({ ok: true, intent: "create", id: created.id });
  }

  if (intent === "toggle") {
    const id = (form.get("id") ?? "").toString();
    const next = form.get("nextStatus") === "active" ? "active" : "draft";
    try {
      await setStatus(id, shop.id, next);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[registration-form._index] toggle failed:", err);
      return json<ActionResult>(
        { ok: false, error: "Could not update status" },
        { status: 400 },
      );
    }
    return json<ActionResult>({ ok: true, intent: "toggle" });
  }

  if (intent === "delete") {
    const id = (form.get("id") ?? "").toString();
    try {
      await deleteRegistrationForm(id, shop.id);
    } catch (err) {
      // The service throws when asked to delete the default form. Surface
      // it as a user-facing error rather than a 500.
      const message =
        err instanceof Error &&
        err.message.includes("default registration form")
          ? "The default form can't be deleted. Make another form the default first."
          : "Could not delete this form";
      // eslint-disable-next-line no-console
      console.error("[registration-form._index] delete failed:", err);
      return json<ActionResult>({ ok: false, error: message }, { status: 400 });
    }
    return json<ActionResult>({ ok: true, intent: "delete" });
  }

  return json<ActionResult>(
    { ok: false, error: `Unknown intent: ${intent}` },
    { status: 400 },
  );
};

/* -------------------------------------------------------------------------- */
/*                                    UI                                      */
/* -------------------------------------------------------------------------- */

export default RegistrationFormList;
