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
 * Buyer identity — READ THIS BEFORE CHANGING `buyerIdentifiers()`:
 *
 * We build a SET of candidate identifiers (customer, company, company
 * location) and match if ANY appears in the relevant list. Two facts about
 * that, both verified rather than assumed (2026-08-11):
 *
 *   1. `buyerIdentity.customer.id` IS populated in native B2B checkout.
 *      Checked against the pilot merchant's live Admin API: of 12 real
 *      orders, all 12 carried a `customer`, including the three whose
 *      `purchasingEntity` is a `PurchasingCompany`. So customer-id matching
 *      alone is sufficient today, and this Function was NOT silently letting
 *      company buyers through before the candidate set existed. (Caveat:
 *      that is Order data, not cart `buyerIdentity` — strong evidence, not
 *      proof. A real B2B test checkout is still the definitive check.)
 *
 *   2. The company and location candidates are currently INERT. The only
 *      producer of `pendingCustomers` / `qualifiedCustomers` is
 *      `app/services/opening-order-sync.server.ts`, which emits exclusively
 *      `gid://shopify/Customer/<id>` — `WholesaleCustomer` has no column
 *      holding a company or location id, so there is nothing to emit. The
 *      extra candidates therefore cannot match anything. They are kept as
 *      cheap defence-in-depth for the case where `customer` is null, not as
 *      a working company-level match.
 *
 * ⚠️ If you ever make the sync emit Company/CompanyLocation GIDs, resolve
 * this FIRST: identity becomes two-level, and the "pending wins" precedence
 * below was written for a one-level world. A buyer could then match
 * `pendingCustomers` by their location id while matching `qualifiedCustomers`
 * by their own customer id — and would be blocked by the opening-order
 * minimum because a COLLEAGUE at the same location has not ordered yet.
 * That is a legitimate sale blocked by design, which violates the golden
 * rule below. The natural fix is customer identity winning over company
 * identity, not "pending wins".
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
 * Every identifier the buyer could be listed under. In a native B2B
 * checkout the customer id may be absent while the company / location ids
 * are present, so all three are candidates.
 */
function buyerIdentifiers(input: CartValidationsGenerateRunInput): string[] {
  const buyer = input.cart.buyerIdentity;
  const candidates = [
    buyer?.customer?.id,
    buyer?.purchasingCompany?.company?.id,
    buyer?.purchasingCompany?.location?.id,
  ];
  return candidates.filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
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

  // Guests, retail buyers and anyone we can't identify pass untouched.
  const candidates = buyerIdentifiers(input);
  if (candidates.length === 0) return NO_ERRORS;

  const isPending = matchesList(candidates, config.pendingCustomers);
  const isQualified =
    !isPending && matchesList(candidates, config.qualifiedCustomers);
  if (!isPending && !isQualified) return NO_ERRORS;

  const subtotal = Number(input.cart.cost.subtotalAmount.amount);
  const quantity = input.cart.lines.reduce(
    (sum, line) => sum + line.quantity,
    0,
  );

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
