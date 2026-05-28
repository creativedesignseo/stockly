# ADR-013 — Registration Form builder (Sami-parity)

> **Status:** Phase 1 (foundation + storefront block + admin builder) IN
> FLIGHT. This is a stub written 2026-05-28 because Phase 1A's schema
> comment referenced an ADR file that didn't exist. The full
> retrospective + final cost/perf/migration discussion lands in Phase 1G
> when the legacy `WholesaleApplication` table is dropped after the
> 48h post-Deploy A soak.
>
> **Authors:** Jonatan Montilla (Adspubli) + Claude Code multi-agent
> swarm (Foundation / Storefront / Admin UI / integration).

## Context

Stockly's wholesale onboarding shipped in Sprint 2 with a hard-coded
8-field form (email, firstName, lastName, phone, companyName, taxId,
website, country, notes) rendered by the theme app extension at
`extensions/quick-order-form/blocks/registration-form.liquid`.
Applications landed in `WholesaleApplication` (Prisma model). Adequate
for the Sprint-4 dev-store pilot but a competitive gap vs Sami
Wholesale, whose admin gives the merchant a full form builder
(see `docs/competitive/sami-registration-form.md`).

The 2026-05-28 user push is parity with the most commonly used Sami
panels: Form elements, Appearance, Settings. After-submit, Email
Notifications, Integrations, and Account-page panels are explicitly
deferred to Phases 3-4.

## Decision (summary — full reasoning lands in Phase 1G)

1. **Schema-driven form** stored as JSON columns (`definition`,
   `appearance`, `settings`) on a new `RegistrationForm` table — one
   row per shop (singleton, 1:1 with `Shop`).
2. **Generic `Application` table** replaces the field-typed
   `WholesaleApplication` (`responses Json` instead of N flat columns).
   Both tables coexist for 48h after Deploy A; legacy drops in Phase 1G.
3. **Foundation TypeScript types are canonical** (`app/lib/registrationForm/types.ts`).
   Interface-based, `id` per field, row-level `status`, `titleEn` for
   localizable strings. The first integration shipped a parallel
   discriminated-union types file in the Admin UI worktree —
   reviewer caught the silent JSON shape divergence; fix landed
   2026-05-28 by deleting the duplicate and migrating all importers.
4. **Snake_case field keys** in the seed default (`first_name`,
   `company_name`, etc.) for back-compat with the legacy storefront
   POST handler.
5. **`dnd-kit`** for drag-and-drop field reordering. Not `react-dnd`.
6. **3 seed templates in code** (`standard`, `modern`, `samitaB2B`)
   exported from `app/lib/registrationForm/seeds.ts`. No template store,
   no DB-backed library in Phase 1.
7. **English-only editor + single step** in Phase 1. Schema accommodates
   localized strings and multi-step; UI defers both.
8. **NO email infrastructure** in Phase 1. Approve/reject still work
   via admin click but no transactional email goes out. Phase 3 wires
   Resend (or equivalent) for admin-on-submit + customer-on-decision.
9. **No-cache GET endpoint** at `/apps/stockly/registration-form`.
   `version` integer on the row is the cache-bust hint for any future
   client-side de-duping.
10. **Dual-write during the soak.** `POST /apps/stockly/apply` writes
    to LEGACY `WholesaleApplication` (authoritative, returns 201) and
    MIRRORS to the new `Application` table (non-blocking, structured
    log keys `[rf.dual_write.fail]` + `[rf.validation.diverged]`).

## Consequences

- Merchant gains a Sami-parity admin at `/app/registration-form` with
  Form elements + Appearance + Settings panels.
- Storefront keeps working unchanged — the rewritten theme block reads
  the seed default form (which mirrors the legacy 8 fields verbatim)
  the first time a shop hits it.
- Existing applications in `WholesaleApplication` survive the
  migration. Back-fill copies them into `Application` during Phase 1G,
  before legacy drop.
- ~17 commits (Foundation + Storefront + Admin UI + integration + nit
  fixes) for ~20 files touched. Test count went 50 → 96.
- Tech debt: the Admin UI's `seed-templates.ts` was deduplicated against
  Foundation's `seeds.ts`; the local types file
  (`app/lib/registration-form-types.ts`) is gone.

## Out of scope (Phase 2-4 follow-ups)

- Multi-step forms
- Multi-language editor
- After-submit rich text editor with dynamic variables
- Email notifications (Resend integration)
- Integrations panel (Klaviyo, Mailchimp, webhooks)
- Account page integration
- Lock-the-registration-page password gate
- Template thumbnails + DB-backed template store
- Custom-CSS sandboxing

## References

- Plan: `progress/2026-05-27-registration-form-plan.md`
- Reverse-engineering: `docs/competitive/sami-registration-form.md`
- Foundation progress: `progress/2026-05-28-rf-foundation.md`
- Storefront progress: `progress/2026-05-28-rf-storefront.md`
- Admin UI progress: `progress/2026-05-28-rf-admin-ui.md`
- App Proxy contract: `progress/2026-05-28-app-proxy-contract.md`
- Reviewer fixes: this commit's parent + the `fix(rf): reviewer nits`
  commit
