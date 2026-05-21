/**
 * Stockly — Quick Order Form Web Component.
 *
 * Hydrates the Liquid-rendered table:
 *   1. Calls /apps/stockly/context once on connect (Shopify App Proxy
 *      auto-signs the request with HMAC; we just need credentials).
 *   2. Branches on `eligible`: if false → branded "not eligible" state.
 *   3. If eligible → enables qty inputs, wires debounced totals,
 *      and POSTs /cart/add.js when the user clicks "Add all to cart".
 *
 * Tier resolution mirrors app/services/tiers.server.ts: scope precedence
 * is product > collection > all, and within a scope the highest minQty
 * <= qty wins. v1 uses Liquid base prices; Storefront-API per-customer
 * prices land in a follow-up.
 */
class StocklyQuickOrder extends HTMLElement {
  connectedCallback() {
    this.contextUrl = this.dataset.contextUrl || '/apps/stockly/context';
    this.customerTags = this.dataset.customerTags || '';
    this.sourceCollectionGid = this.dataset.sourceCollectionGid || '';

    this.statesEl = this.querySelector('.stockly-qo__states');
    this.fpqBannerEl = this.querySelector('[data-stockly-fpq-banner]');
    this.fpqBannerTextEl = this.querySelector('[data-stockly-fpq-banner-text]');
    this.ladderEl = this.querySelector('.stockly-qo__ladder');
    this.ladderTiersEl = this.querySelector('[data-stockly-ladder-tiers]');
    this.tableWrapEl = this.querySelector('.stockly-qo__table-wrap');
    this.rows = Array.from(this.querySelectorAll('.stockly-qo__row'));
    this.footerEl = this.querySelector('.stockly-qo__footer');
    this.grandTotalEl = this.querySelector('[data-stockly-grand-total]');
    this.addAllBtn = this.querySelector('[data-stockly-add-all]');

    this.tiers = [];
    this.eligible = false;
    /** Universal wholesale baseline % (ADR-006). Composes multiplicatively with tier. */
    this.wholesaleBaselinePct = 0;
    /** 'visitor' | 'approved_pre_fpq' | 'qualified' — drives the FPQ banner. */
    this.customerState = 'visitor';
    /** FPQ rules from the shop (ADR-004). Null when no gate is configured. */
    this.fpq = null;

    this._recalcTimer = null;
    this._onQtyInput = this._onQtyInput.bind(this);
    this._addAllToCart = this._addAllToCart.bind(this);

    this._fetchContext();
  }

