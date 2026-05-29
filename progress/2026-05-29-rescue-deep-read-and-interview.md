# 2026-05-29 — Rescue deep-read + interview (NO code touched)

## Objective

Jonatan asked for a full read-only understanding of Stockly before any
further code, to drive a "rescue" plan without scope creep. This session
is **analysis + interview only** — no code, no deploy, no push of code.
The eventual deliverable is a rescue document (radiography, planning
diagnosis, real feature list, blockers, 24h/72h/7d plan, DoD per phase,
what to freeze, what not to touch, what to verify in Shopify).

## What was read (in order)

AGENTS.md, CLAUDE.md (both in session context), HANDOFF.md,
tasks/current.md, README.md, ROADMAP.md, PROJECT.md, ADR-009 (Fly),
ADR-010 (pricing engine), ADR-012 (volume multi-band), ADR-013
(registration form builder), docs/competitive/sami-volume-pricing.md,
docs/design-system.md, git log -30, package.json, scripts/verify.sh,
shopify.app.toml, prisma/schema.prisma (all models), app/routes/,
app/services/, app/lib/, extensions/, run.ts structure, the volume
pricing implementation progress.

## Technical radiography (verified from code, not docs)

**Real and live (Fly v62 / stockly-26):**
- Embedded admin (Remix+Polaris), OAuth (new embedded auth strategy),
  Fly + Managed Postgres.
- Pricing engine: `extensions/stockly-volume-discount/src/run.ts` (618
  lines) — percentage/fixed_amount/fixed_price, per_line/cart_total/
  mix_variants, active-date filter, quantityTo, FPQ, qualifiedCustomers
  bypass.
- Storefront blocks: Quick Order Form, FPQ banner, Wholesale Product
  Panel, Registration Form.
- Applications queue with approve/reject E2E (validated May 26 on dev
  store), GDPR webhooks (data_request/redact/shop.redact), legal pages
  (draft).
- Registration Form multi-form (list→editor + shortcode) — shipped THIS
  session (commits 49fcd45 / e25ef10 / ba6ae0c, deploy v62 + stockly-26).

**Half-done / storage-only:**
- **Volume Pricing multi-band editor does NOT exist in admin** — engine
  + service (`createRule/updateRule/listRules`) support N bands, but the
  admin forms still edit ONE band. Multi-band rules creatable only via
  service/script. (ADR-012 "negative consequences".)
- active-dates + showTableOnPdp: DB + Function ready, no admin UI, no PDP
  table theme block.
- Two pricing areas: `/app/pricing` (Wholesale flat) + `/app/volume-
  pricing` (multi-band) — "ADR-014" referenced in commits/HANDOFF but the
  file does NOT exist in docs/decisions (doc drift).

**Serious risks:**
1. The revenue path (Discount Function) has 7 fixtures that have **NEVER
   been executed** — the extension test runner is broken locally
   (`ERR_MODULE_NOT_FOUND: strip-literal`). "Correct by inspection" only.
   Includes the Date.now() active-date guardrails.
2. **No Billing** — `shopifyApp()` has no billing config; no way to
   charge inside the app (B0-2 open).
3. `orders/paid` webhook (automatic FPQ) is OFF — gated on Privacy Policy
   approval for Protected Customer Data (B0-5). FPQ works only manually.
4. Piro (anchor pilot) is "install pending merchant approval"; everything
   is validated on dev store `desarrollo-adspubli`, not a paying store.
5. `no-discounts.json` fixture asserts strategy FIRST but run.ts returns
   ALL — will fail when the runner is fixed.

## Interview status

**Round 1 asked (10 questions), awaiting Jonatan's answers.** Themes:
(1) the real first pilot + is Piro committed, (2) nearest goal: paying
pilot vs App Store vs sellable demo + date, (3) his definition of
pilot-ready, (4) App-Store-ready this quarter or far, (5) which Sami
parts are must-have vs nice (RF builder vs Volume multi-band — which to
freeze), (6) does pilot #1 need multi-band or just flat baseline %,
(7) how he bills the first pilot (external invoice vs Shopify Billing →
decides if B0-2 blocks), (8) awareness that the revenue path tests never
ran + last real checkout validation, (9) his view on why it took so long,
(10) who is telling him "there are discrepancies / it doesn't work" and
what exactly.

**Round 2 pending** (not yet asked): acceptable vs blocking tech debt;
missing accesses/credentials to verify on Shopify/Fly/GitHub; what to
freeze; what he'd do if rebuilding from scratch.

## Working hypotheses to validate with Jonatan (not conclusions yet)

- Slowdown likely driven by: the Vercel→Fly pivot (~8h), heavy "Sami
  parity" feature breadth (RF builder, volume multi-band, FPQ, baseline,
  aggregation modes, mix_variants) for a 3-pilot MVP, and multi-agent/
  worktree overhead generating lots of docs/ADRs.
- Likely rescue thesis: freeze new feature breadth, prove ONE end-to-end
  paying path on ONE real store, fix the revenue-path test runner so the
  pricing engine is trustworthy, decide billing model.

## Update (later 2026-05-29) — interview round 2 + user direction

Jonatan did not answer Round 1 verbatim but gave direction that reframes
the rescue:

- **New top concern: DESIGN.** He said "falta diseño" (design is missing)
  and "necesito reconfigurar todo" (I need to reconfigure everything).
  OPEN: is this *maquillaje* (a visual pass over the existing app) or
  *cirugía* (re-architecting structure/flows)? Must clarify before any
  plan — they are very different efforts. Round 2 asked him to split
  "falta diseño" into: (a) admin look&feel, (b) storefront, (c) product
  structure/navigation, (d) positioning.
- **North star confirmed (his words):** Stockly = bring Shopify's
  powerful B2B capability — normally locked to Plus ($2,300/mo) — down to
  Basic/Grow, with a premium face. He framed it as "la capacidad potente
  de B2B [de] Shopify". Validate the exact one-liner with him.
- **Reference aesthetic:** repo says "premium luxury brand"; asked him to
  confirm or give a concrete visual reference (Sami / a Figma / shots).
- **He wants to continue this project in the Claude Code DESKTOP app.**
  This closure exists so the desktop session resumes with full context.

Round 2 questions asked (awaiting answers): (1) what exactly "falta
diseño" means (a/b/c/d), (2) maquillaje vs cirugía, (3) concrete visual
reference, (4) his one-line "why pay for Stockly vs BSS / native B2B",
(5) nearest goal (paying pilot / App Store / sellable demo) + is Piro
committed.

## Next step (resume in desktop)

1. Get Jonatan's answers to the Round 2 design questions — especially
   maquillaje vs cirugía, because that decides the whole plan shape.
2. Then Round 3 (acceptable vs blocking tech debt, missing accesses to
   verify on Shopify/Fly/GitHub, what to freeze, rebuild-from-scratch).
3. Then write the consolidated rescue document (radiography, planning
   diagnosis, real feature list, blockers, 24h/72h/7d plan, DoD per
   phase, what to freeze, what not to touch, what to verify in Shopify).
NO implementation until the interview closes.

## Note

No code, schema, route, or extension files were modified this session.
Only this progress entry + a tasks/current.md pointer were written, as
part of the requested "cierre".
