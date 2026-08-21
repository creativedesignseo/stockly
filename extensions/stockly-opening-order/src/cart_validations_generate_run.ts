/**
 * Stockly Opening-Order Minimum — Cart & Checkout Validation Function.
 *
 * Camino B (ADR-016). Gates checkout against a merchant-defined minimum
 * (amount and/or quantity) for two distinct buyer populations:
 *
 *   1. FPQ / opening order — an approved wholesale customer who still owes
 *      their FIRST order (`qualifiedAt = null`, listed in
 *      `pendingCustomers`). Historical behaviour, unchanged.
 *   2. Post-qualification — a customer the merchant already released
 *      (`qualifiedAt != null`, listed in `qualifiedCustomers`). Every
 *      subsequent wholesale order must keep meeting a (usually lower)
 *      recurring minimum.
 *
 * A buyer is never subject to both gates: the FPQ list wins, and the two
 * lists are disjoint by construction on the sync side.
 *
 * It does NOT touch pricing — the wholesale discount is the Discount
 * Function's job (stockly-volume-discount). This function only gates
 * checkout, so an approved customer SEES wholesale pricing from unit 1 but
 * can't complete an order below the minimum that applies to them.
 *
 * Config: read from this validation's own metafield
 * `$app:stockly-opening-order/function-configuration`, written by
 * `app/services/opening-order-sync.server.ts`. The FPQ keys are FLAT and
 * must stay flat — an older deployed Function reading a newer config has to
 * keep working, and vice versa:
 *   {
 *     "mode": "none" | "amount" | "quantity" | "combined",
 *     "amount": number | null,            // min cart subtotal
 *     "quantity": number | null,          // min cart units
 *     "combinedLogic": "and" | "or",
 *     "pendingCustomers": ["gid://shopify/Customer/123", …], // owe opening order
 *     "message": "…",                     // optional custom merchant copy
 *
 *     "postQualification": {              // optional; same shape, no lists
 *       "mode": …, "amount": …, "quantity": …,
 *       "combinedLogic": …, "message": "…"
 *     },
 *     "qualifiedCustomers": ["gid://shopify/Customer/456", …]
 *   }
 *
 * The minimum is measured against `cart.cost.subtotalAmount` — the cart's
 * current subtotal, i.e. AFTER the wholesale discount applies (ADR-016:
 * "spend at least €X on the first wholesale order", measured on what they
 * actually pay). Mirrors the Discount Function's `fpqMet` logic so the two
 * gates agree.
 *
 * Buyer identity — company-first (2026-08-22 rearchitecture):
 *
 *   PRIMARY: a cart carrying `buyerIdentity.purchasingCompany` is a
 *   wholesale cart, full stop — Shopify only populates it for buyers
 *   acting for a native-B2B company the merchant approved. Which gate
 *   applies is read from the COMPANY's own app-owned metafield
 *   (`$app:stockly` / `qualified`, written by orders/paid or the
 *   install backfill): present → recurring gate, absent → opening
 *   gate. No lists, no sync, no staleness. One precedence rule: a
 *   customer present in `qualifiedCustomers` wins over a pending
 *   company (mirrors the Discount Function, protects merchants
 *   migrating from tag-based wholesale to native B2B).
 *
 *   FALLBACK (no purchasingCompany): the original customer-GID lists,
 *   unchanged, for shops that run wholesale on tags without native
 *   B2B. `buyerIdentifiers()` is customer-only — company/location ids
 *   in the lists could never be reached once the primary path exists,
 *   and the sync only ever emitted Customer GIDs anyway.
 *
 * Golden rule: FAIL OPEN on every unknown, malformed or unexpected path.
 * This code runs in a real store's checkout — blocking a legitimate sale
 * because of a bug is worse than not enforcing a minimum.
 */
import type {
  CartValidationsGenerateRunInput,
  CartValidationsGenerateRunResult,
  ValidationError,
} from "../generated/api";

/** One minimum rule. Shared by the FPQ gate (flat, at config root) and the
 *  post-qualification gate (nested under `postQualification`). */
