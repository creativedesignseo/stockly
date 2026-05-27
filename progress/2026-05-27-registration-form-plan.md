# Phase 1 — Sami-style Registration Form Builder (plan)

> Author: stockly-orchestrator
> Date: 2026-05-27
> Status: PLAN — not yet implemented
> Source spec: `docs/competitive/sami-registration-form.md`
> Pre-approved decisions: 14 (see prompt; encoded throughout this plan)

---

## 1. Goal

Replace Stockly's hard-coded wholesale registration form with a
**schema-driven, JSON-defined, single-form-per-shop** builder that
renders identically on the storefront (theme app extension) and in
the admin (Polaris preview canvas). Phase 1 ships the **renderer +
admin builder + storage migration**; email notifications, multi-step,
multi-language editor, after-submit rich editor, and the "lock the
registration page" feature are deferred to Phase 2/3/4.

**Phase 1 scope reminder (out of 14 Sami panels, we ship 3):**
Form elements panel · Appearance panel · Settings panel. Defer
After submit / Email Notifications / Integrations / Account page.

---

## 2. Architecture summary (decisions 1–14 encoded)

| # | Decision | Where it lands in this plan |
|---|---|---|
| 1 | One form per shop (singleton) | New table has `shopId @unique`; route is `/app/registration-form` (no `:id`, no list) |
| 2 | JSON definition (`definition` / `appearance` / `settings` / `status`) | `RegistrationForm` Prisma model |
| 3 | Generic `Application` table replaces `WholesaleApplication`; flat columns folded into `responses Json` | New `Application` model + back-fill migration |
| 4 | Seed default form per shop at upgrade/creation | `getOrCreateShop` extended to also `ensureDefaultRegistrationForm`; one-time back-fill script for existing shops |
| 5 | `dnd-kit` for reorder | `npm i @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` |
| 6 | NO email infra | Approve/reject keep current side-effects; HANDOFF TODO entry only |
| 7 | NO multi-language editor | `definition` stores `{ en: "..." }`; admin only edits `en` |
| 8 | NO multi-step | `definition.steps[]` always length 1 in Phase 1 |
| 9 | Field types: `text`, `email`, `password`, `phone`, `select`, `country`, `textarea` | Renderer + validator handle these 7 |
| 10 | Admin route `/app/registration-form` | New file `app/routes/app.registration-form.tsx` |
| 11 | Builder panels: Form elements / Appearance / Settings | Left rail = 3 icons |
| 12 | 3 seed templates in code (Standard / Modern / Samita-B2B) | `app/services/registrationForms.server.ts` exports `TEMPLATES` |
| 13 | Theme block fetches definition via App Proxy `GET /apps/stockly/registration-form` | New loader on `proxy.registration-form.tsx`; existing storefront block rewritten |
| 14 | Existing storefront form must keep working | Seed runs in `getOrCreateShop` → block always finds a definition; coexist endpoint strategy below |

---

## 3. Files involved

### 3.1 Read-only context (already verified to exist)

- `/Users/aimac/Documents/Workspace/Clients/stockly/HANDOFF.md`
- `/Users/aimac/Documents/Workspace/Clients/stockly/docs/competitive/sami-registration-form.md`
- `/Users/aimac/Documents/Workspace/Clients/stockly/docs/decisions/ADR-008-competitive-intelligence-bss.md`
- `/Users/aimac/Documents/Workspace/Clients/stockly/docs/decisions/ADR-010-b2b-pricing-engine-on-basic-plan.md`
- `/Users/aimac/Documents/Workspace/Clients/stockly/scripts/verify.sh`

### 3.2 Will modify

Prisma:
- `/Users/aimac/Documents/Workspace/Clients/stockly/prisma/schema.prisma`

Services:
- `/Users/aimac/Documents/Workspace/Clients/stockly/app/services/shops.server.ts` (extend `getOrCreateShop` to seed form)
- `/Users/aimac/Documents/Workspace/Clients/stockly/app/services/wholesale-applications.server.ts` (rename → `applications.server.ts`; rewrite to operate on `Application` + `responses Json`)

