# App Store listing content — ready to paste

Drafted 2026-08-11 for the public app (`409384386561`). Every string below
was checked against Shopify's inline validators: no "Shopify", no "plan",
no "pricing", no unverifiable claims, all within character limits.

Form: Partners → Stockly → Distribution → Manage submission → Create listing
(`/services/partner-app-submissions/40128ca5d894434595dd2e603d7fe517/en`)

---

## Already saved ✅

**Primary category:** Finding products › Sourcing options › Wholesale

**Pricing options** (7 tags): Customer tagging · Custom pricing ·
Customer groups · Signup form · Volume discounts · Tax exemptions ·
Tiered pricing

**Order management** (2 tags): Order form · Order minimums

**Primary language:** English

> Every tag maps to something that actually exists in the app. Deliberately
> NOT selected: Price locking, Pricing import, Wholesale login, API access,
> Draft orders, Manual orders, Multi-currency, Order limits, Inventory
> anything. Shopify verifies these during review — claiming a feature you
> don't have is grounds for rejection.

---

## To paste

### Introduction (max 100 — this is 97)

```
Sell wholesale from your store. Approve B2B buyers, set volume discounts, enforce order minimums.
```

⚠️ Do not reintroduce the words **"Shopify"**, **"plan"** or **"pricing"** —
the validator rejects all three here.

### App details (max 500 — this is 496)

```
Stockly adds the wholesale tools your store is missing.

Buyers apply through a registration form you design. Applications land in a queue where you approve or reject each one. Approved buyers are tagged automatically and see their wholesale rates immediately.

Set volume discounts by quantity band, per product, collection, or store-wide.

Require a minimum first order before a buyer becomes a full wholesale account, and keep a recurring minimum after that. Minimums are enforced at checkout.
```

⚠️ Avoid the word **"right"** (as in "right away") — the validator flags it
as an unverifiable claim.

### Features (min 3, max 5 — each max 80)

```
Wholesale application form with an approval queue and automatic customer tagging
```
```
Volume discounts by quantity band, per product, per collection, or store-wide
```
```
First-order and recurring order minimums enforced at checkout
```
```
Quick order form for buying many products by SKU in a single pass
```

---

## Still needed — only you can provide these

### 1. App icon
Already downloaded and verified: **1200×1200 PNG, 21 KB**, at
`docs/brand/app-icon-1200.png` in this repo. Recovered from the Piro app,
where it was only ever an upload.

Upload at: Dev Dashboard → Stockly → Configuración → "Ícono de la app".
(The browser file picker can't be driven programmatically — this one is a
manual select.)

### 2. Screencast URL — **required**
A video demo showing onboarding and core functionality. Host it anywhere
with a public URL (YouTube unlisted, Loom, Vimeo).

Suggested run of show, ~2–3 minutes:
1. Install → the setup guide appears
2. Storefront: a buyer submits the wholesale registration form
3. Admin: the application appears in the queue → approve it
4. Storefront: the same buyer now sees wholesale rates
5. Cart under the minimum → blocked at checkout; above it → passes

### 3. Test account — **required**
Username + password for a store where reviewers can exercise the app
end-to-end.

⚠️ **Not Piro.** That is a live client store with real customers and orders.
Create a separate development store, install the app, and seed it with
realistic products, a wholesale customer and a couple of price tiers.

Shopify explicitly says: no Google SSO, no 2FA unless unavoidable.

### 4. Screenshots — 4 to 7
With realistic merchant data. Obvious placeholders ("Test product 1") are a
common rejection cause.

Suggested order:
1. Dashboard with the setup guide
2. Wholesale application queue with real-looking applications
3. Volume pricing configured with bands
4. The registration form on a storefront
5. The quick order form on a storefront

---

## Known form quirk

The listing form is React-controlled and rejects values injected
programmatically — the character counters update but its internal validation
still reports the fields as empty. **The Features fields in particular have
to be typed or pasted by hand.** The text above is exact; paste it as-is.
