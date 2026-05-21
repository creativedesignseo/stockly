# B2B Customer Lifecycle — Stockly Canonical Spec

**Status:** Canonical
**Last updated:** 2026-05-21
**Supersedes:** Sprint 1's tag-based binary eligibility

This spec defines Stockly's B2B customer lifecycle model. It is the contract between admin UI, App Proxy, storefront blocks, webhook handlers, and database. Any feature touching customer eligibility, wholesale pricing, or order qualification MUST conform to this spec.

The model is **deliberately configurable** to serve many merchant business models — not any single pilot client's workflow.

---

## 1. Customer states

A wholesale customer exists in exactly one of 5 states at any time:

| State code | Description | Sees | Can checkout? |
|---|---|---|---|
| `visitor` | Anonymous or non-wholesale customer | Retail prices only | Yes, at retail |
| `pending` | Submitted application, waiting on merchant review | Retail + "application under review" banner | Yes, at retail |
| `approved_pre_fpq` | Approved by merchant, must still meet first-purchase qualifier | Wholesale prices + FPQ progress banner | Only if cart meets FPQ |
| `qualified` | Made qualifying first purchase; full wholesale | Wholesale prices + full wholesale panel | Yes, freely (subject to `postQualificationMOQ`) |
| `rejected` | Application denied | Retail prices only | Yes, at retail |

## 2. State transitions

```
visitor ──submits application──> pending
                                   │
                                   ├──merchant approves──> approved_pre_fpq
                                   │                          │
                                   │                          ├──pays order meeting FPQ──> qualified  (terminal happy path)
                                   │                          │
                                   │                          └──merchant revokes──> visitor
                                   │
                                   └──merchant rejects──> rejected
                                                            │
                                                            └──merchant re-approves──> approved_pre_fpq
```

Edge cases:
- A `qualified` customer's tag/record can be revoked → back to `visitor`
- A `rejected` customer can re-apply → back to `pending`
- Approval and qualification are independent: a customer can be approved but never qualify (if they never make first purchase)

## 3. Configuration variables (per shop)

Stored on the `Shop` model. Merchant controls all of these via admin.

| Variable | Type | Default | Purpose |
|---|---|---|---|
| `approvalRequired` | bool | `true` | If `false`, any customer with shop's `wholesaleTag` auto-promotes to `approved_pre_fpq` without manual review |
| `fpqMode` | enum | `amount` | `amount` / `quantity` / `combined` / `none` |
| `fpqAmount` | float | `500` | Minimum cart total (in shop currency) to qualify |
| `fpqQuantity` | int | `null` | Minimum unit count across cart to qualify |
| `fpqCombinedLogic` | enum | `and` | If `fpqMode = combined`: `and` (both required) / `or` (either suffices) |
| `postQualificationMOQ` | int | `1` | Minimum units per order after qualification |
| `fpqCurrency` | string | shop default | ISO currency code for FPQ amount |
| `wholesaleTag` | string | `"wholesale"` | Customer tag indicating wholesale candidate (existing in Sprint 1) |

## 4. Merchant presets

Pre-built configurations the merchant selects with one click in admin. These cover the realistic span of B2B models.

### Premium Boutique (Piro-style)
```yaml
approvalRequired: true
fpqMode: amount
fpqAmount: 500
postQualificationMOQ: 1
```
Model: "Compra €500 una vez, después compras libre."

### Artisan Wholesale
```yaml
approvalRequired: true
fpqMode: quantity
fpqQuantity: 24
postQualificationMOQ: 12
```
Model: "Compra 24 unidades primera vez, después siempre mínimo 12."

### Aggressive Volume
```yaml
approvalRequired: true
fpqMode: combined
fpqAmount: 1000
fpqQuantity: 50
fpqCombinedLogic: and
postQualificationMOQ: 5
```
Model: "Primera compra: €1000 Y 50 unidades. Después: mínimo 5 por orden."