interface MinimumRule {
  mode?: string;
  amount?: number | null;
  quantity?: number | null;
  combinedLogic?: string;
  message?: string;
}

interface OpeningOrderConfig extends MinimumRule {
  /** Approved customers who still owe their opening order. */
  pendingCustomers?: string[];
  /** Customers already released by the merchant (`qualifiedAt != null`). */
  qualifiedCustomers?: string[];
  postQualification?: MinimumRule;
}

/** Outcome of evaluating a rule against the cart. */
type RuleOutcome =
  /** The cart satisfies the rule. */
  | "met"
  /** The cart does not satisfy the rule — block. */
  | "unmet"
  /** No enforceable rule (mode "none", unknown mode, missing rule) — pass. */
  | "inactive";

const NO_ERRORS: CartValidationsGenerateRunResult = {
  operations: [{ validationAdd: { errors: [] } }],
};

const DEFAULT_OPENING_ORDER_MESSAGE =
  "Your first wholesale order must meet the opening-order minimum before checkout.";
const DEFAULT_POST_QUALIFICATION_MESSAGE =
  "This order must meet the minimum for wholesale orders.";

/**
 * Identifiers the buyer could be listed under in the customer lists.
 * Customer id only: since the company-first path (2026-08-22) any cart
 * carrying `purchasingCompany` returns from the primary branch before
 * the list fallback runs, so company/location ids in these lists could
 * never match — they were removed as dead-by-architecture. The sync
 * side has only ever emitted `gid://shopify/Customer/...` values.
 */
function buyerIdentifiers(input: CartValidationsGenerateRunInput): string[] {
  const buyer = input.cart.buyerIdentity;
  const id = buyer?.customer?.id;
  return typeof id === "string" && id.length > 0 ? [id] : [];
}

/** True when ANY candidate identifier appears in the given list. */
function matchesList(candidates: string[], list: unknown): boolean {
  if (!Array.isArray(list) || list.length === 0) return false;
  return candidates.some((candidate) => list.includes(candidate));
}

/**
 * Evaluate one minimum rule against the cart. Shared by both gates so the
 * amount/quantity/combined semantics can never drift apart.
 */
function evaluateRule(
  rule: MinimumRule,
  subtotal: number,
  quantity: number,
): RuleOutcome {
  const mode = rule.mode ?? "none";
  if (mode === "none") return "inactive";

  // A criterion that isn't configured, or that we can't evaluate (garbage
  // subtotal), counts as satisfied — fail open.
  const amountOk =
    typeof rule.amount === "number" && rule.amount > 0
      ? !Number.isFinite(subtotal) || subtotal >= rule.amount
      : true;
  const quantityOk =
    typeof rule.quantity === "number" && rule.quantity > 0
      ? quantity >= rule.quantity
      : true;

  if (mode === "amount") return amountOk ? "met" : "unmet";
  if (mode === "quantity") return quantityOk ? "met" : "unmet";
  if (mode === "combined") {
    const met =
      (rule.combinedLogic ?? "and") === "or"
        ? amountOk || quantityOk
        : amountOk && quantityOk;
    return met ? "met" : "unmet";
  }

  // Unknown mode — fail open (don't block).
  return "inactive";
}

/** Apply one gate: either pass the cart through or emit the blocking error. */
function applyGate(
  rule: MinimumRule | undefined,
  subtotal: number,
  quantity: number,
  defaultMessage: string,
): CartValidationsGenerateRunResult {
  if (!rule || typeof rule !== "object") return NO_ERRORS;
  if (evaluateRule(rule, subtotal, quantity) !== "unmet") return NO_ERRORS;

  const message =
    typeof rule.message === "string" && rule.message.trim()
      ? rule.message
      : defaultMessage;

  const errors: ValidationError[] = [{ message, target: "$.cart" }];
  return { operations: [{ validationAdd: { errors } }] };
}

