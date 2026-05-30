# Pattern — Full-canvas editor with an App Bridge "max modal"

**Status:** in use in Stockly (Fly v63, 2026-05-30) — Registration Form editor.
**Portable:** yes. This doc is written so it can be lifted into ANY embedded
Shopify app (Remix + Polaris + App Bridge v4). Nothing here is Stockly-specific
except the file names in the worked example.

---

## 1. The problem this solves

An embedded Shopify app renders inside an iframe in the admin. A normal page
(`<Page>`) lives *inside* the admin frame: the admin's left nav rail eats ~240px
and the content is clamped to the standard page width. For a builder/editor UI
(form builder, theme-style editor, anything with a left rail + canvas + preview)
that feels **cramped** — "flaco", as the client put it.

Competitors (Sami Wholesale, the Shopify theme editor, the checkout editor) don't
live in that cramped frame. When you open their editor it takes over the **whole
screen**: the admin nav rail disappears, an **X** appears top-right to close, and
the editor gets the full canvas. That premium feel is not CSS — it's a specific
App Bridge primitive.

## 2. How we identified it (reverse-engineering)

Given side-by-side screenshots of "ours" (cramped) vs the competitor (full-screen
overlay), the tells were:

1. The competitor's editor **removed the admin left nav rail** — a normal page
   can't do that; only a modal/overlay owned by the admin host can.
2. There was an **X to close** top-right, not a Polaris back-arrow.
3. The admin top bar (search, account avatar) stayed — so it was still inside the
   admin, not a new tab.

That combination = the App Bridge **max modal** (`variant="max"`). It's the
renamed successor of the old "Fullscreen API". Confirmed two ways before writing
a line of code:
- Shopify docs: the `ui-modal` web component, `variant` accepts `'max'`.
- The **installed package's own type defs** (most reliable — beats web docs that
  mix versions): `node_modules/@shopify/app-bridge-react/.../components/Modal.d.ts`
  exports a React `<Modal>` wrapper; `UIModalAttributes.variant: 'small' | 'base'
  | 'large' | 'max'` and an optional `src`.

> Lesson: when an API's web docs are ambiguous across versions, read the
> `.d.ts` of the version you actually have installed. It can't drift.

## 3. The two ways to do it — and which to pick

`<Modal variant="max">` can host its content two ways:

| | `src` (iframe) | **inline children** (chosen) |
|---|---|---|
| How | `<Modal src="/app/editor/:id">` loads a route in a **nested** iframe | Editor JSX is a **child** of `<Modal>`, in the same app context |
| Pros | Tiny change; editor route reused as-is | No nested iframe; SaveBar / sub-state / dirty-tracking just work |
| Cons | Nested-iframe bugs; SaveBar + cross-frame Save handoff is fiddly; documented re-render/crash issues | Must lift the editor into a reusable component; parent owns the title bar |

We chose **inline**. The deciding factor: an editor has a Save bar, sub-dialogs,
and dirty state. With `src` all of that lives in a nested iframe and has to talk
across the frame boundary — fragile. Inline keeps everything in one React context.

## 4. The implementation (4 moving parts)

### a) Lift the editor body into a reusable component with two "chromes"

One component, two wrappers, so the same editor works both standalone (deep-link)
and inside the modal:

```tsx
// RegistrationFormEditor.tsx
export const RegistrationFormEditor = forwardRef<Handle, Props>(function E(
  { initialForm, formId, chrome = "page", onSaved, onDirtyChange }, ref,
) {
  // ...all editor state + handlers...

  // Expose Save/Discard so the MODAL chrome's title-bar buttons can drive them:
  useImperativeHandle(ref, () => ({ save: handleSave, discard: handleDiscard }));
  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

  const body = (/* toolbar + 3-pane layout + sub-dialogs */);

  if (chrome === "modal") return <Box padding="400">{body}</Box>;   // no Page, no global SaveBar
  return (                                                          // standalone page
    <Page fullWidth backAction={{ url: "/app/...", content: "..." }}>
      <SaveBar id={SAVE_BAR_ID}>{/* Save / Discard */}</SaveBar>
      {body}
    </Page>
  );
});
```

