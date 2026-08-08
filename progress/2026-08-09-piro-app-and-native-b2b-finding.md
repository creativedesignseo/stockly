# 2026-08-09 — Dedicated Piro app + the native-B2B finding

## Objective

Get Stockly installable on Piro Jewelry, a store outside Adspubli's
Partner organization. Then, on Jonatan's request, audit Shopify Editions
Spring 2026 against the app.

Two outcomes: a working distribution path was built, and the product's
core premise turned out to be void.

## Part 1 — Why the app could not reach Piro

Root cause found in the Partner dashboard (Distribución → Distribución
personalizada), quoted verbatim:

> "Podrán instalar la aplicación en cualquier tienda que pertenezca a la
> misma organización Plus que **desarrollo-adspubli.myshopify.com**"

The existing app's install link is **bound to the dev store**, and the
"allow multi-store install" checkbox is checked but disabled. That is the
`invalid_link_organization` failure from 2026-07-08 — not a bug, a
binding chosen when distribution was first configured and not editable
afterwards.

Shopify's docs confirm the binding is permanent:

> "You can't change the distribution method after you select it"

## Part 2 — What was built

A **second Shopify app** dedicated to Piro. Same code, same server, new
registration:

- App "Stockly", id `406994354177`, client_id
  `b530543e584cdc7d40a269134f7b4ad3`, in org 130399301.
- `shopify.app.piro.toml` — byte-identical to `shopify.app.toml` except
  `client_id` and `name` (verified by diff), plus one deliberate removal
  (below).
- `npx shopify app deploy --config=piro` → **`stockly-2` released.**
  Ships both Functions (`stockly-volume-discount`,
  `stockly-opening-order`) and both theme extensions.

`shopify app config link` could not be used: it rejects `--config` when
`--client-id` is given, and prompts for a filename otherwise, which fails
in a non-interactive shell. The toml was derived from the base config
instead — same result, deterministic.

### One capability was dropped to get the deploy through

First deploy attempt failed:

> "This app is not approved to subscribe to webhook topics containing
> protected customer data."

A brand-new app has no protected-customer-data approval. The
`customers/update` subscription is commented out in
`shopify.app.piro.toml` with the reason inline. Nothing in the core flow
depends on it — it only auto-enrolls customers approved by an *external*
flow into the opening-order pending list. Re-enable once access is
granted in the Dev Dashboard.

**Unverified and important:** whether `customerCreate` (the storefront
registration form) works on Piro without that same approval. On dev
stores approval is automatic; on a real store it may not be. If it is
required, the registration form will fail with `ACCESS_DENIED` while
wholesale pricing keeps working — the two are independent.

## Part 3 — The finding that matters more

Shopify Editions Spring 2026, verified against Piro's live store:

```
Empresas B2B en 'piro' — 50 encontradas
Catálogos B2B (10/3 máx en plan Basic)
```

Native B2B has been on Basic/Grow/Advanced since 2026-04-02 at no cost.
Piro already runs 50 native company accounts. Stockly's stated
differentiator — B2B on Basic without paying for Plus — no longer exists.

Full analysis and consequences: **ADR-017**.

The good news in the same finding: **minimum order VALUE is still not
native** (native does per-product quantity rules only), which is exactly
what `stockly-opening-order` provides. That is the piece Piro actually
needs this week.

**Open risk:** that Function matches pending buyers by customer GID, but
native B2B checkout runs in a company-location context. Untested. Verify
before promising Ana anything.

## Verification

- `PATH="$(pwd)/node_modules/.bin:$PATH" bash scripts/verify.sh` → green.
  (The PATH prefix is required — see the 2026-07-26 HANDOFF note about
  the global CLI hanging on javy.)
- Production live: `/`, `/healthz`, `/legal/privacy` all `200`;
  `stockly: ● Online`.
- `node_modules` was missing mid-session and had to be reinstalled;
  worth knowing if a later session hits odd tooling failures.

## Not done — needs Jonatan

1. **Select custom distribution** on the new app, targeting
   `piroaccessories.myshopify.com`. Irreversible, so left to him.
2. **Swap Railway's `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET`** to the new
   app. One backend serves one app: doing this **breaks the dev-store
   install**. `shopify app dev` remains available for development.
3. **Request protected customer data access** for the new app.
4. **Verify the validation Function against a real B2B checkout.**

## Next step

Jonatan's call on steps 1-2, then test 4 before telling Ana it is ready.
Install with Stockly's discounts OFF regardless — Editions also shipped
B2B discount stacking, which makes the double-discount risk worse.
