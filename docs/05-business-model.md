# 05 — Business Model

## Two-phase strategy

### Phase 1 — Custom App (Months 0-4)
Pilot with 3 paying clients. Get product-market fit feedback. Generate cashflow to fund Phase 2.

### Phase 2 — Public App Store (Months 4+)
Submit to Shopify App Store. Scale to 50-1000+ recurring subscribers.

---

## Phase 1 economics

```
3 pilot clients × $4,000-5,000 setup           =  $12,000-15,000
3 clients × $300-500/mo × 12 months            =  $14,400/year recurring
                                                  ─────────────
Year 1 total                                   =  $26,400-29,400

Costs (Year 1):
  Shopify Partner Account                      =  $0
  Vercel + Supabase free tier                  =  $0 (cap: 100k req/mo, 500MB DB)
  Domain (stockly.app or similar)              =  $15
  Tools (already owned: ChatGPT, Claude, etc)  =  $0
                                                  ─────────────
Total costs Year 1                             =  ~$15

Net margin Phase 1                             =  ~99.95%
```

This is unusual — solo dev + Shopify ecosystem = near-zero infrastructure cost until significant scale.

---

## Phase 2 pricing (App Store)

| Tier | Price | Limits | Target customer |
|---|---|---|---|
| **Starter** | $39/mo | Up to 100 wholesale orders/mo | Small wholesalers |
| **Growth** | $79/mo | Unlimited orders + analytics | Established wholesalers |
| **Plus** | $149/mo | White label + priority support + custom branding | Brands wanting agency-level service |

**Average Revenue Per User (ARPU) target:** $60/mo
**Free trial:** 14 days (Shopify standard)
**Annual discount:** 2 months free (effective ARPU $50)

---

## Phase 2 revenue projections

### Conservative (realistic base case)

| Month | Clients | MRR | ARR run-rate |
|---|---|---|---|
| 6 | 10 | $600 | $7,200 |
| 12 | 60 | $3,600 | $43,200 |
| 18 | 150 | $9,000 | $108,000 |
| 24 | 300 | $18,000 | $216,000 |

### Optimistic (if Shopify featured listing + viral content)

| Month | Clients | MRR | ARR run-rate |
|---|---|---|---|
| 6 | 30 | $1,800 | $21,600 |
| 12 | 200 | $12,000 | $144,000 |
| 18 | 500 | $30,000 | $360,000 |
| 24 | 1,000 | $50,000 | $600,000 |

### Pessimistic (slow App Store discovery)

| Month | Clients | MRR | ARR run-rate |
|---|---|---|---|
| 6 | 5 | $300 | $3,600 |
| 12 | 25 | $1,500 | $18,000 |
| 18 | 70 | $4,200 | $50,400 |
| 24 | 150 | $9,000 | $108,000 |

**Planning target = Conservative.** Anything above is upside.

---

## Shopify revenue share explained

Shopify App Store revenue share schedule:
- **First $1,000,000/year:** 0% commission (you keep 100%)
- **Above $1,000,000/year:** 15% commission on the overage only

Plus payment processing:
- **2.9% on all transactions** (deducted by payment networks, not Shopify)

### Practical math for our model

If we hit **$216k ARR** (conservative 24-month target):
- Shopify cut: $0 (under $1M threshold)
- Processing fee: $216k × 2.9% = $6,264
- **Net to Stockly:** $209,736/year

If we hit **$600k ARR** (optimistic):
- Shopify cut: $0 (under $1M threshold)
- Processing fee: $600k × 2.9% = $17,400
- **Net to Stockly:** $582,600/year

If we hit **$2M ARR** (hypothetical):
- First $1M: 0% Shopify cut
- Above $1M: $1M × 15% = $150,000 Shopify cut
- Processing fee: $2M × 2.9% = $58,000
- **Net to Stockly:** $1,792,000/year

---

## Unit economics

### Customer Acquisition Cost (CAC)

**Phase 1 (custom):** Outbound sales. Effective CAC = time spent × hourly rate.
- ~20 hours per pilot × $50/hr opportunity cost = $1,000/pilot
- Recovered in first 3 months of $4-5k setup

**Phase 2 (App Store):**
- Free organic from App Store listing (if SEO works)
- Paid: $50-150 per acquired customer (Google Ads on "Shopify wholesale app")
- Target CAC < $200

### Lifetime Value (LTV)

Assumptions:
- Average lifetime: 18 months (typical SaaS)
- ARPU: $60/mo
- **LTV = $60 × 18 = $1,080**

### LTV/CAC ratio
- Conservative: $1,080 / $200 = **5.4x** (healthy, >3x is good)
- Optimistic (organic): $1,080 / $50 = **21.6x** (excellent)

---

## Churn targets

- **Month 1 trial → paid conversion:** 20-30% (industry standard for Shopify apps)
- **Monthly churn:** <5% (target), <8% (acceptable)
- **Annual churn:** ~40-50% (Shopify SaaS norm — high because merchants churn off Shopify)

---

## Funding & cashflow

**No external funding planned.** Self-funded via:
1. Phase 1 client revenue
2. Existing Adspubli agency cashflow
3. No salary draw from Stockly until MRR > $5k

**Reinvestment priorities (when MRR > $5k):**
1. Hire part-time customer support (~$1k/mo)
2. Paid Shopify App Store promotion (~$500/mo)
3. Content marketing (blog + YouTube) (~$1k/mo)
4. Design polish (logo refresh, App Store assets) (~$2k one-time)

---

## Exit scenarios (long-term, not planning, but for context)

1. **Lifestyle business** — keep solo, hit $30-50k MRR, work 20h/week (most likely)
2. **Small team SaaS** — hire 2-3 people, grow to $200-500k MRR
3. **Acquisition** — Shopify-ecosystem buyers (Klaviyo, Yotpo, Gorgias) acquire wholesale apps at 3-5x ARR

No commitment to any path. Optionality is the goal.
