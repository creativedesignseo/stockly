# Restore flat Wholesale Pricing at /app/pricing

**Date:** 2026-05-28 (started)
**Status:** completed
**Owner:** Claude
**Related:** ADR-014 (wholesale vs volume split), tasks/current.md

## Objective

A prior change wrongly turned `/app/pricing` into a multi-band
quantity-break editor, conflating Wholesale Pricing with Volume Pricing.
Sami keeps them as two separate areas. Restore `/app/pricing` to a flat
single-discount Wholesale Pricing form. The separate Volume Pricing area
(`/app/volume-pricing`) is being built by a sibling agent — not touched
here.

## Files inspected

- `app/services/tiers.server.ts` — confirmed the consumed contract:
  `createTier`/`updateTier` accept `kind?: TierKind`; `listRules` accepts
  `{ kind }`; `getTier`/`getRule` resolution.
- `git show 6f77075:app/routes/app.pricing.new.tsx` (and `.$id.tsx`) —
  the pre-multi-band single-discount reference. Reused its layout,
  preview math, and helpers; removed the Trigger card it still had.
- `scripts/verify.sh` — verification now includes `tsc --noEmit`.

## Files changed

- `app/routes/app.pricing.new.tsx` — full rewrite to single-discount
  form. Removed Trigger/aggregation/minQty + BandRangeTable. Added the
  third discount type (`fixed_price`). `createTier({ kind: "wholesale",
  minQty: 1, aggregation: "per_line", … })`.
- `app/routes/app.pricing.$id.tsx` — full rewrite to single-discount
  edit form. Loads via `getTier`/`getRule`, reads the first band,
  updates it with `updateTier(firstBand.id, …)`. Delete still uses
  `deleteRule`. Keeps the Active/Draft toggle. Shows a warning banner if
  it opens a legacy multi-band group (edits only the first band).
- `app/routes/app.pricing._index.tsx` — `listRules(shop.id, { kind:
  "wholesale" })`; replaced the "Volume bands" column with a flat
  "Discount" column (reads `rule.bands[0]`); reworded empty-state copy.

## Commands run

- `bash scripts/verify.sh`

## Verification

`bash scripts/verify.sh` — all checks passed (lint, tsc --noEmit, test,
build:extensions, build). One pre-existing Polaris CSS bundling warning
(`@media … and print`) — unrelated to this change.

## Open risks

- Storefront/Function semantics: a flat wholesale rule is stored as a
  1-band tier with `minQty: 1`, `aggregation: "per_line"`. The Discount
  Function treats it as always-on for the scoped products — intended.
- The `_index` "Discount" column reads `rule.bands[0]`; for a legacy
  multi-band group it shows only the first band's discount. Acceptable
  for the wholesale list, which should only ever contain 1-band rules.

## Next step

None for this task. Sibling agent owns the Volume Pricing area; nav
agent owns `app.tsx` / `app._index.tsx`.
