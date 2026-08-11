# Guía de envío al Shopify App Store — tareas de Jonatan

> Esta guía cubre **solo lo que no puedo hacer yo**. El código ya está
> desplegado en la app pública. Lo de abajo son decisiones, materiales y
> clics en el panel de Shopify.
>
> Contexto de por qué hacemos esto:
> `docs/decisions/ADR-018-functions-require-public-distribution.md`

**La app:** "Stockly", ID `409384386561`, client_id
`40128ca5d894434595dd2e603d7fe517`, distribución **pública** (irreversible,
elegida 2026-08-11). Es la única de las tres apps que puede llegar al App
Store y, por tanto, la única capaz de ejecutar los Functions en tiendas Basic.

**Panel:** https://partners.shopify.com/3062121/apps/409384386561

---

## Orden recomendado

Las tareas 1 y 2 son las que más tardan por dependencias externas. Empieza
por ahí aunque parezcan menos urgentes.

---

## 1. Solicitar acceso a datos protegidos de clientes

**Por qué:** el webhook `customers/update` está desactivado en
`shopify.app.public.toml` porque Shopify rechaza la versión sin esta
aprobación. Sin él, Stockly no puede detectar clientes aprobados por flujos
externos.

⚠️ **Ojo, esto funciona distinto que en la app de Piro.** En una app
**personalizada** el permiso lo concede el comerciante al instalar. En una app
**pública** hay que solicitarlo formalmente, y forma parte del envío.

**Dónde:** Partners → Stockly → **Solicitudes de acceso a la API**, o dentro
del propio formulario de envío.

**Qué pedir:** nivel 1 (nombre, email, teléfono).

**Justificación** (en inglés, pégala tal cual — es veraz, la revisé contra el
código):

> Stockly is a B2B/wholesale app. Merchants use it to run a wholesale
> application and approval workflow, and to enforce minimum order
> requirements for wholesale buyers.
>
> - **Name** — to identify the applicant in the merchant's approval queue and
>   to create or match the corresponding Shopify customer on approval.
> - **Email** — the primary identifier for a wholesale application. Used to
>   match an applicant to an existing Shopify customer, or create one on
>   approval. Stored in a dedicated column so GDPR data-request and redaction
>   webhooks can resolve records without scanning.
> - **Phone** — an optional field on the merchant-configured registration
>   form, used by the merchant to verify a business applicant before granting
>   wholesale pricing.
>
> All three mandatory privacy webhooks are implemented and HMAC-verified:
> `customers/data_request` returns the stored records, `customers/redact`
> hard-deletes them in a transaction, and `shop/redact` deletes the shop
> record, cascading to all related customer data. Customer data is never
> shared with or processed by any third party. It is stored in a single
> PostgreSQL database accessible only over the provider's private network.

---

## 2. Configurar los planes en Shopify App Pricing

**Por qué:** Shopify App Pricing (GA 12-05-2026) reemplaza el Billing API
antiguo, y es lo que recomiendan para apps nuevas. Shopify aloja la pantalla
de planes y se encarga de cobrar y facturar — nosotros no programamos eso.

**Dónde:** Partners → Stockly → **Distribución** → **Gestionar solicitud** →
sección de precios. (Esta sección **solo existe porque la app es pública** —
en las personalizadas no aparece.)

**Los planes decididos** (ADR-008, posicionados sobre BSS, el competidor
directo):

| Plan | Precio | Prueba | Qué incluye |
|---|---|---|---|
| Starter | $39/mes | 14 días | Lo que funciona hoy: tramos de volumen, mínimo de primer pedido, panel mayorista, formulario de pedido rápido |
| Growth | $79/mes | 14 días | + precios por variante, incrementos de cantidad, límites máximos |
| Plus | $149/mes | 14 días | + plazos Net 30/60/90, cotizaciones, pedidos manuales, campos personalizados, APIs |

