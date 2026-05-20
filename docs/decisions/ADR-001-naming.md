# ADR-001 — Project name: Stockly (working name)

**Date:** May 20, 2026
**Status:** Accepted (provisional — revisit at Month 3)
**Deciders:** Jonatan Montilla

---

## Context

We need a name to:
1. Register a GitHub repository
2. Reserve a Shopify Partner app slot
3. Use in internal docs while building

Available .com domain is desirable but not blocking — Shopify apps are discovered by App Store search, not by direct domain.

---

## Names considered

| Name | Verdict | Reason |
|---|---|---|
| Tradeflow | ❌ Rejected | tradeflow.com active (different sector but brand confusion) |
| Wholeflow | ❌ Rejected | wholeflow.com.au taken (different sector, but risky for international expansion) |
| Wholesalr | ❌ Rejected | Misspelling, dated 2010s startup aesthetic |
| B2Beauty | ❌ Rejected | Too narrow to beauty vertical |
| Stockly | ✅ **Accepted** (working name) | Short, English-friendly, no major .com conflict found, suggests inventory/stock + premium feel |
| Caratly | 🟡 Held | Too jewelry-specific for multi-vertical app |
| Ordinal | 🟡 Held | Could be repurposed if Stockly doesn't pan out |

---

## Decision

**Use "Stockly" as the working name** for Phase 1 (Months 0-3).

This is explicitly a *working name*, not a committed brand:
- GitHub repo: `stockly` ✅
- Shopify Partner app shell: `Stockly` ✅
- Local folder: `/Users/aimac/Documents/Workspace/Clients/stockly/` ✅

**At Month 3** (when MVP is shipping to pilots and brand work begins):
- Validate or replace the name
- Conduct domain + trademark + USPTO search
- Get pilot client input ("would you tell other brands about a product called Stockly?")
- Decide commercial name before App Store submission (Month 9-10)

---

## Why "working name" approach

1. **Naming is bikeshedding when there's no product** — the product matters 100x more than the name at this stage
2. **Branding decisions are better with real users** — pilot feedback informs name better than gut at Month 0
3. **Renaming a Shopify app is non-trivial but feasible** before App Store launch
4. **Renaming a public App Store app is painful** — so we MUST decide before submission
5. **Domain availability is fluid** — names available today may not be in 3 months, but waiting also lets us check more names

---

## Consequences

### Positive
- We move forward without analysis paralysis
- All Phase 1 artifacts (repo, docs, pitch decks) use one consistent name
- Pilots see "Stockly" — gives us real-world feedback on the name

### Negative
- Potential renaming work at Month 3 (small, ~1-2 days of find/replace + repo rename)
- Some pilot clients may bond with the name and resist change

### Mitigation
- Tell pilots upfront: "Working name — final brand TBD"
- Keep brand assets (logo, colors) minimal until commercial name is decided
- Use generic "Adspubli — B2B Wholesale App" framing in client emails if uncertainty bothers anyone

---

## Trademark + domain status (as of May 20, 2026)

- [ ] USPTO trademark search — **TBD at Month 2**
- [ ] EUIPO trademark search — **TBD at Month 2**
- [ ] stockly.com — **status unknown, check at Month 2**
- [ ] stockly.app — **likely available, check at Month 2**
- [ ] stockly.io — **likely available, check at Month 2**

---

## Revisit trigger

Revisit this decision **before Sprint 7 (App Store prep)**. Cannot submit to App Store with provisional name.