### b) Save goes to the route action, explicitly, from both chromes

```tsx
const handleSave = () =>
  fetcher.submit({ payload: JSON.stringify(form) },
    { method: "post", action: `/app/registration-form/${formId}` });
```

Explicit `action` means the same fetcher works whether the component is mounted
on its own route or inline in the list.

### c) The list opens the modal; the modal's title bar owns Save/Discard

```tsx
// in the list component
const editorRef = useRef<Handle>(null);
const [editingId, setEditingId] = useState<string | null>(null);
const [dirty, setDirty] = useState(false);
const editing = editingId ? editors[editingId] : null;   // EditorState from loader

<AppBridgeModal variant="max" open={editing !== null} onHide={close}>
  <TitleBar title={`Edit · ${meta?.name ?? ""}`}>
    <button variant="primary" disabled={!dirty} onClick={() => editorRef.current?.save()}>Save</button>
    <button disabled={!dirty} onClick={() => editorRef.current?.discard()}>Discard</button>
  </TitleBar>
  {editing && (
    <RegistrationFormEditor
      key={editingId}            /* remount on form change → fresh state */
      ref={editorRef} chrome="modal"
      formId={editingId} initialForm={editing}
      onDirtyChange={setDirty} onSaved={() => revalidator.revalidate()}
    />
  )}
</AppBridgeModal>
```

- `<TitleBar>` **inside** `<Modal>` becomes the modal's header/footer (per its
  type doc) — that's where Save/Discard belong in modal chrome, NOT the global
  SaveBar (which would sit behind the overlay).
- `onHide` → `revalidator.revalidate()` so the list reflects name/status edits.
- Row click sets `editingId` instead of navigating.

### d) The list loader ships full editor state per row

So the inline modal renders with no extra round-trip:

```ts
const editors: Record<string, EditorState> = {};
const items = forms.map((f) => { editors[f.id] = toEditorState(f); return toRow(f); });
return json({ forms: items, editors });
```

Fine because a shop has a handful of forms. If you ever have hundreds, switch to a
fetcher that loads one form's state on open.

## 5. Gotchas (read before reusing)

1. **Polaris sub-dialogs render BEHIND the max modal.** ⚠️ This is the big one.
   A Polaris `<Modal>` portals to `document.body`; the App Bridge max modal is an
   overlay with a higher stacking context, so the Polaris dialog opens but is
   hidden behind it — it looks like the button "does nothing". (Live bug in
   Stockly's editor as of v63: the per-field edit dialog.)
   **Fix options, cleanest first:**
   - **Inline panels instead of dialogs** — when editing a field, show its config
     as a panel *inside* the editor canvas (e.g. swap the middle pane), not a
     floating modal. This is what Sami does and it sidesteps portals entirely.
   - Nested App Bridge modals are NOT a fix — opening a second App Bridge modal
     inside a `variant="max"` one is documented to close the max modal.
2. **Two `<TitleBar>`s coexist** — the page's own TitleBar and the modal's. App
   Bridge scopes the inner one to the modal. Works, but verify in the live admin.
3. **The new row isn't in `editors` until the loader reruns.** After
   create-from-template (action returns just an id), set `editingId` AND
   `revalidate()`; the modal opens once the new form's state lands.
4. **`open` is controlled** — keep the `<Modal>` mounted and toggle `open`; don't
   conditionally render the whole modal or you lose the close animation + `onHide`.

## 6. Reuse checklist for a new app

- [ ] App Bridge v4 (`@shopify/app-bridge-react` ≥ 4.2). Confirm `Modal` is exported.
- [ ] Editor body is a `forwardRef` component with a `chrome` prop ("page" | "modal").
- [ ] Save submits to an explicit route `action`.
- [ ] List/parent owns `<AppBridgeModal variant="max">` + `<TitleBar>` Save/Discard.
- [ ] Parent gets dirty state via `onDirtyChange`; drives save/discard via the ref.
- [ ] Loader ships the editor state the modal needs (or a fetcher loads it on open).
- [ ] **Sub-editors are inline panels, not Polaris modals** (see gotcha #1).
- [ ] `onHide` revalidates the list.
```
