# site/ — stocklygo.site

Marketing site for Stockly. Separate from the app in `app/` (Remix, deployed
to Railway): different audience, different release cadence, and no reason for
a marketing page to carry the app's runtime.

## Stack and why

| Choice | Reason |
|---|---|
| **Astro 5**, static output | Ships **0 KB of JavaScript**. Nothing on this page needs a client runtime — the FAQ is `<details>`, the form is a native POST. |
| **Tailwind v4** (`@tailwindcss/vite`) | Semantic design tokens in `src/styles/global.css`, the same pattern shopify.com's own site uses (`rounded-button`, `px-button-px`). |
| **Inter Variable**, self-hosted | One `.woff2` in `public/fonts/`, preloaded, `font-display: optional` so a slow font never shifts the layout. No third-party font request. |
| **Netlify** + Netlify Forms | The waitlist form works with no API key, no serverless function and no client JS. Submissions land in the Netlify dashboard. |

Reverse-engineered from `shopify.com/es/prueba-gratis` (Nov 2026): React
Router v7 + Vite, Tailwind v4 with token utilities, critical CSS split out,
self-hosted Inter preloaded, hero image preloaded per breakpoint, Cloudflare
edge cache (`max-age=900, stale-while-revalidate=86400`). Their framework
choice is driven by login, cart and A/B testing — none of which this page has,
hence Astro instead.

## Budget

Measured on the production build:

| Asset | gzip |
|---|---|
| `index.html` (CSS is a separate file, see below) | 9.2 KB |
| `_astro/*.css` | 6.6 KB |
| `inter-variable.woff2` | 48 KB |
| **JavaScript** | **0 KB** |

Keep it that way. If a change adds a `.js` file to `dist/`, question it.

## Commands

```bash
npm run dev      # localhost:4321
npm run build    # -> dist/
npm run preview  # serve dist/ locally
```

## Content rules

**Every claim on this page must map to something that exists in the app.**
The feature copy is derived from `docs/app-store-listing-content.md`, which
was already checked against Shopify's listing validators. Shopify reviewers
read marketing sites too, and advertising a feature that isn't built is
grounds for rejection.

Specifically, do **not** add:

- The Growth or Plus plans. Only Starter ($39/mo, from
  `app/services/billing-plans.ts`) is advertised, because Growth and Plus
  list features that do not exist yet (variant pricing, Net terms, quotes).
- Anything implying a clean wholesale price with no strike-through. That
  needs Cart Transform's `update`, which is Plus-only. The FAQ says so.
- Customer logos or testimonials that aren't real.

## When the app is approved

1. Replace the waitlist form with the App Store install button
   (`src/components/WaitlistForm.astro`, used in `index.astro` twice).
2. Update the FAQ entry "When can I install it?".
3. Drop the "in review" line from the hero disclaimer.

## Legal pages

`/privacy` and `/terms` 301 to the app's own pages (see `public/_redirects`)
so there is one copy to keep current, not two.