Routes (admin):
- `/Users/aimac/Documents/Workspace/Clients/stockly/app/routes/app.customers.applications.tsx` (queue: switch to `Application` model, render rows from `responses Json` using current form definition for labels)
- `/Users/aimac/Documents/Workspace/Clients/stockly/app/routes/app._index.tsx` (replace `prisma.wholesaleApplication.count` with `prisma.application.count`)

Routes (proxy / public):
- `/Users/aimac/Documents/Workspace/Clients/stockly/app/routes/proxy.apply.tsx` (validate dynamically against form definition; store as `responses Json`)

Routes (GDPR webhooks):
- `/Users/aimac/Documents/Workspace/Clients/stockly/app/routes/webhooks.customers.redact.tsx`
- `/Users/aimac/Documents/Workspace/Clients/stockly/app/routes/webhooks.customers.data_request.tsx`
- `/Users/aimac/Documents/Workspace/Clients/stockly/app/routes/webhooks.shop.redact.tsx`

Theme app extension (storefront block):
- `/Users/aimac/Documents/Workspace/Clients/stockly/extensions/quick-order-form/blocks/registration-form.liquid` (strip hardcoded fields; keep minimal shell that web component populates)
- `/Users/aimac/Documents/Workspace/Clients/stockly/extensions/quick-order-form/assets/registration-form.src.js` (fetch definition, render dynamically)
- `/Users/aimac/Documents/Workspace/Clients/stockly/extensions/quick-order-form/assets/registration-form.css` (extend with appearance variables consumed via CSS custom properties)

Docs:
- `/Users/aimac/Documents/Workspace/Clients/stockly/HANDOFF.md` (post-merge: "what works today" delta + Phase 3 email TODO)
- New: `/Users/aimac/Documents/Workspace/Clients/stockly/docs/decisions/ADR-012-registration-form-builder.md` (records decisions 1–14)

### 3.3 New files

Prisma:
- (no new file — extend `prisma/schema.prisma`)
- New migration auto-generated by `prisma db push` against dev, hand-written SQL for prod back-fill

Services / shared types:
- `/Users/aimac/Documents/Workspace/Clients/stockly/app/services/registrationForms.server.ts` (CRUD: get, upsert, ensureDefault; exports `TEMPLATES`)
- `/Users/aimac/Documents/Workspace/Clients/stockly/app/lib/registrationForm/types.ts` (shared TS types: `FormDefinition`, `FormField`, `FieldType`, `Appearance`, `FormSettings`)
- `/Users/aimac/Documents/Workspace/Clients/stockly/app/lib/registrationForm/validate.ts` (validate response payload against definition; used by both proxy.apply and admin preview)
- `/Users/aimac/Documents/Workspace/Clients/stockly/app/lib/registrationForm/seeds.ts` (the 3 hardcoded template JSONs + the back-compat default)

Admin routes:
- `/Users/aimac/Documents/Workspace/Clients/stockly/app/routes/app.registration-form.tsx` (3-pane builder page)

Admin components (under `app/components/registrationForm/`):
- `LeftRail.tsx` (3 icons)
- `FormElementsPanel.tsx` (dnd-kit sortable list + Add element + per-field edit modal)
- `FieldEditModal.tsx` (label / type / required / placeholder / help text / width)
- `AppearancePanel.tsx` (7 color pickers + layout segmented + width + background + custom CSS)
- `SettingsPanel.tsx` (title + status toggle + redirect URL + 9 error message strings)
- `PreviewCanvas.tsx` (renders the same field components; Polaris-themed)
- `TopToolbar.tsx` (title input, status badge, desktop preview placeholder, SaveBar wire-up)

Storefront renderer (extension JS):
- (no new file — rewrite the existing `registration-form.src.js`)

Proxy:
- `/Users/aimac/Documents/Workspace/Clients/stockly/app/routes/proxy.registration-form.tsx` (NEW — `GET` returns the active definition JSON; HMAC-verified via `authenticate.public.appProxy`)

Tests:
- `/Users/aimac/Documents/Workspace/Clients/stockly/app/lib/registrationForm/validate.test.ts`
- `/Users/aimac/Documents/Workspace/Clients/stockly/app/lib/registrationForm/seeds.test.ts`
- `/Users/aimac/Documents/Workspace/Clients/stockly/app/services/registrationForms.server.test.ts`

