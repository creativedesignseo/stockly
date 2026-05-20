# 03 — Features (MVP v1.0)

## Principles

1. **5 features, done brilliantly** — not 50 features done OK
2. **Each feature is theme-native** — inherits brand styling automatically
3. **Each feature has a custom error path** — no Shopify generics
4. **Each feature works on mobile** — tested on 375px first

---

## F1 — Quick Order Form

### What it does
Wholesale customers see a single page (e.g. `/pages/wholesale-order`) with all eligible products in a table. They type quantities, see real-time pricing, and click "Add all to cart."

### User story
> "As a wholesaler, I want to add 50 SKUs to my cart in 30 seconds via a table view, without clicking into each product."

### Acceptance criteria
- [ ] Table renders all products customer is eligible to see
- [ ] Columns: image (thumb), title, variant (if multiple), SKU, price (B2B if applicable), qty input, line total
- [ ] Live search/filter (by title or SKU)
- [ ] Live total at bottom
- [ ] "Add all to cart" button — only enabled when ≥1 qty entered
- [ ] Mobile: collapsible cards instead of table, sticky total
- [ ] Empty state: branded, with link to product catalog

### Technical notes
- Theme App Extension block
- Fetch via Storefront API with customer's access token (per-customer prices)
- Web Component for table interaction (no React in theme)
- Debounced qty input → live total recalc

---

## F2 — Volume Pricing Display

### What it does
Shows tier pricing in real-time as quantity increases, with contextual nudges ("Add 20 more to unlock 10% off").

### User story
> "As a wholesaler, I want to see tier pricing in real-time as I increase quantities, so I know when adding more saves money."

### Acceptance criteria
- [ ] Tier table on product page (e.g. "1-9 units: $50, 10-49: $45, 50+: $40")
- [ ] Current tier highlighted based on current qty
- [ ] "Add X more to unlock next tier" nudge
- [ ] In Quick Order Form: shows per-line tier indicator
- [ ] In cart: per-line tier indicator
- [ ] Mobile: collapsible tier table

### Technical notes
- Tiers stored in `tiers` table (shop_id, product_id or collection_id, min_qty, discount_pct)
- Tier resolution: query tier matching current qty, fall back to base price
- Storefront-side calculation (no admin API on every keystroke)

---

## F3 — Branded Cart

### What it does
Replaces the default Shopify cart with a fully branded one. Inherits theme colors/fonts. Replaces generic Shopify error pages with branded messages.

### User story
> "As a wholesaler, I want a cart that matches the brand aesthetic, with clear messages when I'm short of minimums — not a generic Shopify gray page."

### Acceptance criteria
- [ ] Cart drawer (mobile/desktop) styled to match theme
- [ ] Wider cart option (configurable via admin)
- [ ] Custom empty state (branded, with CTA to keep shopping)
- [ ] Minimum quantity warning ON PRODUCT PAGE (prevents the error from happening)
- [ ] Minimum order value warning (if configured)
- [ ] Tier upsell banner ("add 50 more to save 10%")
- [ ] Custom checkout-blocked message (replaces Shopify generic error)

### Technical notes
- Theme App Extension blocks for cart drawer + cart page
- Override `cart.json` template
- Branded messages stored in `settings` table (per-shop, editable in admin)
- For checkout block: use cart attributes + checkout extensibility (when available on plan)

---

## F4 — Admin Configuration UI

### What it does
Store owner configures everything (tiers, branding, copy, customer eligibility) through a polished Polaris admin.

### User story
> "As a store owner, I want to configure tiers, messages, and branding without touching code or theme files."

### Acceptance criteria
- [ ] Dashboard: overview of B2B activity (orders this month, top wholesale customers, AOV)
- [ ] Settings → Branding: primary color, accent color, font family, logo upload
- [ ] Settings → Copy: editable text for all customer-facing messages (errors, hints, empty states, CTAs)
- [ ] Tiers manager: create/edit/delete tiers, apply to product or collection
- [ ] Customer eligibility: select tag(s) and/or Company filter
- [ ] Preview mode: see storefront with current settings before publish

### Technical notes
- Polaris React components
- App Bridge embedded
- Auto-save with debounce (don't make user click Save constantly)
- Optimistic UI updates

---

## F5 — Custom Error Messages

### What it does
Every customer-facing error that Shopify would normally show as a generic gray page becomes a branded message instead.

### User story
> "As a wholesaler, I want clear branded messages when I don't meet minimums — not Shopify's generic 'minimum quantity not met' page."

### Acceptance criteria
- [ ] "Minimum quantity not met" → branded message on product page (prevents page navigation)
- [ ] "Minimum order value not met" → branded banner in cart
- [ ] "Product not available to this customer" → branded message instead of 404
- [ ] "Quantity exceeds available stock" → branded message inline
- [ ] All messages: editable text in admin

### Technical notes
- Most are prevented at the source (Quick Order Form + product page warn before submit)
- Cart-level: intercept with Shopify Functions or cart transform (if plan supports)
- Use cart attributes to flag B2B context so messages adapt

---

## Future features (post-MVP)

See [PROJECT.md](../PROJECT.md) Phase 2 features table:
- F6 Contextual upsells
- F7 Customer-specific catalogs
- F8 Quote system
- F9 Net 30/60 display
- F10 Reorder from history
- F11 Analytics dashboard
- F12 Bulk import (CSV/Excel)
