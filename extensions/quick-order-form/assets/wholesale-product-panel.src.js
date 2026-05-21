/**
 * Stockly — Wholesale Product Panel Web Component.
 *
 * Renders on individual product pages alongside the standard retail
 * Add-to-cart form. Shows the eligible customer their live wholesale
 * price (multiplicative baseline × tier), tier ladder, qty stepper,
 * and a CTA that POSTs /cart/add.js.
 *
 * The panel stays hidden until /apps/stockly/context confirms the
 * visitor is an approved wholesale customer — keeps retail visitors
 * from seeing B2B pricing (luxury-brand requirement).
 *
 * Tier resolution mirrors run.ts and quick-order-form.src.js:
 *   per_line tier qualifies on the selected qty;
 *   cart_total tier qualifies on cart-wide qty (best-effort via /cart.js)
 *   higher of the two wins, then composes multiplicatively with
 *   the universal wholesale baseline %.
 *
 * FPQ progress banner: same gate model as the QOF — only shows when
 * the customer is in `approved_pre_fpq` state and the gate isn't met.
 * For the FPQ calc we fetch /cart.js once and add this panel's pending
 * line so the customer sees the full picture before clicking add.
 */
class StocklyProductPanel extends HTMLElement {
  connectedCallback() {
    this.contextUrl = this.dataset.contextUrl || '/apps/stockly/context';
    this.customerTags = this.dataset.customerTags || '';
    this.productGid = this.dataset.productGid || '';
    this.collectionGids = (this.dataset.collectionGids || '')
      .split(',')
      .filter(Boolean);
    this.productTitle = this.dataset.productTitle || '';

    this.fpqEl = this.querySelector('[data-stockly-fpq]');
    this.fpqTextEl = this.querySelector('[data-stockly-fpq-text]');
    this.ladderEl = this.querySelector('.stockly-wpp__ladder');
    this.ladderTiersEl = this.querySelector('[data-stockly-ladder]');
    this.variantRowEl = this.querySelector('[data-stockly-variant-row]');
    this.variantSelectEl = this.querySelector('[data-stockly-variant-select]');
    this.wholesalePriceEl = this.querySelector('[data-stockly-wholesale-price]');
    this.retailPriceEl = this.querySelector('[data-stockly-retail-price]');
    this.saveEl = this.querySelector('[data-stockly-save]');
    this.savePctEl = this.querySelector('[data-stockly-save-pct]');
    this.qtyInputEl = this.querySelector('[data-stockly-qty]');
    this.qtyMinusEl = this.querySelector('[data-stockly-qty-minus]');
    this.qtyPlusEl = this.querySelector('[data-stockly-qty-plus]');
    this.lineTotalEl = this.querySelector('[data-stockly-line-total]');
    this.nudgeEl = this.querySelector('[data-stockly-nudge]');
    this.addBtnEl = this.querySelector('[data-stockly-add]');
    this.msgEl = this.querySelector('[data-stockly-msg]');

    // Parse the variants payload Liquid embedded.
    try {
      const payload = this.querySelector('[data-stockly-variants]');
      this.variants = payload ? JSON.parse(payload.textContent) : [];
    } catch {
      this.variants = [];
    }

    this.tiers = [];
    this.eligible = false;
    this.wholesaleBaselinePct = 0;
    this.customerState = 'visitor';
    this.fpq = null;
    /** Selected variant object, mutated by the variant <select>. */
    this.selectedVariant = this._initialVariant();
    /** Cart snapshot for cart_total tier eval. Refreshed on connect + after add. */
    this._cart = null;

    this._onQtyInput = this._onQtyInput.bind(this);
    this._onVariantChange = this._onVariantChange.bind(this);
    this._onAdd = this._onAdd.bind(this);

    this._fetchContext();
  }

  _initialVariant() {
    const initialId = Number(this.dataset.initialVariantId);
    return (
      this.variants.find((v) => v.id === initialId) ||
      this.variants.find((v) => v.available) ||
      this.variants[0] ||
      null
    );
  }

