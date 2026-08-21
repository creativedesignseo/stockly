# 2026-08-21 — Approved, and the first three post-approval changes

## Objective

Handle Shopify's verdict and the work it unblocked: re-enable the
`customers/update` webhook, fix the blank app icon in the admin sidebar,
and set up the client-secret rotation.

## The verdict

**APPROVED.** Email 2026-08-21 18:30 UTC, *"Congratulations! Your app has
been approved"* — *"officially been approved and published on the Shopify
App Store as a listed application"*. Less than 24 hours after the reviewer
requested changes (2026-08-20 14:32 UTC).

- Listing: **https://apps.shopify.com/stockly-2** — 200. The handle is
  `stockly-2`; `apps.shopify.com/stockly` is a 404 and belongs to someone
  else. Do not guess this URL.
- Partner Dashboard reads **Published**, App Store visibility **Limited**
  (deliberate — "Make fully visible" untouched).
- **Protected customer data access: Approved, Aug 21, 2026** (Partners →
  API access requests). Verified on the page before acting on it.

## Changed

### `customers/update` re-enabled (`dd244bd`)

Commented out on 2026-08-11 because a brand-new public app had no
protected-customer-data approval and Shopify refused to create a version
while subscribing to a protected topic. The approval above removes that
block. No scope change — it rides on the already-granted
`write_customers`, so installed shops are not re-prompted.

**Open gap:** the toml is committed but **not deployed**. Until
`npx shopify app deploy --config=public` runs, the repo and Shopify's live
config disagree and the topic is never delivered.

### Blank admin nav icon fixed (`dd244bd`)

Diagnosed by reading the rendered DOM rather than guessing. Findings, in
order:

1. The colour app icon (`applications/..._200x200.png`) is rendered only in
   the embedded app's title bar, at 20x20. It is **not** what the sidebar
   uses.
2. The sidebar icon is `<rect fill="currentColor" mask="url(#...)"/>` — an
   SVG used as a **mask** and filled with the admin's text colour.
3. The masked SVG began with `<rect width="3.84" height="3.84"/>` — a
   full-canvas background rectangle. Through a mask that paints the entire
   box solid, burying the logo. Hence the black square.

Fix: strip the background rect, normalise `viewBox` to `0 0 16 16`, scale
the two logo paths x4, `fill="currentColor"`. Rendered old-vs-new to PNG
and compared before uploading. File: `docs/brand/stockly-nav-icon-16.svg`.

Upload path (not obvious — it is in the **Dev** Dashboard, not Partners):
**Dev Dashboard → Stockly → App settings → Navigation bar → Manage →
Upload icon**. Direct URL:
`partners.shopify.com/3062121/apps/409384386561/edit/embedded_app/navigation`

Uploaded and **verified in the real admin sidebar**, not just in the page's
own preview.

> Correction worth recording: earlier in the session this "Navigation bar"
> screen was dismissed as deprecated and irrelevant. The deprecation banner
> refers to static app *menus*; the **icon** on that screen still feeds the
> modern sidebar. The advice was wrong and cost a detour.

### Client secret — deliberately NOT rotated

An agent must not perform this one. The reason for rotating is that the old
secret leaked into a session transcript; having an agent read the new one
writes it into the current transcript, reproducing the problem with a new
value. Steps for a human are in `tasks/current.md`, order-sensitive:
rotate → Railway → verify SUCCESS + `/healthz` → only then revoke the old.

## Verified (observed, not assumed)

- `verify.sh` green — 156 app tests in 14 files, extension fixtures (14 + 8),
  both builds.
- Production live: `/healthz`, `/`, `/legal/privacy`, `/legal/terms`,
  `/auth/login` → **200**. All five webhook routes, including
  `customers/update`, → **401** on a forged HMAC.
- Listing `apps.shopify.com/stockly-2` → **200**.
- Railway `dfda1b4a` **SUCCESS**.

## Market benchmarks (for the 100-customer question)

BSS B2B Wholesale Pricing: 5,253 stores / 1,105 reviews. Wholesale Pricing
Now: 2,268 stores, **-22% YoY** (merchants leaving — a migration target).
~35% of App Store apps have zero reviews. Shopify B2B GMV +76% in 2025.
100 paying merchants ≈ $3,900/mo against ~$20/mo infrastructure.

## Next step

The three items in `tasks/current.md`: rotate the secret (human), deploy the
webhook config, reinstall Piro. Do not press "Make fully visible" until
there are first merchants and reviews.
