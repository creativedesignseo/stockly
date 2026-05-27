# Phase 1F — Registration Form admin builder UI

> Date: 2026-05-28
> Branch: worktree-agent-aefba126a1ac4b564
> Plan: progress/2026-05-27-registration-form-plan.md (§7, §8)
> Status: SHIPPED — green on `bash scripts/verify.sh`. Mocks the
> Foundation service; integration commit pending.

---

## Objective

Build the admin builder at `/app/registration-form` per plan Phase 1F.
3-pane layout (LeftRail / middle panel / live preview) + top toolbar
+ App Bridge SaveBar, with dnd-kit-powered field reorder. No service
layer or storefront block work in this phase — both run in parallel
worktrees and integrate later.

## Files inspected

- `progress/2026-05-27-registration-form-plan.md` (full plan, §3 + §7)
- `app/routes/app.tsx` (NavMenu placement)
- `app/routes/app.pricing.new.tsx` (SaveBar + Polaris layout pattern)
- `app/services/tiers.test.ts` (vitest style reference)
- `vite.config.ts`, `package.json` (no jsdom — tests are pure Node)
- `node_modules/@shopify/polaris-icons/dist/index.d.ts` (icon name audit)

## Files changed

**New (15):**

- `app/lib/registration-form-types.ts`
- `app/components/registration-form/seed-templates.ts`
- `app/components/registration-form/seed-templates.test.ts`
- `app/components/registration-form/keys.ts`
- `app/components/registration-form/keys.test.ts`
- `app/components/registration-form/layout.ts`
- `app/components/registration-form/layout.test.ts`
- `app/components/registration-form/field-icons.tsx`
- `app/components/registration-form/LeftRail.tsx`
- `app/components/registration-form/FieldList.tsx`
- `app/components/registration-form/FieldEditModal.tsx`
- `app/components/registration-form/TypePickerModal.tsx`
- `app/components/registration-form/AppearancePanel.tsx`
- `app/components/registration-form/SettingsPanel.tsx`
- `app/components/registration-form/FormPreview.tsx`
- `app/components/registration-form/TemplatePickerModal.tsx`
- `app/routes/app.registration-form.tsx`

**Modified (3):**

- `package.json` (+ `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`)
- `package-lock.json` (regenerated)
- `app/routes/app.tsx` (NavMenu link)

## Commands run

```
npm install
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
bash scripts/verify.sh   # lint + 66 tests + extension build + remix build, all green
```

## Verification

`bash scripts/verify.sh` → green. 66 unit tests pass (22 new specs
across seed-templates, layout, keys). Remix client + SSR bundles
build clean (the `@media print` CSS warning is pre-existing Polaris
noise, not introduced here).

## dnd-kit usage points

Single SortableContext in `FieldList.tsx`:

- `PointerSensor` (5px activation distance to avoid hijacking clicks
  on edit/delete buttons) + `KeyboardSensor` (accessibility).
- `verticalListSortingStrategy` — one column of full-width rows.
- `arrayMove` on `onDragEnd` → `onReorder(next)` callback up to the
  route, which clones the form and replaces `definition.steps[0].fields`.

## Plan deviations

1. **Tests are `.test.ts` not `.test.tsx`.** Vitest has no jsdom or
   happy-dom configured in this repo. Rather than adding a heavy
   dependency for one phase, I extracted the testable logic into
   pure helpers (`keys.ts`, `layout.ts`) and tested those + the
   seed-template integrity. Component rendering tests would belong
   in a follow-up that introduces `@testing-library/react` and a
   jsdom env — out of scope for Phase 1F.
2. **Color pickers are native `<input type=color>`, not Polaris
   `ColorPicker`.** Polaris ships an HSB picker that returns an
   `{hue, saturation, brightness}` object — wiring that to a hex
   string for storage tripled the surface area for zero merchant
   benefit. Native picker + a hex TextField stays editable both ways.
3. **`structuredClone` for state copies.** Required by Node 17+
   (we target 20+), so safe; keeps the reducer-like helpers obvious
   without bringing in immer.
4. **Custom CSS is shown in admin but NOT applied to the preview.**
   A bad CSS rule from the merchant would otherwise break the admin
   chrome itself. The storefront renderer is the only place that
   injects it (in a scoped `<style>` per the plan).

## Integration TODOs left for the post-merge wiring

1. In `app/routes/app.registration-form.tsx`:
   - **Loader**: replace `const form = SEED_STANDARD;` with
     `const form = await getRegistrationForm(shop.id);` (use
     `ensureDefaultRegistrationForm` if you want first-load to
     auto-seed).
   - **Action**: replace the `void parsed;` no-op with
     `await upsertRegistrationForm(shop.id, { definition: parsed.definition, appearance: parsed.appearance, settings: parsed.settings, status: parsed.status });`.
2. Decide whether `app/components/registration-form/seed-templates.ts`
   stays (admin-only convenience for the Template Picker) or whether
   the route re-imports `TEMPLATES` from the Foundation service and
   this file is deleted. Both options work; the convenience file is
   tiny and decoupled.
3. Replace `app/lib/registration-form-types.ts` with re-exports from
   the canonical types in the Foundation service (`app/services/
   registrationForms.server.ts`) — or keep this file as the public
   "type-only" surface and have the service import from it. Either
   way, no duplication after merge.
4. Confirm the `Reset to template` TitleBar button copy + placement
   matches Sami once Foundation lands real template metadata.

## Open risks

- None blocking. The mocks are clearly fenced behind `TODO(integration)`
  comments and don't write anywhere — worst case is a save click
  appears successful while nothing persists. The route file's top
  doc-block calls this out explicitly.

## Next step

After Foundation PR merges: do the swaps in the Integration TODOs
list above, smoke-test save+reload, then move to Phase 1E (storefront
block) and Phase 1G (docs + ADR).