ADR:
- `/Users/aimac/Documents/Workspace/Clients/stockly/docs/decisions/ADR-012-registration-form-builder.md`

---

## 4. Schema migration

### 4.1 New `RegistrationForm` model

```prisma
model RegistrationForm {
  id          String   @id @default(cuid())
  shopId     String   @unique
  shop       Shop     @relation(fields: [shopId], references: [id], onDelete: Cascade)

  /// Status of the form. 'active' is served by the storefront block;
  /// 'draft' falls back to the seeded default for back-compat.
  status     String   @default("active")  // 'active' | 'draft'

  /// JSON shape: { steps: [{ id, titleEn, fields: FormField[] }] }
  /// Phase 1: steps always length 1.
  definition Json

  /// JSON shape: { layout: 'default' | 'boxed', width: number,
  ///   colors: { main, heading, label, ...7 colors },
  ///   background: { type: 'color', color: string },
  ///   customCss: string }
  appearance Json

  /// JSON shape: { titleEn: string, redirectUrl?: string,
  ///   errorMessages: { required, invalid, invalidEmail, ... 9 keys } }
  settings   Json

  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

Add reverse relation on `Shop`: `registrationForm RegistrationForm?`.

### 4.2 New `Application` model (replaces `WholesaleApplication`)

```prisma
model Application {
  id                String   @id @default(cuid())
  shopId            String
  shop              Shop     @relation(fields: [shopId], references: [id], onDelete: Cascade)

  status            String   @default("pending")  // pending | approved | rejected

  /// The full form submission as JSON, keyed by field `key`.
  /// Shape: { email: "...", firstName: "...", companyName: "...", <custom>: ... }
  responses         Json

  /// Denormalized for fast filtering / GDPR webhook lookups.
  /// Always derived from responses.email (lowercased, trimmed).
  email             String

  /// If submitter was logged in.
  shopifyCustomerId String?

  reviewNote        String?
  reviewedAt        DateTime?

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([shopId, status, createdAt])
  @@index([shopId, email])
}
```

`WholesaleApplication` is **dropped** after back-fill (decision 3 says
"replace"). The old `Shop.applications WholesaleApplication[]` relation
becomes `Shop.applications Application[]`.

### 4.3 Migration steps (Fly Postgres uses `prisma db push`, not versioned migrations)

Because the project uses `prisma db push` (HANDOFF L183) we cannot ship
a single atomic Prisma migration. We do it in **three deploys**:

**Deploy A — additive only (zero downtime):**
1. Add `RegistrationForm` model.
2. Add `Application` model alongside `WholesaleApplication` (both exist).
3. `npx prisma db push --skip-generate` against prod.
4. Run one-off back-fill script via `fly ssh console -C 'node scripts/migrate-applications.mjs'`:
   - For every `WholesaleApplication` row: insert into `Application` with `responses = { email, firstName, lastName, phone, companyName, taxId, website, country, notes }`, preserving id (or generating new + leaving cross-reference column TBD — simpler: new id, drop old).
   - For every `Shop`: call `ensureDefaultRegistrationForm` (the back-compat default = the current 8 fields).
5. Verify counts match (`SELECT count(*) FROM "WholesaleApplication"` == `SELECT count(*) FROM "Application"`).

**Deploy B — switch readers/writers:**
6. All app code now reads/writes `Application` and `RegistrationForm`. `WholesaleApplication` is still in the schema but no code touches it.
7. Storefront block now fetches definition from new proxy endpoint; old hardcoded form removed.
8. Soak in prod for **at least 48h** before Deploy C.

**Deploy C — drop legacy (separate session, separate ADR-012 note):**
9. Remove `WholesaleApplication` from `prisma/schema.prisma`.
10. `npx prisma db push` → drops the table.

### 4.4 Back-fill script — `scripts/migrate-applications.mjs`

New file. One-time, idempotent, safe to re-run. Does:
- For each `Shop` without a `RegistrationForm`: insert the default (8 legacy fields).
- For each `WholesaleApplication` without a corresponding `Application` (matched by `shopId + email + createdAt` tuple): create one.
- Logs counts at end.

**Do not delete `WholesaleApplication` rows here.** Deploy C handles
table drop; rows stay as a backup for the soak window.

---

## 5. Service layer

### 5.1 `app/services/registrationForms.server.ts` (NEW)

Exports:
- `getRegistrationForm(shopId): Promise<RegistrationForm>` — single-row lookup.
- `ensureDefaultRegistrationForm(shopId): Promise<RegistrationForm>` — idempotent; creates the back-compat default if missing.
- `upsertRegistrationForm(shopId, { definition, appearance, settings, status }): Promise<RegistrationForm>` — used by admin Save.
- `TEMPLATES: { standard, modern, samitaB2B }` — JSON objects, hardcoded.
- `DEFAULT_FORM` — the back-compat seed (matches current 8 hardcoded fields verbatim).

`getOrCreateShop` (in `shops.server.ts`) gets one extra line at the end:
`await ensureDefaultRegistrationForm(shop.id);` so any newly-installed
shop ships with a working form on first storefront render.

### 5.2 Rename `wholesale-applications.server.ts` → `applications.server.ts`

Functions keep similar names but operate on the new shape:
- `submitApplication({ shopId, responses, shopifyCustomerId? })` — derives `email` from `responses.email`, validates against the shop's current `RegistrationForm.definition` via `lib/registrationForm/validate.ts`, dedupe-by-email (same coalesce rule).
- `listApplications(shopId, opts)` — unchanged signature.
- `getApplication`, `markApplicationApproved`, `markApplicationRejected` — unchanged.
- `validateApplication` is REMOVED from this file (moves to `lib/registrationForm/validate.ts`, which is schema-aware).
- `normalizePhone` — kept (still used by approve flow for Shopify customerCreate).

### 5.3 `lib/registrationForm/validate.ts` (NEW, shared)

`validateResponses(definition, responses): string[]`
- Walks `definition.steps[0].fields[]`
- For each `required` field: checks presence in `responses`.
- For each field type: applies type-specific validator (email regex, E.164 phone, etc.) using the localized error messages from `settings.errorMessages` (fall back to English defaults).
- Returns the list of errors in submission order.

Used by:
- `proxy.apply.tsx` (server, authoritative)
- The admin live preview (mirror, instant feedback)
- The storefront JS (mirror, instant feedback before POST)

---

## 6. App Proxy changes

### 6.1 New `GET /apps/stockly/registration-form` → `app/routes/proxy.registration-form.tsx`

- HMAC-verified via `authenticate.public.appProxy`.
- Loader resolves the shop from `session.shop`, calls
  `getRegistrationForm(shop.id)`, returns:
  ```json
  { ok: true, definition: {...}, appearance: {...}, settings: { titleEn, errorMessages, ... } }
  ```
- 404 → fall back to seeded default (should be impossible post-migration,
  but defensive).
- `Cache-Control: public, max-age=60` so storefront doesn't hammer us.
- No PII in the response (definition + appearance only — no responses,
  no submitter data).

### 6.2 Modified `POST /apps/stockly/apply`

- Load active `RegistrationForm` for the shop.
- Parse FormData / JSON body as before.
- Call `validateResponses(form.definition, body)` instead of the
  hardcoded `validateApplication`.
- Call `submitApplication({ shopId, responses: body, shopifyCustomerId })`.
- Response shape unchanged: `{ ok: true, id }` or `{ ok: false, errors: [] }`.

**Back-compat:** the seed default uses field keys that match the
current storefront FormData names (`email`, `first_name`, `last_name`,
`phone`, `company_name`, `tax_id`, `website`, `country`, `notes`). Any
old storefront still POSTing the legacy form will validate and submit
successfully because the seeded `definition` mirrors the legacy form
1:1. **This is decision 14's safety net.**

---

## 7. Theme app extension changes

### 7.1 `extensions/quick-order-form/blocks/registration-form.liquid`

- Strip the hardcoded `<div class="stockly-reg__grid">` and all `<label>` blocks.
- Keep: `<stockly-registration>` wrapper, `data-action-url`, `data-already-wholesale`, `data-fetch-url="/apps/stockly/registration-form"`, success/errors slots, schema settings for fallback heading/intro/success copy.
- Liquid no longer carries field definitions — block becomes a thin shell.
- Add a loading skeleton in initial HTML to avoid a flash of empty form
  while the fetch resolves.

### 7.2 `extensions/quick-order-form/assets/registration-form.src.js`

Rewrite `connectedCallback`:
1. `fetch(this.dataset.fetchUrl)` to get definition + appearance + settings.
2. Apply `appearance.colors.*` as CSS custom properties on the host
   (`--stockly-reg-color-main`, etc.).
3. Apply `appearance.customCss` by inserting a `<style>` scoped inside the host.
4. Render fields by iterating `definition.steps[0].fields`:
   - Build `<label class="stockly-reg__field stockly-reg__field--{width}">` per field.
   - Switch on `field.type` → emit `<input type="text|email|password|tel">`, `<textarea>`, or `<select>`.
   - For `country`: emit `<select>` populated from a hardcoded ISO list (no API call).
   - For `select`: use `field.options`.
5. Submit handler unchanged; only difference is body now has dynamic keys.
6. Error rendering unchanged.

**Failure mode:** if fetch fails, render a minimal hard-coded fallback
form with just email + companyName + name + phone so customers can
still apply. Log to console.

### 7.3 `extensions/quick-order-form/assets/registration-form.css`

Convert hardcoded colors and widths to CSS custom properties driven by
appearance JSON. Add `.stockly-reg--boxed` class for the boxed layout.

### 7.4 Recompile the JS bundle

`npm run build:extensions` regenerates `registration-form.js` from `.src.js`.

---

## 8. Admin UI — `/app/registration-form`

### 8.1 Page layout (3 panes + top toolbar)

```
┌──────────────────────────────────────────────────────────────────┐
│ TopToolbar: [Title input] [Active/Draft] [Desktop ▾] [SaveBar]   │
├──────┬──────────────────────────┬────────────────────────────────┤
│ Left │  Middle panel            │  Right canvas                  │
│ rail │  (depends on selected    │  (live preview)                │
│ 3 icn│   left-rail icon)        │                                │
└──────┴──────────────────────────┴────────────────────────────────┘
```

State management: single `useState<FormState>` holding `{ definition,
appearance, settings, status, title }`. All children receive the
relevant slice + an update callback. Save action posts the whole state
to the route's `action` which calls `upsertRegistrationForm`.

### 8.2 Left rail (`LeftRail.tsx`)

3 icons (Polaris `Icon`): `FileIcon` (Form elements) / `ColorIcon`
(Appearance) / `SettingsIcon` (Settings). Selected = highlighted bg.

### 8.3 Form elements panel (`FormElementsPanel.tsx`)

- Header section (collapsed card) — Phase 1 just shows form title.
- "Form elements" label + dnd-kit `SortableContext` wrapping the field
  list. Each item:
  - Drag handle (left)
  - Type icon (text/email/etc.)
  - Label preview ("Email *")
  - Edit pencil → opens `FieldEditModal`
  - Delete trash icon
- `+ Add element` button → opens a type-picker popover, then opens
  `FieldEditModal` pre-populated with defaults.

### 8.4 Field edit modal (`FieldEditModal.tsx`)

Polaris `Modal` with `TextField` for label, `Select` for type (7
options), `Checkbox` for required, `TextField` for placeholder + help
text, `Select` for width (`full` / `half`). For `select` type: a
repeater for options (value + label). For `country`: no extra config.
`key` is auto-generated from label (slugified) but editable in an
"Advanced" disclosure to avoid clobbering response keys.

### 8.5 Appearance panel (`AppearancePanel.tsx`)

- Layout: `RadioButton` group `default | boxed`
- Width: `RangeSlider` 320–1200 (default 600)
- 7 `<input type="color">` (or Polaris ColorPicker) — main / heading /
  label / description / option / paragraph / paragraphBg
- Background: `Select` (only `Color` in Phase 1) + color picker
- Custom CSS: `<textarea>` (no syntax highlighting in Phase 1; CodeMirror
  in Phase 2)

### 8.6 Settings panel (`SettingsPanel.tsx`)

- General section: form title (`TextField`, max 50), status `RadioButton`
  group `active | draft`, after-submit redirect URL (`TextField`,
  optional, validated as URL).
- Error messages section: 9 `TextField` rows for the 9 strings (one
  per `errorMessages` key). All English-only in Phase 1.

### 8.7 Preview canvas (`PreviewCanvas.tsx`)

Renders the same field components as the storefront WOULD render —
implemented in React with Polaris controls for the admin context but
keyed off the same definition JSON. Live-updates as state changes.
No mobile preview toggle in Phase 1 (decision 11 says Desktop only).

### 8.8 Top toolbar (`TopToolbar.tsx`)

- Title `TextField` with character counter (17/50 style).
- Status `Badge` (Active = green, Draft = subdued).
- "Desktop view" `Select` (single option — placeholder for Phase 2's
  Desktop/Mobile toggle).
- App Bridge `ContextualSaveBar` (already used elsewhere in the codebase;
  see `app/routes/app.pricing.*` for the pattern) wired to a single
  `handleSave()` that submits via fetcher.

---

## 9. Migration of `/app/customers/applications` (queue) rendering

The queue currently shows `app.companyName`, `app.email`, `app.phone`,
`app.taxId`, `app.country` as flat columns. After migration these live
in `app.responses` JSON.

Plan:
- Loader: in addition to `listApplications`, also load
  `getRegistrationForm(shopId)`. Pass both to the page.
- Row rendering: derive each cell from `responses[<key>]`, using the
  definition's `fields[]` to get labels for the modal detail view.
- "Company" column: read `responses.companyName ?? responses.company_name`
  with a fallback chain (legacy keys still work because seed default
  uses legacy keys).
- "Contact" column: `responses.firstName` + `responses.lastName` +
  `responses.email`.
- Modal: iterate the form's `fields[]` and render `Field` rows for
  every field that has a value in `responses`, plus any "orphan" keys
  in `responses` not in `fields[]` (defensive — definition could have
  changed between submission and review).
- Approve flow: unchanged. Uses `responses.email`, `responses.firstName`,
  `responses.lastName`, `responses.phone`, `responses.companyName` —
  same keys as today, just sourced from JSON instead of columns.

### GDPR webhooks (parallel update)

- `webhooks.customers.redact.tsx`: change
  `prisma.wholesaleApplication.deleteMany` → `prisma.application.deleteMany`.
  Email lookup now reads the denormalized `Application.email` column.
- `webhooks.customers.data_request.tsx`: same swap. Return
  `responses` JSON directly (it's the customer-provided data).
- `webhooks.shop.redact.tsx`: cascade via `Shop.onDelete: Cascade`
  already covers it; update doc comment.

---

## 10. Tests (under existing Vitest setup)

New tests:
- `app/lib/registrationForm/validate.test.ts`
  - required field missing → error
  - invalid email → error with localized message
  - invalid phone (not E.164) → error
  - all valid → empty array
  - definition with select field, value not in options → error
- `app/lib/registrationForm/seeds.test.ts`
  - Each of the 3 templates has at least one field
  - The back-compat default has all 9 legacy field keys (email,
    firstName, lastName, phone, companyName, taxId, website, country,
    notes) — guards against accidental schema drift
- `app/services/registrationForms.server.test.ts`
  - `ensureDefaultRegistrationForm` is idempotent (calling twice
    leaves one row)
  - `upsertRegistrationForm` updates `updatedAt`

Update:
- Whatever test file currently exercises `validateApplication` → port to
  `validateResponses` against the seed default definition.

Fixtures:
- `test-fixtures/registration-forms/seed-default.json`
- `test-fixtures/registration-forms/samita-b2b.json`

---

## 11. Step-by-step execution order

Each numbered step is one logical commit. **Verify** = run
`bash scripts/verify.sh` and confirm green before moving on.

### Phase 1A — Schema + service layer (no UI yet)

1. Add `RegistrationForm` and `Application` models to `prisma/schema.prisma`
   alongside (not replacing) `WholesaleApplication`. Add `RegistrationForm?`
   relation on `Shop`. Run `npx prisma generate`. **Verify.**
2. Create `app/lib/registrationForm/types.ts`, `seeds.ts`, `validate.ts`. **Verify.**
3. Create `app/services/registrationForms.server.ts` with CRUD + TEMPLATES.
   Add `ensureDefaultRegistrationForm` call to `getOrCreateShop`. **Verify.**
4. Add unit tests for validate + seeds + service. **Verify.**

### Phase 1B — Back-fill (DEV ONLY; prod gate at Step 10)

5. Write `scripts/migrate-applications.mjs` (idempotent). Run against
   local dev DB. Spot-check counts. **No verify here — script is
   one-off, not in CI.**

### Phase 1C — Backend cutover (rename + reroute)

6. Rename `app/services/wholesale-applications.server.ts` →
   `applications.server.ts`. Rewrite to operate on `Application` /
   `responses`. Update all import sites:
   - `app/routes/proxy.apply.tsx`
   - `app/routes/app.customers.applications.tsx`
   - `app/routes/app._index.tsx`
   - `app/routes/webhooks.customers.redact.tsx`
   - `app/routes/webhooks.customers.data_request.tsx`
   **Verify.**
7. Update `proxy.apply.tsx`: load active form, validate via
   `validateResponses`, store full body as `responses`. Keep legacy
   form-field names working (seed default mirrors them 1:1). **Verify.**
8. Create new `proxy.registration-form.tsx` (GET endpoint). **Verify.**
9. Update `/app/customers/applications` queue + modal to read from
   `responses` JSON with fallbacks for legacy keys. **Verify.**

### Phase 1D — Prod migration gate (STOP for user)

10. **STOP** — wait for explicit Jonatan approval. Then:
    - Deploy A (additive schema), run back-fill on prod, soak 24h.
    - Confirm counts match + GDPR webhooks still fire.
    - Only then proceed.

### Phase 1E — Storefront block rewrite

11. Rewrite `extensions/quick-order-form/blocks/registration-form.liquid`
    to thin shell. **Verify.**
12. Rewrite `assets/registration-form.src.js` to fetch + render
    dynamically. Add CSS custom property wiring. **Verify.**
13. Run `npm run build:extensions`. Test on dev store storefront end-to-end
    (submit a real application; confirm 201 + row appears in
    `/app/customers/applications`). **Verify.**

### Phase 1F — Admin builder UI

14. Install `npm i @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`. **Verify.**
15. Create `app/routes/app.registration-form.tsx` skeleton with loader +
    action + 3-pane layout shell (no panels wired). **Verify.**
16. Build `LeftRail` + `TopToolbar` + state plumbing. **Verify.**
17. Build `FormElementsPanel` + `FieldEditModal` + dnd-kit reorder. **Verify.**
18. Build `AppearancePanel`. **Verify.**
19. Build `SettingsPanel`. **Verify.**
20. Build `PreviewCanvas` (re-uses field renderer logic). **Verify.**
21. Wire ContextualSaveBar → `upsertRegistrationForm`. Manual test:
    drag-reorder, edit a field, save, reload dev store, confirm new
    field appears on storefront. **Verify.**

### Phase 1G — Docs + deploy C

22. Write `docs/decisions/ADR-012-registration-form-builder.md`.
23. Update `HANDOFF.md` with new state ("Registration Form Builder
    Phase 1 LIVE") + Phase 3 email TODO entry.
24. **STOP** — wait for Jonatan to confirm 48h prod soak before Deploy C.
25. After soak: remove `WholesaleApplication` from schema, `prisma db push`,
    confirm prod still healthy. Final commit.

---

## 12. Risks

### High

- **Storefront block downtime / data loss during cutover.** Decision 14
  is the explicit guard, but the seed must match the legacy field keys
  EXACTLY (`first_name`, `company_name`, `tax_id` snake_case, not
  camelCase). Mismatched keys = silent data loss for in-flight
  applications.
  - Mitigation: explicit test (`seeds.test.ts`) asserting the seed
    default has all 9 legacy snake_case keys + a "back-compat" smoke
    test that POSTs a legacy form body to `proxy.apply` and asserts a
    `pending` Application row appears.

- **Back-fill drift in prod.** If the back-fill script runs partial then
  fails, we get a mix of old + new rows that the queue page double-counts.
  - Mitigation: idempotency keyed on `shopId + email + createdAt`;
    transaction per batch; explicit dry-run flag (`--dry-run` prints
    counts only). Hold for explicit user OK before running on prod.

- **App Proxy GET endpoint returning stale definition.** Cache headers
  + Shopify's CDN can serve a 60s-old definition to a customer who
  submits responses for a field the merchant just removed. Server
  validation rejects → confusing error.
  - Mitigation: server-side validation tolerates extra keys in
    `responses` (stores them anyway). Removed fields = ignored, not
    error. Only required-missing triggers error.

### Medium

- **dnd-kit + Polaris styling friction.** dnd-kit is headless; the
  drag handle styling needs to match Polaris' subtle look. Easy to ship
  ugly first pass.
- **Custom CSS injection is an XSS vector** if rendered on the storefront
  without sanitization. The merchant authoring is "trusted" but an
  attacker who compromises a merchant could inject `<script>` via the
  customCss textarea.
  - Mitigation: storefront injects `customCss` into a `<style>` tag,
    not via `innerHTML`. CSS-in-style is not script-executable.
- **Status toggle behavior unclear.** If merchant flips to `Draft`,
  does the storefront show the seed default or nothing? Decision 1 says
  one form per shop; "draft" implies hidden. Phase 1 chose: **draft =
  storefront serves seed default** (form keeps working). Worth a
  callout in the ADR.

### Low

- New ADR-012 needed to record decisions 1–14 for future agents.
- Existing `quick-order-form/` extension folder name no longer matches
  its contents (it bundles 4 blocks). Rename is Phase 2 polish.
- Status column on `Application` index — currently we order by
  `[status, createdAt]`. New `Application` keeps the same index.

---

## 13. Verification strategy

- Per-step: `bash scripts/verify.sh` (lint + tests + extension build +
  Remix build).
- After Step 7 (proxy.apply rewrite): manual `curl -X POST` with a
  legacy-shaped form body → expect 201 + new `Application` row.
- After Step 13 (storefront block): end-to-end submission from dev
  store (`desarrollo-adspubli.myshopify.com`) → confirm queue row.
- After Step 21 (admin builder): edit a field's label in admin → save →
  refresh storefront → confirm new label appears.
- After Step 25 (Deploy C): smoke test queue page + storefront form +
  GDPR webhook (`fly logs` to confirm no errors).

---

## 14. Stop conditions (where the plan pauses for user input)

1. **Before Step 10** — Deploy A to production. User must explicitly
   approve schema additive deploy + back-fill script run on prod DB.
2. **Before Step 11** — Even on dev store, before rewriting the
   storefront block, confirm the new `Application` table is fully
   populated and the queue page renders identically.
3. **Before Step 24** — Production soak before Deploy C
   (`WholesaleApplication` table drop). Irreversible. Minimum 48h after
   Deploy B with zero errors.
4. **Anytime** the user requests a deploy → defer to
   `deployment-guardian`, not this plan.

---

## 15. Out of scope (Phase 2 / 3 / 4)

- Multi-step forms
- Multi-language editor (Spanish/French/German tabs)
- Email notifications (admin + customer approve/reject) — Phase 3 with
  Resend or per-shop SMTP
- After submit panel (rich text editor + dynamic variables)
- Email Notifications panel
- Integrations panel (Klaviyo / Mailchimp / Zapier)
- Account page integration (`Show account detail` + `Edit account page`)
- Lock the registration page (password gate)
- Field types: `date`, `radio_group`, `address_block`
- Desktop/Mobile preview toggle (only Desktop in Phase 1)
- Template library with thumbnails (Phase 1 is 3 hardcoded templates,
  no thumbnail UI)
- Custom CSS sanitization beyond `<style>`-vs-`innerHTML`
- Versioned Prisma migrations (still `prisma db push`)
- Multi-form per shop

---

## 16. Estimated effort

- Phase 1A (schema + services): 0.5 day
- Phase 1B (back-fill script): 0.5 day
- Phase 1C (backend cutover): 1 day
- Phase 1D (prod migration gate): 1 day (mostly waiting)
- Phase 1E (storefront block rewrite): 1 day
- Phase 1F (admin builder UI): 2.5 days
- Phase 1G (docs + Deploy C): 0.5 day

**Total: ~6–7 working days** assuming no surprises in the back-fill or
the dnd-kit/Polaris styling. Buffer +1 day for the storefront block
rewrite if CSS custom-property fallbacks break on older themes.
