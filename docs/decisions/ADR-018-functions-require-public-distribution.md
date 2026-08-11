# ADR-018 — Shopify Functions require public distribution; both existing apps are permanent dead ends

**Date:** 2026-08-11
**Status:** Accepted (platform constraint — not a choice we made, one we discovered)
**Supersedes in practice:** the custom-distribution strategy executed on 2026-08-09 and 2026-08-11
**Related:** ADR-010 (pricing engine is a Function), ADR-016 (opening-order minimum), ADR-017 (native B2B voids the premise)

---

## Context

On 2026-08-11 Stockly was successfully installed on the pilot merchant's live
store (Piro Jewelry, `piroaccessories.myshopify.com`) via a dedicated
custom-distribution app. The install worked, OAuth worked, the embedded admin
rendered. Then the first real B2B checkout test blocked nothing.

The reason, straight from production logs:

```
Shop must be on a Shopify Plus plan to activate functions from a custom app.
[opening-order-sync] no stockly-opening-order function found
```

Piro's plan, verified via Admin API: **Basic**. Not Plus. Not a development
store.

## The constraint, verbatim

From [shopify.dev/docs/apps/build/functions](https://shopify.dev/docs/apps/build/functions):

> "Stores on any plan can use public apps that are distributed through the
> Shopify App Store and contain functions. **Only stores on a Shopify Plus
> plan can use custom apps that contain Shopify Function APIs.**"

A Shopify staff moderator, asked this exact question
([community.shopify.dev/t/…/25232](https://community.shopify.dev/t/cart-transform-discount-functions-require-plus-for-custom-apps-but-not-public-apps-need-clarification-for-single-store-wholesale-pricing/25232)):

> "you're right that Shopify Functions in custom apps are for Plus stores
> only - **there are no work arounds**, it would have to be a public app for
> a Shopify Basic store!"

The rule is stated universally across Function APIs — there is no carve-out
for Cart & Checkout Validation. Both of Stockly's engines are affected:

| Engine | Type | On Basic via custom app |
|---|---|---|
| `stockly-volume-discount` | Discount Function | ❌ blocked |
| `stockly-opening-order` | Cart & Checkout Validation | ❌ blocked |

Since those two Functions *are* the product, **Stockly's core cannot run on
any non-Plus store through custom distribution.** Its entire target market is
Basic/Grow.

## Why this went undetected for months

All development happened on `desarrollo-adspubli.myshopify.com`, a **Partner
development store**. Development stores carry Plus-level capabilities for
testing. Everything worked there, and nothing in the local test suite or the
verification pipeline could have caught this — it is a plan/distribution
gate enforced server-side by Shopify at Function activation time, invisible
until you install on a real non-Plus store.

## The second, worse half: distribution is irreversible

From [shopify.dev/docs/apps/launch/distribution/select-distribution-method](https://shopify.dev/docs/apps/launch/distribution/select-distribution-method):

> "**You can't change the distribution method after you select it**, so make
> sure that you understand the different capabilities and requirements of
> each type."

No exceptions, no migration path documented. Consequently **both existing
apps are permanent dead ends** for App Store distribution:

| App | client_id | Distribution | Can ever go public? |
|---|---|---|---|
| `stockly` | `fbc28fda2161d2fc40037b0d211b83c9` | Custom → bound to the dev-store org | **Never** |
| `Stockly` | `b530543e584cdc7d40a269134f7b4ad3` | Custom → bound to Piro (chosen 2026-08-11) | **Never** |

The second binding was chosen the same day, hours before this constraint was
discovered. It solved the problem we knew about (org-locking) and locked in
the one we didn't.

## Decision

1. **Create a THIRD app with public distribution**, chosen at creation and
   never changed. All existing code carries over unmodified —
   `shopify.app.piro.toml` is the template; only `client_id` and `name`
   differ.
2. **Submit it with limited visibility ("unlisted")**. Per
   [shopify.dev/docs/apps/launch/distribution/visibility](https://shopify.dev/docs/apps/launch/distribution/visibility),
   only fully-visible apps "are indexed and appear in" App Store search and
   external search engines, while *"Merchants can install both fully visible
   and limited visibility apps from an app listing page that uses a Shopify
   App Store URL."* This gives Functions-on-Basic without a commercial launch.
   **It still requires the full app review** — unlisted skips the marketing
   burden, not the compliance burden.
3. **Keep the Piro custom app installed in the meantime.** Everything that is
   not a Function still works there: the wholesale registration form, the
   application queue, the admin. Piro loses nothing by waiting, because its
   $300 minimum already runs through a theme-level implementation that covers
   all 61 of its B2B companies (see Consequences).
4. **Do not pursue "Built for Shopify" status yet.** It is a separate 2–4 week
   process with stricter bars and is not required to unblock Functions.

## A permanent product ceiling discovered alongside

From the same Shopify staff thread: the Cart Transform **`update` operation**
(rewriting a line's actual price) is **Plus-only "regardless of being a
public/custom app."**

Going public unblocks Discount Functions and Validation Functions on Basic.
It does **not** unblock true price rewriting. On Basic stores Stockly will
always show struck-through retail + a discount, never a clean wholesale price.
This is permanent and should shape how the product is described to merchants.

## Consequences

**Timeline.** App review runs ~2–4 weeks, +1–2 weeks per resubmission.
Realistic unblock: **3–6 weeks from submission**, and submission is gated on
work that is not yet done.

**What is already done** toward the requirements: the three mandatory GDPR
webhooks (B0-1), the Billing API integration (`cf8adf0`), a Polaris-compliant
embedded admin, correct OAuth, public legal pages, and an app icon.

**What is missing**: listing copy, 4–7 screenshots with realistic merchant
data, a demo store with test credentials for reviewers, Jonatan's legal review
of `/legal/privacy` and `/legal/terms`, and a decision on Billing (see below).

**Open decision that blocks submission — Billing.** Shopify App Pricing
(GA 2026-05-12) "replaces both Managed Pricing and the legacy Billing API",
and Shopify directs new apps to it. Stockly's own Billing API integration may
therefore be the wrong thing to submit. Resolve this *before* submitting
rather than after a rejection.

**Strategic.** Combined with ADR-017 (native B2B free on all plans since
2026-04-02), the honest position is: Stockly needs 3–6 weeks and a completed
App Store submission before it can deliver anything its pilot merchant does
not already have. That is not a reason to stop, but it is the real cost of
the next step and should be stated plainly in any resourcing conversation.

**Stopgap for Piro today.** Nothing available on Basic without a public app is
more robust than what Piro already runs. The theme-level block
(`{% if customer.b2b? %}` + disabling the checkout button) is real deterrence
but bypassable via cart permalinks. The only unbypassable option is a Shopify
Flow workflow (free, all plans) that flags or cancels sub-minimum B2B orders
after the fact — merchant-hostile, but genuine enforcement. Recommend running
both until the public app ships.

## Revisit trigger

- Shopify changes the plan gating on Functions for custom apps.
- Shopify introduces a distribution-method migration path.
- Cart Transform `update` becomes available below Plus.
