/**
 * Stockly — Wholesale Registration Form Web Component (Sami-style).
 *
 * Renders the form dynamically from a JSON definition fetched via the
 * App Proxy:
 *
 *   GET /apps/stockly/registration-form?shop={shop_domain}
 *
 * Response shape (see Phase 1 plan, section 6):
 *   {
 *     version: 1,
 *     definition: { steps: [{ id, titleKey, fields: [{ type, key, label, required, width, placeholder, options?, rows?, confirmPaired? }] }] },
 *     appearance: { layout, width, colors, background, customCss },
 *     settings:   { title, status, afterSubmitRedirectUrl, errorMessages }
 *   }
 *
 * Back-compat: field keys come from the definition. The seed default
 * preserves the legacy snake_case keys (email, first_name, last_name,
 * phone, company_name, tax_id, website, country, notes) so existing
 * server-side validation keeps working unchanged.
 *
 * Failure mode: if the fetch fails or returns malformed JSON, we
 * render a minimal hard-coded fallback form (email + first/last name +
 * company_name) so customers can still apply. Logged to console.
 *
 * Field types implemented in Phase 1:
 *   text, email, password (with confirmPaired), phone, select, country, textarea.
 */

(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────

  // ISO-3166-1 country list (compact subset of name + alpha-2). Covers
  // the destinations Stockly's wholesale merchants ship to. Edit at
  // will — the JS doesn't depend on completeness, just on this shape.
  const COUNTRIES = [
    { code: 'US', name: 'United States' },
    { code: 'CA', name: 'Canada' },
    { code: 'MX', name: 'Mexico' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'IE', name: 'Ireland' },
    { code: 'FR', name: 'France' },
    { code: 'DE', name: 'Germany' },
    { code: 'ES', name: 'Spain' },
    { code: 'PT', name: 'Portugal' },
    { code: 'IT', name: 'Italy' },
    { code: 'NL', name: 'Netherlands' },
    { code: 'BE', name: 'Belgium' },
    { code: 'LU', name: 'Luxembourg' },
    { code: 'CH', name: 'Switzerland' },
    { code: 'AT', name: 'Austria' },
    { code: 'DK', name: 'Denmark' },
    { code: 'SE', name: 'Sweden' },
    { code: 'NO', name: 'Norway' },
    { code: 'FI', name: 'Finland' },
    { code: 'IS', name: 'Iceland' },
    { code: 'PL', name: 'Poland' },
    { code: 'CZ', name: 'Czechia' },
    { code: 'SK', name: 'Slovakia' },
    { code: 'HU', name: 'Hungary' },
    { code: 'RO', name: 'Romania' },
    { code: 'BG', name: 'Bulgaria' },
    { code: 'GR', name: 'Greece' },
    { code: 'HR', name: 'Croatia' },
    { code: 'SI', name: 'Slovenia' },
    { code: 'EE', name: 'Estonia' },
    { code: 'LV', name: 'Latvia' },
    { code: 'LT', name: 'Lithuania' },
    { code: 'TR', name: 'Türkiye' },
    { code: 'IL', name: 'Israel' },
    { code: 'AE', name: 'United Arab Emirates' },
    { code: 'SA', name: 'Saudi Arabia' },
    { code: 'IN', name: 'India' },
    { code: 'CN', name: 'China' },
    { code: 'JP', name: 'Japan' },
    { code: 'KR', name: 'South Korea' },
    { code: 'SG', name: 'Singapore' },
    { code: 'HK', name: 'Hong Kong SAR' },
    { code: 'TW', name: 'Taiwan' },
    { code: 'TH', name: 'Thailand' },
    { code: 'VN', name: 'Vietnam' },
    { code: 'PH', name: 'Philippines' },
    { code: 'ID', name: 'Indonesia' },
    { code: 'MY', name: 'Malaysia' },
    { code: 'AU', name: 'Australia' },
    { code: 'NZ', name: 'New Zealand' },
    { code: 'BR', name: 'Brazil' },
    { code: 'AR', name: 'Argentina' },
    { code: 'CL', name: 'Chile' },
    { code: 'CO', name: 'Colombia' },
    { code: 'PE', name: 'Peru' },
    { code: 'UY', name: 'Uruguay' },
    { code: 'ZA', name: 'South Africa' },
    { code: 'MA', name: 'Morocco' },
    { code: 'EG', name: 'Egypt' },
    { code: 'NG', name: 'Nigeria' },
    { code: 'KE', name: 'Kenya' },
  ];

  const DEFAULT_ERROR_MESSAGES = Object.freeze({
    required: 'Please fill in this field',
    invalid: 'Invalid value',
    invalidEmail: 'Please enter a valid email address',
    invalidPhone: 'Please enter a valid phone number',
    passwordMismatch: 'Passwords do not match',
    submitFailed: 'Could not submit. Please check your connection and try again.',
    serverError: 'Server returned an invalid response.',
  });

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // Loose international phone — 7-20 digits with optional +, spaces,
  // hyphens, dots and parens. Server is authoritative.
  const PHONE_RE = /^\+?[0-9][0-9\s\-().]{5,19}$/;

  // Minimal fallback definition — only the 4 fields we need to keep
  // wholesale applications flowing when the proxy fetch fails.
  const FALLBACK_DEFINITION = Object.freeze({
    steps: [
      {
        id: 'step-1',
        titleKey: 'Apply for wholesale access',
        fields: [
          { type: 'email', key: 'email', label: 'Email', required: true, width: 'full' },
          { type: 'text', key: 'first_name', label: 'First name', required: true, width: 'half' },
          { type: 'text', key: 'last_name', label: 'Last name', required: true, width: 'half' },
          { type: 'text', key: 'company_name', label: 'Company name', required: true, width: 'full' },
        ],
      },
    ],
  });

  // ── Helpers ──────────────────────────────────────────────────────

  function createEl(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const key in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, key)) continue;
        const value = attrs[key];
        if (value == null || value === false) continue;
        if (key === 'class') {
          el.className = value;
        } else if (key === 'dataset') {
          for (const dk in value) el.dataset[dk] = value[dk];
        } else if (key === 'text') {
          el.textContent = value;
        } else if (key in el && typeof value !== 'string') {
          // Boolean / numeric DOM props (required, disabled, rows, ...).
          el[key] = value;
        } else {
          el.setAttribute(key, value === true ? '' : String(value));
        }
      }
    }
    for (const child of children) {
      if (child == null) continue;
      el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return el;
  }

  /**
   * Strip <script> tags and inline event handlers from a CSS string
   * before injecting into a <style>. Defense in depth — the admin
   * Save endpoint should sanitize too, but the storefront must not
   * trust merchant-authored CSS.
   */
  function sanitizeCustomCss(css) {
    if (typeof css !== 'string') return '';
    // Remove anything that looks like an HTML tag, plus CSS @import to
    // avoid pulling in cross-origin stylesheets at runtime.
    return css
      .replace(/<\s*script[\s\S]*?>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
      .replace(/<\/?[a-z][\s\S]*?>/gi, '')
      .replace(/@import[^;]*;/gi, '')
      .replace(/expression\s*\(/gi, '');
  }

  function safeText(value, fallback) {
    if (typeof value === 'string' && value.trim()) return value;
    return fallback;
  }

  // ── Web component ───────────────────────────────────────────────

  class StocklyRegistration extends HTMLElement {
    connectedCallback() {
      if (this._initialised) return;
      this._initialised = true;

      this.actionUrl = this.dataset.actionUrl || '/apps/stockly/apply';
      this.fetchUrl = this.dataset.fetchUrl || '/apps/stockly/registration-form';
      this.shopDomain = this.dataset.shop || '';
      // Optional short code identifying WHICH form to render. Empty →
      // the proxy serves the shop's default form (dual-serve back-compat
      // for theme blocks placed before short codes existed).
      this.formShortcode = this.dataset.formShortcode || '';
      this.alreadyWholesale = this.dataset.alreadyWholesale === 'true';
      this.customerEmail = this.dataset.customerEmail || '';
      this.customerFirstName = this.dataset.customerFirstName || '';
      this.customerLastName = this.dataset.customerLastName || '';

      this.fallback = {
        heading: this.dataset.fallbackHeading || 'Apply for wholesale access',
        intro: this.dataset.fallbackIntro || '',
        submitLabel: this.dataset.fallbackSubmitLabel || 'Submit application',
        successHeading: this.dataset.fallbackSuccessHeading || 'Application received',
        successBody: this.dataset.fallbackSuccessBody || 'Thanks — we\'ll review your application soon.',
        alreadyText: this.dataset.alreadyText || 'You already have wholesale access.',
      };

      this.rootEl = this.querySelector('[data-stockly-root]');
      if (!this.rootEl) {
        // Liquid mount point missing — bail cleanly, do not crash.
        // eslint-disable-next-line no-console
        console.error('[Stockly] registration form mount point missing');
        return;
      }

      if (this.alreadyWholesale) {
        this._renderAlready();
        return;
      }

      this._loadAndRender();
    }

    async _loadAndRender() {
      try {
        const params = new URLSearchParams();
        if (this.shopDomain) params.set('shop', this.shopDomain);
        if (this.formShortcode) params.set('shortcode', this.formShortcode);
        const qs = params.toString();
        const url = this.fetchUrl + (qs ? `?${qs}` : '');
        const res = await fetch(url, {
          method: 'GET',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const payload = await res.json();
        const { definition, appearance, settings } = this._normalizePayload(payload);
        this._applyAppearance(appearance);
        this._render(definition, settings);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[Stockly] failed to load registration form definition; using fallback', err);
        this._applyAppearance(null);
        this._render(FALLBACK_DEFINITION, { errorMessages: DEFAULT_ERROR_MESSAGES });
      }
    }

    _normalizePayload(payload) {
      const definition = payload && payload.definition && Array.isArray(payload.definition.steps)
        ? payload.definition
        : FALLBACK_DEFINITION;
      const appearance = (payload && payload.appearance) || null;
      const settings = (payload && payload.settings) || {};
      // Merge error messages on top of defaults.
      settings.errorMessages = Object.assign({}, DEFAULT_ERROR_MESSAGES, settings.errorMessages || {});
      return { definition, appearance, settings };
    }

    _applyAppearance(appearance) {
      // Remove any layout class so re-renders are clean.
      this.classList.remove('stockly-reg--layout-default', 'stockly-reg--layout-boxed');

      if (!appearance) {
        this.classList.add('stockly-reg--layout-default');
        return;
      }

      const layout = appearance.layout === 'boxed' ? 'boxed' : 'default';
      this.classList.add(`stockly-reg--layout-${layout}`);

      if (typeof appearance.width === 'number' && appearance.width > 0) {
        this.style.setProperty('--rf-form-max-width', `${appearance.width}px`);
      }

      const colors = appearance.colors || {};
      const map = {
        main: '--rf-color-main',
        heading: '--rf-color-heading',
        label: '--rf-color-label',
        description: '--rf-color-description',
        option: '--rf-color-option',
        paragraph: '--rf-color-paragraph',
        paragraphBackground: '--rf-color-paragraph-bg',
      };
      for (const key in map) {
        const value = colors[key];
        if (typeof value === 'string' && value.trim()) {
          this.style.setProperty(map[key], value);
        }
      }

      // Background — only `color` type in Phase 1.
      const bg = appearance.background;
      if (bg && bg.type === 'color' && typeof bg.color === 'string') {
        this.style.setProperty('--rf-color-background', bg.color);
      }

      // Custom CSS — sanitized, injected once, scoped via a marker
      // class on the host (merchant CSS should use
      // `stockly-registration .something` selectors).
      this._injectCustomCss(appearance.customCss);
    }

    _injectCustomCss(css) {
      if (this._customStyleEl) {
        this._customStyleEl.remove();
        this._customStyleEl = null;
      }
      const sanitized = sanitizeCustomCss(css);
      if (!sanitized) return;
      const styleEl = document.createElement('style');
      styleEl.setAttribute('data-stockly-custom-css', '');
      styleEl.textContent = sanitized;
      this.appendChild(styleEl);
      this._customStyleEl = styleEl;
    }

    _render(definition, settings) {
      const step = (definition.steps && definition.steps[0]) || FALLBACK_DEFINITION.steps[0];
      const fields = Array.isArray(step.fields) ? step.fields : [];

      const heading = safeText(step.titleKey, this.fallback.heading);
      const submitLabel = safeText((settings && settings.submitLabel), this.fallback.submitLabel);

      const inner = createEl('div', { class: 'stockly-reg__inner' });

      if (heading) {
        inner.appendChild(createEl('h2', { class: 'stockly-reg__heading', text: heading }));
      }
      if (this.fallback.intro) {
        inner.appendChild(createEl('p', { class: 'stockly-reg__intro', text: this.fallback.intro }));
      }

      const form = createEl('form', {
        class: 'stockly-reg__form',
        novalidate: true,
        dataset: { stocklyForm: '' },
      });

      const grid = createEl('div', { class: 'stockly-reg__grid' });
      const renderedFields = [];
      for (const field of fields) {
        if (!field || typeof field.key !== 'string' || typeof field.type !== 'string') continue;
        const rendered = this._renderField(field);
        if (rendered) {
          grid.appendChild(rendered.wrapper);
          renderedFields.push(rendered);
        }
      }
      form.appendChild(grid);

      const errorsEl = createEl('div', {
        class: 'stockly-reg__errors',
        hidden: true,
        dataset: { stocklyErrors: '' },
      });
      form.appendChild(errorsEl);

      const actions = createEl('div', { class: 'stockly-reg__actions' });
      const submitEl = createEl('button', {
        type: 'submit',
        class: 'stockly-reg__submit',
        dataset: { stocklySubmit: '' },
        text: submitLabel,
      });
      actions.appendChild(submitEl);
      form.appendChild(actions);

      inner.appendChild(form);

      const successEl = createEl(
        'div',
        { class: 'stockly-reg__success', hidden: true, dataset: { stocklySuccess: '' } },
        createEl('h3', {
          class: 'stockly-reg__success-heading',
          text: this.fallback.successHeading,
        }),
        createEl('p', { text: this.fallback.successBody }),
      );
      inner.appendChild(successEl);

      // Swap the skeleton for the real form.
      this.rootEl.replaceChildren(inner);

      this.formEl = form;
      this.submitEl = submitEl;
      this.errorsEl = errorsEl;
      this.successEl = successEl;
      this.renderedFields = renderedFields;
      this.errorMessages = (settings && settings.errorMessages) || DEFAULT_ERROR_MESSAGES;
      this.afterSubmitRedirectUrl = settings && settings.afterSubmitRedirectUrl ? String(settings.afterSubmitRedirectUrl) : '';

      this._prefillFromCustomer();

      this._onSubmit = this._onSubmit.bind(this);
      form.addEventListener('submit', this._onSubmit);
    }

    _renderAlready() {
      const wrapper = createEl(
        'div',
        { class: 'stockly-reg__already', dataset: { stocklyAlready: '' } },
        createEl('p', { text: this.fallback.alreadyText }),
      );
      this.rootEl.replaceChildren(wrapper);
    }

    _renderField(field) {
      const width = field.width === 'full' ? 'full' : 'half';
      const required = Boolean(field.required);
      const wrapperClasses = ['stockly-reg__field', `stockly-reg__field--${width}`];
      if (required) wrapperClasses.push('stockly-reg__field--required');

      const wrapper = createEl('div', { class: wrapperClasses.join(' ') });
      const labelText = field.label || field.key;
      const inputId = `stockly-reg-${field.key}-${Math.random().toString(36).slice(2, 8)}`;

      wrapper.appendChild(createEl('label', {
        class: 'stockly-reg__label',
        for: inputId,
        text: labelText,
      }));

      let inputEl = null;
      let confirmEl = null;

      switch (field.type) {
        case 'textarea':
          inputEl = createEl('textarea', {
            id: inputId,
            name: field.key,
            rows: typeof field.rows === 'number' ? field.rows : 4,
            required,
            placeholder: field.placeholder || '',
            maxlength: 2000,
          });
          break;

        case 'select':
          inputEl = createEl('select', { id: inputId, name: field.key, required });
          // Empty placeholder option.
          inputEl.appendChild(createEl('option', { value: '', text: field.placeholder || 'Select…' }));
          if (Array.isArray(field.options)) {
            for (const opt of field.options) {
              if (!opt) continue;
              const value = String(opt.value != null ? opt.value : opt.label || '');
              const label = String(opt.label != null ? opt.label : value);
              if (!value && !label) continue;
              inputEl.appendChild(createEl('option', { value, text: label }));
            }
          }
          break;

        case 'country':
          inputEl = createEl('select', { id: inputId, name: field.key, required });
          inputEl.appendChild(createEl('option', { value: '', text: field.placeholder || 'Select country…' }));
          for (const c of COUNTRIES) {
            inputEl.appendChild(createEl('option', { value: c.code, text: c.name }));
          }
          break;

        case 'password':
          inputEl = createEl('input', {
            id: inputId,
            type: 'password',
            name: field.key,
            required,
            placeholder: field.placeholder || '',
            autocomplete: 'new-password',
          });
          if (field.confirmPaired === true) {
            const confirmId = `${inputId}-confirm`;
            confirmEl = createEl('input', {
              id: confirmId,
              type: 'password',
              name: `${field.key}_confirm`,
              required,
              placeholder: 'Confirm password',
              autocomplete: 'new-password',
              dataset: { stocklyConfirmFor: field.key },
            });
          }
          break;

        case 'phone':
          inputEl = createEl('input', {
            id: inputId,
            type: 'tel',
            name: field.key,
            required,
            placeholder: field.placeholder || '+34 555 44 33 22',
            autocomplete: 'tel',
          });
          break;

        case 'email':
          inputEl = createEl('input', {
            id: inputId,
            type: 'email',
            name: field.key,
            required,
            placeholder: field.placeholder || '',
            autocomplete: 'email',
          });
          break;

        case 'text':
        default:
          inputEl = createEl('input', {
            id: inputId,
            type: 'text',
            name: field.key,
            required,
            placeholder: field.placeholder || '',
            maxlength: 200,
          });
          break;
      }

      wrapper.appendChild(inputEl);
      if (confirmEl) wrapper.appendChild(confirmEl);

      if (field.helpText) {
        wrapper.appendChild(createEl('small', { class: 'stockly-reg__hint', text: field.helpText }));
      }

      const fieldErrorEl = createEl('div', { class: 'stockly-reg__field-error', hidden: true });
      wrapper.appendChild(fieldErrorEl);

      return { field, wrapper, inputEl, confirmEl, fieldErrorEl };
    }

    _prefillFromCustomer() {
      if (!this.renderedFields) return;
      for (const r of this.renderedFields) {
        const key = r.field.key;
        if (key === 'email' && this.customerEmail) r.inputEl.value = this.customerEmail;
        if ((key === 'first_name' || key === 'firstName') && this.customerFirstName) r.inputEl.value = this.customerFirstName;
        if ((key === 'last_name' || key === 'lastName') && this.customerLastName) r.inputEl.value = this.customerLastName;
      }
    }

    _validate() {
      const errors = [];
      const messages = this.errorMessages || DEFAULT_ERROR_MESSAGES;

      for (const r of this.renderedFields) {
        const { field, inputEl, confirmEl, fieldErrorEl } = r;
        inputEl.classList.remove('is-invalid');
        if (confirmEl) confirmEl.classList.remove('is-invalid');
        fieldErrorEl.hidden = true;
        fieldErrorEl.textContent = '';

        const value = (inputEl.value || '').trim();
        const confirmValue = confirmEl ? (confirmEl.value || '').trim() : null;

        if (field.required && !value) {
          this._markFieldError(r, messages.required);
          errors.push(`${field.label || field.key}: ${messages.required}`);
          continue;
        }

        if (!value) continue;

        if (field.type === 'email' && !EMAIL_RE.test(value)) {
          this._markFieldError(r, messages.invalidEmail);
          errors.push(`${field.label || field.key}: ${messages.invalidEmail}`);
          continue;
        }

        if (field.type === 'phone' && !PHONE_RE.test(value)) {
          this._markFieldError(r, messages.invalidPhone);
          errors.push(`${field.label || field.key}: ${messages.invalidPhone}`);
          continue;
        }

        if (field.type === 'password' && confirmEl && value !== confirmValue) {
          this._markFieldError(r, messages.passwordMismatch);
          errors.push(`${field.label || field.key}: ${messages.passwordMismatch}`);
          continue;
        }
      }

      return errors;
    }

    _markFieldError(r, message) {
      r.inputEl.classList.add('is-invalid');
      if (r.confirmEl) r.confirmEl.classList.add('is-invalid');
      r.fieldErrorEl.textContent = message;
      r.fieldErrorEl.hidden = false;
    }

    async _onSubmit(e) {
      e.preventDefault();
      this._clearErrors();

      const clientErrors = this._validate();
      if (clientErrors.length) {
        this._showErrors(clientErrors);
        return;
      }

      this.submitEl.disabled = true;

      try {
        const formData = new FormData();
        // Tell the server which form this was, under a reserved key, so it
        // validates against the EXACT definition the customer saw (resolved
        // by shortcode) rather than just the shop's default form.
        if (this.formShortcode) formData.append('__shortcode', this.formShortcode);
        for (const r of this.renderedFields) {
          // Drop password-confirm sibling — server only needs the
          // primary value once we've verified they match client-side.
          const value = r.inputEl.value;
          formData.append(r.field.key, value);
        }
        const res = await fetch(this.actionUrl, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          body: formData,
        });

        // App Proxy edge cases sometimes return HTML on auth failure —
        // guard against parsing non-JSON.
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(this.errorMessages.serverError || 'Server returned an invalid response.');
        }

        if (!res.ok || !data.ok) {
          const errs = Array.isArray(data.errors) && data.errors.length
            ? data.errors
            : [this.errorMessages.submitFailed || 'Something went wrong. Please try again.'];
          this._showErrors(errs);
          return;
        }

        this.formEl.hidden = true;
        this.successEl.hidden = false;
        this.successEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        if (this.afterSubmitRedirectUrl) {
          // Defer slightly so the success state is visible during the
          // 350ms scroll, then navigate.
          setTimeout(() => {
            window.location.assign(this.afterSubmitRedirectUrl);
          }, 1200);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[Stockly] registration submit failed', err);
        this._showErrors([this.errorMessages.submitFailed || 'Could not submit. Please check your connection and try again.']);
      } finally {
        this.submitEl.disabled = false;
      }
    }

    _showErrors(errors) {
      this.errorsEl.replaceChildren(
        ...errors.map((msg) => createEl('p', { class: 'stockly-reg__error', text: msg })),
      );
      this.errorsEl.hidden = false;
      this.errorsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    _clearErrors() {
      if (!this.errorsEl) return;
      this.errorsEl.replaceChildren();
      this.errorsEl.hidden = true;
    }
  }

  if (!customElements.get('stockly-registration')) {
    customElements.define('stockly-registration', StocklyRegistration);
  }
})();
