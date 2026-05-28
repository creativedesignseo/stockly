# Wire admin nav + dashboard for two sibling pricing areas

**Date:** 2026-05-28 (started)
**Status:** completed
**Owner:** Claude
**Related:** HANDOFF.md (pricing hub), tasks/current.md

## Objective

Expose **Wholesale Pricing** and **Volume Pricing** as two sibling
navigation areas (mirroring Sami's structure). Two sibling agents are
building the actual route trees; this task only touches navigation and
the dashboard. The Volume routes do not yet exist in this worktree —
NavMenu links are plain hrefs and the Remix build does not validate
them.

## Files inspected

- `app/routes/app.tsx` — App Bridge NavMenu, single "Pricing" entry.
- `app/routes/app._index.tsx` — dashboard with stat/tip cards; loader
  counts active tiers / pending apps / qualified customers via Prisma.

## Files changed

- `app/routes/app.tsx` — split single "Pricing" link into "Wholesale
  Pricing" (/app/pricing) and "Volume Pricing" (/app/volume-pricing);
  updated the nav comment to describe both areas. All other NavMenu
  entries left untouched.
- `app/routes/app._index.tsx` — relabeled the "Active pricing rules"
  StatCard CTA to "Manage Wholesale Pricing"; added a parallel
  `NavCard` linking to /app/volume-pricing. New small `NavCard` helper
  (no count — avoids touching the shared loader / volume schema).

## Commands run

- `bash scripts/verify.sh`

## Verification

`bash scripts/verify.sh` → all checks passed (lint, tsc --noEmit,
extension build, Remix build). Pre-existing Polaris CSS minify warning
(`@media ... and print`) is unrelated.

## Open risks

- /app/volume-pricing route is owned by the sibling Volume agent and
  not present in this worktree; link will 404 until that lands.

## Next step

None — hand-off to sibling agents owning the two pricing route trees.
