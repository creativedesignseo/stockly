# 2026-06-01 — RF editor Live preview now renders inside the max modal

## Objective

Close the last open follow-up on the Registration Form editor screen: the
**Live preview** pane rendered **blank** inside the App Bridge `variant="max"`
modal, while it rendered fine in the standalone `chrome="page"` route.

## Files inspected

- `app/components/registration-form/FormPreview.tsx` — confirmed NOT broken;
  it renders the field grid (or an "Add a field…" empty state) and applies the
  appearance custom properties. Same component used by both chromes.
- `app/components/registration-form/RegistrationFormEditor.tsx` — the 3-pane
  body. Both chromes share the same `body`; the only difference is the wrapper:
  `chrome="page"` → `<Page fullWidth>`, `chrome="modal"` → `<Box padding="400">`.
  The editor|preview split was a Polaris `<Layout>` (`Layout.Section oneThird`
  = editor, `Layout.Section` = preview).
- `app/components/registration-form/RegistrationFormList.tsx` — mounts
  `<AppBridgeModal variant="max">` with the editor inline (`chrome="modal"`).
- `docs/patterns/shopify-app-bridge-max-modal-editor.md` — the max-modal
  pattern doc (gotcha #1 was the earlier portal-behind-overlay sub-dialog bug,
  fixed in v64; this preview bug was not yet documented there).

## Root cause

Polaris `<Layout>` is built to live inside a `<Page>`, which gives it width +
the viewport-based responsive context. Inside the max-modal overlay there is no
`<Page>` (the body sits in a bare `<Box>`), so `<Layout>`'s viewport
media-query wrap dropped the preview `Layout.Section` out of the modal's
scrollable area — it rendered blank. Isolated to the modal context because
`chrome="page"` (which DOES have a `<Page>`) shows the preview correctly.

## Files changed

- `app/components/registration-form/RegistrationFormEditor.tsx` (+64/−34):
  extracted `editorColumn` and `previewPane`, then a `splitLayout` that branches
  on chrome. `chrome="modal"` uses an explicit 2-column CSS grid
  (`gridTemplateColumns: minmax(320px, 1fr) minmax(0, 2fr)`, `gap` =
  `--p-space-500`, `alignItems: start`) — fixed tracks, no viewport media query.
  `chrome="page"` keeps the Polaris `<Layout>` byte-for-byte (zero regression
  risk on the working path).

## Commands run

- `bash scripts/verify.sh` → all checks passed (lint, tsc --noEmit, tests,
  extension build, Remix build). Pre-existing Polaris `@media … and print` CSS
  warning unchanged.
- `git commit` → `165766d`; `git push origin main`.
- Deploy via `deployment-guardian`: `fly deploy --app
  stockly-lustrous-forest-4364 --remote-only` → **Fly v66**.
- Post-deploy verify: `fly status` (machine started, health check passing),
  `curl /healthz` → 200, `curl /` → 200.

## Verification result

GREEN locally; prod v66 live and healthy. The `release_command`
(`prisma db push --skip-generate`) ran as a no-op (schema diff since v65 was
empty).

## Open risks / next step

- **Pending Jonatan's visual confirmation** in the dev store: open the RF editor
  in the max modal and confirm the preview now shows on the right. The fix is a
  best-hypothesis fix that could not be verified visually from here (the bug
  only reproduces inside the embedded admin modal). If the preview is still off,
  the next suspects are shadow-DOM/style scoping inside the overlay or the
  modal's own scroll container — not the split layout.
- Consider folding this preview note into
  `docs/patterns/shopify-app-bridge-max-modal-editor.md` (gotcha #5) once
  confirmed.
