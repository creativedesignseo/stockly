# Theme App Extension — CSS gotchas (storefront)

> Reusable lessons for building Shopify **theme app extension** blocks
> (the storefront UI an app injects into a merchant's theme). These bite
> on ANY Shopify app, not just Stockly — keep this handy for future builds.

---

## #1 — The host theme styles your `<input>`s (the "double border" bug)

### Symptom

A focused (or even resting) text input shows **two concentric lines**:
our intended border **plus** a second grey line stacked just inside/outside
it. Looks broken. Reproduces in a clean browser (Safari, never opened) — so
it is **NOT a cache issue**.

### Root cause

The merchant's **theme** (Dawn and the whole family of themes derived from
it) does **not** draw input borders with the CSS `border` property. It
draws them with a **`box-shadow` ring**, frequently with `!important`:

```css
/* typical Dawn-style input styling, simplified */
.field__input,
input {
  box-shadow: 0 0 0 0.1rem rgba(0,0,0,.55);   /* the "border" */
}
input:focus {
  box-shadow: 0 0 0 0.2rem rgba(0,0,0,1);     /* thicker on focus */
}
```

Our block applies its **own** `border` (and, in an earlier version, its own
`box-shadow` halo). The theme's `box-shadow` and our `border` **coexist** →
two visible lines. Our halo had been *masking* the theme's ring; the moment
we removed the halo, the theme's grey ring showed through.

### Why it's easy to misdiagnose

- `outline: none` does **nothing** here — the second line is a
  **`box-shadow`**, not an `outline`. (We chased the outline first.)
- It looks like a cache/stale-deploy problem, but a clean browser proves
  it is live CSS from the theme.
- In **Safari** a `box-shadow` with `0` blur + spread renders as a crisp
  solid band, so even our own halo looked like a hard second line.

### Fix

Force our own box-shadow OFF (and outline off) on the inputs, base **and**
focus, with `!important` to beat the theme. Then OUR `border` is the only
border decoration:

```css
.my-block__field input,
.my-block__field textarea,
.my-block__field select {
  border: 1px solid var(--border);     /* the single line, at rest */
  box-shadow: none !important;         /* kill the theme's ring */
  outline: none !important;            /* kill browser/theme outline */
}
.my-block__field input:focus,
.my-block__field input:focus-visible,
/* …textarea/select :focus + :focus-visible … */ {
  outline: none !important;
  border-color: var(--accent);         /* recolour the same single line */
  box-shadow: none !important;
}
```

Result: **one clean line** — grey at rest, accent-coloured on focus.

Implemented for the registration form in `stockly-35`
(`extensions/quick-order-form/assets/registration-form.css`).

### General principle

A theme app extension renders **inside the merchant's theme**, so the theme
can style any generic element you emit (`input`, `select`, `button`, `a`,
`p`…). Defensive rules for storefront blocks:

1. **Reset aggressively on controls you own**: `box-shadow: none !important`
   and `outline: none !important` on your inputs/selects, then draw your own
   single `border`. Don't assume `outline: none` covers focus rings — themes
   use `box-shadow`.
2. **Prefer your own classes + tokens** (`--sk-*`) over relying on element
   defaults; scope every rule under your host element
   (`stockly-registration …`) so you only fight the theme on your own nodes.
3. **Audit the other blocks too**: any block with inputs/selects (Quick
   Order Form qty inputs, Product Panel variant select) is exposed to the
   same theme ring — apply the same reset. *(Follow-up: verify QOF +
   product-panel inputs.)*
4. **Test on a Dawn-based theme**, not only our prototypes — the prototype
   has no theme CSS, so this class of bug is invisible there.

---

## How we found it (for next time)

1. Reported as a visual bug → first assumed our own focus CSS (halo).
2. Removed the halo → second line persisted (now grey, not black).
3. Assumed cache → user proved it in a never-opened Safari → **not cache**.
4. Zoomed screenshot → two concentric rounded rectangles, accent outer +
   grey inner → deduced a `box-shadow` from the theme under our border.
5. `box-shadow: none !important` → resolved.

Lesson: when a storefront control looks "doubled", suspect the **theme's
box-shadow**, not your own `border`/`outline`. Reproduce in a clean browser
to rule out cache early.
