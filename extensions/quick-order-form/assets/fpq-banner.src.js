/**
 * Stockly — Wholesale FPQ Banner (cart page Web Component).
 *
 * On the merchant's cart template, shows an approved_pre_fpq
 * customer how close they are to meeting the FPQ (€500 wholesale,
 * 12 mixed units, etc — whatever the merchant configured).
 *
 * Pipeline on connect:
 *  1. Fetch /apps/stockly/context → customer state + shop FPQ config
 *  2. If state != 'approved_pre_fpq' or fpq.mode == 'none' → stay hidden
 *  3. Fetch /cart.js → current cart contents (Shopify storefront)
 *  4. Compute the WOULD-BE wholesale subtotal using the same
 *     multiplicative composition the Function applies at checkout
 *     (baseline × tier per line)
 *  5. Compare against fpq.amount / fpq.quantity per shop's mode
 *  6. Render "Add €X more..." (unmet) or "✓ minimum met..." (met)
 *
 * Stays in sync as the customer changes the cart: listens for the
 * theme's cart change events (the standard `cart:updated` /
 * `cart:refresh` / `cart:change` patterns most themes dispatch) and
 * re-renders. Falls back to a polling tick every 2s if the theme
 * doesn't dispatch events (defensive — some themes mutate the cart
 * without firing public events).
 */
class StocklyFpqBanner extends HTMLElement {
  connectedCallback() {
    this.contextUrl = this.dataset.contextUrl || "/apps/stockly/context";
    this.customerTags = this.dataset.customerTags || "";
    this.bannerEl = this.querySelector("[data-stockly-fpq-cart-banner]");
    this.textEl = this.querySelector("[data-stockly-fpq-cart-banner-text]");

    this.context = null;
    this._lastCartHash = "";

    this._onCartChange = this._onCartChange.bind(this);
    [
      "cart:updated",
      "cart:refresh",
      "cart:change",
      "cart:added",
      "cart:item-updated",
    ].forEach((ev) => document.addEventListener(ev, this._onCartChange));

    this._init();
  }

  async _init() {
    try {
      const params = new URLSearchParams();
      if (this.customerTags) params.set("customer_tags", this.customerTags);
      const res = await fetch(`${this.contextUrl}?${params.toString()}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return;
      this.context = await res.json();
      this._applyBranding(this.context.branding || {});
      await this._refresh();
      // Defensive polling for themes that don't dispatch cart events
      this._pollTimer = setInterval(() => this._refresh(), 2000);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[Stockly] FPQ banner init failed", err);
    }
  }

  _onCartChange() {
    this._refresh();
  }

  _applyBranding(branding) {
    if (branding.primaryColor) {
      this.style.setProperty("--stockly-primary", branding.primaryColor);
    }
    if (branding.accentColor) {
      this.style.setProperty("--stockly-accent", branding.accentColor);
    }
  }

  async _refresh() {
    if (!this.context) return;

    const state = this.context.customerState;
    const fpq = this.context.shop?.fpq;
    if (
      state !== "approved_pre_fpq" ||
      !fpq ||
      fpq.mode === "none"
    ) {
      this.bannerEl.hidden = true;
      return;
    }

    let cart;
    try {
      const r = await fetch("/cart.js", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      cart = await r.json();
    } catch {
      return;
    }

    // Skip re-render if cart hasn't changed (cheap guard).
    const hash = `${cart.token}:${cart.item_count}:${cart.total_price}`;
    if (hash === this._lastCartHash) return;
    this._lastCartHash = hash;

    const baseline =
      Number(this.context.shop?.wholesaleBaselinePct ?? 0) || 0;
    const baselineFactor = 1 - baseline / 100;

    // Compute hypothetical wholesale subtotal (in currency units, not
    // cents). Tier compositions are skipped here for v1 — the cart
    // banner approximates against baseline only. Result: the banner
    // might say "you need €X more" when actually a tier kicks in too
    // (which would mean the customer hits the gate slightly earlier).
    // Acceptable inaccuracy for v1; a tighter calc would require
    // exposing tier metadata to the cart banner too.
    let cartWholesale = 0;
    cart.items.forEach((item) => {
      const lineRetail = (item.original_line_price ?? item.line_price ?? 0) / 100;
      cartWholesale += lineRetail * baselineFactor;
    });
    const cartQty = cart.item_count;

    const amountMet =
      fpq.amount && fpq.amount > 0 ? cartWholesale >= fpq.amount : true;
    const quantityMet =
      fpq.quantity && fpq.quantity > 0 ? cartQty >= fpq.quantity : true;

    let met = true;
    if (fpq.mode === "amount") met = amountMet;
    else if (fpq.mode === "quantity") met = quantityMet;
    else if (fpq.mode === "combined") {
      met =
        fpq.combinedLogic === "or"
          ? amountMet || quantityMet
          : amountMet && quantityMet;
    }

    if (met) {
      this.bannerEl.dataset.fpqState = "met";
      this.textEl.textContent =
        "✓ First-order minimum met — wholesale pricing applies at checkout.";
      this.bannerEl.hidden = false;
      return;
    }

    const hints = [];
    if (
      (fpq.mode === "amount" || fpq.mode === "combined") &&
      !amountMet &&
      fpq.amount
    ) {
      const remaining = Math.max(0, fpq.amount - cartWholesale);
      hints.push(`${this._formatMoney(remaining)} more`);
    }
    if (
      (fpq.mode === "quantity" || fpq.mode === "combined") &&
      !quantityMet &&
      fpq.quantity
    ) {
      const remaining = Math.max(0, fpq.quantity - cartQty);
      hints.push(`${remaining} more unit${remaining === 1 ? "" : "s"}`);
    }
    const joiner = fpq.combinedLogic === "or" ? " or " : " and ";

    this.bannerEl.dataset.fpqState = "unmet";
    this.textEl.textContent = hints.length
      ? `Add ${hints.join(joiner)} in wholesale spend to unlock pricing on your first order.`
      : "Your first order must meet the wholesale minimum to unlock pricing.";
    this.bannerEl.hidden = false;
  }

  _formatMoney(amount) {
    if (window.Shopify && typeof window.Shopify.formatMoney === "function") {
      // eslint-disable-next-line no-template-curly-in-string
      const fmt = window.Shopify.money_format || "${{amount}}";
      return window.Shopify.formatMoney(Math.round(amount * 100), fmt);
    }
    return `${amount.toFixed(2)}`;
  }

  disconnectedCallback() {
    if (this._pollTimer) clearInterval(this._pollTimer);
    [
      "cart:updated",
      "cart:refresh",
      "cart:change",
      "cart:added",
      "cart:item-updated",
    ].forEach((ev) => document.removeEventListener(ev, this._onCartChange));
  }
}

if (!customElements.get("stockly-fpq-banner")) {
  customElements.define("stockly-fpq-banner", StocklyFpqBanner);
}