/**
 * Company-first identity (2026-08-21 rearchitecture).
 *
 * A cart that carries `buyerIdentity.purchasingCompany` IS a wholesale
 * cart — Shopify only populates it for buyers purchasing on behalf of a
 * native-B2B company, which the merchant explicitly approved. No tag, no
 * enrolment list, no sync can add or remove that fact, so it is the most
 * truthful signal available and it can never go stale.
 *
 * Which gate applies is read from the COMPANY itself: an app-owned
 * metafield (`$app:stockly` / `qualified`) that the backend writes when
 * the company completes its first qualifying order (orders/paid webhook)
 * or when it is backfilled as an established customer (ordersCount > 0
 * at enablement). Metafield present and truthy → the recurring
 * post-qualification minimum; absent → the opening-order minimum. State
 * lives where the entity lives — nothing to keep in sync, no list to
 * outgrow, and Shopify's own docs bless Company metafields as Function
 * input (the field is NOT deprecated, unlike everything Market-shaped).
 *
 * Customer-list identity remains as the fallback for shops that run
 * wholesale on tags without native B2B — behaviour unchanged for them.
 */
function companyQualified(
  input: CartValidationsGenerateRunInput,
): boolean {
  const value =
    input.cart.buyerIdentity?.purchasingCompany?.company?.metafield?.value;
  if (typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  // The backend writes an ISO timestamp; accept legacy boolean-ish
  // values defensively. Anything non-empty that isn't an explicit
  // negative counts as qualified — misreading "qualified" as "pending"
  // would wrongly gate an established buyer, the worse failure.
  return v.length > 0 && v !== "false" && v !== "0" && v !== "null";
}

export function cartValidationsGenerateRun(
  input: CartValidationsGenerateRunInput,
): CartValidationsGenerateRunResult {
  let config: OpeningOrderConfig;
  try {
    const parsed: unknown = JSON.parse(
      input.validation?.metafield?.value ?? "{}",
    );
    // Malformed config must never block checkout.
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NO_ERRORS;
    }
    config = parsed as OpeningOrderConfig;
  } catch {
    return NO_ERRORS;
  }

  const subtotal = Number(input.cart.cost.subtotalAmount.amount);
  const quantity = input.cart.lines.reduce(
    (sum, line) => sum + line.quantity,
    0,
  );

  // ---- Primary path: native-B2B company buyer -----------------------
  // The company's own qualification metafield picks the gate. This
  // needs no lists, so it covers every company from the moment the
  // merchant approves it in Shopify.
  //
  // Precedence when the company is PENDING but the CUSTOMER is in
  // `qualifiedCustomers`: the customer wins and gets the recurring
  // gate. This mirrors the Discount Function, which ORs company
  // qualification with the customer list — without it the two engines
  // disagree on the same cart (adversarial-review find, 2026-08-22):
  // a merchant migrating from tag-based wholesale to native B2B would
  // show a released buyer wholesale prices while blocking their
  // checkout with the opening-order gate they already cleared.
  const company = input.cart.buyerIdentity?.purchasingCompany?.company;
  if (company?.id) {
    const qualifiedViaCustomerList = matchesList(
      buyerIdentifiers(input),
      config.qualifiedCustomers,
    );
    return companyQualified(input) || qualifiedViaCustomerList
      ? applyGate(
          config.postQualification,
          subtotal,
          quantity,
          DEFAULT_POST_QUALIFICATION_MESSAGE,
        )
      : applyGate(config, subtotal, quantity, DEFAULT_OPENING_ORDER_MESSAGE);
  }

  // ---- Fallback path: tag-based shops (customer lists) --------------
  // Guests, retail buyers and anyone we can't identify pass untouched.
  const candidates = buyerIdentifiers(input);
  if (candidates.length === 0) return NO_ERRORS;

  const isPending = matchesList(candidates, config.pendingCustomers);
  const isQualified =
    !isPending && matchesList(candidates, config.qualifiedCustomers);
  if (!isPending && !isQualified) return NO_ERRORS;

  // The opening-order gate wins: a buyer is never subject to both.
  return isPending
    ? applyGate(config, subtotal, quantity, DEFAULT_OPENING_ORDER_MESSAGE)
    : applyGate(
        config.postQualification,
        subtotal,
        quantity,
        DEFAULT_POST_QUALIFICATION_MESSAGE,
      );
}
