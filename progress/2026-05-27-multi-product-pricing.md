# 2026-05-27 — Multi-product selection for wholesale pricing rules

## Objective

Jonatan's UX request after looking at /app/pricing/new + /app/pricing/$id:

> "al seleccionar los productos en primer lugar, debe poder seleccionar
> varios; en segundo lugar cuando se seleccione, tiene que haber una vista
> previa en el Sidebar del lado derecho; y tercer lugar, no debe quedar
> ese URL allí fea"

Translation into work:

1. Resource Picker must allow `multiple: true` so one rule can target N
   products without duplicating the rule N times (Sami/BSS UX pattern).
2. Sidebar must show a live preview of the selected products
   (thumbnail + title), so the merchant sees what the rule covers
   without scrolling.
3. The raw `gid://shopify/Product/...` URL must never appear on screen.
   Replace it with a clean thumbnail+title row that has a remove button.

## Files inspected

- `prisma/schema.prisma` — Tier model
- `app/services/tiers.server.ts` — createTier, updateTier, resolveTier
- `app/services/discount-function-sync.server.ts` — buildConfiguration
- `extensions/stockly-volume-discount/src/run.ts` — Function
- `app/routes/app.pricing.new.tsx` — admin create form
- `app/routes/app.pricing.$id.tsx` — admin edit form
- `app/services/tiers.test.ts` — Vitest mocks

## Files changed

| File | Why |
|------|-----|
| `prisma/schema.prisma` | Added `scopeIds String[] @default([])` to Tier. Kept legacy `scopeId String?` for one release cycle. |
| `app/services/tiers.server.ts` | `createTier` + `updateTier` now accept `scopeIds`, mirror `scopeIds[0]` into legacy `scopeId`. `resolveTier` OR-matches both new (`scopeIds: { has }`) and legacy (`scopeId == X`) forms so existing rules keep matching. |
| `app/services/discount-function-sync.server.ts` | `buildConfiguration` serializes both `scopeId` (legacy) and `scopeIds` (new) into the Function's metafield. |
| `extensions/stockly-volume-discount/src/run.ts` | `tierAppliesToLine` now reads `scopeIds` first, falls back to `scopeId`. Added `scopeIds` field to the `ConfiguredTier` type. |
| `app/routes/app.pricing.new.tsx` | Replaced single-`scopeId` TextField + Browse button with multi-select picker (`multiple: true`), a list of selected items (thumbnail + title + remove), and a sidebar `Selected products` card. Action parses `form.getAll("scopeIds")` and passes to `createTier`. |
| `app/routes/app.pricing.$id.tsx` | Same UI rewrite. Loader gained a Shopify GraphQL `nodes(ids:)` query to resolve existing rule targets into `(id, title, image)` so the edit form opens with real thumbnails instead of GIDs. |
| `app/services/tiers.test.ts` | Updated mock `tier()` factory to include the new `scopeIds`, `discountType`, `discountAmount` fields. Updated the `resolveTier` query-shape assertion to cover both new and legacy OR branches. |

## Architecture

```
Admin UI (multi-select picker)
       │
       ▼  POST /app/pricing[/$id]  (form.getAll("scopeIds"))
createTier / updateTier
       │   - writes Tier.scopeIds (new)
       │   - mirrors scopeIds[0] into Tier.scopeId (legacy back-compat)
       ▼
syncTiersToFunction
       │   - reads Tier
       │   - emits BOTH scopeId + scopeIds into metafield JSON
       ▼
Shopify Discount Function (run.ts)
       │   - tierAppliesToLine reads scopeIds first
       │   - falls back to scopeId for pre-migration metafields
       ▼
Checkout discount applied
```

## Back-compat guarantees

- Rows written before 2026-05-27 have `scopeId != null` and `scopeIds = []`.
  - `resolveTier` matches them via the legacy OR branch.
  - `syncTiersToFunction` emits their `scopeId` into the metafield.
  - The Function falls back to `scopeId` when `scopeIds` is empty.
- Rows written after the migration have BOTH `scopeId` (mirrored to
  `scopeIds[0]` so old reads still work) and the full `scopeIds`.
- Once we ship a backfill that copies `scopeId → scopeIds[0]` on all
  legacy rows, we can drop the legacy field and the back-compat OR
  branches in one release.

## Commands run

```bash
npx prisma generate                    # regen client with scopeIds field
npx eslint <changed files>             # clean
npx tsc --noEmit                       # only pre-existing errors remain
bash scripts/verify.sh                 # lint + tests + ext build + remix build all green
```

## Pre-existing errors NOT introduced by this change

- `app/routes/webhooks.customers.data_request.tsx:68,77` — `Record<string,string>` cast issue, present on `main` before this change.
- `extensions/stockly-volume-discount/src/run.ts:395,447` — `flatMap` shape error from the fixed-amount discount work, present on `main` before this change.

## Open risks

- Schema column is added but production DB is not yet migrated. Fly's
  `release_command` (`npx prisma db push --skip-generate` in `fly.toml`)
  will apply it on next deploy. The default `[]` means no existing rows
  need backfill for the Function to keep working.
- Function changes require `npx shopify app deploy` to push the new
  WASM build to Shopify. Until then checkout uses the old Function
  (still reading legacy `scopeId`), which is still correct for any
  pre-migration rule.
- Resource Picker returns image shape `{originalSrc}` on Product/Variant
  and `{url}` on Collection in some App Bridge versions. We normalize
  both — should test live with the dev store after deploy.

## Verification

- `bash scripts/verify.sh` → all green
- Pre-deploy: schema + service + sync + function + UI in sync
- Post-deploy (next): create a 2-product rule on the dev store, verify
  the checkout discount applies to both products

## Next step (gated by user)

1. Commit the change (`feat(pricing): multi-product selection per rule`)
2. `fly deploy --app stockly-lustrous-forest-4364` — triggers
   `prisma db push` to add the `scopeIds` column on the prod DB
3. `npx shopify app deploy` — pushes the new Function WASM
4. Live test on `desarrollo-adspubli.myshopify.com`: create a rule
   that targets 2+ products, verify checkout discount applies to all
5. (Optional) Run a one-shot backfill to copy `scopeId → scopeIds[0]`
   on legacy rows, then schedule removal of the legacy column for the
   next sprint
