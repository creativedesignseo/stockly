/**
 * Currency labelling helpers shared by every admin screen that renders
 * money.
 *
 * Stockly stores money as bare numbers and checkout compares them
 * against the cart's real currency, so a wrong symbol was only ever a
 * LABEL bug — but a label bug the merchant sees on their very first
 * screen. Extracted 2026-08-14 from app.settings.pricing.tsx and
 * app.pricing._index.tsx, which each carried their own copy.
 *
 * Pure module — safe to import from client components. The Admin API
 * lookup that produces the ISO code lives in `currency.server.ts`.
 */

/**
 * Best-effort currency symbol for an ISO 4217 code, e.g. "USD" → "$".
 *
 * Returns null only when we have no code at all, so callers can render
 * a bare number instead of inventing a symbol. An unrecognised code is
 * echoed back verbatim ("XYZ 100") — still honest, just less pretty.
 */
export function currencySymbolFor(code: string | null): string | null {
  if (!code) return null;
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((part) => part.type === "currency")?.value ?? code;
  } catch {
    // Unsupported code or an ICU build without `narrowSymbol`.
    return code;
  }
}

export type MoneyFormatter = (value: string | number) => string;

/**
 * Build the `money()` formatter used across the pricing screens.
 *
 * `symbol` is null when the Admin API lookup failed; every amount then
 * renders bare rather than under a guessed currency.
 */
export function moneyFormatterFor(symbol: string | null): MoneyFormatter {
  return (value: string | number) => (symbol ? `${symbol}${value}` : `${value}`);
}
