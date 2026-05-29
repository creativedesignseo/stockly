# Stockly — Design System (living coherence doc)

> Status: living. Created 2026-05-29 (Fase 0 of the multi-form
> registration plan). Owner: Jonatan / docs-curator.
>
> Purpose: keep the 13 admin screens (pricing, volume-pricing,
> registration-form, customers/applications, settings, …) speaking
> **one** visual language so the app does not drift into a
> "Frankenstein" of hand-rolled UIs. This is a **reference document,
> not a code module** — there is no `tokens.ts`. The admin gets its
> tokens from Polaris; the storefront form gets them from one CSS file.
> Every value below was read from the actual repo or measured live from
> the competitor (Sami); none are invented.

There are exactly **two** surfaces, and they do not share a token set:

| Surface | Where | Token source |
|---|---|---|
| **Admin** (embedded in Shopify) | `app/routes/app.*.tsx` | Shopify **Polaris** components + `--p-*` CSS vars |
| **Storefront** (registration form) | `extensions/quick-order-form/` | `--rf-color-*` vars in `registration-form.css` |

---

## 1. Admin tokens — Polaris (condensed from `sami-registration-form.md` §9.1)

The key finding from reverse-engineering Sami: **their admin is Shopify
Polaris, verbatim.** Stockly already ships Polaris, so matching the
competitor's admin look costs nothing — use the same components. Do not
hand-roll admin CSS (see the Golden Rule, §4).

### 1.1 Core tokens (measured live from Sami's admin iframe)

| Token | Value | Polaris equivalent |
|---|---|---|
| Font family | `Inter, -apple-system, system-ui, "San Francisco", "Segoe UI", Roboto, …` | `--p-font-family-sans` |
| Page background | `rgb(241,241,241)` | `--p-color-bg` |
| Surface / card | `rgb(255,255,255)` | `--p-color-bg-surface` |
| Text default | `rgb(48,48,48)` | `--p-color-text` |
| Text subdued | `rgb(97,97,97)` | `--p-color-text-secondary` |
| Border radius | `8px` | `--p-border-radius-200` |
| Section heading | 13px / 600 | `Text variant="headingSm"` |
| Body / row text | 13px / 450 | `Text variant="bodyMd"` |

> In Stockly code, prefer the Polaris **component** (`<Text>`, `<Card>`)
> over the raw `--p-*` var. Raw vars are acceptable only inside the few
> hand-styled elements Polaris does not ship (e.g. the status switch,
> see §1.5).

### 1.2 Button variants

| Use | Polaris |
|---|---|
| Primary CTA ("Create new wholesale pricing", "Save") | `<Button variant="primary">` / `<button variant="primary">` inside `<SaveBar>` |
| Secondary / neutral action | plain `<Button>` |
| Low-emphasis / icon action (row remove) | `<Button variant="tertiary" icon={…}>` |
| Destructive | `<Button tone="critical" variant="primary">` |

### 1.3 IndexTable

The list primitive for every "list of things" screen.

| Part | Measured (Sami) | Stockly usage |
|---|---|---|
| Header row | 12px / 550 / `rgb(97,97,97)` on `rgb(247,247,247)`, pad `8px 8px 8px 12px` | `IndexTable` default |
| Body cell | 13px / 450, pad `6px 8px 6px 12px` | `IndexTable.Row` / `IndexTable.Cell` |

Reference: `app/routes/app.pricing._index.tsx` (`headings={[…]}`,
`IndexTable.Row` with `onClick` → editor). Row click navigates to the
editor; inline controls (status toggle) `stopPropagation` so they don't
trigger the row navigation.

### 1.4 Tabs

Filter the list by lifecycle. Stockly uses **3 honest tabs**
(`All / Active / Draft`) backed by `active: boolean` — not Sami's 5
(which include Expired/Pending lifecycle Stockly doesn't model yet).
Driven by a `?status=` query param via `setSearchParams` (never a full
reload — a reload inside the embed iframe loses host/id_token).
Reference: `app.pricing._index.tsx` `tabs` + `onTabSelect`.

### 1.5 Banner

| Tone | Use |
|---|---|
| `info` | At-a-glance read-only status (e.g. "Shop-wide pricing setup") |
| `warning` | Caveats / "this mode isn't available yet" / legacy-data notices |
| `critical` | Validation error summary above a form |

Reference: the info banner in `app.pricing._index.tsx`; the critical
error-summary and warning banners in `app.pricing.$id.tsx`.

### 1.6 Card

Every content block is a `<Card>` wrapping a `<BlockStack gap="400">`
with a `headingMd` title + `bodySm` subdued description. The list wraps
its `Tabs` + `IndexTable` in a single `<Card padding="0">`. Reference:
both pricing routes.

### 1.7 The one allowed exception — the status switch

Polaris v12 ships no first-class "switch", so the Active/Draft toggle is
a `<button role="switch">` styled with `--p-color-bg-fill-success` /
`--p-color-bg-fill-tertiary`. This is the canonical hand-rolled control;
clone `StatusToggle` / `StatusToggleCell` from the pricing routes rather
than inventing a new one. It is the **exception that proves the rule** —
everything else is a Polaris component.

---

## 2. Storefront form tokens (from `registration-form.css`, §9.2)

The storefront registration form is **not** Polaris — it renders inside
the theme via `extensions/quick-order-form/`. Its appearance is driven
entirely by CSS custom properties on the `stockly-registration` host,
set at runtime from the form's fetched JSON. These defaults live in
`extensions/quick-order-form/assets/registration-form.css`.

### 2.1 Canonical `--rf-color-*` tokens (and defaults)

| Token | Default | Role |
|---|---|---|
| `--rf-color-main` | `#111` | Submit button bg + focus ring (use merchant brand color) |
| `--rf-color-heading` | `#111` | Form heading color |
| `--rf-color-label` | `#555` | Field label color |
| `--rf-color-description` | `#666` | Hint / description text |
| `--rf-color-option` | `#111` | Select / option / input text |
| `--rf-color-paragraph` | `#333` | Body paragraph (intro, success) |
| `--rf-color-paragraph-bg` | `transparent` | Inline paragraph background |
| `--rf-color-background` | `#ffffff` | Form / card background |
| `--rf-color-border` | `rgba(0,0,0,0.12)` | Field border |
| `--rf-color-button-text` | `#ffffff` | Submit button text |
| `--rf-color-error` | `rgb(170,50,50)` | Error messages + required `*` |
| `--rf-color-success` | `rgb(28,110,70)` | Success / already-wholesale state |
| `--rf-form-max-width` | `100%` | Form max-width (set per appearance, e.g. `600px`) |

### 2.2 Metrics (the deliberate upgrade over Sami's dated default)

Sami's storefront default is dated (2px radius, Material drop-shadow,
borderless gray inputs, serif fallback, hard-black submit). Stockly's
CSS modernizes it — these are the canonical metrics:

| Element | Metric |
|---|---|
| Card radius (boxed layout) | **12px** (`.stockly-reg__inner`) |
| Input / select / button radius | **8px** |
| Boxed card shadow | soft, `0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04)` |
| Input shadow | `0 1px 2px rgba(0,0,0,.04)`, 1px border |
| **Focus ring** | `border-color: var(--rf-color-main)` + `0 0 0 3px color-mix(in srgb, var(--rf-color-main) 18%, transparent)` (brand-tinted) |
| Submit hover | lift `translateY(-1px)` + `0 3px 8px rgba(0,0,0,.16)` |
| Layout | 2-column grid, collapses to 1-col `@media (max-width: 600px)` |

### 2.3 Layout variants

- `.stockly-reg--layout-default` — plain form, no card.
- `.stockly-reg--layout-boxed` — card-wrapped: 2rem padding, 1px border,
  12px radius, soft shadow.

---

## 3. Screen pattern — "list → editor"

The canonical shape for any "manage N of something" feature. Stockly's
Wholesale Pricing **already implements it** and is the in-repo
reference. Clone it; do not invent a new layout.

### 3.1 The list (`app/routes/app.pricing._index.tsx`)

- `<Page>` with a primary action **"Create new …"** → `/…/new`.
- Optional read-only **`<Banner tone="info">`** at top for at-a-glance
  state (Stockly: shop-wide pricing setup).
- A single `<Card padding="0">` containing:
  - **`<Tabs>`** All / Active / Draft, `?status=` query-param driven.
  - **`<IndexTable>`** — ID / Name / Status (inline toggle) / … /
    Created. Row `onClick` → the editor route. Inline controls
    `stopPropagation`.
  - **`<EmptyState>`** both for "no rows at all" (whole page) and "no
    rows in this tab" (inside the table).
- Inline status toggle submits via a per-row `useFetcher` (optimistic),
  independent of opening the editor.

> Multi-form registration adds two things to this template, per the
> plan: an **"Add new" → `Select Template` modal** before landing in the
> editor, and a **Short Code** column (copyable chip). Same skeleton
> otherwise.

### 3.2 The editor (`app/routes/app.pricing.$id.tsx`)

- `<Page backAction>` → back to the list. `<TitleBar>` = `Edit: {name}`.
- **App Bridge `<SaveBar>`** driven by an `isDirty` diff against the
  loaded values; Save calls `formRef.current?.requestSubmit()`. Do **not**
  hide the bar optimistically — on a validation error the action returns
  JSON (no redirect) and the bar must stay visible (this was a real
  "looks saved but wasn't" bug; see commit `6bb3b1f`).
- **3-panel feel** via `<Layout>`: main `<Layout.Section>` (stacked
  `<Card>` blocks — info, eligibility, scope, discount, danger zone) +
  `<Layout.Section variant="oneThird">` (live summary / preview).
- Editor actions use **intents** (`update` / `delete`) on the same
  route; both redirect back to the list on success.

> Sami's registration builder is a richer 3-pane (left rail switcher +
> middle panel + live preview canvas). When the registration editor is
> built it keeps this same contract — `<Page>` + `<SaveBar>` + `<Layout>`
> — just with more panels. The pricing editor is the structural
> reference; the registration editor is the elaborated case.

---

## 4. Golden rule

> **Admin = Polaris components, never hand-rolled CSS. Storefront = the
> `--rf-color-*` tokens. Every new screen clones an existing pattern.**

Concretely:

1. **Admin:** reach for a Polaris component first (`Card`, `IndexTable`,
   `Tabs`, `Banner`, `Button`, `Text`, `Layout`, `SaveBar`). Raw `--p-*`
   vars only inside the one sanctioned exception (the status switch,
   §1.7). No bespoke admin CSS files.
2. **Storefront:** style only through `--rf-color-*` and the metrics in
   §2. Do not add new ad-hoc colors; if the form needs a new color role,
   add a `--rf-color-*` token here first, then use it.
3. **New screen:** start by cloning the nearest existing pattern —
   `app.pricing._index.tsx` for a list, `app.pricing.$id.tsx` for an
   editor — rather than from a blank file. Coherence comes from copying,
   not from re-deriving.

---

## Sources

- `docs/competitive/sami-registration-form.md` §9 (measured tokens)
- `extensions/quick-order-form/assets/registration-form.css` (storefront tokens)
- `app/routes/app.pricing._index.tsx` (list pattern)
- `app/routes/app.pricing.$id.tsx` (editor pattern)