### Flexible Entry
```yaml
approvalRequired: true
fpqMode: combined
fpqAmount: 500
fpqQuantity: 24
fpqCombinedLogic: or
postQualificationMOQ: 1
```
Model: "Primera compra: €500 O 24 unidades, lo que prefieras. Después: libre."

### Relationship-based
```yaml
approvalRequired: true
fpqMode: none
postQualificationMOQ: 1
```
Model: "Aprobación manual es la única barrera. Después compras lo que quieras."

### Self-serve (tag-based)
```yaml
approvalRequired: false
fpqMode: amount
fpqAmount: 200
postQualificationMOQ: 1
```
Model: "Auto-aprobación por tag + primera compra €200."

## 5. Eligibility resolution algorithm

Executed every time `/apps/stockly/context` is called (storefront → App Proxy → backend).

```
Input: shopDomain, logged_in_customer_id (may be empty), customer_tags
Output: customerState, fpq, eligible

1. If logged_in_customer_id is empty:
     return { customerState: 'visitor', eligible: false, fpq: null }

2. Look up WholesaleCustomer by (shopId, shopifyCustomerId):
     - If row exists, use its approvalStatus + qualifiedAt
     - If no row exists AND shop.approvalRequired = false AND customer has shop.wholesaleTag:
         Auto-create WholesaleCustomer with approvalStatus = 'approved', qualifiedAt = null
     - If no row exists AND shop.approvalRequired = true:
         return { customerState: 'visitor', eligible: false, fpq: null }
     - If no row exists AND no tag match:
         return { customerState: 'visitor', eligible: false, fpq: null }

3. Resolve customerState from WholesaleCustomer:
     - approvalStatus = 'pending' → state = 'pending', eligible = false
     - approvalStatus = 'rejected' → state = 'rejected', eligible = false
     - approvalStatus = 'approved' AND qualifiedAt = null → state = 'approved_pre_fpq', eligible = true (for viewing prices)
     - approvalStatus = 'approved' AND qualifiedAt != null → state = 'qualified', eligible = true

4. Compute FPQ (only if state = 'approved_pre_fpq'):
     - Read shop.fpqMode, shop.fpqAmount, shop.fpqQuantity, shop.fpqCombinedLogic
     - Read current cart total + quantity (via cart cookie or Storefront API)
     - Apply mode logic:
         * amount: isMet = cartTotal >= fpqAmount
         * quantity: isMet = cartQty >= fpqQuantity
         * combined+and: isMet = (cartTotal >= fpqAmount) AND (cartQty >= fpqQuantity)
         * combined+or: isMet = (cartTotal >= fpqAmount) OR (cartQty >= fpqQuantity)
         * none: isMet = true
     - Return fpq object with current/required/remaining/isMet

5. Return assembled response
```

## 6. App Proxy response shape (extended from Sprint 1)

```typescript
{
  customerState: 'visitor' | 'pending' | 'approved_pre_fpq' | 'qualified' | 'rejected',
  eligible: boolean,  // shortcut: true if state ∈ {approved_pre_fpq, qualified}
  
  fpq: {
    mode: 'amount' | 'quantity' | 'combined' | 'none',
    combinedLogic?: 'and' | 'or',
    required: { amount?: number, quantity?: number },
    current: { amount: number, quantity: number },
    remaining: { amount?: number, quantity?: number },
    isMet: boolean,
  } | null,  // null when state != 'approved_pre_fpq'
  
  postQualificationMOQ: number,
  
  shop: { domain, wholesaleTag, currency, ... },
  branding: { primaryColor, accentColor, fontFamily, logoUrl },
  copy: {
    // existing
    notEligible, emptyState, errorMinQty, errorMinValue, tierUnlockHint, emptyCart,
    // new strings for the lifecycle
    pendingApprovalBanner, fpqProgressBanner, fpqMetCelebration,
    rejectedMessage, applyForWholesaleCta, qualifiedWelcome,
  },
  tiers: [ /* existing tier objects */ ],
}
```

## 7. Qualifying purchase detection (webhook)

The promotion from `approved_pre_fpq` to `qualified` happens asynchronously via Shopify webhook.

