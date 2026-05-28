# Create Volume Pricing admin area at /app/volume-pricing

**Date:** 2026-05-28 (started)
**Status:** completed
**Owner:** Claude
**Related:** ADR-014 (Tier.kind), tasks/current.md (pre-existing tsc blocker),
app/routes/app.pricing.* (sibling Wholesale Pricing area)

## Objective

Give Volume Pricing (multi-band quantity breaks, "buy more save more")
its own admin home at `/app/volume-pricing`, separate from Wholesale
Pricing (flat single discount, being restored at `/app/pricing` by a
sibling agent). Both areas share the `Tier` table, separated by
`Tier.kind` ("volume" vs "wholesale"). This area always reads/writes
`kind: "volume"`.

## Files inspected

- `app/routes/app.pricing.new.tsx` — multi-band create form (port source).
- `app/routes/app.pricing.$id.tsx` — multi-band edit/delete form (port source).
- `app/routes/app.pricing._index.tsx` — multi-band list (port source).
- `app/components/pricing/band-range-table.tsx` (via grep of exports) —
  shared editor; imported, not edited.
- `app/services/tiers.server.ts` — confirmed `createRule`/`updateRule`
  accept `kind?: TierKind` and `listRules(shopId, { kind })` filters;
  `RuleSummary` has `bandCount/minQty/maxQty/createdAt/bands`.

## Files changed

- `app/routes/app.volume-pricing.new.tsx` — NEW. Create form, `kind:"volume"`
  in `createRule`, SaveBar id `volume-pricing-new-save-bar`, redirects to
  `/app/volume-pricing`, title "New volume pricing".
- `app/routes/app.volume-pricing.$id.tsx` — NEW. Edit/delete form,
  `kind:"volume"` in `updateRule`, SaveBar id `volume-pricing-edit-save-bar`,
  delete button "Delete this volume pricing", redirects to
  `/app/volume-pricing`.
- `app/routes/app.volume-pricing._index.tsx` — NEW. List filtered via
  `listRules(shop.id, { kind: "volume" })`, inline toggle posts to
  `/app/volume-pricing`, primary action "Create volume pricing", empty
  state copy about quantity breaks. Dropped the wholesale shop-setup
  banner (baseline/FPQ/MOQ chips) — those are shop-wide settings owned
  by the Wholesale area, not relevant to the per-rule volume list.
- `tasks/current.md` — recorded the pre-existing tsc blocker (below).

## Commands run

```
npm install && npx prisma generate   # node_modules was missing
bash scripts/verify.sh               # lint ✓ tsc ✗(pre-existing) test ✓ ext-build ✓ remix-build ✓
npx tsc --noEmit                     # isolated: 8 errors, all in run.ts
# proof of pre-existing: moved my 3 files out, re-ran tsc → same 8 errors in run.ts
```

## Verification

- Lint: pass. Tests: pass. Extension build: pass. Remix build: pass —
  build output confirms the new routes compile and are picked up
  (`app.volume-pricing.new`, `app.volume-pricing._id` chunks emitted).
- `tsc --noEmit`: FAIL, but the 8 errors are all in
  `extensions/stockly-volume-discount/src/run.ts` (missing
  `../generated/api` codegen artifact). Removing my 3 new files leaves
  the identical 8 errors; my routes add zero. Pre-existing and unrelated.

## Open risks

- The nav agent must add the "Volume pricing" NavMenu link in `app/tsx`
  for this area to be reachable; I did not touch nav files (off-limits).
- `verify.sh` will stay red on `tsc` until the extension `generated/api.ts`
  is produced (run `npm run typegen` in the extension) or the extension
  is excluded from the root tsconfig. Tracked in tasks/current.md.

## Next step

Nav agent links `/app/volume-pricing`; resolve the extension typegen
blocker so `verify.sh` goes fully green.
