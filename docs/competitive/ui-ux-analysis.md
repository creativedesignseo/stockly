# UI/UX Analysis — Sami Wholesale vs BSS B2B Solution vs Stockly

> Live competitive UX research performed 2026-05-27 using Claude in Chrome
> to navigate both apps inside `desarrollo-adspubli.myshopify.com`.
> Captured 12+ screenshots across all major sections of each app.
> The goal: identify patterns worth adopting in Stockly, patterns to
> avoid, and prioritize a UI roadmap.

**Method:** Claude-in-Chrome MCP navigates the Shopify admin, clicks
through each app's sidebar, captures screenshots, reads accessibility
trees. No DOM scraping needed — we evaluate visually as a human merchant
would.

---

## TL;DR

Both Sami and BSS solve the same B2B problem with different UX
philosophies. Stockly today is closer to a **bare CRUD admin** than to
either competitor. The shortest path to feeling "professional" is to
adopt 5 specific patterns from these apps (none of them complex) — see
the Roadmap section.

The **single highest-leverage pattern** is a **Setup Guide widget with
progress bar** on the dashboard. Jonatan explicitly called this out
("me llama la atención una funcionalidad que va como guiando a la
configuración") and both Sami and BSS have it. It guides first-time
merchants through theme integration → pricing → registration form →
testing in one persistent, dismissible card.

---

## Sami Wholesale — pattern catalog

**Tech vibe:** custom CSS that breaks Polaris consistency, but with
strong information design and clear empty states. English-only (a
weakness for EU merchants). Pushes adjacent apps (B2B Lock) heavily
via inline banners.

### Dashboard
- "Hello Jonathan Montilla 👋 FREE plan" header with plan badge
- KPI row: Wholesale Revenue · Completed Orders · Pay Later Orders ·
  Customer Approvals (with sparkline placeholders)
- "Last 7 days" range pill
- **Setup Guide widget** dismissible, 4 steps:
  1. Integrate Theme — expanded by default with CTA "Go to Integrate Theme"
  2. Pricing (collapsed)
  3. Wholesale Registration (collapsed)
  4. Quick Order Form (collapsed)
- Right column:
  - "Need A CSS Adjustment?" promotional card (green gradient) —
    "Our engineers (Haley & Joanna) can help" → contact support CTA
  - "Recent activity" widget — "See what happen most recently
    across customers, orders and pricing workflows" + History link
  - "Active app blocks" widget — "You have 0 active app blocks
    on your store" + Refresh link

### Feature pages (Wholesale Pricing, Volume Pricing, Registration Form)
- **Consistent empty state pattern**:
  - Page title
  - Centered illustration (~280px wide)
  - "Let's create your first X" heading
  - One-line description
  - Two CTAs: "Learn more" (text) + "Add new X" (primary, dark button)
- **Upsell banner above the empty state** on some pages:
  - Wholesale Pricing → B2B Lock app upsell
  - Registration Form → "Protect your B2B registration page" with
    "Lock the registration page" CTA
- Bottom card "How to set it up?" with "Chat now 😊" button

### Quick Order Form — 3-card sub-feature picker
- Three large cards side-by-side: Quick Order Form / Collection Quick
  Buy / Variants Tables
- Each card: illustration + name + description + chip showing where it
  applies ("Custom pages", "Collection pages", "Product page") +
  "Create" button (some greyed-out behind a paywall star)
- Top upsell banner: "Protect your wholesale pages"

### Add-on Features — toggle grid with section headers
- Section: **Checkout & Payment Rules** — 4 cards (Order limit, Extra
  fee, Payment term, Invoice payment) each with a toggle, screenshot
  thumbnail, description, "Setup X" link
- Section: **Tax Settings** — 2 cards (Tax exempt, Tax display)
- Section: **Advanced / B2B Settings** — Shipping rate, Wholesale cart
- Each toggle persists state visually (on/off)

### Settings — vertical sub-nav
- Left column: store name card + sub-nav
  - General ✓
  - Notifications
  - PDF templates
  - Translations
  - Public API
- Right column: the active sub-section's settings
- General settings groups:
  - "Wholesale pricing" (Show original price dropdown, Cart discount combination toggle)
  - "Checkout discount methods" (Discount code text)
  - "Automatic order tags" (tag chips input)
  - "Google reCaptcha" (reCaptcha type)

---

## BSS B2B Solution — pattern catalog

**Tech vibe:** Spanish-localized completely, more Polaris-aligned than
Sami, heavy use of plan-tier badges on every feature (constant
upselling). Cards are functional but visually dense. Custom illustrated
icons per feature.

### Dashboard
- "Hola desarrollo-adspubli 👋" with FREE plan badge
- Top-right: "Spanish (Español)" language picker + "Que viene!" link
  (changelog/news)
- **Guía de configuración** widget — "1 de 4 tareas completas" with
  **a real horizontal progress bar** filled to 25%:
  1. ✅ Habilitar bloque de incrustación de la aplicación
  2. ⚪ Crear formulario de registro (expanded, with illustration
     thumbnail and CTA "Explorar formulario de registro")
  3. ⚪ Instalación
  4. ⚪ Habilitar función
- **Resumen B2B** section with "Ver plan de precios" link
- 4 KPI cards: Ingresos totales generados · Valor promedio por pedido ·
  Total de clientes aprobados · Solicitudes B2B pendientes
  - Each card shows "0.00 EUR / on 0 B2B orders created" + Manage link
- Right column:
  - **Estado del app embed: Deshabilitado** (yellow warning) — "Activa el
    app embed en el Editor de Temas de Shopify para mostrar precios B2B,
    reglas y widgets en tu tienda" + "Abrir editor de temas" link
  - **Módulos activos** — "Se han desactivado todos los módulos"
  - **Bloques de aplicación activos** — count + refresh link

### Feature directories (Precios B2B, Gestión de clientes, etc.)
- Card grid layout (typically 2 columns × N rows)
- Each card has:
  - Custom illustrated icon in the header
  - Feature name + **"Disponible en el plan Essential/Advanced/Platinum"
    badge** (colored, prominent)
  - One-line description
  - 3-4 sub-links stacked: "Configuración" / "Instalación" / "Ajustes" /
    "Historial de uso"
- All sub-links use the same visual weight regardless of importance

### Sections covered
- **Precios B2B**: Precios personalizados / Lista de precios / Precios
  por volumen / Tarifa de envío / Cargo adicional
- **Gestión de clientes**: Formularios de registro / Etiquetas automáticas
- **Gestión de pedidos**: Límites de pedido / Campos personalizados /
  Pedidos manuales / Incrementos de cantidad / Condiciones de pago neto
- **Descuento**: Códigos de descuento (single card)
- **Impuesto y moneda**: Exención de impuestos / Visualización de impuestos
  / Moneda múltiple
- **AAPI pública** (sic — typo for "API pública"): tabs "Clave API /
  Registros y uso", gated behind Plan Platino

### Other touches
- Purple "B2B" floating bubble chat widget bottom-right
- "Aprender más sobre B2B/wholesale Solution Public API" footer link

---

## Patterns to ADOPT in Stockly (priority-ranked)

### P0 — Highest leverage, immediate adoption

#### A. Setup Guide widget on dashboard (the one Jonatan flagged)
Both Sami and BSS have this. BSS has the **progress bar**, which is
strictly better.

**What:** Dismissible card on `/app` showing 4-5 setup steps with
checkmarks. Each step has a 1-line description + a CTA button.

**Stockly version (proposed steps):**
1. Activate theme app embed (block "Wholesale Registration" in theme)
2. Configure pricing (baseline % + FPQ)
3. Create your first tier
4. Test wholesale flow (preview as customer)
5. Add support email for wholesale inquiries

Implementation: a self-contained Polaris Card in `app._index.tsx`.
Step completion derives from DB state (theme block present? at least
1 tier? etc.). Persists via Shop.onboarded.

**Effort:** ~3 hours. **Impact:** very high. First impression for every
merchant who installs.

#### B. KPI row on dashboard
Both apps lead with 4 metrics. Stockly today shows similar cards but
the data structure is decent — we can compute these from our DB +
Shopify queries.

**Stockly version:**
- **Wholesale revenue (last 30 days)** — sum of orders tagged
  `wholesale-order` (once order tagging lands B0-5)
- **Pending applications** — count of `WholesaleApplication`
  status="pending" (we already show this)
- **Qualified customers** — count of `WholesaleCustomer` with
  qualifiedAt != null (we already show this)
- **Average wholesale order value** — derived from same orders query

**Effort:** ~4 hours (the first metric needs a `WholesaleOrder`
tracking concept; the others are already in DB).

#### C. Empty-state illustration + clear CTA per page
Today our `/app/tiers`, `/app/customers/applications` etc. have empty
states but no illustration. Both Sami and BSS invest in custom
illustrations per page. We don't need custom illustrations — Polaris
ships `EmptyState` component with stock images.

**Effort:** ~1 hour total. Sweep all empty pages.

#### D. "App embed status" warning banner on dashboard
BSS shows a yellow warning if the theme app embed isn't activated:
**"Activate the app embed in Shopify Theme Editor to show B2B prices,
rules and widgets in your store"** + "Open theme editor" CTA.

This is critical: without the theme embed, Stockly's storefront blocks
don't render. Today a merchant could install Stockly and never see any
wholesale UI on their store, and have no idea why.

**Stockly version:** loader checks if the embed block is active via
Shopify Theme API → if not, render a critical Banner at top of `/app`
with a deep link to Theme Editor opening the embed slot.

**Effort:** ~2 hours.

### P1 — High value, slightly bigger lift

#### E. Settings with vertical sub-nav
Stockly today has a flat `/app/settings/pricing`. Sami has a clean
vertical sub-nav with 5 sub-sections. We'd benefit from:
- `/app/settings/pricing` (current — baseline + FPQ + MOQ)
- `/app/settings/branding` (logo, colors for storefront blocks)
- `/app/settings/notifications` (email merchant on new application)
- `/app/settings/translations` (block copy in ES/EN/etc.)
- `/app/settings/api` (API key for ERP integrations — Platinum-tier feature)

**Effort:** ~1 day for the layout + 4 pages.

#### F. Sub-feature picker pattern (3-card layout)
Sami's Quick Order Form page uses this: instead of one page = one
feature, the page hosts 3 sub-variants of the same feature with
illustrations. Stockly could use this for:
- "Storefront integration" page with cards for: Registration Form /
  Quick Order Form / Wholesale Banner / Product Panel (each = a theme
  block we ship)

**Effort:** ~3 hours.

#### G. Recent activity widget on dashboard
Shows last 5-10 events (applications, qualifications, tier changes).
We have the data; we just don't surface it.

**Effort:** ~2 hours.

### P2 — Nice to have, lower priority

- **Chat support widget** bottom-right (Sami has Crisp/similar, BSS has
  custom). Adspubli has its own support — could integrate Crisp pointing
  to `soporte@adspubli.com`.
- **Language switcher in header** (BSS has full ES localization). We're
  already Spanish-primary admin but English-default labels in many places.
- **"What's new" / changelog button in header** (BSS's "Que viene!").
  Easy with a JSON-driven modal.

---

## Patterns to AVOID

### From Sami
- ❌ **Cross-app upsell banners** (B2B Lock on the Pricing page,
  Wholesale Pages Protect on QOF page). Looks spammy. Stockly's a
  single product — keep the surface clean.
- ❌ **Custom non-Polaris styling** (gradients, custom green bar) — drifts
  from Shopify Admin look, looks "third-party". We use Polaris.

### From BSS
- ❌ **Plan-tier badges on every single feature card** ("Disponible en
  el plan Advanced", "Plan Platinum"). Aggressive upsell that creates
  cognitive load. We have 3 tiers but should gate via dimmed state or
  feature flag, not stamp it on every card.
- ❌ **Triple sub-link cards** ("Configuración / Instalación / Ajustes"
  on every feature card). 3 similar entries to the same feature is
  confusing — pick one canonical entry.
- ❌ **Information-dense card grids** (some pages have 5-6 cards each
  with sub-links). Overwhelming. Polaris recommends 2-3 cards max per
  page or a true Index.

### From both
- ❌ **Empty pages where the entire content area says "Add your first X"**
  with no other entry. Better UX: page header + brief explanation +
  empty state in a card.

---

## Stockly UI Roadmap (next 1-2 sessions)

Concrete order based on the patterns above. Total effort estimate:
**~2 working days** to close the visible-UX gap with Sami/BSS.

### Day 1 (~6h) — Dashboard transformation
| Order | Task | Effort | Pattern source |
|---|---|---|---|
| 1 | **Setup Guide widget** with progress bar + 4 steps | 3h | BSS + Sami |
| 2 | **App embed status banner** (critical alert if theme block missing) | 2h | BSS |
| 3 | Improve existing KPI cards (real data, sparkline placeholders) | 1h | Both |

After Day 1: a merchant installing Stockly for the first time sees a
guided onboarding flow on the dashboard, instead of a static
"Suggested next steps" widget.

### Day 2 (~6h) — Page-level polish
| Order | Task | Effort | Pattern source |
|---|---|---|---|
| 4 | Empty-state illustrations on all 5 admin pages | 1h | Both |
| 5 | New `/app/customers` page (list of wholesale customers) | 3h | — (own gap) |
| 6 | Recent activity widget on dashboard | 2h | Sami |

After Day 2: every page has a clear empty state, the customer list
gap is filled (#1 issue Jonatan flagged), recent activity is visible.

### Day 3+ (later) — Polish
- Settings with vertical sub-nav (1 day)
- Chat widget integration (half day)
- Theme block sub-feature picker page (half day)

---

## Evidence / Screenshots

12 screenshots captured 2026-05-27 from
`desarrollo-adspubli.myshopify.com` via Claude in Chrome MCP. Saved to
the Chrome extension's screenshot cache (referenced by `ss_*` IDs in
session logs). For visual reference, re-run the capture procedure or
view the original session transcript.

**Sections captured:**
- Sami Wholesale: Dashboard, Wholesale Pricing, Volume Pricing,
  Registration Form, Quick Order Form, Add-on Features, Settings
- BSS B2B Solution: Dashboard, Precios B2B, Gestión de clientes,
  Gestión de pedidos, Descuento, Impuesto y moneda, AAPI pública

---

## Decision point for Jonatan

Three viable paths forward:

1. **Day 1 — Dashboard transformation** (~6h): biggest wow-factor change.
   New merchants see a guided onboarding, KPIs, embed warning. This is
   what you flagged ("eso me gusta") and is the highest first-impression
   impact.

2. **Day 2 — Page-level polish + customers page** (~6h): closes the
   `/app/customers` gap (you said yesterday you didn't understand why we
   were proposing this — now you've seen Sami and BSS, the gap is
   obvious — both have a customer-management surface).

3. **Both days in sequence** (~12h, 2 sessions): full UI sweep to
   competitive parity. End state: Stockly looks at least as polished as
   Sami, with cleaner Polaris consistency than either competitor.

My vote: **start with Day 1's Setup Guide widget** (item #1) as a
single 3-hour session today. It's the smallest viable demonstration of
the new direction. If you like it, we continue. If you want to course-
correct, we've only invested 3 hours.
