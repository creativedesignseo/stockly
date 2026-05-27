# Volume Pricing — Implementation Plan

> Planning artifact. Implementer follows steps top-to-bottom. **No code
> in this file** — only file paths, line cues, and decisions.
>
> Owner: stockly-orchestrator. Drafted 2026-05-27 from the inputs in
> `docs/competitive/sami-volume-pricing.md` + the pre-approved
> architecture decisions handed down by Jonatan.

---

## 1. Goal

Extend the existing `/app/pricing` rule editor so a single rule can
declare **N quantity bands** (Sami "Volume Pricing"), introducing a
new `fixed_price` discount type, an active-date window, and the
`mix_variants` aggregation mode — all without breaking the Piro
Jewelry pilot's live single-band tiers.

---

## 2. Architecture summary (the 7 decisions, recapped)

1. **Single URL.** `/app/pricing` remains the only entry point.
   "Volume Pricing" is just a rule with `N > 1` bands. Single-band
   rules continue to work unchanged.
2. **Schema additions to `Tier`:** `quantityTo Int?` (null on last
   band = open-ended), `groupId String?` (rules with the same
   `groupId` form one logical Volume Pricing rule).
3. **New `discountType = 'fixed_price'`** (final per-unit price,
   overrides retail). Joins the existing `percentage` and
   `fixed_amount`. **Do not ship `price_per_item`** — duplicates
   `fixed_amount` semantically.
4. **Active dates** (`startsAt`, `endsAt` on `Tier`) read by the WASM
   Function at run time. **No cron, no scheduled worker.**
5. **"Show Table on Product Page" toggle:** ships UI + storage
   (boolean on the rule + a reserved `tableTemplateId` slot) in
   Phase 1; the actual theme app block is Phase 2. UI surfaces a
   banner stating the widget ships in Phase 2.
6. **`aggregation = 'mix_variants'`:** third aggregation, between
   `per_line` and `cart_total`. Sums qty across variants **of the
   same product** within scope.
7. **Back-compat is non-negotiable.** Existing tiers keep applying.
   The Function reads both legacy (no `groupId`, no `quantityTo`,
   no `startsAt/endsAt`) and new metafield shapes for at least one
   release cycle.

How they hang together: groupId is the unit of presentation; bands
inside a group are still individual `Tier` rows (so all existing
queries, sync code, and Function evaluation paths work band-by-band
unchanged). Active dates and the new discount type live per-band but
in practice the form will write the same values to every band in a
group. `mix_variants` is a per-rule aggregation choice; the Function
groups eligible lines by `product.id` instead of by line id
(per_line) or globally (cart_total).

---

## 3. Schema migration

File: `prisma/schema.prisma` (model `Tier`, lines 110-193).

Add these fields:

- `quantityTo Int?` — upper bound (inclusive). Null = open-ended.
  Only valid on the band with the highest `minQty` inside a group;
  the service layer enforces this invariant.
- `groupId String?` — cuid string. All bands of one Volume Pricing
  rule share this. Nullable for one release cycle so legacy reads
  don't crash; the back-fill below populates it for every existing
  row before any new code paths depend on it.
- `discountFixedPrice Float?` — used when `discountType = 'fixed_price'`.
  Per-unit final price in shop currency. Null otherwise.
- `startsAt DateTime?` — when the band becomes active. Null = no
  start gate.
- `endsAt DateTime?` — when the band expires. Null = no end gate.
- `showTableOnPdp Boolean @default(false)` — Phase-1 storage for
  the storefront-table toggle.
- `tableTemplateId String?` — reserved (Phase 2 template picker).

Add a new index:
`@@index([shopId, groupId])` — supports the list-view aggregation
query (`distinct on groupId` or equivalent in-memory rollup).

### Back-compat migration step (the critical part)

