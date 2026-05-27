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