⚠️ **Importante y honesto:** las funciones de Growth y Plus **no están
construidas todavía**. Si las anuncias como disponibles, es publicidad falsa y
motivo de rechazo. Dos opciones: describirlas como "próximamente" en la ficha,
o lanzar solo con Starter y añadir los otros planes cuando existan. **Mi
recomendación: lanza solo Starter.** Menos superficie que revisar, menos que
prometer, y se añaden planes después sin volver a pasar revisión.

---

## 3. Materiales de la ficha

**Capturas: entre 4 y 7**, con datos realistas de comerciante (nunca "Producto
de prueba 1" ni datos evidentemente falsos — es causa habitual de rechazo).

Sugeridas, en este orden:
1. El panel de Stockly con la guía de configuración
2. La cola de solicitudes mayoristas con solicitudes reales
3. La pantalla de precios mayoristas con tramos configurados
4. El formulario de registro en la tienda
5. El formulario de pedido rápido en la tienda

**Textos que hay que escribir:**
- Nombre: `Stockly`
- Eslogan (una línea, qué hace)
- Descripción (párrafos, beneficios para el comerciante — no características
  técnicas)
- Categoría: probablemente "Venta al por mayor" / B2B
- Palabras clave

**Ícono:** PNG o JPG, **1200×1200 px, máximo 1 MB**. Súbelo en Dev Dashboard →
Stockly → Configuración → "Ícono de la app". Puedes reutilizar el verde lima
que ya subiste a la app de Piro.

---

## 4. Tienda de demostración para los revisores

Shopify necesita entrar y probar la app. Hace falta:
- Una tienda con Stockly instalada y **con datos**: productos, algún cliente
  mayorista, tramos de precio configurados
- Usuario y contraseña de acceso
- Instrucciones paso a paso de qué probar

⚠️ **No uses Piro para esto.** Es la tienda real de una clienta, con pedidos y
clientes reales. Crea una tienda de desarrollo aparte.

---

## 5. Revisión legal (pendiente desde julio)

Lee `/legal/privacy` y `/legal/terms` en producción y confirma que reflejan la
realidad de Adspubli: dirección, emails de contacto, jurisdicción, límites de
responsabilidad. Shopify los lee durante la revisión.

Si puedes, que les eche un ojo alguien con conocimiento de RGPD/SaaS.

---

## 6. Enviar — con visibilidad LIMITADA

**Dónde:** Partners → Stockly → Distribución → **Gestionar solicitud**.

Al enviar, elige **visibilidad limitada** (no listada): la app se instala por
URL directa pero **no aparece en las búsquedas del App Store ni en Google**.
Es lo que necesitamos para Piro sin montar una operación comercial.

**Sigue pasando la revisión completa.** Lo no listado te ahorra el marketing,
no el cumplimiento.

**Plazos reales:** 2–4 semanas de revisión, +1–2 por cada reenvío si piden
cambios. Cuenta con **3–6 semanas** desde el envío.

---

## Lo que NO hay que hacer todavía

**"Built for Shopify".** Aparece destacado en el panel y es tentador. Es un
sello **adicional y opcional**, con 2–4 semanas más de proceso y criterios más
estrictos (Core Web Vitals, accesibilidad). **No hace falta para desbloquear
los Functions.** Déjalo para cuando la app ya esté aprobada y funcionando.

---

## Cuando Shopify apruebe

Eso ya es mío:
1. Cambiar las credenciales de Railway a la app pública
2. Reactivar `customers/update` en `shopify.app.public.toml` y redesplegar
3. Reinstalar en Piro desde la app pública
4. **Entonces sí**, los Functions se activan en Piro y el mínimo funciona de
   verdad

---

## Recordatorio sobre Piro mientras tanto

Piro **no se queda sin nada**. Su mínimo de $300 sigue funcionando por el tema
(`theme/snippets/b2b-minimum-order.liquid`), y cubre **las 61 empresas** —
mejor alcance que el de Stockly, que depende de una etiqueta que solo tienen 4.

La app personalizada sigue instalada y sirve para el formulario de registro y
la cola de solicitudes. Nadie pierde nada esperando.
