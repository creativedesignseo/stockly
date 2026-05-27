/**
 * scripts/backfill-tier-groupids.ts
 *
 * One-shot back-fill for the Volume Pricing migration (ADR-012).
 * Every legacy `Tier` row was created before the `groupId` field
 * existed and therefore has `groupId = NULL`. The new admin UI and
 * Function code group bands by `groupId`; NULLs would silently
 * exclude legacy rules from those code paths.
 *
 * Semantics: every legacy tier becomes its own 1-band group (one
 * fresh cuid per row). That preserves today's behavior — N rows in
 * the list view, each addressed independently — and lets the new
 * helpers (`createRule`, `updateRule`, `listRules`) operate uniformly
 * once the schema is in.
 *
 * Idempotency: safe to re-run. Only rows whose `groupId IS NULL`
 * are touched. Subsequent runs are no-ops.
 *
 * How to run:
 *   Local dev:
 *     DATABASE_URL=postgres://... npx tsx scripts/backfill-tier-groupids.ts
 *
 *   Production (handled by deployment-guardian, not by an agent):
 *     1. Deploy the new Prisma client + schema (additive `prisma db push`).
 *     2. fly ssh console -a stockly-lustrous-forest-4364 \
 *          -C 'node /app/scripts/backfill-tier-groupids.js'
 *     3. Verify: `SELECT count(*) FROM "Tier" WHERE "groupId" IS NULL;`
 *        must return 0 before any new code paths are released.
 *
 * Post-condition checked by the script itself: exits with code 1 if
 * any row still has `groupId IS NULL` after the run.
 */
import { randomUUID } from "node:crypto";
import prisma from "../app/db.server";

function newGroupId(): string {
  // Node 20 ships randomUUID natively. We don't need a cuid-compatible
  // shape here — groupId is opaque, never user-facing, never sorted.
  return randomUUID();
}

async function main() {
  const rows = await prisma.tier.findMany({
    where: { groupId: null },
    select: { id: true, shopId: true },
  });

  if (rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log("[backfill] no rows with groupId IS NULL — nothing to do");
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`[backfill] back-filling groupId on ${rows.length} legacy tier row(s)`);

  // One transaction so a partial failure leaves the table clean.
  await prisma.$transaction(
    rows.map((row) =>
      prisma.tier.update({
        where: { id: row.id },
        data: { groupId: newGroupId() },
      }),
    ),
  );

  const remaining = await prisma.tier.count({ where: { groupId: null } });
  if (remaining > 0) {
    // eslint-disable-next-line no-console
    console.error(`[backfill] FAILED — ${remaining} row(s) still have NULL groupId`);
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(`[backfill] OK — back-filled ${rows.length} row(s); 0 NULLs remaining`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[backfill] crashed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