```
Webhook: orders/paid
Handler:
  1. Parse webhook payload (HMAC verified)
  2. Look up WholesaleCustomer by (shopId, customer.id)
  3. If approvalStatus = 'approved' AND qualifiedAt IS null:
       a. Compute orderTotal (from totalPrice) and orderQuantity (sum of line item quantities)
       b. Apply shop FPQ rules (same logic as eligibility step 4)
       c. If FPQ met:
            - Update WholesaleCustomer: qualifiedAt = now(), qualifyingOrderId, qualifyingOrderAmount
            - (Optional) Trigger welcome email via Resend
  4. Idempotent: if already qualified, no-op
```

## 8. Data model

### Shop (extend)
```prisma
model Shop {
  // existing fields...
  
  approvalRequired         Boolean  @default(true)
  fpqMode                  String   @default("amount")  // amount|quantity|combined|none
  fpqAmount                Float?
  fpqQuantity              Int?
  fpqCombinedLogic         String   @default("and")     // and|or
  postQualificationMOQ     Int      @default(1)
  fpqCurrency              String   @default("EUR")
}
```

### WholesaleCustomer (extend)
```prisma
model WholesaleCustomer {
  // existing fields...
  
  approvalStatus           String    @default("pending")  // pending|approved|rejected
  approvedAt               DateTime?
  approvedBy               String?   // admin user identifier
  qualifiedAt              DateTime?
  qualifyingOrderId        String?
  qualifyingOrderAmount    Float?
  rejectionReason          String?
}
```

### WholesaleApplication (new)
```prisma
model WholesaleApplication {
  id                String    @id @default(cuid())
  shopId            String
  shop              Shop      @relation(fields: [shopId], references: [id], onDelete: Cascade)
  
  shopifyCustomerId String?   // null if applicant doesn't have an account yet
  email             String
  companyName       String?
  taxId             String?
  vatNumber         String?
  notes             String?
  
  status            String    @default("pending")  // pending|approved|rejected
  submittedAt       DateTime  @default(now())
  reviewedAt        DateTime?
  reviewedBy        String?
  rejectionReason   String?
  
  @@index([shopId, status])
  @@index([shopId, email])
}
```

## 9. UI surfaces

### Admin (Polaris)
- `/app/customers` — list of all wholesale customers with state filter
- `/app/customers/applications` — pending applications queue (review + approve/reject)
- `/app/customers/:id` — customer detail: state, FPQ progress, qualifying order, manual override
- `/app/settings/b2b-model` — configure FPQ (with presets + custom)
- `/app/settings/copy` — edit customer-facing strings per state

### Storefront (Theme App Extensions)
- **Wholesale Application form** block — for visitors to submit application
- **FPQ progress banner** block — persistent header for `approved_pre_fpq` customers
- **Wholesale Product Panel** block — on product pages, above retail content, for `approved_pre_fpq` and `qualified` customers
- **Quick Order Form** block (existing F1) — gated by `eligible: true`; respects FPQ for checkout button state

## 10. Open questions (track separately, not blocking)

- Should `approved_pre_fpq` customers see wholesale prices on ALL products immediately, or only after demonstrating intent (e.g., viewing 3+ products)?
- Should re-orders by `qualified` customers always apply best available tier, or respect ladder qty cumulative?
- How are downgrades handled? (e.g., merchant manually demotes `qualified` → `approved_pre_fpq`)
- B2B-specific tax handling — explicitly out of scope for v1 (Shopify handles)
- Multi-currency: FPQ amount in shop currency or customer-presentation currency?

## 11. Related docs

- ADR: [ADR-004 — First-Purchase Qualifier](../decisions/ADR-004-first-purchase-qualifier.md)
- ADR: [ADR-005 — Backend choice (Vercel + Vercel Postgres)](../decisions/ADR-005-backend-choice.md)
- Features: [03 — Features MVP](../03-features-mvp.md) (needs update to reflect FPQ)
- Roadmap: [ROADMAP.md](../../ROADMAP.md) (Sprint 2+ implementations)