  async _fetchContext() {
    try {
      const params = new URLSearchParams();
      if (this.customerTags) params.set('customer_tags', this.customerTags);

      const res = await fetch(`${this.contextUrl}?${params.toString()}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`Context endpoint returned ${res.status}`);
      }

      const data = await res.json();
      this.tiers = Array.isArray(data.tiers) ? data.tiers : [];
      this.eligible = Boolean(data.eligible);
      this.wholesaleBaselinePct = Number(data.shop?.wholesaleBaselinePct ?? 0) || 0;
      this.customerState = data.customerState || (this.eligible ? 'approved_pre_fpq' : 'visitor');
      this.fpq = data.shop?.fpq ?? null;
      this._applyBranding(data.branding || {});

      if (!this.eligible) {
        this._showState('not-eligible');
        return;
      }

      if (this.rows.length === 0) {
        this._showState('empty');
        return;
      }

      this._showTable();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Stockly] context fetch failed', err);
      this._showState('error');
    }
  }

  _applyBranding(branding) {
    if (branding.primaryColor) {
      this.style.setProperty('--stockly-primary', branding.primaryColor);
    }
    if (branding.accentColor) {
      this.style.setProperty('--stockly-accent', branding.accentColor);
    }
    if (branding.fontFamily) {
      this.style.setProperty('--stockly-font', branding.fontFamily);
    }
  }

  _showState(name) {
    this.statesEl.hidden = false;
    this.statesEl.dataset.stocklyState = name;
    this.statesEl.querySelectorAll('.stockly-qo__state').forEach((p) => {
      p.hidden = !p.classList.contains(`stockly-qo__state--${name}`);
    });
    this.fpqBannerEl.hidden = true;
    this.ladderEl.hidden = true;
    this.tableWrapEl.hidden = true;
    this.footerEl.hidden = true;
  }

  _showTable() {
    this.statesEl.hidden = true;
    this.tableWrapEl.hidden = false;
    this.footerEl.hidden = false;

    this._renderLadder();
    this._updateFpqBanner();

    this.rows.forEach((row) => {
      const input = row.querySelector('.stockly-qo__qty');
      input.disabled = false;
      input.addEventListener('input', this._onQtyInput);
    });

    this.addAllBtn.addEventListener('click', this._addAllToCart);
  }

  /**
   * Render the volume-tier ladder above the table.
   *
   * Includes tiers that apply to the block's current view:
   *   - All shop-wide tiers (scope='all'), AND
   *   - Collection-scoped tiers whose scopeId matches the block's
   *     configured source collection (when one is set).
   *
   * Product-scoped tiers stay out of the ladder — they'd be too
   * noisy here; they get per-row indicators in a follow-up commit.
   *
   * Hidden when no qualifying tier exists.
   */
  _renderLadder() {
    const applicable = this.tiers
      .filter((t) => {
        if (t.scope === 'all') return true;
        if (t.scope === 'collection' && this.sourceCollectionGid) {
          return t.scopeId === this.sourceCollectionGid;
        }
        return false;
      })
      .sort((a, b) => a.minQty - b.minQty);

    if (applicable.length === 0) {
      this.ladderEl.hidden = true;
      return;
    }

    this.ladderTiersEl.innerHTML = applicable
      .map((t) => {
        // cart_total tiers say "mixed units" so the customer
        // understands they can assort across products
        const unitLabel = t.aggregation === 'cart_total' ? 'mixed units' : 'units';
        return `
          <span
            class="stockly-qo__ladder-tier"
            data-min-qty="${t.minQty}"
            data-discount="${t.discountPct}"
            data-aggregation="${t.aggregation ?? 'per_line'}"
          >
            <span class="stockly-qo__ladder-qty">${t.minQty}+ ${unitLabel}</span>
            <span class="stockly-qo__ladder-discount">-${t.discountPct}%</span>
          </span>
        `;
      })
      .join('');

    this.ladderEl.hidden = false;
  }

  /**
   * Highlight the active tier pill based on the maximum qty across
   * rows. The "active" tier is the highest-minQty pill whose
   * threshold is met by any row. Called from _recalcTotals().
   */
  _updateLadderActive() {
    if (!this.ladderTiersEl || this.ladderTiersEl.children.length === 0) {
      return;
    }

    // For per_line pills: the activation threshold is the MAX line qty.
    // For cart_total pills: it's the SUM of all line quantities.
    let maxLineQty = 0;
    let cartTotalQty = 0;
    this.rows.forEach((row) => {
      const qty = parseInt(row.querySelector('.stockly-qo__qty').value, 10) || 0;
      if (qty > maxLineQty) maxLineQty = qty;
      cartTotalQty += qty;
    });

    const pills = this.ladderTiersEl.querySelectorAll('.stockly-qo__ladder-tier');
    pills.forEach((p) => {
      const min = parseInt(p.dataset.minQty, 10);
      const aggregation = p.dataset.aggregation || 'per_line';
      const referenceQty = aggregation === 'cart_total' ? cartTotalQty : maxLineQty;
      p.classList.toggle('stockly-qo__ladder-tier--active', min <= referenceQty && min > 0);
    });
  }

  _onQtyInput() {
    // Debounce so rapid typing doesn't thrash the DOM.
    if (this._recalcTimer) clearTimeout(this._recalcTimer);
    this._recalcTimer = setTimeout(() => this._recalcTotals(), 120);
  }

  /**
   * Return the tiers that COULD apply to this row, regardless of qty.
   * Used by both _resolveDiscountPct (filters by qty) and
   * _resolveNextTier (looks ahead for upcoming tiers).
   */
  _applicableTiers(row) {
    const productGid = row.dataset.productGid;
    const collectionGids = (row.dataset.collectionGids || '')
      .split(',')
      .filter(Boolean);

    return this.tiers.filter((t) => {
      if (t.scope === 'all') return true;
      if (t.scope === 'product') return t.scopeId === productGid;
      if (t.scope === 'collection') return collectionGids.includes(t.scopeId);
      return false;
    });
  }

  /**
   * Resolve the PER-LINE tier discount for a row at a given quantity.
   * Mirrors the server-side precedence in tiers.server.ts:
   *   product > collection > all, then highest qualifying minQty wins.
   * Cart-total tiers (ADR-007) are evaluated separately in
   * _recalcTotals — they don't qualify on per-line qty.
   */
  _resolveDiscountPct(row, qty) {
    if (qty <= 0 || this.tiers.length === 0) return 0;

    const scopeRank = { product: 3, collection: 2, all: 1 };

    const qualifying = this._applicableTiers(row)
      .filter((t) => (t.aggregation ?? 'per_line') === 'per_line')
      .filter((t) => t.minQty <= qty)
      .sort((a, b) => {
        const rankDiff = scopeRank[b.scope] - scopeRank[a.scope];
        if (rankDiff !== 0) return rankDiff;
        return b.minQty - a.minQty;
      });

    return qualifying[0]?.discountPct ?? 0;
  }

  /**
   * Resolve the active cart_total tier's discount % for a given row.
   * Cart-total tiers apply uniformly to every line within their scope
   * when the SUM of qualifying line quantities meets minQty.
   *
   * `cartTotalQty` is computed once in _recalcTotals and passed in to
   * avoid recomputing per row.
   */
  _resolveCartTotalDiscountPct(row, cartTotalQty) {
    if (cartTotalQty <= 0 || this.tiers.length === 0) return 0;

    const scopeRank = { product: 3, collection: 2, all: 1 };

    const qualifying = this._applicableTiers(row)
      .filter((t) => t.aggregation === 'cart_total')
      .filter((t) => t.minQty <= cartTotalQty)
      .sort((a, b) => {
        const rankDiff = scopeRank[b.scope] - scopeRank[a.scope];
        if (rankDiff !== 0) return rankDiff;
        return b.minQty - a.minQty;
      });

    return qualifying[0]?.discountPct ?? 0;
  }

  /**
   * Find the next tier this row could unlock — the closest tier by
   * minQty whose discount BEATS the row's current discount. Returns
   * null if no future tier exists or qty is 0 (no nudge before the
   * customer starts engaging with the row).
   */
  _resolveNextTier(row, qty) {
    if (qty <= 0 || this.tiers.length === 0) return null;

    const currentDiscount = this._resolveDiscountPct(row, qty);

    const future = this._applicableTiers(row)
      .filter((t) => t.minQty > qty && t.discountPct > currentDiscount)
      .sort((a, b) => a.minQty - b.minQty);

    if (future.length === 0) return null;
    const next = future[0];
    return {
      minQty: next.minQty,
      discountPct: next.discountPct,
      missingQty: next.minQty - qty,
    };
  }

  _recalcTotals() {
    let grand = 0;

    // First pass: cart-wide qty (needed for cart_total tier evaluation).
    let cartTotalQty = 0;
    this.rows.forEach((row) => {
      const input = row.querySelector('.stockly-qo__qty');
      const qty = Math.max(0, parseInt(input.value, 10) || 0);
      cartTotalQty += qty;
    });

    this.rows.forEach((row) => {
      const input = row.querySelector('.stockly-qo__qty');
      const qty = Math.max(0, parseInt(input.value, 10) || 0);
      if (String(qty) !== input.value) input.value = qty;

      const basePrice = parseInt(row.dataset.basePrice, 10) || 0;

      // Pick the higher of (per-line tier %, cart-total tier %).
      // Mirrors the Function's combine logic — keeps storefront math
      // identical to checkout.
      const perLinePct = this._resolveDiscountPct(row, qty);
      const cartTotalPct = this._resolveCartTotalDiscountPct(row, cartTotalQty);
      const tierPct = Math.max(perLinePct, cartTotalPct);

      // Multiplicative composition of wholesale baseline × tier
      // (memory/wholesale-pricing-composition).
      const baselineFactor = 1 - this.wholesaleBaselinePct / 100;
      const tierFactor = 1 - tierPct / 100;
      const lineTotal = Math.round(basePrice * qty * baselineFactor * tierFactor);

      row.querySelector('[data-stockly-line-total]').textContent =
        this._formatMoney(lineTotal);

      // Per-row nudge: "Add N more for -X%" when a higher tier is
      // reachable. Stays hidden at qty=0 (the ladder pill above
      // already advertises the first tier).
      const nudgeEl = row.querySelector('[data-stockly-row-nudge]');
      const next = this._resolveNextTier(row, qty);
      if (next) {
        nudgeEl.textContent = `Add ${next.missingQty} more for -${next.discountPct}%`;
        nudgeEl.hidden = false;
      } else {
        nudgeEl.hidden = true;
      }

      grand += lineTotal;
    });

    this.grandTotalEl.textContent = this._formatMoney(grand);
    this.addAllBtn.disabled = grand === 0;
    this._updateLadderActive();
    this._updateFpqBanner();
  }

  /**
   * Update the FPQ progress banner (ADR-004). Only relevant for
   * customers in the `approved_pre_fpq` state — qualified customers
   * have already cleared the gate, visitors don't see the block.
   *
   * The FPQ amount is measured on the customer's WHOLESALE spend
   * (what they'd actually pay if discount applied), NOT on retail.
   * So "first order ≥ €500" means "you must commit €500 in wholesale
   * terms" — the genuine business commitment.
   *
   * Hidden when: customer is qualified OR FPQ mode is "none" OR
   * the threshold is already met. Otherwise renders progress like
   * "Add €245 more to unlock wholesale pricing on your first order".
   */
  _updateFpqBanner() {
    if (!this.fpqBannerEl) return;

    if (
      this.customerState !== 'approved_pre_fpq' ||
      !this.fpq ||
      this.fpq.mode === 'none'
    ) {
      this.fpqBannerEl.hidden = true;
      return;
    }

    // Sum the already-rendered discounted line totals — that's the
    // customer's wholesale spend (what they'd pay if the gate let
    // them through), which is what the FPQ amount is compared to.
    let cartWholesaleAmount = 0;
    let cartTotalQty = 0;
    this.rows.forEach((row) => {
      const input = row.querySelector('.stockly-qo__qty');
      const qty = parseInt(input.value, 10) || 0;
      cartTotalQty += qty;

      const lineTotalEl = row.querySelector('[data-stockly-line-total]');
      if (lineTotalEl) {
        const cents = this._parseMoneyToCents(lineTotalEl.textContent || '');
        cartWholesaleAmount += cents / 100;
      }
    });

    const amountMet =
      this.fpq.amount && this.fpq.amount > 0
        ? cartWholesaleAmount >= this.fpq.amount
        : true;
    const quantityMet =
      this.fpq.quantity && this.fpq.quantity > 0
        ? cartTotalQty >= this.fpq.quantity
        : true;

    let met = true;
    if (this.fpq.mode === 'amount') met = amountMet;
    else if (this.fpq.mode === 'quantity') met = quantityMet;
    else if (this.fpq.mode === 'combined') {
      met = this.fpq.combinedLogic === 'or'
        ? amountMet || quantityMet
        : amountMet && quantityMet;
    }

    if (met) {
      this.fpqBannerEl.dataset.fpqState = 'met';
      this.fpqBannerTextEl.textContent =
        '✓ First-order minimum met — wholesale pricing applies at checkout.';
      this.fpqBannerEl.hidden = false;
      return;
    }

    // Build "add X more" hint for unmet rule(s).
    const hints = [];
    if (
      (this.fpq.mode === 'amount' || this.fpq.mode === 'combined') &&
      !amountMet &&
      this.fpq.amount
    ) {
      const remaining = Math.max(0, this.fpq.amount - cartWholesaleAmount);
      hints.push(`${this._formatMoney(Math.round(remaining * 100))} more`);
    }
    if (
      (this.fpq.mode === 'quantity' || this.fpq.mode === 'combined') &&
      !quantityMet &&
      this.fpq.quantity
    ) {
      const remaining = Math.max(0, this.fpq.quantity - cartTotalQty);
      hints.push(`${remaining} more unit${remaining === 1 ? '' : 's'}`);
    }
    const joiner = this.fpq.combinedLogic === 'or' ? ' or ' : ' and ';

    this.fpqBannerEl.dataset.fpqState = 'unmet';
    this.fpqBannerTextEl.textContent = hints.length
      ? `Add ${hints.join(joiner)} in wholesale spend to unlock pricing on your first order.`
      : 'Your first order must meet the wholesale minimum to unlock pricing.';
    this.fpqBannerEl.hidden = false;
  }

  async _addAllToCart() {
    const items = this.rows
      .map((row) => ({
        id: parseInt(row.dataset.variantId, 10),
        quantity: parseInt(row.querySelector('.stockly-qo__qty').value, 10) || 0,
      }))
      .filter((item) => item.quantity > 0);

    if (items.length === 0) return;

    this.addAllBtn.disabled = true;
    try {
      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error(`Cart add returned ${res.status}`);
      window.location.href = '/cart';
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Stockly] add-to-cart failed', err);
      this.addAllBtn.disabled = false;
    }
  }

  /**
   * Parse a money string like "$643.50" or "€643,50" or "643.50 EUR"
   * back into integer cents. Used to derive the cart's wholesale
   * subtotal from rendered line totals without recomputing the math.
   */
  _parseMoneyToCents(str) {
    // Strip everything except digits, dot, comma, minus. Take the
    // last separator as the decimal mark to handle both "1,234.50"
    // and "1.234,50" conventions.
    const cleaned = String(str).replace(/[^0-9.,-]/g, '');
    if (!cleaned) return 0;
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    let decimalMark = '';
    if (lastDot >= 0 && lastComma >= 0) {
      decimalMark = lastDot > lastComma ? '.' : ',';
    } else if (lastDot >= 0) {
      decimalMark = '.';
    } else if (lastComma >= 0) {
      decimalMark = ',';
    }
    let normalized = cleaned;
    if (decimalMark === ',') {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
    const value = parseFloat(normalized);
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100);
  }

  _formatMoney(cents) {
    if (window.Shopify && typeof window.Shopify.formatMoney === 'function') {
      // `${{amount}}` is Shopify's money_format placeholder syntax, not a JS template literal.
      // eslint-disable-next-line no-template-curly-in-string
      const fmt = window.Shopify.money_format || '${{amount}}';
      return window.Shopify.formatMoney(cents, fmt);
    }
    return `$${(cents / 100).toFixed(2)}`;
  }
}

if (!customElements.get('stockly-quick-order')) {
  customElements.define('stockly-quick-order', StocklyQuickOrder);
}
