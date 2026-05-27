# Sami Wholesale — Volume Pricing (reverse-engineering notes)

> Built 2026-05-27 from live Sami install on `desarrollo-adspubli.myshopify.com`.
> Purpose: brief the implementation agents that will build Stockly's
> equivalent. Notes are descriptive (what Sami does), not prescriptive
> (what Stockly should do). The implementation plan + ADR happens in
> a separate step.

URL pattern observed: `/apps/wholesale-sami/admin/volume-pricing` (list) and `/apps/wholesale-sami/admin/volume-pricing/new` (create). The `/new` route renders the create form directly — no intermediate template picker like Registration Form.

---

## 1. UI map

### 1.1 List view (`/volume-pricing`)

Empty state:
- Title "Volume Pricing"
- Top-right action: `Import` (locked behind plan, crown icon)
- Card with illustration of a volume pricing table preview
- CTA `Add new volume pricing`
- Secondary `Learn more`

Populated state (inferred from Wholesale Pricing list — same pattern):
- Tabs: All / Active / Draft / Expired / Pending
- IndexTable columns: Id / Name / Status / Apply Customers / Apply Products / Apply Markets / Created
- Status column = inline toggle
- Row click → `/volume-pricing/:id`

### 1.2 Create / edit form (`/volume-pricing/new`)

Layout: Polaris `Page` with two columns. Left = form, right = live preview sidebar. App Bridge contextual save bar at top ("Cambios no guardados / Descartar / Guardar").

Page heading: `← New Volume Pricing [Active badge]`

**Left column cards (top→bottom):**

#### Title
- Text input, helper "This will only be visible to you."

#### Apply to Customers
- Radio group:
  - `All customers` — "All website visitors whether or not they are logged in"
  - `Logged-in customers` (default-selected in template)
  - `Customer tags` — disabled, "Upgrade to SILVER Plan to use this feature"
- Sub-card "**Exclude Customers**" — disabled, SILVER plan

#### Apply to Markets
- Radio group:
  - `All markets` (default)
  - `Specific markets` — disabled, SILVER plan

#### Apply to Products
- Radio group:
  - `All products`
  - `Specific products or variants` (default in template)
  - `Specific collections` — disabled, SILVER plan
  - `Product tags` — disabled, SILVER plan
- Toggle: `set pricing for products variants` (with ⓘ tooltip)
- Search input "Search products" + `Browse` button
- Empty-state illustration "Search or browse to add products"

#### Design table
- Collapsible section (collapsed by default). Likely lets the merchant configure column headers / colors / row striping for the storefront table.

#### Discount Range (the heart of the feature)
- Info banner explaining Discount Type semantics:
  > "Fixed Price means that the wholesale price is given as a fixed amount of retail price that won't be changed even the retail price is changed.
  > Example: the retail price of the item is 100$ and you set 70$ as 'Fixed Price' then customers will see 70$ as final price.
  > Price Per Item should be less than or equal to the retail price of the item."
- Table with columns: `Quantity from | Quantity to | Discount Type | Discount Value | 🗑`
- `Quantity from` and `Quantity to` are integer inputs (range, inclusive)
- `Discount Type` dropdown — at least three values:
  - `Percent` (default) — value is `%`
  - `Fixed Price` — value is final price (currency)
  - `Price Per Item` — value is per-unit currency
- `Discount Value` adapts (`%` suffix, currency prefix, etc.)
- One trash icon per row
- `Add range` button below table

#### Discount Methods (GOLD plan)
All three options disabled with "Upgrade to GOLD Plan to use this feature":
- `Same Variant` — "buy multiple units of the exact same variant. Example: Buy 2 Large Red shirts → discount applied"
- `Mix Variants` — "mix different variants of the same product. Example: Buy 1 Large Red shirt + 1 Medium Blue shirt → discount applied"
- `Mix Products` — "mix different products that you've selected in this rule. Example: Buy 1 T-shirt + 1 Hoodie (both selected in the rule) → discount applied"

