# App Proxy contract — Registration Form integration

## TL;DR

- App Proxy is already wired: `subpath = "stockly"`, `prefix = "apps"`, target `/proxy/*`. Storefront `/apps/stockly/<x>` → Remix `/proxy/<x>`. See `shopify.app.toml` lines 87-94.
- HMAC verification is already in place via `authenticate.public.appProxy(request)` — used in both existing routes. Implementers should copy that pattern verbatim; do NOT roll a custom verifier.
- From a theme block, plain same-origin `fetch('/apps/stockly/...')` works. Shopify proxies it; no CORS dance needed.
- Shopify auto-appends `shop`, `path_prefix`, `timestamp`, `signature`, `logged_in_customer_id` query params. Read `logged_in_customer_id` from `request.url`, not from a body field.
- No CSRF token in theme blocks. HMAC on the proxy request + your own input validation is the contract. Direct curl bypass is blocked by HMAC.

## 1. Fetch from theme block (GET)

Same-origin from the storefront. Mirror the existing pattern in `extensions/quick-order-form/assets/quick-order-form.src.js` lines 49-57:

```js
const params = new URLSearchParams();
if (this.customerTags) params.set('customer_tags', this.customerTags);
const res = await fetch(`/apps/stockly/registration-form?${params}`, {
  credentials: 'same-origin',
  headers: { Accept: 'application/json' },
});
```

Anonymous vs logged-in: Shopify still forwards the request, but `logged_in_customer_id` arrives empty and `authenticate.public.appProxy` returns `session === null`. `proxy.context.tsx` lines 42-50 show the correct null-safe pattern (fall back to `url.searchParams.get("shop")`).

## 2. JSON response format

Return raw JSON via Remix `json()`. Shopify does NOT wrap. Required:

- `Content-Type: application/json; charset=utf-8` (Remix `json()` sets it).
- Status codes used in the repo: `200` OK, `201` created (apply), `400` missing shop, `405` wrong method, `422` validation errors, `500` server.
- Do NOT add a Remix default export on the route — it must be a resource route (loader/action only) or Shopify gets the HTML document wrapper. See the comment in `proxy.context.tsx` lines 150-154.

## 3. Caching

Shopify edge does not cache App Proxy responses unless you opt in via `Cache-Control`. For a merchant-editable form definition use:

```
Cache-Control: private, max-age=60
```

That's the TTL `proxy.context.tsx` line 135 already uses. `private` because the payload varies per `logged_in_customer_id`. No `Vary` header needed (the variant comes from query params, not headers).

For the POST endpoint: `Cache-Control: no-store` (already implicit for non-GET; don't set caching headers on `proxy.apply.tsx`).

## 4. POST signature validation

Already implemented. `proxy.apply.tsx` line 39 calls `authenticate.public.appProxy(request)` which:

- Verifies the `signature` query param against `SHOPIFY_API_SECRET` over the sorted querystring.
- Throws a 401 Response on tamper/missing/expired.

A malicious actor POSTing directly to `https://stockly-lustrous-forest-4364.fly.dev/proxy/apply` without a valid signature gets 401 before our action body runs. No additional signing needed.

Body format support is already permissive: form-encoded OR `application/json` (lines 54-61). Reuse that pattern.

## 5. CSRF

Theme app extensions have no CSRF token primitive. The HMAC signature IS the CSRF defense: only requests routed by Shopify's edge (which adds the signature) reach `/proxy/*`. A cross-site form on attacker.com cannot forge the signature.

Caveat: if you ever skip `authenticate.public.appProxy`, CSRF protection is gone. Always call it first.

## Risks / gotchas

- Cookies: `credentials: 'same-origin'` is right; cross-origin would strip Shopify's customer session cookie and break `logged_in_customer_id`.
- The form's `value="{{ customer.email }}"` is trust-on-render only — the server must NOT trust the email field came from a logged-in customer. Use `logged_in_customer_id` query param for identity, the body field for display.
- Dev tunnel: `automatically_update_urls_on_dev = true` means the `[app_proxy].url` rewrites on `shopify app dev`. Don't hardcode the Fly URL anywhere in extension code — always use the relative `/apps/stockly/...` path.
- Theme editor preview can render the block with no customer context; defend with the `session === null` branch.
- `request.formData()` consumes the stream — don't call it twice. The existing apply handler branches on content-type to pick `.json()` vs `.formData()`.

## Files referenced

- `/Users/aimac/Documents/Workspace/Clients/stockly/shopify.app.toml` lines 87-94
- `/Users/aimac/Documents/Workspace/Clients/stockly/app/routes/proxy.context.tsx` lines 36-154
- `/Users/aimac/Documents/Workspace/Clients/stockly/app/routes/proxy.apply.tsx` lines 30-114
- `/Users/aimac/Documents/Workspace/Clients/stockly/extensions/quick-order-form/blocks/registration-form.liquid`
- `/Users/aimac/Documents/Workspace/Clients/stockly/extensions/quick-order-form/assets/registration-form.src.js` lines 36-79
- `/Users/aimac/Documents/Workspace/Clients/stockly/extensions/quick-order-form/assets/quick-order-form.src.js` lines 49-87 (sibling fetch pattern)
- `/Users/aimac/Documents/Workspace/Clients/stockly/app/lib/auth.server.ts` (admin-only helper; not for proxy routes)
