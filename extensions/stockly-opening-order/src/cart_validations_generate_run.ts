/**
 * Stockly Opening-Order Minimum — Cart & Checkout Validation Function.
 *
 * Camino B (ADR-016). Blocks checkout for an approved wholesale customer
 * who still owes their OPENING ORDER until the cart meets the merchant's
 * minimum (amount and/or quantity). Once the merchant releases them
 * (qualifiedAt set) they drop off the pending list and checkout is free.
 *
 * It does NOT touch pricing — the wholesale discount is the Discount
 * Function's job (stockly-volume-discount). This function only gates
 * checkout, so an approved customer SEES wholesale pricing from unit 1 but
 * can't complete their first order below the minimum.
 *
 * Config: read from this validation's own metafield
 * `$app:stockly-opening-order/function-configuration`, written by
 * `app/services/opening-order-sync.server.ts`:
 *   {
 *     "mode": "none" | "amount" | "quantity" | "combined",
 *     "amount": number | null,            // min cart subtotal
 *     "quantity": number | null,          // min cart units
 *     "combinedLogic": "and" | "or",
 *     "pendingCustomers": ["gid://shopify/Customer/123", …], // owe opening order
 *     "message": "…"                      // optional custom merchant copy
 *   }
 *
 * The minimum is measured against `cart.cost.subtotalAmount` — the cart's
 * current subtotal, i.e. AFTER the wholesale discount applies (ADR-016:
 * "spend at least €X on the first wholesale order", measured on what they
 * actually pay). Mirrors the Discount Function's `fpqMet` logic so the two
 * gates agree.
 */
import type {
  CartValidationsGenerateRunInput,
  CartValidationsGenerateRunResult,
  ValidationError,
} from "../generated/api";

interface OpeningOrderConfig {
  mode?: string;
  amount?: number | null;
  quantity?: number | null;
  combinedLogic?: string;
  pendingCustomers?: string[];
  message?: string;
}

const NO_ERRORS: CartValidationsGenerateRunResult = {
  operations: [{ validationAdd: { errors: [] } }],
};

export function cartValidationsGenerateRun(
  input: CartValidationsGenerateRunInput,
): CartValidationsGenerateRunResult {
  let config: OpeningOrderConfig;
  try {
    config = JSON.parse(input.validation?.metafield?.value ?? "{}");
  } catch {
    // Malformed config must never block checkout.
    return NO_ERRORS;
  }

  const mode = config.mode ?? "none";
  if (mode === "none") return NO_ERRORS;

  // Only gate customers who still owe their opening order. Everyone else
  // (guests, retail, released wholesale customers) passes untouched.
  const customerId = input.cart.buyerIdentity?.customer?.id ?? "";
  const pending = config.pendingCustomers ?? [];
  if (!customerId || !pending.includes(customerId)) return NO_ERRORS;

  const subtotal = Number(input.cart.cost.subtotalAmount.amount);
  const qty = input.cart.lines.reduce((sum, line) => sum + line.quantity, 0);

  const amountOk =
    typeof config.amount === "number" && config.amount > 0
      ? subtotal >= config.amount
      : true;
  const quantityOk =
    typeof config.quantity === "number" && config.quantity > 0
      ? qty >= config.quantity
      : true;

  let met: boolean;
  if (mode === "amount") met = amountOk;
  else if (mode === "quantity") met = quantityOk;
  else if (mode === "combined") {
    met =
      (config.combinedLogic ?? "and") === "or"
        ? amountOk || quantityOk
        : amountOk && quantityOk;
  } else {
    // Unknown mode — fail open (don't block).
    return NO_ERRORS;
  }

  if (met) return NO_ERRORS;

  const message =
    config.message && config.message.trim()
      ? config.message
      : "Your first wholesale order must meet the opening-order minimum before checkout.";

  const errors: ValidationError[] = [{ message, target: "$.cart" }];
  return { operations: [{ validationAdd: { errors } }] };
}