Because we use `prisma db push` against prod (per HANDOFF "Open
decisions" and `tasks/current.md`), this is **not** a SQL migration
file. Sequence:

1. Edit `schema.prisma` with the additions above. Keep `groupId`
   nullable.
2. Run `npm run prisma:generate` locally to refresh the client.
3. Add a back-fill script `scripts/backfill-tier-groupids.ts` that
   wraps a single transaction:
     - Find every `Tier` with `groupId IS NULL`.
     - For each row, set `groupId` to a fresh `cuid()` (one per row
       — every legacy tier becomes its own 1-band group, which is
       the right semantic).
     - Same query also sets `quantityTo = null` (already the default
       but explicit for clarity) and leaves `discountType` /
       `discountAmount` untouched.
4. Locally: `npx prisma db push` then run the back-fill against
   the dev DB. Confirm `SELECT count(*) FROM "Tier" WHERE groupId
   IS NULL;` returns 0.
5. Document in HANDOFF that production needs the same two steps
   in order: `prisma db push` (additive only, safe), then run the
   back-fill via `fly ssh console -a stockly-lustrous-forest-4364
   -C 'node /app/scripts/backfill-tier-groupids.js'`.
   **The plan does NOT execute production steps** — that's
   `deployment-guardian` territory.

**Why nullable:** if we made `groupId` required, `prisma db push`
would refuse to apply against the live DB (existing NULLs). Keeping
it nullable lets the schema land first, then back-fill, then
optionally tighten the column in a follow-up.

---

## 4. Service layer changes — `app/services/tiers.server.ts`

### 4.1 Type additions

- Extend `TierDiscountType` (line 185):
  `'percentage' | 'fixed_amount' | 'fixed_price'`.
- Extend `TierAggregation` (line 18):
  `'per_line' | 'cart_total' | 'mix_variants'`.
- Add a new shape `BandInput` representing one row in the multi-band
  form. Each band carries `{ minQty, quantityTo, discountType,
  discountPct, discountAmount, discountFixedPrice }`. The service
  exposes group-level write helpers (below); the per-band record
  stays as today.

### 4.2 New helper `createRule({ rule-level fields, bands: BandInput[] })`

Replaces `createTier` as the entry point used by `app.pricing.new.tsx`
when N≥1 bands are submitted. Existing `createTier` is **kept** (for
internal/test callers) but the route uses `createRule`.

Responsibilities:
- Generate one `groupId` (cuid).
- Validate band invariants in JS before any DB write:
  - `bands.length >= 1`.
  - `bands` sorted ascending by `minQty`.
  - For i > 0: `bands[i].minQty == bands[i-1].quantityTo + 1`
    (no gap, no overlap), OR `bands[i-1].quantityTo == null` is
    illegal except on the last band.
  - Exactly one band may have `quantityTo == null`, and it must be
    the last one.
  - Per-band discount value invariant:
    - `percentage` → `discountPct` in (0, 100], others null.
    - `fixed_amount` → `discountAmount > 0`, others null.
    - `fixed_price` → `discountFixedPrice > 0`, others null.
- Inside a single Prisma transaction, write N `Tier` rows with the
  same `groupId`, identical scope/customer/market/aggregation/
  active-date/showTableOnPdp fields, and per-band quantity + discount.
- Return the list of created tiers (or just the `groupId` + count;
  the route only needs the redirect target).

### 4.3 New helper `updateRule(groupId, { rule-level fields, bands })`

The "edit Volume Pricing" save action.

Approach: **replace-all bands in a single transaction.**
- `DELETE FROM "Tier" WHERE shopId = ? AND groupId = ?`
- Re-create the bands with the same validation as `createRule`.
- Rule-level fields (scope, scopeIds, customer/market eligibility,
  aggregation, active dates, showTableOnPdp, name, active) come from
  the form once and are written identically to every band.

Why replace-all instead of per-band diff: massively simpler, no
ordering bugs, and a rule never has more than ~5-7 bands in practice.
Cost is one extra round trip and a brief moment where the rule
"doesn't exist" mid-transaction — acceptable since the txn is atomic
from the Function's perspective (it reads the metafield, not the DB).

### 4.4 New helper `deleteRule(groupId, shopId)`

`DELETE FROM "Tier" WHERE shopId = ? AND groupId = ?`.
Replaces the per-tier `deleteTier` call from
`app.pricing.$id.tsx` (which still works on legacy single-row groups
because each legacy tier got its own groupId in the back-fill).

### 4.5 `listRules(shopId, { activeOnly? })`

New aggregating reader for the list view. Returns a `RuleSummary[]`
shape:
```
{
  groupId,
  name,            // from the first band (all bands share)
  scope, scopeIds, // shared
  customerEligibility, marketEligibility, marketIds,
  aggregation,
  active,          // logical AND across bands (any draft band drafts the rule)
  showTableOnPdp,
  startsAt, endsAt,
  bandCount: N,
  minQty: bands[0].minQty,
  maxQty: bands[N-1].quantityTo,  // null = open-ended
  createdAt,
}
```
Implementation: `listTiers(...)` already returns Tier[] ordered. The
new function calls it and groups by `groupId` in memory. Acceptable
for the same reason as today (hundreds of rules per shop tops).

### 4.6 `resolveTier` (lines 62-129)

Update the in-memory filter at line 102 to also enforce `quantityTo`:
qualifying = `t.minQty <= qty && (t.quantityTo == null || qty <= t.quantityTo)`.
Active-date filter: `(t.startsAt == null || now >= t.startsAt) &&
(t.endsAt == null || now <= t.endsAt)`.

These changes affect ONLY the storefront price-display path (App
Proxy → `resolveTier`). The Function has its own equivalent (see §5).

### 4.7 Keep `createTier` / `updateTier` / `deleteTier` / `getTier`

They stay for tests + internal callers. Their semantics don't change
(they operate on one Tier row). If `createTier` is called without a
`groupId`, it generates a fresh one (so legacy code paths produce a
1-band group, matching today's UX).

### 4.8 Invariants enforced at the service layer

- A rule with `aggregation = 'mix_variants'` must have
  `scope != 'variant'` (mix_variants is meaningless when scope is
  already a single variant). Action layer also validates; service
  is the safety net.
- A rule with active dates must have `startsAt < endsAt` if both
  are set.
- `showTableOnPdp` is only allowed when `scope in ('product',
  'variant')` (collection scope has no PDP target; all-scope is
  too noisy). Other modes silently coerce to false in the writer.

---

## 5. Discount Function changes

### 5.1 `extensions/stockly-volume-discount/src/run.ts`

All edits are inside `run(input)` and the `ConfiguredTier` interface.

Add to `ConfiguredTier`:
- `quantityTo?: number | null`
- `discountFixedPrice?: number` (per-unit final price)
- `startsAt?: string | null` (ISO)
- `endsAt?: string | null`
- `groupId?: string` (kept for diagnostics — not needed for math but
  helps when we add winner-selection per group)
- `discountType` extended to include `'fixed_price'`.

Extend `Aggregation` (line 47) to `'per_line' | 'cart_total' |
'mix_variants'`.

#### Active-date filter

New step right after `eligibleTiers = tiers.filter(...)` (line 301).
Use `(new Date()).toISOString()` once at the top of `run()` (Functions
do allow `Date.now()` — it's deterministic per invocation), then
filter out any tier with `startsAt > now` or `endsAt < now`.

#### `quantityTo` enforcement

In the per-line winner block (lines 348-357), add a second `.filter`:
`(t) => t.quantityTo == null || qty <= t.quantityTo`. Same for the
`cartTotalWinning` filter (line 362) using `cartTotalQty`.

#### `mix_variants` aggregation

Add a third partition next to `perLineTiers` and `cartTotalTiers`:
`mixVariantTiers = eligibleTiers.filter(t => t.aggregation === 'mix_variants')`.

For each line, compute a per-line `mixVariantQty` = sum of cart
quantities for lines whose `merchandise.product.id` matches the
current line's product GID. (Build a `Map<productGid, totalQty>`
once before the per-line loop to avoid O(N²).)

Then add a `mixVariantWinning` filter symmetric to
`cartTotalWinning`, using `mixVariantQty` as the qty signal **and**
also filtering by scope (`tierAppliesToLine` already handles product/
variant/all scope matching).

Push it into the `candidates` array alongside per_line + cart_total
winners. The existing "pick highest discount" tiebreaker still
applies.

#### `fixed_price` discount type

Inside the `lineCalcs.map(...)` block (lines 333-411), add a fourth
branch alongside percentage and fixed_amount:

When `tierType === 'fixed_price'`:
- `lineWholesale = winningTier.discountFixedPrice * qty`
  (no baseline composition — the merchant has stated the final
  per-unit price; baseline is irrelevant by design).
- The emitted discount entry uses `value: { fixedAmount: { amount:
  (lineRetail - lineWholesale).toFixed(2) } }` (same emission pattern
  as `fixed_amount`).
- If `discountFixedPrice >= line.cost.amountPerQuantity.amount`,
  treat the tier as a no-op for that line (don't emit a discount,
  don't emit a markup — Shopify rejects negative discounts).
- Message: `Wholesale ${effectiveBaseline}% + €${discountFixedPrice}/unit fixed (${minQty}+ ${mode})`.

#### Back-compat reads (one release cycle)

Already present for `aggregation`, `discountType`, `customerEligibility`
(default values when missing). Add the same default-on-missing
pattern for `quantityTo` (treat as `null`), `startsAt`/`endsAt`
(treat as `null` = always active), and `discountFixedPrice`
(undefined when type isn't fixed_price). No legacy metafield will
break — the new code paths only trigger when the new fields are
present.

### 5.2 `extensions/stockly-volume-discount/src/run.graphql`

**No changes required.** Today's input query (read above, all
33 lines) already exposes:
- `line.merchandise.product.id` (needed for mix_variants — used in
  the new per-product qty Map).
- `line.quantity`, `line.cost.amountPerQuantity.amount`.
- `buyerIdentity.customer.{id, hasAnyTag}`.

`localization.market.id` would be required for `specific_markets`
(still Sprint 5 per `app.pricing.new.tsx` line 137-139), not for
Volume Pricing. No `b2b-specialist` audit is on disk
(`progress/2026-05-27-function-input-audit.md` does not exist).

If a follow-up reviewer wants a defensive belt: add `localization {
language { isoCode } }` so future translations of the storefront
table don't need a second Function rev. Not required for Phase 1.

---

## 6. Sync layer — `app/services/discount-function-sync.server.ts`

### 6.1 Update `buildConfiguration` (lines 273-344)

Each entry of `scopedTiers` (lines 287-320) gets the new fields
appended to the `.map(...)` return shape:

- `quantityTo: t.quantityTo` (null when open-ended).
- `discountFixedPrice: t.discountFixedPrice` (null unless type is
  fixed_price).
- `startsAt: t.startsAt?.toISOString() ?? null`.
- `endsAt: t.endsAt?.toISOString() ?? null`.
- `groupId: t.groupId` (for Function-side diagnostics + a future
  per-group winner-selection if we change semantics).

The existing comment block in the file (lines 246-272) needs an
update to document the v4 shape, but that's a doc-only change.

### 6.2 No filter changes

Keep filtering `scope in ('all', 'product', 'variant')`. Bands with
collection scope still skip checkout enforcement (unchanged).

### 6.3 Sort

Already `.sort((a, b) => a.minQty - b.minQty)`. Multi-band rules
naturally interleave by minQty, which is what the Function expects
when picking the highest-qualifying tier per line. No change.

---

## 7. Admin UI — list view (`/app/pricing._index.tsx`)

Currently shows one row per Tier. After migration, one row per
**groupId**.

### 7.1 Loader change (lines 106-129)

Swap `listTiers(shop.id)` for the new `listRules(shop.id)` that
returns `RuleSummary[]` (see §4.5).

### 7.2 Inline toggle action (lines 80-104)

Today flips `active` on one Tier. Change to flip `active` on **every
Tier in the group**:
- Read `groupId` instead of `id` from the form.
- `prisma.tier.updateMany({ where: { shopId, groupId }, data: {
  active } })`.
- Ownership check via a single `findFirst({ where: { shopId,
  groupId } })`.
- Re-sync the Function as before.

### 7.3 Row rendering (lines 321-371)

Each row now shows a `RuleSummary`. Columns adjust:

- **ID:** `#${groupId.slice(0,6)}`.
- **Name:** unchanged (taken from the first band).
- **Status:** toggle posts `groupId` not `id`.
- **Apply Customers / Apply Markets:** unchanged (still from the
  rule-level field).
- **Apply Products:** unchanged (`ScopeCell`).
- **Volume bands** (new column, between Products and Markets):
  - `bandCount > 1` → render `"${bandCount} bands · ${minQty}–${maxQty ?? '∞'} units"`.
  - `bandCount === 1` → render `"${minQty}+ units"` (preserves the
    today-look for legacy rules).
- **Created:** unchanged.

Row `onClick` navigates to `/app/pricing/${groupId}` (was `${id}` —
they're equal post-migration for legacy rows but new multi-band
rules need the groupId).

### 7.4 Empty state, banners, tabs

No structural change. Tab counts (lines 161-162) use
`rules.filter(r => r.active).length` instead of the per-tier count.

---

## 8. Admin UI — new/edit forms (`app.pricing.new.tsx`, `app.pricing.$id.tsx`)

The form keeps the same overall scaffolding (SaveBar, two-column
layout, ChoiceCard helper, InlineGrid 2×2 option layouts) — do **not**
rewrite it.

### 8.1 New "Discount Range" card (replaces today's `Discount` card)

Lives roughly between today's `Trigger` and the bottom of the left
column. Contents:

- Heading "Discount range" + helper "One row per quantity band. The
  last band's upper bound can be left blank to mean 'and above'."
- A small `Banner tone="info"` explaining the three discount-type
  semantics (Percent off / Fixed amount off / Fixed price), mirroring
  Sami's helper text from §1.2 of the competitive doc.
- A table of band rows. Each row:
  - `From` integer field (was `minQty`).
  - `To` integer field (allowed blank only on the last band).
  - `Discount type` Polaris `Select` (3 options).
  - `Value` field — adapts to type: `%` suffix for percentage,
    `€` prefix + "off" suffix for fixed_amount, `€` prefix + "final
    price" suffix for fixed_price.
  - Trash icon button to remove the row (disabled when only one band
    remains).
- `Add band` button under the table. On click, appends a new row whose
  `From` defaults to the previous row's `To + 1` (or `previousFrom +
  10` if previous `To` is blank). Empty `To`.
- Inline validation messages per row (the same `errors` shape, keyed
  by `bands.${index}.${field}`).

Why a hand-rolled table instead of N stacked Cards: matches Sami's
density and saves vertical space when a rule has 4-5 bands.

#### Form state shape

Replace the today single-field `discountPct` / `discountAmount` /
`discountType` state (lines 340-348 of new.tsx) with one array:
```
const [bands, setBands] = useState<BandDraft[]>([
  { from: '10', to: '19', type: 'percentage', value: '10' },
]);
```
Hidden inputs serialize each band as `bands[${i}].${field}` so the
action parses them as `Array.from({ length: bands.length }, (_, i) =>
({ from: form.get(`bands[${i}].from`), ... }))`. Standard Remix
multi-row pattern.

#### Action validation

In both `new.tsx` and `$id.tsx` action:
- Parse the `bands[N].*` fields into a `bands` array, dropping
  empty trailing rows.
- Run the same invariants the service layer enforces (gaps/overlaps,
  exactly one open-ended on the last band, per-type field
  requirements). Errors keyed `bands.${i}.${field}`.
- On success, call `createRule({ ..., bands })` or
  `updateRule(groupId, { ..., bands })`.

### 8.2 Active dates — new sidebar Card (right column)

Right column already hosts "Pricing summary" + "Selected products"
+ "Preview". Insert between Summary and Preview:

- Heading "Active dates" + helper "Optional. Leave blank for
  always-active."
- Two date+time inputs: `Starts at`, `Ends at`. Use Polaris
  `DatePicker` + `TextField` for the time, or just a `<input
  type="datetime-local">` (Polaris doesn't ship a datetime picker
  in v12; either approach works — the implementer picks).
- Inline validation: if both set, starts < ends.

Hidden inputs `startsAt` + `endsAt` serialized as ISO strings.

### 8.3 Mix Variants — extend the existing Aggregation picker

`AGGREGATION_OPTIONS` (new.tsx lines 298-315) currently has 2 entries
(`per_line`, `cart_total`). Add a third:

```
{
  value: 'mix_variants',
  title: 'Mix variants of the same product',
  description: 'Sum quantities across different variants of the same product. Mix sizes / colors to hit the minimum.',
}
```

Disabled when `scope === 'variant'` (mirrors the existing
`cart_total + variant` disabled logic at lines 754-757).

The 2×2 `InlineGrid` (line 753) becomes a 3-card layout — switch to
`columns={{ xs: 1, sm: 3 }}` or accept a 2+1 wrap on small screens.

Action validator (lines 124-126, 254-255) updates its `includes`
check to accept the third value.

### 8.4 Show Table on Product Page — new sidebar Card

Below Active dates:

- Heading "Show table on product page" + helper "When on, a volume
  pricing table renders on the storefront PDP for any product in
  scope."
- The `StatusToggle` helper from `$id.tsx` lines 1355-1397 — reuse it
  (or hoist to a shared file later; not required for Phase 1).
- Below the toggle, a `Banner tone="warning"` (only when toggle is
  on): "Theme widget ships in Phase 2 — toggle is saved and ready,
  but no table renders on the storefront yet."

Hidden input `showTableOnPdp` value `on` / `off`.

Disabled when `scope === 'all'` or `scope === 'collection'` (matches
the §4.8 invariant).

### 8.5 Other UI touch-ups

- Page title for `new.tsx`: "New volume pricing" feels right once N>1
  is the default. Keep "Wholesale pricing" if Jonatan prefers
  continuity — confirm in implementation. The plan recommends
  keeping "wholesale pricing" so the URL + nomenclature stay aligned
  with what merchants saw yesterday.
- `Preview` card on the right needs to handle multi-band: show a
  small table of `From – To | Final per-unit` rows instead of the
  single-tier math. Compute against €100 retail for every band.
- The `Pricing summary` "Trigger" / "Discount" rows compress to
  "N bands · ${minQty}–${maxQty ?? '∞'}".

### 8.6 Edit-form route param

`app.pricing.$id.tsx` is keyed by `params.id`. After migration, the
list links use `groupId`. Two paths:

Option A (recommended): rename the route param from `id` to
`groupId`. Loader fetches all tiers in the group. Old links keep
working because every legacy tier's `id === groupId`-ish? No — they
differ. So old bookmarks break. Cheap fix: keep the route file
unchanged; the loader detects whether `params.id` matches a `Tier.id`
OR a `Tier.groupId` and resolves accordingly. Implementer picks.

Recommend the loader-detection approach (Option B): `getTier(id,
shop)` first; if null, `prisma.tier.findFirst({ where: { shopId,
groupId: id } })`. Either way we resolve to the full set of bands.

---

## 9. Test changes — `extensions/stockly-volume-discount/tests/`

Today's only fixture is `no-discounts.json`. Add four new fixtures
under `extensions/stockly-volume-discount/tests/fixtures/`, each
following the structure of `no-discounts.json` (payload with
`export`, `target`, `input`, `output`):

1. **`fixed-price-discount.json`** — one band with
   `discountType: 'fixed_price'`, `discountFixedPrice: 70`,
   `minQty: 1`, cart line at €100 retail × 5 qty. Expected output:
   single `fixedAmount` entry equal to `(100 - 70) * 5 = 150.00`,
   wholesale-tagged customer.

2. **`active-date-filter.json`** — two bands in the metafield:
   one with `endsAt = '2020-01-01T00:00:00Z'` (expired) and one
   with `startsAt = '2099-01-01T00:00:00Z'` (future). Cart meets
   both qty thresholds. Expected output: empty `discounts: []` —
   the Function filtered both out by date.

3. **`mix-variants-aggregation.json`** — one tier with
   `aggregation: 'mix_variants'`, `scope: 'product'`, `scopeIds:
   ['gid://shopify/Product/1']`, `minQty: 10`, `discountPct: 15`.
   Cart contains two lines of the same product (different variants)
   at qty 6 + qty 5 = 11 total. Expected output: percentage 15%
   on BOTH lines (the mix_variants per-product sum cleared 10).

4. **`multi-band-rule.json`** — three bands sharing
   `groupId: 'g_test_1'`:
   - `minQty: 1,  quantityTo: 9,  discountPct: 5`
   - `minQty: 10, quantityTo: 49, discountPct: 10`
   - `minQty: 50, quantityTo: null, discountPct: 20`
   Cart with one line at qty 25 of a wholesale-tagged customer.
   Expected output: percentage `10` (composed with baseline if the
   fixture sets one; recommend baseline `0` for arithmetic clarity).

For each fixture, the customer object must include
`hasAnyTag: true` (or false where you want to negative-test). Mirror
the input shape from `run.graphql`.

`default.test.js` already iterates over every `*.json` in `fixtures/`
— **no test runner changes needed.** New fixtures automatically run.

---

## 10. Step-by-step execution order

Each step is sized 1-3 files. Run `bash scripts/verify.sh` after
each step marked `[VERIFY]`. Do not commit on red.

### Step 1 — Schema additions only
- Edit `prisma/schema.prisma` (model `Tier`): add the 7 new fields
  and the `@@index([shopId, groupId])`.
- `npm run prisma:generate`.
- Push to **local dev DB only**: `npx prisma db push`.
- [VERIFY] `bash scripts/verify.sh` (lint + build must still pass —
  no code yet uses the new fields, so this just proves the schema is
  valid).

### Step 2 — Back-fill script
- Add `scripts/backfill-tier-groupids.ts` (see §3 back-fill).
- Run it against local dev DB. Assert post-condition: 0 NULL
  `groupId` rows.
- [VERIFY] `bash scripts/verify.sh`.

### Step 3 — Service-layer additions (no UI yet)
- Edit `app/services/tiers.server.ts`:
  - Extend `TierDiscountType` and `TierAggregation` unions.
  - Add `createRule`, `updateRule`, `deleteRule`, `listRules`
    helpers (see §4.2 – §4.5).
  - Update `resolveTier` to enforce `quantityTo` + active dates
    (§4.6).
  - Add the safety-net invariants (§4.8).
- Existing `createTier` / `updateTier` / `deleteTier` keep working
  unchanged. If `createTier` is called without `groupId`, it
  generates one (one-line addition).
- [VERIFY] `bash scripts/verify.sh`.

### Step 4 — Sync layer fields
- Edit `app/services/discount-function-sync.server.ts`:
  - Update `buildConfiguration` to add `quantityTo`,
    `discountFixedPrice`, `startsAt`, `endsAt`, `groupId` per
    scopedTier entry (§6.1).
  - Refresh the doc comment (lines 246-272) to call out v4 shape.
- [VERIFY] `bash scripts/verify.sh`.

### Step 5 — Discount Function (WASM)
- Edit `extensions/stockly-volume-discount/src/run.ts`:
  - Extend `ConfiguredTier` interface (§5.1) and `Aggregation` /
    `discountType` unions.
  - Add the active-date filter step.
  - Add `quantityTo` filter to per-line + cart-total winner blocks.
  - Add `mix_variants` partition + per-product qty Map +
    `mixVariantWinning` resolution.
  - Add `fixed_price` branch in the line-calculation switch.
- **Do NOT modify `run.graphql`** — no input change required.
- [VERIFY] `bash scripts/verify.sh` (extension build must succeed).

### Step 6 — Test fixtures
- Add the 4 new fixtures listed in §9 to
  `extensions/stockly-volume-discount/tests/fixtures/`.
- Run only the function tests if `verify.sh` is slow:
  `npx vitest run extensions/stockly-volume-discount`.
- [VERIFY] `bash scripts/verify.sh` (now 5 fixtures, all must pass).

### Step 7 — Admin list view rewrite
- Edit `app/routes/app.pricing._index.tsx`:
  - Switch loader to `listRules`.
  - Switch toggle action to `updateMany` on `groupId`.
  - Add the `Volume bands` column.
  - Update row `onClick` to use `groupId`.
- [VERIFY] `bash scripts/verify.sh` + manual smoke (open
  `/app/pricing` against dev DB, see legacy rules render correctly).

### Step 8 — Edit form (smaller refactor first)
- Edit `app/routes/app.pricing.$id.tsx`:
  - Loader: resolve `params.id` as either `Tier.id` OR `groupId`
    (§8.6). Fetch all bands for the group.
  - Action: parse `bands[N].*` form fields, call `updateRule`.
  - UI: replace the single-band Discount + Trigger cards with the
    multi-band "Discount range" card (§8.1).
  - Add Active dates + Show Table sidebar cards (§8.2, §8.4).
  - Extend Aggregation picker with `mix_variants` option (§8.3).
  - Update Pricing summary + Preview cards (§8.5).
- [VERIFY] `bash scripts/verify.sh` + manual smoke (edit a legacy
  rule, save it, confirm it still works at checkout).

### Step 9 — Create form
- Edit `app/routes/app.pricing.new.tsx` mirroring Step 8 changes.
  Defaults: 1 band (matches today's UX for merchants who just want
  a single threshold).
- [VERIFY] `bash scripts/verify.sh` + manual smoke (create a
  multi-band rule on dev, confirm DB shows N rows with same
  groupId, confirm the metafield JSON has them sorted).

### Step 10 — HANDOFF + ADR
- Add `docs/decisions/ADR-012-volume-pricing-multi-band.md`
  documenting:
  - The 7 pre-approved decisions and why each.
  - The "one Tier row per band, grouped by groupId" choice over
    a separate `Rule` table.
  - The "Function reads dates, no cron" choice.
  - The Phase-2 deferral of the storefront table widget.
- Update `HANDOFF.md`:
  - New "Last commit" + Fly + Shopify app versions
    (deployment-guardian will fill in actual numbers).
  - "What works" line: "Multi-band volume pricing live —
    `/app/pricing` rules can have N quantity bands with mixed
    discount types, active-date windows, and mix_variants
    aggregation".
  - Pending production step: `prisma db push` then back-fill
    script (out of scope here, called out for deployment-guardian).
- [VERIFY] `bash scripts/verify.sh`.

### Step 11 — Commit
- One commit per logical step is ideal but several are coupled.
  Suggested commits:
  1. `feat(pricing): schema additions for multi-band volume pricing`
  2. `feat(pricing): groupId back-fill script`
  3. `feat(pricing): createRule/updateRule/listRules service helpers`
  4. `feat(function): fixed_price + mix_variants + active dates + quantityTo`
  5. `test(function): fixtures for new pricing modes`
  6. `feat(pricing): multi-band UI in list, create, edit`
  7. `docs(adr): ADR-012 multi-band volume pricing`
- Use the Co-Authored-By trailer per CLAUDE.md conventions.

**Do not deploy.** Stop here. Handoff to `deployment-guardian`.

---

## 11. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Production `Tier` rows have `groupId IS NULL` and the new list-view query crashes when `groupId` is required upstream | High if back-fill is skipped | Plan separates schema push from back-fill explicitly; document both as ordered prod steps for deployment-guardian. Code defends with `null` checks for one release. |
| Function reads a legacy metafield (no `quantityTo` / no `startsAt`) and accidentally drops the discount because of strict comparisons | Medium | Default-on-missing pattern (`t.quantityTo == null` short-circuits the upper-bound filter, same for dates). Already the style for `aggregation` + `discountType` today. Fixtures will pin this. |
| Multi-band metafield exceeds Shopify's Function input byte budget on a shop with 100s of bands | Low (a typical merchant has 1-3 rules × 3-5 bands) | Each band adds ~120 bytes JSON. 100 rules × 5 bands = ~60 KB, well under the 50 KB input limit per Function call. Document the ceiling in ADR-012. |
| `mix_variants` per-product Map miscounts when the cart has variants of products not in scope | Medium | The Map is built unfiltered (sum qty across the cart by product), but the *filter* still uses `tierAppliesToLine` so out-of-scope products' qty doesn't matter — they wouldn't have a candidate tier in the first place. Fixture #3 covers this. |
| `updateRule` "delete-and-recreate" inside one txn leaves a brief inconsistency visible to a concurrent `syncTiersToFunction` running for the same shop | Low (admin saves are sequential per-merchant) | The txn is atomic from the DB's perspective. Sync runs *after* the txn commits in the same request, so the read inside `buildConfiguration` sees the post-update state. |
| Replacing `/app/pricing/:id` route key from `id` to `groupId` breaks active merchant bookmarks | Medium | Loader resolves either; documented in §8.6. |
| Piro pilot stops applying any discount after deploy because of a missed back-compat path | Catastrophic | Step 6 fixtures explicitly include a legacy-shape fixture path; add a 5th fixture `legacy-single-band.json` that mirrors today's production metafield and asserts the discount still applies. Recommend the implementer add this as a guardrail. |
| Active dates use UTC; merchant types local time → expires a day early | Medium UX | Form converts the `<input type="datetime-local">` value to UTC ISO before submit; show the merchant's resolved UTC date in a small helper line under each input. |

---

## 12. Out of scope (Phase 2 follow-ups)

These are deliberately deferred. None of them block Phase 1 shipping
to Piro.

- **Theme app block "Volume Pricing Table"** for the storefront
  PDP (the toggle is stored but unused at runtime). Will likely
  ship via App Proxy + Liquid block calling `/apps/stockly/pricing-table?product=...`.
- **Table template picker modal** ("Change Template" in Sami).
  `Tier.tableTemplateId` is reserved but unused.
- **Rule lifecycle / status state machine** — today `active:
  boolean`. Sami has `draft / expired / pending`. The active-date
  fields will drive a derived `status` later (`now < startsAt →
  pending`, `now > endsAt → expired`), but the tab UI ships only
  All / Active / Draft for now.
- **Customer-tag eligibility, specific-customer eligibility,
  specific-markets eligibility, product-tag scope, collection scope
  at checkout** — all already-tracked items in tasks/current.md +
  audit P1, not part of this plan.
- **Translation of storefront table strings** (Sami's "go to
  Translation to edit the content of the table" tip).
- **Import / export of volume pricing rules** (Sami's locked-behind-
  plan Import button).
- **Per-band scheduling** — Phase 1 applies one (startsAt, endsAt)
  to every band of a rule. Per-band dates are a Phase 2 nice-to-have
  if any merchant asks (they probably won't).
- **`price_per_item` discount type** — deliberately skipped per
  pre-approved decision #3.

---

## 13. Stop conditions

The implementer MUST pause and surface back to the user before:

- Running `npx prisma db push` against production
  (`stockly-lustrous-forest-4364`).
- Running the back-fill script against production.
- Running `fly deploy`, `shopify app deploy`, or any variant.
- Modifying `fly.toml`, `shopify.app.toml`, or any `.env*` file.
- Force-pushing to main (already forbidden by AGENTS.md).

Anything above goes through `deployment-guardian`.
