# 2026-08-21 — Three stacked discounts on Piro, and the switch that ends it

## What was found

Piro had **three independent 65% wholesale discounts** configured at the
same time:

| # | Engine | Value |
|---|---|---|
| 1 | Shopify B2B catalog price list "Wholesale B2B" | −65% |
| 2 | Stockly `wholesaleBaselinePct` | 65 |
| 3 | Stockly Tier rule "Wholesale 65" (active, collection-scoped) | 65% |

They compose multiplicatively. A $28 bracelet:

```
$28.00 × 0.35 (catalog) × 0.35 (baseline) × 0.35 (rule) = $1.20   → 95.7% off
```

Even discounting the catalog, Stockly alone was double-discounting:
$28 × 0.35² = $3.43, 87.75% off.

It had not fired yet only by accident: Stockly's FPQ gate withholds its own
discount from a buyer who has not cleared the first-order minimum, and the
observed buyer had not. Reinstalling the app, or qualifying any customer,
would have detonated it.

## The deeper problem

The two engines do not merely stack — **they defeat each other's logic**.
Stockly's FPQ promises *"no wholesale price until the first order reaches
$300"*. The catalog hands out the same 65% unconditionally. So a buyer
gets wholesale pricing without ever qualifying, and the gate is
decorative. Any reasoning about Stockly's pricing behaviour on that shop
was invalid while the catalog existed.

## Why the $300 minimum did not block a live $82.60 order

Verified against production, not inferred:

- Buyer = customer `8239683010639` (tagged `wholesale` in Shopify).
- Stockly's enrolled customers for Piro: `6050330345551`, `6239531532367`,
  `6422816325711`, `6562857091151`, `7986197004367`. The buyer is in
  **neither** `pendingCustomers` nor `qualifiedCustomers`.
- The Validation Function fails open on unrecognised buyers by design
  ("blocking a legitimate sale because of a bug is worse than not
  enforcing a minimum"). So the gate never evaluated.

The minimum did not fail. It was never applied. Stockly knows 5 of Piro's
50 B2B companies — it protects ~10% of their wholesale buyers.

## The fix

`Shop.pricingSource`: `'stockly' | 'catalog'`, default `'stockly'`.

Enforced in `buildConfiguration()` (`discount-function-sync.server.ts`):
in `catalog` mode it emits `wholesaleBaselinePct: 0` and `tiers: []`, so
the Discount Function has nothing to apply.

**The switch lives at the sync boundary, not in the UI.** Every pricing
change flows through that one function, so a leftover baseline or a rule
someone re-enables next month cannot leak a second discount into checkout.
A UI-level guard would have been advisory; this one is structural.

Untouched in both modes: checkout order minimums (a separate Validation
Function), the registration form, the approval queue, the quick order
form.

4 tests, including one asserting that a Shop row predating the column
keeps its pricing (undefined → `stockly`).

Piro set to `catalog`; its duplicate rule deactivated.

## Also shipped

`customers/update` deployed as app version `stockly-3`. That the deploy
succeeded is itself proof the protected-customer-data approval is real —
the identical command failed on 2026-08-11 with *"This app is not
approved to subscribe to webhook topics containing protected customer
data"*.

## Process failure worth recording

The catalog price list was already in project memory, and had been
explained to Jonatan earlier the same day. What was never done was the
obvious next query — *what does Stockly have configured for that same
shop?* — a single Prisma call already run minutes earlier for another
reason. The compounding risk was also described as hypothetical ("if we
reinstall, they could compound") when it was already configured and
waiting.

**Rule: when two systems can price the same order, read BOTH
configurations before concluding anything about either.**

## Open

- **Backfill Piro's 45 unenrolled wholesale customers.** `customers/update`
  only fires on change, so it will not retroactively enrol them. Until
  then the checkout minimum covers ~10% of Piro's buyers.
- Theme extension warning surfaced during deploy: `registration-form.js`
  is 14,629 B against a 10,000 B threshold. Relevant to the Built for
  Shopify criterion "minimizes impact on storefront loading speed".
