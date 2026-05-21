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
    this.ladderEl = this.querySelector('.stockly-qo__ladder');
    this.ladderTiersEl = this.querySelector('[data-stockly-ladder-tiers]');
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
    this.ladderEl.hidden = true;
    this.tableWrapEl.hidden = true;
    this.footerEl.hidden = true;
  }

  _showTable() {
    this.statesEl.hidden = true;
    this.tableWrapEl.hidden = false;
    this.footerEl.hidden = false;

    this._renderLadder();

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
      .map(
        (t) => `
          <span
            class="stockly-qo__ladder-tier"
            data-min-qty="${t.minQty}"
            data-discount="${t.discountPct}"
          >
            <span class="stockly-qo__ladder-qty">${t.minQty}+ units</span>
            <span class="stockly-qo__ladder-discount">-${t.discountPct}%</span>
          </span>
        `,
      )
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

    let maxQty = 0;
    this.rows.forEach((row) => {
      const qty = parseInt(row.querySelector('.stockly-qo__qty').value, 10) || 0;
      if (qty > maxQty) maxQty = qty;
    });

    const pills = this.ladderTiersEl.querySelectorAll('.stockly-qo__ladder-tier');
    let activeMinQty = -1;
    pills.forEach((p) => {
      const min = parseInt(p.dataset.minQty, 10);
      if (min <= maxQty && min > activeMinQty) activeMinQty = min;
    });

    pills.forEach((p) => {
      const min = parseInt(p.dataset.minQty, 10);
      p.classList.toggle('stockly-qo__ladder-tier--active', min === activeMinQty);
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
   * Resolve the discount percent for a row at a given quantity.
   * Mirrors the server-side precedence in tiers.server.ts:
   *   product > collection > all, then highest qualifying minQty wins.
   */
  _resolveDiscountPct(row, qty) {
    if (qty <= 0 || this.tiers.length === 0) return 0;

    const scopeRank = { product: 3, collection: 2, all: 1 };

    const qualifying = this._applicableTiers(row)
      .filter((t) => t.minQty <= qty)
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

    this.rows.forEach((row) => {
      const input = row.querySelector('.stockly-qo__qty');
      const qty = Math.max(0, parseInt(input.value, 10) || 0);
      if (String(qty) !== input.value) input.value = qty;

      const basePrice = parseInt(row.dataset.basePrice, 10) || 0;
      const discountPct = this._resolveDiscountPct(row, qty);
      const lineTotal = Math.round(basePrice * qty * (1 - discountPct / 100));

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
