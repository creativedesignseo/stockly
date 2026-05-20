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

    this.statesEl = this.querySelector('.stockly-qo__states');
    this.tableWrapEl = this.querySelector('.stockly-qo__table-wrap');
    this.rows = Array.from(this.querySelectorAll('.stockly-qo__row'));
    this.footerEl = this.querySelector('.stockly-qo__footer');
    this.grandTotalEl = this.querySelector('[data-stockly-grand-total]');
    this.addAllBtn = this.querySelector('[data-stockly-add-all]');

    this.tiers = [];
    this.eligible = false;

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
    this.tableWrapEl.hidden = true;
    this.footerEl.hidden = true;
  }

  _showTable() {
    this.statesEl.hidden = true;
    this.tableWrapEl.hidden = false;
    this.footerEl.hidden = false;

    this.rows.forEach((row) => {
      const input = row.querySelector('.stockly-qo__qty');
      input.disabled = false;
      input.addEventListener('input', this._onQtyInput);
    });

    this.addAllBtn.addEventListener('click', this._addAllToCart);
  }

  _onQtyInput() {
    // Debounce so rapid typing doesn't thrash the DOM.
    if (this._recalcTimer) clearTimeout(this._recalcTimer);
    this._recalcTimer = setTimeout(() => this._recalcTotals(), 120);
  }

  /**
   * Resolve the discount percent for a row at a given quantity.
   * Mirrors the server-side precedence in tiers.server.ts:
   *   product > collection > all, then highest qualifying minQty wins.
   */
  _resolveDiscountPct(row, qty) {
    if (qty <= 0 || this.tiers.length === 0) return 0;

    const productGid = row.dataset.productGid;
    const collectionGids = (row.dataset.collectionGids || '')
      .split(',')
      .filter(Boolean);

    const scopeRank = { product: 3, collection: 2, all: 1 };

    const qualifying = this.tiers
      .filter((t) => {
        if (t.minQty > qty) return false;
        if (t.scope === 'all') return true;
        if (t.scope === 'product') return t.scopeId === productGid;
        if (t.scope === 'collection') return collectionGids.includes(t.scopeId);
        return false;
      })
      .sort((a, b) => {
        const rankDiff = scopeRank[b.scope] - scopeRank[a.scope];
        if (rankDiff !== 0) return rankDiff;
        return b.minQty - a.minQty;
      });

    return qualifying[0]?.discountPct ?? 0;
  }

  _recalcTotals() {
    let grand = 0;

    this.rows.forEach((row) => {
      const input = row.querySelector('.stockly-qo__qty');
      const qty = Math.max(0, parseInt(input.value, 10) || 0);
      if (String(qty) !== input.value) input.value = qty;

      const basePrice = parseInt(row.dataset.basePrice, 10) || 0;
      const discountPct = this._resolveDiscountPct(row, qty);
      const lineTotal = Math.round(basePrice * qty * (1 - discountPct / 100));

      row.querySelector('[data-stockly-line-total]').textContent =
        this._formatMoney(lineTotal);
      grand += lineTotal;
    });

    this.grandTotalEl.textContent = this._formatMoney(grand);
    this.addAllBtn.disabled = grand === 0;
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
