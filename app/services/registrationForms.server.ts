/**
 * Registration Form service (ADR-013, Phase 1B).
 *
 * CRUD for the per-shop singleton `RegistrationForm` row + seed
 * helpers. Routes (admin + storefront proxy) MUST go through this
 * file rather than touching `prisma.registrationForm` directly so the
 * back-compat default seeding stays consistent.
 *
 * Exports:
 *   - `getRegistrationForm(shopId)` — read.
 *   - `ensureDefaultRegistrationForm(shopId)` — idempotent create.
 *   - `upsertRegistrationForm(shopId, patch)` — admin save path.
 *   - `TEMPLATES` / `TEMPLATE_META` — re-exported from `lib/seeds.ts`.
 *   - `DEFAULT_FORM_DEFINITION` / `DEFAULT_APPEARANCE` / `DEFAULT_SETTINGS`.
 */
import type { Prisma, RegistrationForm } from "@prisma/client";
import prisma from "../db.server";
import {
  DEFAULT_APPEARANCE,
  DEFAULT_FORM_DEFINITION,
  DEFAULT_SETTINGS,
  TEMPLATES,
  TEMPLATE_META,
} from "../lib/registrationForm/seeds";
import type {
  FormAppearance,
  FormSettings,
  RegistrationFormDefinition,
} from "../lib/registrationForm/types";

export {
  DEFAULT_APPEARANCE,
  DEFAULT_FORM_DEFINITION,
  DEFAULT_SETTINGS,
  TEMPLATES,
  TEMPLATE_META,
};

/**
 * Read the singleton form for a shop. Returns null if not yet seeded
 * (callers that need the form to always exist should use
 * `ensureDefaultRegistrationForm` instead).
 */
export async function getRegistrationForm(
  shopId: string,
): Promise<RegistrationForm | null> {
  return prisma.registrationForm.findUnique({ where: { shopId } });
}

/**
 * Idempotent: creates the back-compat default form if none exists for
 * the shop, returns the (existing or fresh) row. Safe to call from
 * `getOrCreateShop` and from the App Proxy GET endpoint as a defensive
 * fallback for shops installed before Phase 1A landed.
 *
 * Uses Prisma `upsert` so concurrent first-render races don't throw
 * P2002 on the unique `shopId` constraint.
 */
export async function ensureDefaultRegistrationForm(
  shopId: string,
): Promise<RegistrationForm> {
  return prisma.registrationForm.upsert({
    where: { shopId },
    create: {
      shopId,
      status: "active",
      definition: DEFAULT_FORM_DEFINITION as unknown as Prisma.InputJsonValue,
      appearance: DEFAULT_APPEARANCE as unknown as Prisma.InputJsonValue,
      settings: DEFAULT_SETTINGS as unknown as Prisma.InputJsonValue,
      version: 1,
    },
    // Nothing to update — we only want the existing row when present.
    update: {},
  });
}

/**
 * Patch shape accepted by the admin save action. All four slices are
 * optional so the route can save just one panel at a time if it wants;
 * Phase 1's admin UI saves the whole state at once via ContextualSaveBar.
 */
export interface UpsertRegistrationFormInput {
  status?: "active" | "draft";
  definition?: RegistrationFormDefinition;
  appearance?: FormAppearance;
  settings?: FormSettings;
}

/**
 * Upsert the form for a shop. Bumps `version` on every call (the
 * storefront uses it as a cache-busting hint). Creates the row with
 * the back-compat default fallback if it doesn't exist yet.
 */
export async function upsertRegistrationForm(
  shopId: string,
  patch: UpsertRegistrationFormInput,
): Promise<RegistrationForm> {
  const existing = await prisma.registrationForm.findUnique({
    where: { shopId },
  });

  const definition = (patch.definition ?? existing?.definition ?? DEFAULT_FORM_DEFINITION) as
    unknown as Prisma.InputJsonValue;
  const appearance = (patch.appearance ?? existing?.appearance ?? DEFAULT_APPEARANCE) as
    unknown as Prisma.InputJsonValue;
  const settings = (patch.settings ?? existing?.settings ?? DEFAULT_SETTINGS) as
    unknown as Prisma.InputJsonValue;
  const status = patch.status ?? existing?.status ?? "active";

  if (existing) {
    return prisma.registrationForm.update({
      where: { shopId },
      data: {
        status,
        definition,
        appearance,
        settings,
        version: { increment: 1 },
      },
    });
  }

  return prisma.registrationForm.create({
    data: {
      shopId,
      status,
      definition,
      appearance,
      settings,
      version: 1,
    },
  });
}

/**
 * Type-narrowed reader for a stored definition. Prisma types
 * `definition` as `JsonValue`; this helper casts to our shared shape.
 * If the JSON is malformed (e.g. hand-edited in psql) the caller can
 * fall back to `DEFAULT_FORM_DEFINITION`.
 */
export function parseDefinition(row: RegistrationForm): RegistrationFormDefinition {
  return row.definition as unknown as RegistrationFormDefinition;
}

export function parseAppearance(row: RegistrationForm): FormAppearance {
  return row.appearance as unknown as FormAppearance;
}

export function parseSettings(row: RegistrationForm): FormSettings {
  return row.settings as unknown as FormSettings;
}
