# Move the Registration Form editor into an App Bridge max modal

**Date:** 2026-05-30 (started + completed)
**Status:** completed (with one known follow-up)
**Owner:** both (Jonatan direction + live testing, Claude implementation)
**Related:** HANDOFF.md "Registration Form multi-form" + Fly version block,
tasks/current.md "Just shipped (2026-05-30)",
docs/patterns/shopify-app-bridge-max-modal-editor.md,
memory shopify-remix-deploy-gotchas #15

## Objective

The RF editor lived inside a cramped embedded `<Page>` (admin nav rail eats
width). The competitor Sami opens its editor as a full-screen overlay.
Jonatan wanted parity — the first concrete step of the broader "design
rescue". Confirmed this is **maquillaje, not cirugía**: data model + logic
were fine, only the container changed.

## Files inspected

- `app/routes/app.registration-form.$id.tsx` — old singleton editor (Page chrome).
- `app/routes/app.registration-form._index.tsx` — list loader/action.
- `app/components/registration-form/RegistrationFormList.tsx` — list UI (row → navigate).
- `app/components/registration-form/{FieldEditModal,TypePickerModal,TemplatePickerModal,FieldList}.tsx` — sub-dialogs.
- `app/services/registrationForms.server.ts` — `listRegistrationForms` already returns full rows.
- `node_modules/@shopify/app-bridge-react/.../Modal.d.ts` + `app-bridge-types` — confirmed `<Modal>` + `variant:'max'` + `src` (more reliable than web docs).

## Files changed

- **NEW** `app/components/registration-form/RegistrationFormEditor.tsx` — editor body extracted; two chromes (`page`/`modal`); imperative `save`/`discard` ref; inline middle-pane panels (type/edit/delete/template).
- **NEW** `app/components/registration-form/FieldEditForm.tsx` — inline field create/edit form (replaces FieldEditModal).
- `app.registration-form.$id.tsx` — reduced to loader/action + `<RegistrationFormEditor chrome="page">`.
- `app.registration-form._index.tsx` — loader now ships full `EditorState` per form (`editors` map).
- `RegistrationFormList.tsx` — row opens an `<AppBridgeModal variant="max">` with TitleBar Save/Discard, instead of navigating.
- `lib/registrationForm/types.ts` — added shared `EditorState`.
- **DELETED** `FieldEditModal.tsx`, `TypePickerModal.tsx` (orphaned by the inline panels).

## Commands run

```
git checkout -b feat/registration-form-max-modal   # later ff-merged to main
bash scripts/verify.sh                              # green each iteration
fly deploy --app stockly-lustrous-forest-4364       # v63 (max modal), v64 (inline fix)
git revert 8b8edb1                                  # undo the cli bump that broke the build
```

## Verification

- `scripts/verify.sh` green at every commit (lint, tsc, tests, extension + Remix build).
- Prod smoke after each deploy: `/` and `/healthz` → HTTP 200; primary machine `started`, health check passing.
- Jonatan validated live: editor opens full-screen (v63); edit/delete/add work via inline panels (v64).

## Open risks

- **Live preview pane renders empty inside the max modal** — not yet
  investigated (likely height/width of `FormPreview` in the modal context).
  Logged in tasks/current.md for the next design pass.
- Two `<TitleBar>`s coexist (page + modal) — works in practice; watch if App
  Bridge changes scoping.
- Inline approach chosen over `src` (nested iframe) deliberately; if Shopify
  pushes the `src` path harder, revisit (see pattern doc §3).

## Next step

Wait for Jonatan's list of design/functionality retouches; first item is the
empty Live preview. Then continue applying the max-modal pattern to other
admin screens (the rescue direction).