  async _fetchContext() {
    try {
      const params = new URLSearchParams();
      if (this.customerTags) params.set('customer_tags', this.customerTags);
      const res = await fetch(`${this.contextUrl}?${params.toString()}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return; // stay hidden — fail safe for retail visitors
      const data = await res.json();

      this.tiers = Array.isArray(data.tiers) ? data.tiers : [];
      this.eligible = Boolean(data.eligible);
      this.wholesaleBaselinePct = Number(data.shop?.wholesaleBaselinePct ?? 0) || 0;
      this.customerState = data.customerState || (this.eligible ? 'approved_pre_fpq' : 'visitor');
      this.fpq = data.shop?.fpq ?? null;
      this._applyBranding(data.branding || {});

      if (!this.eligible || !this.selectedVariant) {
        return; // remain hidden
      }

      // Cart snapshot (best effort — used for cart_total tier + FPQ).
      try {
        const cartRes = await fetch('/cart.js', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (cartRes.ok) this._cart = await cartRes.json();
      } catch {
        /* ignore — proceed without cart context */
      }

      this._hydrate();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Stockly] product panel context fetch failed', err);
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

  _hydrate() {
    // Reveal the panel.
    this.hidden = false;

    // Variant selector — only show when > 1 variant.
    if (this.variants.length > 1) {
      this.variantSelectEl.replaceChildren(
        ...this.variants.map((v) => {
          const opt = document.createElement('option');
          opt.value = v.id;
          opt.textContent = v.available ? v.title : `${v.title} — sold out`;
          if (v.id === this.selectedVariant.id) opt.selected = true;
          if (!v.available) opt.disabled = true;
          return opt;
        }),
      );
      this.variantSelectEl.addEventListener('change', this._onVariantChange);
      this.variantRowEl.hidden = false;
    }

    this._renderLadder();

    this.qtyInputEl.addEventListener('input', this._onQtyInput);
    this.qtyMinusEl.addEventListener('click', () => this._bumpQty(-1));
    this.qtyPlusEl.addEventListener('click', () => this._bumpQty(1));
    this.addBtnEl.addEventListener('click', this._onAdd);

    this._recalc();
  }

  /**
   * Render the tier ladder for tiers applicable to this product:
   *   - scope=all   → always shown
   *   - scope=collection → shown when product is in that collection
   *   - scope=product → shown when scopeId matches this product
   */
  _renderLadder() {
    const applicable = this.tiers
      .filter((t) => this._tierApplies(t))
      .sort((a, b) => a.minQty - b.minQty);

    if (applicable.length === 0) {
      this.ladderEl.hidden = true;
      return;
    }

    this.ladderTiersEl.innerHTML = applicable
      .map((t) => {
        const unitLabel = t.aggregation === 'cart_total' ? 'mixed units' : 'units';
        return `
          <span
            class="stockly-wpp__ladder-tier"
            data-min-qty="${t.minQty}"
            data-discount="${t.discountPct}"
            data-aggregation="${t.aggregation ?? 'per_line'}"
          >
            <span class="stockly-wpp__ladder-qty">${t.minQty}+ ${unitLabel}</span>
            <span class="stockly-wpp__ladder-discount">-${t.discountPct}%</span>
          </span>
        `;
      })
      .join('');

    this.ladderEl.hidden = false;
  }

  _tierApplies(tier) {
    if (tier.scope === 'all') return true;
    if (tier.scope === 'product') return tier.scopeId === this.productGid;
    if (tier.scope === 'collection') return this.collectionGids.includes(tier.scopeId);
    return false;
  }

  _onVariantChange(e) {
    const id = Number(e.target.value);
    const variant = this.variants.find((v) => v.id === id);
    if (variant) {
      this.selectedVariant = variant;
      this._recalc();
    }
  }

  _onQtyInput() {
    const raw = parseInt(this.qtyInputEl.value, 10) || 1;
    const safe = Math.max(1, raw);
    if (String(safe) !== this.qtyInputEl.value) {
      this.qtyInputEl.value = safe;
    }
    this._recalc();
  }

  _bumpQty(delta) {
    const current = parseInt(this.qtyInputEl.value, 10) || 1;
    const next = Math.max(1, current + delta);
    this.qtyInputEl.value = next;
    this._recalc();
  }

  /**
   * Resolve the per-line tier % for the selected variant at the
   * current qty. Mirrors run.ts precedence: product > collection >
   * all, then highest qualifying minQty wins.
   */
  _resolvePerLinePct(qty) {
    if (qty <= 0 || this.tiers.length === 0) return 0;
    const scopeRank = { product: 3, collection: 2, all: 1 };
    const qualifying = this.tiers
      .filter((t) => this._tierApplies(t))
      .filter((t) => (t.aggregation ?? 'per_line') === 'per_line')
      .filter((t) => t.minQty <= qty)
      .sort((a, b) => {
        const r = scopeRank[b.scope] - scopeRank[a.scope];
        return r !== 0 ? r : b.minQty - a.minQty;
      });
    return qualifying[0]?.discountPct ?? 0;
  }

  /**
   * Cart-total tier eval. Adds this panel's pending qty to the qty
   * already in cart so the customer sees the discount they'd lock in
   * BEFORE they click add. Without this, mixing across products
   * wouldn't reflect in the displayed price until after the add.
   */
  _resolveCartTotalPct(qty) {
    if (this.tiers.length === 0) return 0;
    const cartQty = this._cart?.item_count ?? 0;
    const referenceQty = cartQty + qty;
    if (referenceQty <= 0) return 0;
    const scopeRank = { product: 3, collection: 2, all: 1 };
    const qualifying = this.tiers
      .filter((t) => this._tierApplies(t))
      .filter((t) => t.aggregation === 'cart_total')
      .filter((t) => t.minQty <= referenceQty)
      .sort((a, b) => {
        const r = scopeRank[b.scope] - scopeRank[a.scope];
        return r !== 0 ? r : b.minQty - a.minQty;
      });
    return qualifying[0]?.discountPct ?? 0;
  }

  _resolveNextTier(qty) {
    if (this.tiers.length === 0) return null;
    const current = this._resolvePerLinePct(qty);
    const future = this.tiers
      .filter((t) => this._tierApplies(t))
      .filter((t) => (t.aggregation ?? 'per_line') === 'per_line')
      .filter((t) => t.minQty > qty && t.discountPct > current)
      .sort((a, b) => a.minQty - b.minQty);
    if (future.length === 0) return null;
    const next = future[0];
    return {
      minQty: next.minQty,
      discountPct: next.discountPct,
      missingQty: next.minQty - qty,
    };
  }

  _recalc() {
    if (!this.selectedVariant) return;

    const qty = Math.max(1, parseInt(this.qtyInputEl.value, 10) || 1);
    const retailCents = Number(this.selectedVariant.price) || 0;

    const perLinePct = this._resolvePerLinePct(qty);
    const cartTotalPct = this._resolveCartTotalPct(qty);
    const tierPct = Math.max(perLinePct, cartTotalPct);

    const baselineFactor = 1 - this.wholesaleBaselinePct / 100;
    const tierFactor = 1 - tierPct / 100;

    const wholesaleUnitCents = Math.round(retailCents * baselineFactor * tierFactor);
    const lineCents = wholesaleUnitCents * qty;

    // Effective total discount % off retail (combined).
    const totalDiscountPct = retailCents > 0
      ? Math.round((1 - (wholesaleUnitCents / retailCents)) * 100)
      : 0;

    this.wholesalePriceEl.textContent = this._formatMoney(wholesaleUnitCents);
    if (totalDiscountPct > 0) {
      this.retailPriceEl.textContent = this._formatMoney(retailCents);
      this.retailPriceEl.hidden = false;
      this.savePctEl.textContent = `${totalDiscountPct}%`;
      this.saveEl.hidden = false;
    } else {
      this.retailPriceEl.hidden = true;
      this.saveEl.hidden = true;
    }

    this.lineTotalEl.textContent = qty > 1
      ? `${qty} × ${this._formatMoney(wholesaleUnitCents)} = ${this._formatMoney(lineCents)}`
      : '';

    // Highlight active tier pill.
    const cartTotalQtyRef = (this._cart?.item_count ?? 0) + qty;
    this.ladderTiersEl?.querySelectorAll('.stockly-wpp__ladder-tier').forEach((p) => {
      const min = parseInt(p.dataset.minQty, 10);
      const agg = p.dataset.aggregation || 'per_line';
      const ref = agg === 'cart_total' ? cartTotalQtyRef : qty;
      p.classList.toggle('stockly-wpp__ladder-tier--active', min <= ref && min > 0);
    });

    // Next-tier nudge.
    const next = this._resolveNextTier(qty);
    if (next) {
      this.nudgeEl.textContent = `Add ${next.missingQty} more for -${next.discountPct}%`;
      this.nudgeEl.hidden = false;
    } else {
      this.nudgeEl.hidden = true;
    }

    this.addBtnEl.disabled = !this.selectedVariant.available || qty < 1;

    this._updateFpqBanner(qty, wholesaleUnitCents);
  }

  /**
   * Minimal FPQ progress hint on the product page. Approves are gated
   * via the dedicated cart-page fpq-banner block and the QOF banner;
   * the panel just nudges "you need X more" when the cart + pending
   * line still falls short. Hidden when met (no checkmark needed —
   * the cart banner handles that state).
   */
  _updateFpqBanner(qty, wholesaleUnitCents) {
    if (!this.fpqEl) return;
    if (
      this.customerState !== 'approved_pre_fpq' ||
      !this.fpq ||
      this.fpq.mode === 'none' ||
      !this.fpq.amount
    ) {
      this.fpqEl.hidden = true;
      return;
    }
    const bFactor = 1 - this.wholesaleBaselinePct / 100;
    let cartWholesale = 0;
    (this._cart?.items || []).forEach((it) => {
      cartWholesale += ((it.original_line_price ?? it.line_price ?? 0) / 100) * bFactor;
    });
    const projected = cartWholesale + (wholesaleUnitCents * qty) / 100;
    const remaining = this.fpq.amount - projected;
    if (remaining <= 0) {
      this.fpqEl.hidden = true;
      return;
    }
    this.fpqEl.dataset.fpqState = 'unmet';
    this.fpqTextEl.textContent =
      `Add ${this._formatMoney(Math.round(remaining * 100))} more in wholesale spend to unlock pricing.`;
    this.fpqEl.hidden = false;
  }

  async _onAdd() {
    if (!this.selectedVariant) return;
    const qty = Math.max(1, parseInt(this.qtyInputEl.value, 10) || 1);
    this.addBtnEl.disabled = true;
    this._showMsg('', null);
    try {
      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items: [{ id: this.selectedVariant.id, quantity: qty }] }),
      });
      if (!res.ok) throw new Error(`Cart add returned ${res.status}`);
      // Refresh cart snapshot so tier ladder + FPQ banner stay accurate.
      try {
        const r = await fetch('/cart.js', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (r.ok) this._cart = await r.json();
      } catch { /* ignore */ }
      this._showMsg(`Added ${qty} × ${this.productTitle} to your wholesale cart.`, 'ok');
      this._recalc();
      document.dispatchEvent(new CustomEvent('cart:refresh'));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Stockly] product panel add failed', err);
      this._showMsg('Could not add to cart. Please try again.', 'error');
    } finally {
      this.addBtnEl.disabled = false;
    }
  }

  _showMsg(text, state) {
    if (!text) {
      this.msgEl.hidden = true;
      this.msgEl.textContent = '';
      this.msgEl.removeAttribute('data-state');
      return;
    }
    this.msgEl.textContent = text;
    if (state) this.msgEl.dataset.state = state;
    this.msgEl.hidden = false;
  }

  _formatMoney(cents) {
    if (window.Shopify && typeof window.Shopify.formatMoney === 'function') {
      // eslint-disable-next-line no-template-curly-in-string
      const fmt = window.Shopify.money_format || '${{amount}}';
      return window.Shopify.formatMoney(cents, fmt);
    }
    return `$${(cents / 100).toFixed(2)}`;
  }
}

if (!customElements.get('stockly-product-panel')) {
  customElements.define('stockly-product-panel', StocklyProductPanel);
}