(Stockly's `aggregation = per_line | cart_total` covers Same Variant and Mix Products. Mix Variants is between them: same product, any variant.)

**Right column sidebar (top→bottom):**

#### Status
- Card with `Active` badge + toggle. Mirrors `Tier.active` in Stockly.

#### Show Table on Product Page
- Toggle. When ON, the volume pricing table renders on the storefront PDP for any product in scope.

#### Preview table
- `Change Template` link → opens "Select Template" modal (templates list is loaded async; observed loader spinner). Implies multiple table presentations (different headers, color schemes, with/without strikethrough, etc.)
- `Preview: Example Price "€100,00"` heading
- Live table rendering the merchant's current ranges + discount values, sample €100 unit. Example seen:
  - `10 - 19 | €90.00`
  - `20 - 29 | €80.00`
  - `30 - 39 | €70.00`
  - `40 - 49 | €60.00`
  - `50 +   | €50.00`

#### Tip banner
- "go to Translation to edit the content of the table" — implies the table strings are translatable per language.

#### Active dates (SILVER plan)
- Disabled card with explanation: "START DATE allows you to set the activation date and time and the SET END DATE allows you to set the expiration date and time."
- Checkbox `Start date` (disabled)
- Checkbox `End date` (disabled)

---

## 2. Implied data model

```ts
type VolumePricing = {
  id: string;
  title: string;                   // internal label, max ~50 chars
  status: 'active' | 'draft' | 'expired' | 'pending';

  // Customer scope (mirrors Wholesale Pricing — same eligibility card)
  customerEligibility: 'all_customers' | 'logged_in' | 'customer_tags' | 'specific_customers';
  customerTags?: string[];          // when 'customer_tags'
  customerIds?: string[];           // when 'specific_customers'
  excludedCustomerTags?: string[];  // SILVER
  excludedCustomerIds?: string[];   // SILVER

  // Market scope
  marketEligibility: 'all_markets' | 'specific_markets';
  marketIds?: string[];             // when 'specific_markets'

  // Product scope
  productScope: 'all_products' | 'specific_products' | 'specific_collections' | 'product_tags';
  productIds?: string[];            // GIDs (mix of Product / ProductVariant when "set pricing for products variants" is on)
  variantPricing: boolean;          // the "set pricing for products variants" toggle
  collectionIds?: string[];         // SILVER
  productTags?: string[];           // SILVER

  // The discount tiers themselves — N rows per rule
  ranges: Array<{
    quantityFrom: number;
    quantityTo: number | null;       // null = "50+" (open-ended upper bound)
    discountType: 'percent' | 'fixed_price' | 'price_per_item';
    discountValue: number;           // 10 (=%) | 90 (=€ final price) | 90 (=€ per unit)
  }>;

  // Discount Method (GOLD)
  discountMethod: 'same_variant' | 'mix_variants' | 'mix_products';

  // Storefront presentation
  showTableOnProductPage: boolean;
  tableTemplateId: string;           // selected from "Change Template" modal

  // Scheduling (SILVER)
  startDate?: Date;
  endDate?: Date;

  createdAt: Date;
  updatedAt: Date;
};
```

---

## 3. Merchant flow

1. `/volume-pricing` → click `Add new volume pricing`
2. Lands on `/volume-pricing/new` with title `New Volume Pricing`, status `Active` (badge), default eligibilities all set to broadest free-tier option (Logged-in customers, All markets, Specific products).
3. Merchant types Title, picks Apply-to-* options, browses to pick N products/variants.
4. Adds N discount ranges (Add range button). Each row independently picks Discount Type.
5. Right sidebar live-updates the Preview table.
6. Optionally toggles `Show Table on Product Page`.
7. Save bar at top → Guardar.
8. List view shows the new row.

---

## 4. Gap analysis vs Stockly today

| Sami concept | Stockly today | Gap |
|---|---|---|
| **1 Volume Pricing = N ranges** | 1 Tier = 1 range (minQty + discountPct) | Need to group N tiers under one parent rule OR change Tier model. |
| Discount Type `Percent` | `discountType: percentage` ✓ | OK |
| Discount Type `Fixed Price` (final price) | Not modeled. We have `fixed_amount` (off per unit) — different semantic. | NEW |
| Discount Type `Price Per Item` | `discountType: fixed_amount` (off per unit, applied via baseline composition) | Close but Sami's is the FINAL per-unit price, ours is the DEDUCTION per unit. Different math. |
| `quantityTo` upper bound | `minQty` only (open-ended) | NEW (need to add ceiling on each band) |
| Apply to Customers (4 modes) | Just added (`customerEligibility`) ✓ | OK |
| Apply to Markets | Just added (UI only, no Function logic) ✓ | OK |
| Apply to Products — multi-product picker | Just added (`scopeIds[]`) ✓ | OK |
| Apply to Products — Specific collections | `scope: collection` (storefront only) | Partial (no checkout enforcement) |
| Apply to Products — Product tags | NOT supported | NEW |
| Discount Methods (Same Variant / Mix Variants / Mix Products) | `aggregation: per_line | cart_total` | Need to add Mix Variants (between per_line and cart_total). |
| Show Table on Product Page | Quick Order Form (different concept) | NEW (per-rule storefront table widget) |
| Change Template modal | NOT supported | NEW |
| Active dates (start/end) | NOT supported | NEW (Tier.startsAt + endsAt + cron to flip active) |
| Translations of table strings | NOT supported | NEW (per-locale overrides) |
| Status: draft / expired / pending | Just `active: boolean` | NEW (state machine) |

---

## 5. Shopify API / scope requirements

- **`localization.market.id`** in Function input — required for `apply_to_markets='specific_markets'`. Already mentioned in Customer-eligibility doc.
- **`customer.metafield`** or a tag-union approach in `input.graphql` — required for per-rule `customer_tags`.
- **Customer search modal** — Sami uses a custom one (Shopify ResourcePicker doesn't support `customer`). Build with Admin GraphQL `customers(query:)` + Polaris Combobox.
- **Collection membership in Function input** — already a known gap (ADR-008 P0 #3 sidesteps it). Sami likely defers collection-scoped pricing to storefront only too.
- **Product tag membership in Function input** — `merchandise.product.hasAnyTag(tags: [...])` exists but tags are baked at deploy time (same limitation as customer tags).
- **Scheduling** — Active dates require either:
  - A cron worker that flips `active` at start/end times, OR
  - The Function reads `startsAt/endsAt` from metafield and filters in WASM. Simpler if we just trust the Function (no cron needed).

---

## 6. Suggested implementation phases (for the planning agent)

Phase 1 — Repurpose Wholesale Pricing as the technical foundation (it already has 90% of what Volume Pricing needs):
- Add `quantityTo` to Tier (nullable, last range can be open-ended)
- Add `discountType: 'fixed_price'` (final per-unit price), keep existing `percentage` + `fixed_amount`
- Group ranges by a new `Rule` parent (`Rule has many Tier`) OR keep flat with a `groupId` field
- Optional `startsAt` / `endsAt` (no cron — Function reads metafield and filters)
- New page `/app/volume-pricing` reuses the same form components

Phase 2 — Storefront table widget (Show Table on Product Page):
- New theme app block "Volume pricing table" that calls App Proxy to fetch the current product's rule + ranges and renders the table
- 2-3 template presets baked in (not a modal-loaded library at first)

Phase 3 — Discount Methods (Same Variant / Mix Variants / Mix Products):
- Add `aggregation: 'mix_variants'` (sum qty across variants of the same product, scope-aware)
- Update Function to compute the right cart-qty key per aggregation mode

Phase 4 — Active dates + Status state machine:
- `Rule.status` enum, scheduled flips
- "Draft" tab shows future-dated rules; "Expired" shows past-end ones

---

## 7. Decisions for the planning agent

These are open questions that need a decision before code:

1. **Same model or new model?** Reuse `Tier` table with a parent `Rule` row, or create `VolumePricing` as a sibling model?
2. **Quantity ranges as DB rows vs JSON?** N ranges per rule — keep as separate rows (current Tier pattern) or as a JSON column on Rule?
3. **Are Wholesale Pricing and Volume Pricing the same thing in Stockly's mental model, or do we keep two URLs like Sami?** Sami has `/wholesale-pricing` AND `/volume-pricing` as distinct UIs that both ultimately drive the same checkout discount.
4. **Discount Type semantics — `Fixed Price` vs `Price Per Item`** — do we ship both? They overlap heavily with each other and with the existing `fixed_amount`.
5. **Templates for the table widget** — bake 3 in code, or build a real template store?
