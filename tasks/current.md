# tasks/current.md — Stockly active task queue

> Single page of what's being worked on **right now**. Keep it short.
> Older completed tasks live in `progress/`. Strategic plan lives in
> `ROADMAP.md`. Operational truth lives in `HANDOFF.md`.

**Last updated:** 2026-08-21 (night) — **🛡️ Single source of wholesale discount shipped (`pricingSource`); Piro set to `catalog` after finding three stacked 65% discounts. `customers/update` deployed as app version `stockly-3`.** Prior: **🎉 APPROVED AND PUBLISHED on the Shopify App Store. Listing live at https://apps.shopify.com/stockly-2, visibility deliberately still LIMITED. The review saga is over; the post-approval queue below is the real work now.**

## P0 — Post-approval queue

### 1. Rotate the client secret — ONLY Jonatan can do this

Dev Dashboard → Stockly → App settings → Credentials → Secret → **Rotate**.
An agent must not do it: the whole point is that the old secret leaked into
a session transcript, and having an agent read the new one would write it
into the current transcript — same problem, new value.

Order matters (revoking early breaks webhook HMAC):

1. Rotate → copy the new secret.
2. Railway → service `stockly` → Variables → `SHOPIFY_API_SECRET` → paste → save.
3. Wait for deploy SUCCESS + `/healthz` 200 (an agent can verify this).
4. **Only then** revoke the old secret.

Cheapest moment there will ever be: production holds two sessions, both ours.

### 2. ✅ DONE — `customers/update` deployed (app version `stockly-3`)

Deployed 2026-08-21 20:50 UTC. Shopify accepted the protected-topic
subscription, which is itself proof the protected-data approval is real
(the same deploy failed on 2026-08-11 with "not approved to subscribe to
webhook topics containing protected customer data").

### 2b. Backfill Piro's existing wholesale customers — REAL GAP

Stockly knows **5** of Piro's **50** B2B companies, so the checkout
minimum currently protects ~10% of their wholesale buyers. Verified
2026-08-21: the buyer on a live $82.60 order was customer
`8239683010639`, in neither `pendingCustomers` nor `qualifiedCustomers`,
so the $300 gate never evaluated — the Validation Function fails open on
anyone it does not recognise, by design.

`customers/update` only fires on change, so it will NOT pick up the 45
already-tagged customers. A one-off import is needed: read the customers
carrying Piro's wholesale tag from the Admin API and create the missing
`WholesaleCustomer` rows. Decide per customer whether they land as
qualified (no opening-order gate) or pending (must clear $300 first) —
they are existing buyers, so "qualified" is probably right, but that is
Ana's call, not a technical default.

### 3. Reinstall on `piroaccessories`

Down since the 2026-08-12 credential switch. Her 5 wholesale customers are
intact in the database. **Tell Ana honestly:** the $300 minimum she believes
she has came from the theme (`theme/snippets/b2b-minimum-order.liquid`), not
from Stockly, and the theme gate is bypassable via cart permalinks. This
reinstall is the *first* time minimums are genuinely enforced there. Frame it
as the upgrade it is — do not let her keep believing it already worked.

### Still deliberately frozen

- **Do NOT press "Make fully visible"** yet. Limited→full is one click at any
  time; App Store reviews are permanent and weigh heavily in ranking. Get the
  first merchants and ~5 reviews first. On Basic plans the storefront shows
  struck-through retail + discount (Cart Transform `update` is Plus-only), and
  only Starter is deliverable.
- Do NOT change access scopes (`write_products`, `write_publications`,
  `read_orders` are declared but unused; changing forces re-consent).

### Growth notes (benchmarks pulled 2026-08-21)

BSS B2B Wholesale Pricing: **5,253 stores**, 1,105 reviews. Wholesale Pricing
Now: **2,268 stores**, falling 22% YoY. ~35% of App Store apps have zero
reviews. Shopify's B2B GMV grew 76% in 2025. 100 paying merchants ≈ 2% of
BSS ≈ $3,900/mo, against ~$20/mo of infrastructure. Reviews are the gate:
the listing does not convert without them.

### Deferred, with reasons

- [ ] **Real B2B checkout test on Piro.** Outstanding since July. The 22
  fixtures prove the Function's logic against synthetic input; they cannot
  prove Shopify hands it a buyer identifier in a real native-B2B checkout.
  Blocked until Piro is reinstalled.
- [ ] `hello@stocklygo.site` is printed in the marketing site footer and does
  not exist — create the alias or change the address. Two test submissions
  (`test-deploy-check@`, `test-browser-path@`) sit in the Netlify form inbox.
- [ ] No LLM API key configured for `graphify`, so the graph's semantic pass
  over docs/images is stale. The code graph is current.

## Known and NOT fixed (audited 2026-08-14, deliberately left)

- No Prisma `connection_limit` on the Railway `DATABASE_URL`; `new
  PrismaClient()` sizes its pool from the *host's* core count inside a
  container.
- `app/routes/app.onboarding.tsx` redirects drop the query string
  (`throw redirect("/app")`), contradicting the warning in `app._index.tsx`.
- Legal pages are Spanish-only against an English listing.
- `syncTiersToFunction` swallows every error and returns void, so a failed
  discount sync shows the merchant a green success. All its call sites have
  dead error handling.

---

Older completed and superseded items — the whole submission checklist, the
May/June sprints, and the pre-pilot backlog — moved to **`tasks/archive.md`**
on 2026-08-14. Per-session journals remain in `progress/`.
