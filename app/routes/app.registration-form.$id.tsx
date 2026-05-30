/**
 * Admin route: Registration Form Builder (per-form editor).
 *
 * URL: /app/registration-form/:id
 *
 * Phase 3 (N-forms): the editor now loads and saves ONE form of the
 * shop's collection, addressed by `params.id`. The list lives at
 * /app/registration-form (app.registration-form._index.tsx); clicking a
 * row navigates here.
 *
 * 3-pane UI (unchanged from the singleton editor):
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Top toolbar — title, status, save bar                        │
 *   ├──────┬────────────────────────┬──────────────────────────────┤
 *   │ Left │  Middle panel          │  Right canvas — live preview │
 *   │ rail │  (Elements/Appearance/ │                              │
 *   │      │   Settings)            │                              │
 *   └──────┴────────────────────────┴──────────────────────────────┘
 *
 * State management: a single `useState<EditorState>` holds the whole
 * editor state. Children receive the relevant slice + an update
 * callback. Save is via App Bridge SaveBar with dirty-tracking against
 * the last saved snapshot.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useParams } from "@remix-run/react";

import { authenticateAdmin } from "../lib/auth.server";
import type {
  EditorState,
  FormAppearance,
  FormSettings,
  RegistrationFormDefinition,
} from "../lib/registrationForm/types";
import {
  getRegistrationFormById,
  updateRegistrationForm,
} from "../services/registrationForms.server";

import { RegistrationFormEditor } from "../components/registration-form/RegistrationFormEditor";

/* -------------------------------------------------------------------------- */
/*                                  LOADER                                    */
/* -------------------------------------------------------------------------- */

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { shop } = await authenticateAdmin(request);
  const id = params.id;
  if (!id) throw new Response("Form id is required", { status: 400 });

  // Shop-scoped read: getRegistrationFormById returns null if the id
  // doesn't exist OR belongs to another shop (tenant isolation).
  const row = await getRegistrationFormById(id, shop.id);
  if (!row) throw new Response("Registration form not found", { status: 404 });

  // Prisma JSON columns are typed as `Prisma.JsonValue` — narrow via a
  // single `as unknown as <type>` cast at the boundary. Runtime shape is
  // guaranteed identical because the same types are what
  // updateRegistrationForm accepted on write.
  const form: EditorState = {
    name: row.name,
    status: row.status as "active" | "draft",
    definition: row.definition as unknown as RegistrationFormDefinition,
    appearance: row.appearance as unknown as FormAppearance,
    settings: row.settings as unknown as FormSettings,
  };

  return json({ form, shortCode: row.shortCode, isDefault: row.isDefault });
};

/* -------------------------------------------------------------------------- */
/*                                  ACTION                                    */
/* -------------------------------------------------------------------------- */

type SaveResult =
  | { ok: true; savedAt: string }
  | { ok: false; error: string };

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const { shop } = await authenticateAdmin(request);
  const id = params.id;
  if (!id) {
    return json<SaveResult>({ ok: false, error: "Missing form id" }, { status: 400 });
  }

  const fd = await request.formData();
  const payloadRaw = fd.get("payload");
  if (typeof payloadRaw !== "string") {
    return json<SaveResult>({ ok: false, error: "Missing payload" }, { status: 400 });
  }

  let parsed: EditorState;
  try {
    parsed = JSON.parse(payloadRaw) as EditorState;
  } catch {
    return json<SaveResult>({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  // EditorState matches updateRegistrationForm's input verbatim. The
  // service auto-bumps `version` so the storefront's GET (Cache-Control:
  // no-cache, per ADR-013) refetches on next load.
  try {
    await updateRegistrationForm(id, shop.id, {
      name: parsed.name,
      status: parsed.status,
      definition: parsed.definition,
      appearance: parsed.appearance,
      settings: parsed.settings,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[app.registration-form.$id] update failed:", err);
    return json<SaveResult>(
      { ok: false, error: "Save failed — check server logs" },
      { status: 500 },
    );
  }

  return json<SaveResult>({ ok: true, savedAt: new Date().toISOString() });
};

/* -------------------------------------------------------------------------- */
/*                                    UI                                      */
/* -------------------------------------------------------------------------- */

/**
 * Standalone deep-link editor. The list (app.registration-form._index)
 * normally opens the editor inside an App Bridge max modal; this route
 * keeps the editor reachable by direct URL (e.g. a bookmarked form, or a
 * link from elsewhere in the admin). Both render the same component.
 */
export default function RegistrationFormBuilderRoute() {
  const { form } = useLoaderData<typeof loader>();
  const params = useParams();
  return (
    <RegistrationFormEditor
      chrome="page"
      formId={params.id as string}
      initialForm={form}
    />
  );
}
