/**
 * Stockly — Wholesale Registration Form Web Component.
 *
 * Wraps the Liquid form with progressive enhancement:
 *   - If JS loads: AJAX submit → /apps/stockly/apply, then swaps the
 *     form for a success message in place (no page reload).
 *   - If JS fails to load: the form posts the old-fashioned way to
 *     the same URL; Shopify's App Proxy delivers it to our backend
 *     which returns JSON. Not pretty but not broken.
 *
 * Already-wholesale guard: if the visitor already has the wholesale
 * tag (per Liquid customer.tags), the form is hidden and a notice
 * shown instead — no point letting an approved customer re-apply.
 */
class StocklyRegistration extends HTMLElement {
  connectedCallback() {
    this.actionUrl = this.dataset.actionUrl || '/apps/stockly/apply';
    this.alreadyWholesale = this.dataset.alreadyWholesale === 'true';

    this.formEl = this.querySelector('[data-stockly-form]');
    this.submitEl = this.querySelector('[data-stockly-submit]');
    this.errorsEl = this.querySelector('[data-stockly-errors]');
    this.successEl = this.querySelector('[data-stockly-success]');
    this.alreadyEl = this.querySelector('[data-stockly-already]');

    if (this.alreadyWholesale) {
      this.formEl.hidden = true;
      this.alreadyEl.hidden = false;
      return;
    }

    this._onSubmit = this._onSubmit.bind(this);
    this.formEl.addEventListener('submit', this._onSubmit);
  }

  async _onSubmit(e) {
    e.preventDefault();
    this._clearErrors();
    this.submitEl.disabled = true;

    try {
      const formData = new FormData(this.formEl);
      const res = await fetch(this.actionUrl, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        body: formData,
      });

      // Some App Proxy edge cases return HTML on auth failure — guard
      // against parsing non-JSON.
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Server returned an invalid response.');
      }

      if (!res.ok || !data.ok) {
        const errs = Array.isArray(data.errors) && data.errors.length
          ? data.errors
          : ['Something went wrong. Please try again.'];
        this._showErrors(errs);
        return;
      }

      // Success — swap form for the thank-you panel.
      this.formEl.hidden = true;
      this.successEl.hidden = false;
      this.successEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Stockly] registration submit failed', err);
      this._showErrors(['Could not submit. Please check your connection and try again.']);
    } finally {
      this.submitEl.disabled = false;
    }
  }

  _showErrors(errors) {
    this.errorsEl.replaceChildren(
      ...errors.map((msg) => {
        const li = document.createElement('p');
        li.className = 'stockly-reg__error';
        li.textContent = msg;
        return li;
      }),
    );
    this.errorsEl.hidden = false;
    this.errorsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  _clearErrors() {
    this.errorsEl.replaceChildren();
    this.errorsEl.hidden = true;
  }
}

if (!customElements.get('stockly-registration')) {
  customElements.define('stockly-registration', StocklyRegistration);
}
