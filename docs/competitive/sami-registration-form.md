# Sami Wholesale — Registration Form (reverse-engineering notes)

> Built 2026-05-27 from live Sami install on `desarrollo-adspubli.myshopify.com`.
> Same caveats as `sami-volume-pricing.md`: descriptive, not prescriptive.

URL pattern: `/apps/wholesale-sami/admin/registration-form` (list) and `/apps/wholesale-sami/admin/registration-form/new` (builder). The list → builder flow goes through a `Select Template` modal first.

---

## 1. UI map

### 1.1 List view (`/registration-form`)

Empty state:
- Title "Registration Form"
- Yellow banner: **Protect your B2B registration page** — "Limit access to your registration form and control who can apply to your wholesale program" → CTA `Lock the registration page` (likely a password gate on `/account/register`)
- Card with form-preview illustration + CTA `Add new registration form`
- Secondary "Learn more"
- Bottom card: "How to set it up?" — onboarding hand-holder with `Chat now` link

Populated state (inferred):
- Same Sami list pattern as Volume Pricing — IndexTable with Status toggle, Active/Draft tabs.

### 1.2 Template picker (modal on "Add new registration form")

Modal title: `Select Template`. 5 templates shown as preview thumbnails with `Select` button:

| Template | Fields included |
|---|---|
| **Standard** | First Name * + Last Name * + Email * + Password * + Confirm password * (4 input fields, 2-col layout) |
| **Modern** | First Name + Last Name + Email + Phone + Password + Confirm password (Modern adds Phone) |
| **Address** | Standard + Address Line 1 (and likely full address block when scrolled) |
| **Demographics** | Date of birth + Gender (radio: Male / Female / Other) + Referred by (radio: Google search / Facebook ads / Youtube ads / Someone / Other...) |
| **Samita Wholesale** | Company name * + Street address * + Apartment, suite, etc + City + Postal/Zip + Country (B2B fields) |

Cancel button at bottom-right.

### 1.3 Builder canvas (`/registration-form/new` after template select)

**Top bar:** App Bridge contextual save bar ("Cambios sin guardar / Descartar / Guardar")

**Layout (3 vertical panes + top toolbar):**

#### Left rail — panel switcher (7 icons stacked, ~50px wide)
1. **Form elements** (file-cabinet icon, active by default)
2. **Appearance** (paintbrush)
3. **After submit** (lightning/spark)
4. **Email Notifications** (envelope)
5. **Integrations** (grid)
6. **Settings** (gear)
7. **Account page** (person with +)

Each icon swaps the middle panel; right canvas (preview) stays put.

#### Middle panel — depends on selected left-rail icon

**(a) Form elements panel**
- Top section "Header" — card showing the form's header config (title + subtitle)
- "Form elements" label
- Cards listing each STEP of the form (Demographics template has 2: "Tell us about yourself" + "Create your account"). Each card is draggable (handle on right).
- `+ Add element` button below
- Bottom section "Footer" — collapsed card

Implied: forms support **multi-step** with named step containers. Each step holds N field elements.

Clicking a step expands it to list/edit fields (we couldn't reproduce the click through Shopify embed, but the user-provided screenshot shows the Standard template's first step expanded with `First Name | Last Name | Email | Password` rows, each draggable, each with its own icon).

Implied **field types** (from all 5 templates + visible icons):
- `text` (First Name, Last Name, Company name, Street address, Apartment, City)
- `email` (Email)
- `password` (Password) — has duplicate/copy icon, suggesting auto-confirm-password pairing
- `phone` (Phone)
- `date` (Date of birth)
- `radio_group` (Gender, Referred by)
- `select` (Country, Postal/Zip)
- `address_block` (Address Line 1, full address composite)
- `section` (the multi-step containers)

Each field probably has: label, placeholder, required toggle, validation rules, width (full / half), help text.

