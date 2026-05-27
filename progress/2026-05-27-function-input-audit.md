# Function input audit — Volume Pricing additions

## TL;DR

| Feature | input.graphql change? | Why |
|---|---|---|
| fixed_price discount | no | `line.cost.amountPerQuantity.amount` is already queried (run.graphql:7-9); enough to derive `(perUnit - fixedPrice) * qty`. |
| Active dates filtering | unclear/likely no | Shopify Functions have no native `now()` in the input query. The standard pattern is `cart.buyerIdentity.purchasingCompany.location.deliveredAt` or a `localization` field — neither fits "is this tier active right now". Needs prototype. |
| mix_variants aggregation | no | `merchandise.product.id` is already queried (run.graphql:16); grouping lines by product GID is purely a `run.ts` change. |

## fixed_price discount type

No input change needed. `cost.amountPerQuantity.amount` is already pulled (run.graphql:6-10) and `run.ts:391` already uses it to compute `lineRetail`. The new path is symmetric to the existing `fixed_amount` branch (run.ts:467-482): compute `lineDiscountMoney = (perUnit - fixedPrice) * qty`, clamp at 0, emit one `fixedAmount` discount per line. Same `.toFixed(2)` cents-precision pattern applies — no new decimal concerns. The metafield shape grows by one field (e.g. `discountType: "fixed_price"`, `fixedPrice: number`), but that's `discount-function-sync.server.ts` territory, not GraphQL.

## Active dates filtering

This is the only uncertain one. Shopify Functions execute deterministically and do NOT expose a wall-clock `now()` inside the WASM module — by design, so the same input produces the same output. The query input has no `currentTime` field. Two patterns I've seen in shopify.dev community:

1. **`localization` extension** — recent API versions expose `localization.country` and similar, but I'm not confident a timestamp is reachable from `purchase.product-discount.run` target. Worth prototyping against api_version `2026-04` (the toml at line 1).
2. **Out-of-band scheduling** — write the active tier set to the metafield from the Remix admin via a cron/scheduled job, so the Function only sees currently-active tiers. This sidesteps the determinism issue and is the conservative choice if the input query truly has no clock.

Recommendation: implementer should prototype reading a time field from `RunInput` in a sandbox before assuming option 2 is forced. If forced, it's a server-side scheduler ADR, not an input change.

## mix_variants aggregation

No input change. `merchandise.product.id` (run.graphql:16) is already there and `run.ts:341-343` already resolves `productGid` per line. The new mode is a third partition alongside `perLineTiers` / `cartTotalTiers` (run.ts:314-319): group `input.cart.lines` by `productGid`, sum quantities within the group (after `tierAppliesToLine` scope filter), evaluate `minQty` against the group sum, then apply to every line in the group. No new fields needed. Byte budget is unaffected — querying nothing new.

## Cross-cutting risks

- **Tier filter at run.ts:256-263** drops tiers with `discountPct <= 0`. A `fixed_price` tier may legitimately have `discountPct = 0` — the filter needs to learn the new type before this lands.
- **Active dates**: if going the server-side scheduler route, HANDOFF.md and a new ADR are required; this is not a silent change.
- **mix_variants ordering**: the current per-line winner selection (run.ts:348-357) doesn't know about a third aggregation mode. The candidates array at run.ts:367-372 needs a third entry, and the specificity tiebreaker needs to extend cleanly.
- **Test fixtures**: `extensions/stockly-volume-discount/tests/` currently has only one fixture (per AGENTS.md "audit P1-5"). All three features need fixtures before merge — pricing-path rule from CLAUDE.md.
- **api_version 2026-04** is current per `shopify.extension.toml:1`; confirm date/time input fields against THAT version's schema, not an older one.