**(b) Appearance panel** (from user screenshot)
- `Layout` — segmented: `Default | Boxed`
- `Width` — px input (default 600)
- `Style` — dropdown (default `Classic`)
- Color pickers (7 visible):
  - Main color
  - Heading color
  - Label color
  - Description color
  - Option color
  - Paragraph color
  - Paragraph background
- `Background` — dropdown (`Color`)
- `Background color` — picker (only when Background = Color)
- `Custom CSS` — code editor at bottom

**(c) After submit panel** (from user screenshot)
- `Action` dropdown — `Clear form` (default). Likely options: Clear form, Redirect to URL, Show success message, etc.
- Dynamic variables list (click to copy into editor): `{{page.title}}`, `{{page.href}}`, "Show more" (likely expands to: form field values, customer info, etc.)
- `Message (en)` — rich text editor (TinyMCE-like: File / Edit / View / Insert / Format / Tools / Table / Help menus + Heading dropdown + Bold/Italic/Color toolbar)
- Multi-language: the `(en)` badge means each text is localizable

**(d) Email Notifications panel** (from user screenshot)
- Collapsible section `Admin : when someone registers`
  - `Admin Email` — text input (comma-separated multiple recipients), helper "You can put multiple email addresses separated with a comma"
  - Checkbox `Also send to dynamic email` — "Set up admin email based on selected option on the form" (e.g., if form has a "Referred by" field, send a copy to the rep matched to that referral)
  - Dynamic variables: `{{data}}` (all visible input data), `{{page.title}}`, `{{page.href}}`, "Show more"
  - `Subject` — text input (per-language, "(en)" badge)
  - `Admin Content` — rich text editor (per-language)
  - Checkbox `Limit content width`
  - Helper "Please go to the app's General Settings to set up SMTP" — SAMI needs SMTP config to actually send (Shopify Functions/Apps can't natively send email — they likely use Mailgun/SES/SMTP)
- Collapsible section `Customer Email`
  - `Your customer's account is approved` (template editor)
  - `Your customer's account is rejected` (template editor)

**(e) Integrations panel** — not observed. Likely Klaviyo / Mailchimp / Zapier / webhooks. Sami chats about this in their docs.

**(f) Settings panel** (from user screenshot)
- `General` (collapsed) — likely form name, URL slug, allow Shopify-customer-created bypass
- `Error message` (expanded)
  - 9 localized strings, each (en):
    - `Required` → "Please fill in field"
    - `Invalid` → "Invalid"
    - `Invalid name`
    - `Invalid email`
    - `Invalid url`
    - `Invalid phone`
    - `Invalid number`
    - `Invalid password`
    - `Confirmed password doesn't match`

**(g) Account page panel** (from user screenshot)
- Checkbox `Show account detail on account page`
- Checkbox `Edit account page` — creates a sub-page at `/account?view=samitaWS_registrationForm_edit` so signed-in customers can update their saved fields
- Collapsible `Other Page` — likely register/login page overrides (locked, has crown icon)

#### Right canvas — live preview

**Top toolbar:**
- Title input (e.g. "Registration Form", `17/50` character counter)
- `Active` / `Draft` segmented control
- `English ▾` language switcher (multi-locale)
- `Desktop view ▾` (Desktop / Mobile preview)

**Preview body:**
- Renders the form live — exact same styles as the storefront would show
- For multi-step templates: progress indicator at top (3 dots), `Next` button instead of `Submit` until the last step
- Form has its own "Header" (Create an account / Complete form below to signup for Shopify account.) and "Footer" sections

---

## 2. Implied data model

```ts
type RegistrationForm = {
  id: string;
  title: string;                    // max 50 chars, internal label
  status: 'active' | 'draft';

  // Versioning per language
  locales: Record<string, FormLocale>;  // { en: {...}, es: {...} }

  // Layout (Appearance panel)
  appearance: {
    layout: 'default' | 'boxed';
    width: number;                   // px
    style: 'classic' | ...;          // probably 2-3 presets
    colors: {
      main: string;
      heading: string;
      label: string;
      description: string;
      option: string;
      paragraph: string;
      paragraphBackground: string;
    };
    background: { type: 'color' | 'image' | 'gradient'; color?: string; imageUrl?: string };
    customCss: string;
  };

  // The form structure
  steps: Array<{
    id: string;
    titleKey: string;                // "Tell us about yourself"
    fields: Array<FormField>;
  }>;
  hasHeader: boolean;
  hasFooter: boolean;

  // After submit
  afterSubmit: {
    action: 'clear_form' | 'redirect' | 'show_message';
    redirectUrl?: string;
    message?: Record<string, string>;    // per-locale rich-text HTML
  };

  // Email notifications
  notifications: {
    admin: {
      recipients: string[];          // comma-separated input parsed
      alsoSendToDynamicEmail: boolean;
      subject: Record<string, string>;
      contentHtml: Record<string, string>;
      limitContentWidth: boolean;
    };
    customerApproved: { subject: I18nStr; contentHtml: I18nStr; };
    customerRejected: { subject: I18nStr; contentHtml: I18nStr; };
  };

  // Error messages
  errorMessages: Record<string, {
    required: string;
    invalid: string;
    invalidName: string;
    invalidEmail: string;
    invalidUrl: string;
    invalidPhone: string;
    invalidNumber: string;
    invalidPassword: string;
    passwordMismatch: string;
  }>;

  // Account page wiring
  accountPage: {
    showAccountDetail: boolean;
    editAccountPage: boolean;        // generates /account?view=...
  };

  // Settings
  settings: {
    lockedPassword?: string;         // "Lock the registration page" feature
  };

  createdAt: Date;
  updatedAt: Date;
};

type FormField =
  | { type: 'text'; key: string; label: I18nStr; required: boolean; width: 'full' | 'half'; placeholder: I18nStr; helpText?: I18nStr }
  | { type: 'email'; ... }
  | { type: 'password'; ...; confirmPaired: boolean }   // shows duplicate icon
  | { type: 'phone'; ... }
  | { type: 'date'; ... }
  | { type: 'radio'; key: string; label: I18nStr; required: boolean; options: Array<{ value: string; labelI18n: I18nStr }> }
  | { type: 'select'; ... }
  | { type: 'address_block'; ... }
  | { type: 'country'; ... };

type I18nStr = Record<string, string>;   // { en: "...", es: "..." }
```

---

## 3. Merchant flow

1. `/registration-form` → click `Add new registration form`
2. Modal `Select Template` opens with 5 thumbnails. Click `Select` on one.
3. Land in `/registration-form/new` builder with the chosen template pre-populated.
4. Drag-and-drop / add / edit fields, customize Appearance, configure After submit, Email Notifications, Settings.
5. Top toolbar: switch language tab (English ▾) to localize. Top right: toggle Active/Draft. Desktop/Mobile preview.
6. Save via top contextual bar.
7. Form is now reachable on the storefront. Sami likely auto-creates a `/pages/registration` (or `/account/register`) Liquid section that embeds the form via JS.

Storefront flow (inferred):
- Customer fills the form on `/pages/registration` or wherever the merchant embedded it
- Submit → POST to Sami app proxy → creates a pending `Customer` in Shopify (probably tagged `pending-wholesale`) AND records the application in Sami's DB
- Admin email fires
- Merchant approves/rejects from `/registration-form/applications` (parallel of Stockly's `/app/customers/applications`)
- Customer email (approved/rejected template) fires
- On approve: Shopify Customer is tagged with the shop's wholesale tag

---

## 4. Gap analysis vs Stockly today

Stockly's `WholesaleApplication` model + `/app/customers/applications` is a fixed flat form. Sami is a **form builder**. This is a feature-class jump, not a feature addition.

| Sami concept | Stockly today | Gap |
|---|---|---|
| Form builder canvas | Hard-coded React form | NEW — needs schema-driven renderer |
| 5 templates | 1 hardcoded form | NEW — seed templates |
| Multi-step forms | Single page | NEW |
| Drag-and-drop reordering of fields | N/A | NEW |
| Per-field config (label/required/width/help) | N/A (fields are hardcoded) | NEW |
| Appearance (colors / Custom CSS / layout) | N/A — uses Polaris defaults | NEW |
| Multi-language (per-string i18n) | N/A | NEW |
| After submit actions | Redirects to thank-you, no editor | NEW (rich text editor + dynamic vars) |
| Email notifications (admin + customer approved/rejected) | NOT IMPLEMENTED (Stockly auto-tags but doesn't email — see B0-? in roadmap) | NEW (also needs SMTP/Mailgun/SES integration) |
| Configurable error messages | Hard-coded English | NEW |
| Lock the registration page (password gate) | N/A | NEW |
| Account page integration (show + edit) | N/A | NEW |
| Active/Draft state | N/A — every form is always live | NEW |
| Desktop/Mobile preview | N/A | NEW (nice-to-have) |
| Template library with thumbnails | N/A | NEW |

---

## 5. Shopify API / scope requirements

- **`customers/create` via Admin GraphQL** — Stockly already does this on approve (`approveCustomer.server.ts`). Same flow for the inbound application submit, but creating with `tags: ['pending-wholesale']` first, and the approve step adds the real wholesale tag.
- **Theme app extension / Online Store 2.0 section** — to embed the form on storefront. Stockly's existing `extensions/quick-order-form/` is a precedent.
- **App Proxy** — for form POST handling. Stockly already uses `/apps/stockly/apply` (App Proxy → `/proxy.apply.ts`).
- **SMTP / Mailgun / Postmark / SES** — Shopify Apps can't send email natively. Sami says "Please go to the app's General Settings to set up SMTP". We'd need:
  - Per-shop SMTP config OR shared Mailgun account
  - Email templating engine (Handlebars / Liquid-server)
  - Worker to send (Fly has no managed queue — would need cron or BullMQ on Redis)
- **No new Shopify scopes needed** beyond what Stockly already has (`write_customers`).

---

## 6. Suggested implementation phases (for the planning agent)

This is a large feature. Recommendation: ship in 4 phases, not 1.

### Phase 1 — Schema-driven form renderer (3-5 days)
- New Prisma model `RegistrationForm` (one per shop initially, multi-form later)
- New model `FormField` (or JSON column on RegistrationForm)
- Build a renderer component that takes the schema + locale and outputs a `<form>` with Polaris-styled fields (admin preview) and a vanilla-styled version (storefront)
- Storefront: theme app extension renders the schema fetched from App Proxy
- Migration: seed a single "Standard" RegistrationForm row from the existing hardcoded fields so the storefront keeps working
- No builder UI yet — just the renderer + seeded data

### Phase 2 — Admin builder UI (5-7 days)
- New page `/app/registration-form/:id` with the 3-pane layout
- Left rail panel switcher (start with Form elements + Appearance + Settings; defer After submit / Notifications / Integrations / Account page to Phase 4)
- Form elements panel: list + drag-and-drop reorder + per-field edit modal
- Appearance: 7 color pickers, Layout, Width, Custom CSS textarea
- Templates: seed 3 (Standard / Modern / Samita-style) — no template store, no Demographics/Address yet
- Multi-step containers: out of scope for Phase 2 (single step only)

### Phase 3 — Email notifications (3-4 days)
- SMTP integration (Mailgun account or per-shop SMTP credentials in Settings)
- Email template editor (TipTap or TinyMCE)
- Admin notification on application submit
- Customer notification on approve/reject (the manual buttons already exist in `/app/customers/applications` — just add the side-effect)
- Defer the "dynamic admin email based on form selection" feature

### Phase 4 — Polish (4-5 days)
- Multi-step forms
- Multi-language editor
- Configurable error messages
- After submit rich editor with dynamic variables
- Account page integration
- Lock the registration page (password)
- Active/Draft state
- Desktop/Mobile preview toggle
- Custom CSS sanitization

**Total estimate: 15-21 working days** for full Sami parity on this feature alone. That's a sprint by itself.

---

## 7. Decisions for the planning agent

1. **One form per shop, or N?** Sami implies N (list view + Add new). Stockly today has 1 hardcoded form. Picking N adds significant complexity (routing, default form selection, conflicts) for no current pilot need.
2. **Drag-and-drop library?** `react-dnd` vs `dnd-kit` vs HTML5 drag attrs. Polaris doesn't ship a primitive.
3. **Rich text editor for email + after-submit messages?** TipTap (modern, headless) vs TinyMCE (what Sami uses, ugly menus). Pick now or both editors will fork later.
4. **Email infrastructure?** Per-shop SMTP credentials are easier to ship but a UX burden on merchants. Shared Mailgun under our domain is easier for merchants but couples deliverability and adds a cost line.
5. **Templates as JSON in code vs DB-seeded?** Easier to evolve in code. Easier to "add new template" without deploy if in DB.
6. **Should this replace `WholesaleApplication` and `/app/customers/applications`, or live alongside?** Cleanest: replace. Safest: alongside with a migration path. The data model in `WholesaleApplication` is a strict subset of what a Sami-style form would store.

---

## 8. Pitch consequence (non-technical)

If Stockly ships the form builder + Volume Pricing + Customer/Market eligibility + Discount Methods, the feature gap vs Sami SILVER plan ($30/mo) is ~5% — Stockly would be at near-parity on the admin UX while still running on Shopify Basic. That's a strong sales narrative IF backed by stable infrastructure (email, scheduling, theme blocks).

---

## 9. Design system — MEASURED tokens (2026-05-29, via Claude browser)

> Sections 1–8 above were inferred from screenshots. This section is
> **measured live** from the Sami iframe on `desarrollo-adspubli` using
> Playwright `getComputedStyle`, so the numbers are exact, not guessed.
> Screenshots saved under `assets/sami-registration-form/`:
> `sami-01-landing.png` (empty state), `sami-02-form-list.png` (list),
> `sami-03-editor.png` (builder). Reproduce by navigating to
> `/apps/wholesale-sami/admin/registration-form` — the app renders in an
> iframe named `app-iframe` served from `d1vn7kssr6luje.cloudfront.net`;
> the builder canvas is a separate `previewFrame` (srcdoc).

### 9.1 The big finding: Sami's admin UI is **Shopify Polaris**, verbatim

Every admin surface (list, banner, builder chrome) uses Polaris tokens
unchanged. **Stockly already uses Polaris**, so replicating Sami's admin
look is not "design work" — it's using the same Polaris components we
already ship. Measured admin tokens:

| Token | Value | Polaris equiv |
|---|---|---|
| Font family | `Inter, -apple-system, system-ui, "San Francisco", "Segoe UI", Roboto, ...` | `--p-font-family-sans` |
| Page background | `rgb(241,241,241)` | `--p-color-bg` |
| Surface / card | `rgb(255,255,255)` | `--p-color-bg-surface` |
| Text default | `rgb(48,48,48)` | `--p-color-text` |
| Text subdued | `rgb(97,97,97)` | `--p-color-text-secondary` |
| Border radius | `8px` | `--p-border-radius-200` |
| Section heading ("Form elements") | 13px / weight 600 / `rgb(48,48,48)` | `Text variant="headingSm"` |
| Body / row text | 13px / weight 450 / `rgb(48,48,48)` | `Text variant="bodyMd"` |
| IndexTable header | 12px / weight 550 / `rgb(97,97,97)` on `rgb(247,247,247)`, padding `8px 8px 8px 12px` | `IndexTable` default |
| IndexTable cell | 13px / 450, padding `6px 8px 6px 12px` | `IndexTable.Row` |

Button variants measured:
- **Primary (gated/premium)** — "Add new registration form": white text, bg `rgba(0,0,0,0.17)` (this is the *disabled* state because the plan caps forms; an enabled Polaris primary is solid `rgb(0,0,0)` → `Button variant="primary"`). Has a small crown/upgrade icon.
- **Secondary** — "Lock the registration page": bg white, radius 8px, padding `6px 12px`, 13px/450, with the signature Polaris inset shadow `rgb(181,181,181) 0 -1px 0 0 inset, rgba(0,0,0,.1) 0 0 0 1px inset, rgb(255,255,255) 0 .5px 0 1.5px inset` → plain `<Button>`.
- **Tertiary** — "Views registered customers": bg `rgb(227,227,227)`, padding `4px 12px 4px 6px` → `Button variant="tertiary"` with icon.

### 9.2 The storefront form preview — the "boxed-form" template (what to actually replicate + improve)

This is the canvas the user wants "more worked". The "Standard" template
renders inside `previewFrame` with its own CSS (NOT Polaris — this is the
storefront output). Root CSS variables Sami exposes:

```css
:root{
  --samita_ws-rgs-form-width: 600px;          /* card max-width */
  --samita_ws-rgs-form-padding: 30px;
  --samita_ws-rgs-form-sm-padding: 15px;      /* mobile */
  --samita_ws-rgs-form-default-font-size: 14px;
  --samita_ws-default-heading-1-font-size: 26px;
  --samita_ws-default-heading-2-font-size: 19px;
  --samita_ws-default-heading-3-font-size: 17px;
  --samita_ws-rounded-radius: 20px;           /* "rounded" style preset */
  --samita_ws-border-radius-small: 8px;
}
/* Font choices the Appearance panel offers (Google Fonts):
   Montserrat, Roboto, Poppins. Default fallback when none picked = serif (Times). */
```

Measured computed values of the rendered "Standard" form:

| Element | Measured style |
|---|---|
| Card | bg white, radius **2px**, padding 30px, margin `30px 77px`, **max-width 600px**, shadow `rgba(0,0,0,.14) 0 2px 2px, rgba(0,0,0,.12) 0 3px 1px -2px, rgba(0,0,0,.2) 0 1px 5px` (Material elevation-2) |
| Heading `<h3>` "Create an account" | 26px / weight 600 / line-height 39px / black; font = template font (fell back to **Times serif** in our capture) |
| Subtitle | 16px / 400 / black |
| Label | 16px / 400 / black |
| Input | bg **`rgb(241,241,241)`**, **no border**, radius 2px, height 41px, font 14px, padding `10px 12px`, subtle shadow `rgba(50,50,93,.15) 0 1px 3px, rgba(0,0,0,.02) 0 1px 0` |
| Submit button | **Arial** 14px, white on **`rgb(0,0,0)`**, border `1px solid #000`, radius 2px, padding `11px 22px`, width 100px |
| Layout | 2-column grid (First/Last side by side, Password/Confirm side by side); Email full-width |

**"Standard" template fields** (measured, in order, all required):
`First Name` (text) · `Last Name` (text) · `Email` (text) · `Password` (password) · `Confirm password` (password).

> Design critique for "more worked" (the user's ask): Sami's default is
> dated — 2px radius, Material drop-shadow, gray flat inputs with no
> border, serif fallback heading, hard-black submit. To make Stockly's
> canvas feel more premium without leaving Polaris-adjacent tokens:
> bump radius to 8–12px, replace the Material shadow with a single soft
> shadow (`0 1px 3px rgba(0,0,0,.1)`), give inputs a 1px border + focus
> ring, ship a real default font (Inter), and use the merchant's brand
> color on the submit instead of pure black. Keep the 600px / 2-col grid
> structure — that part is fine.

### 9.3 Editor chrome — confirmations (correcting §1.3 inferences)

- **Edit URL is `/registration-form/{id}`** (e.g. `/registration-form/12265`), not `/new`. `/new` is only the create path; editing an existing form uses the numeric id.
- **Left rail = 7 section icons + 1 fullscreen toggle at the very bottom** (8 total, stacked at x≈8, ~44px apart). Confirms the 7-panel switcher in §1.3.
- **Top bar** (left→right): template name input + char counter `Standard 8/50`, `Active`/`Draft` segmented toggle, `English ▾` locale switcher, `Desktop view ▾`. App Bridge contextual save bar shows `Cambios sin guardar / Descartar / Guardar`.
- **SHORT CODE info banner** (blue) sits atop the canvas: `SHORT CODE: {SamitaWSRegistrationForm:MTIyNjU=} - Use this shortcode to embed the form to front store`. The merchant pastes this shortcode into a theme/page to render the form (so the embed mechanism is a **shortcode token**, not a theme app block — relevant for Stockly's storefront strategy).

### 9.4 List view — confirmed columns (matches user screenshot 4)

IndexTable with tabs `All / Active / Draft`, search + sort. Columns:
`☐ | Id (#12265) | Name (Standard) | Short Code (copyable chip {SamitaWSRegistrationForm:MTIyNjU=}) | Status (toggle switch) | Create At (2026-05-28 18:32:08)`.
Above it: the yellow "Protect your B2B registration page" banner with
`Lock the registration page` CTA, plus header actions
`Views registered customers` and the gated `Add new registration form`.

### 9.5 What this means for the Stockly build

Because the admin is pure Polaris and Stockly is already Polaris, the
"make it look exactly like Sami" requirement is essentially free for the
list + builder chrome — reuse `IndexTable`, `Tabs`, `Banner`, `Button`,
contextual save bar. The only real design effort is §9.2 (the storefront
form renderer), and there the recommendation is to **match Sami's
structure (600px, 2-col, shortcode embed) but modernize the styling** per
the critique above. This slots directly into Phase 1 (renderer) and
Phase 2 (builder) of §6.

### 9.6 Rail panels — measured live (corrects §1.3 inferences)

Clicked through each of the 7 rail icons and read the resulting panel
content. Measured mapping:

| # | Panel | Measured contents |
|---|---|---|
| 1 | **Form elements** | First Name, Last Name, Email, Password rows + `Add element` |
| 2 | **Appearance** | Layout `Default / Boxed`, Width (`px` input), Style `Classic`, color pickers: Main / Heading / Label / Description / Option (+ Paragraph, Paragraph background) |
| 3 | **After submit** | Action `Clear form`, dynamic vars `{{page.title}}` / `{{page.href}}` / "Show more", rich-text editor `(en)` with File/Edit/View/Insert/Format/Tools/Table menus |
| 4 | **Email Notifications** | "Also send to dynamic email", `{{data}}` (all visible input data), `{{page.title}}` |
| 5 | *indistinct* | Click landed on the same state as After submit — could not isolate a distinct 5th panel programmatically. §1.3 inferred "Integrations"; treat as unconfirmed. |
| 6 | **Customer tags** ⚠️ | "Add tag when customer is approved" + "Add Tags". **This corrects §1.3/§1.f**, which inferred icon 6 was "Settings / error messages". The measured panel 6 is customer **tagging on approval** — directly equivalent to Stockly's existing wholesale-tag-on-approve logic. (Error-message config likely lives under a different/secondary panel.) |
| 7 | **Account page** | "Edit account page", "Other Page" (gated, crown icon) |

Takeaway for Stockly: panel 6 (tag-on-approve) is a feature Stockly
**already has** server-side (`approveCustomer` tags the Shopify customer).
Surfacing it as a builder panel is pure UI. Panels 1, 2, 7 are the core
build; 3 and 4 (after-submit + email) map to the deferred Phase 3/4 work
and the still-open email-notifications gap.
