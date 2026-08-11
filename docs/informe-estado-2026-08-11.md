# Informe de estado — Stockly

**Fecha:** 11 de agosto de 2026
**Para:** Jonatan Montilla (Adspubli)
**Alcance:** sesión completa del 11/08 y estado real del proyecto

> Todo lo que aparece aquí está verificado contra producción, la API de
> Shopify o el código. Lo que no pude verificar, lo digo.

---

## 1. Resumen en 30 segundos

Hoy Stockly se instaló por primera vez en la tienda real de un cliente
(Piro Jewelry). Funciona: el panel carga, el formulario de registro y la cola
de solicitudes operan.

**Pero su motor —precios mayoristas y mínimos de pedido— no puede ejecutarse
ahí.** Shopify no permite ejecutar Functions desde una app personalizada en
tiendas que no sean Plus, y Piro es Basic. Es una regla de plataforma, no un
error nuestro ni algo que se pueda rodear.

La solución existe y está en marcha: publicar la app en el App Store (en modo
no listado). Eso desbloquea todo. **Plazo realista: 3–6 semanas** desde el
envío, y el envío depende de materiales que tienes que preparar tú.

**Ana no pierde nada esperando.** Su mínimo de $300 ya funciona por otra vía y
cubre mejor a sus clientes que lo que Stockly le daría hoy.

---

## 2. Lo que funciona hoy en producción

| Componente | Estado |
|---|---|
| Backend (Railway) | ✅ En línea, plan Hobby, endpoints 200 |
| Base de datos PostgreSQL | ✅ En línea |
| App instalada en Piro | ✅ 1 instalación activa |
| Panel de administración | ✅ Carga dentro del admin de Piro |
| Formulario de registro mayorista | ✅ Operativo |
| Cola de solicitudes | ✅ Operativa |
| **Motor de precios (Discount Function)** | ❌ **Bloqueado en Piro** |
| **Mínimos de pedido (Validation Function)** | ❌ **Bloqueado en Piro** |

---

## 3. Los tres muros de plataforma (lo más importante del día)

Se encontraron tres restricciones de Shopify, encadenadas. Cada una empuja al
mismo sitio: publicar en el App Store.

### Muro 1 — La distribución personalizada no llega a tiendas ajenas

El enlace de instalación de la app original estaba atado permanentemente a la
organización de la tienda de desarrollo. Por eso fallaba en Piro con
`invalid_link_organization`.

**Resuelto:** se creó una app dedicada para Piro con distribución
personalizada apuntando a una sola tienda concreta. La instalación funcionó.

### Muro 2 — Functions requieren Plus en apps personalizadas

Documentación de Shopify, textual:

> *"Solo las tiendas con plan Shopify Plus pueden usar apps personalizadas que
> contengan Shopify Function APIs."*

Y un moderador de Shopify sobre esta misma pregunta:

> *"no hay ningún rodeo, tendría que ser una app pública para una tienda
> Basic."*

Piro es **Basic** (verificado vía API). Los dos motores de Stockly son
Functions. Por tanto ninguno puede funcionar ahí.

**Por qué no lo vimos antes:** todo el desarrollo se hizo en
`desarrollo-adspubli`, que es una **tienda de desarrollo de Partner** y tiene
capacidades de Plus habilitadas para pruebas. Todo funcionaba ahí. Ningún test
local podía detectarlo — es una barrera que Shopify aplica en su servidor, en
el momento de activar la Function, y solo se ve al instalar en una tienda real
que no sea Plus.

### Muro 3 — El método de distribución es irreversible

> *"No puedes cambiar el método de distribución después de seleccionarlo."*

Consecuencia: las **dos** apps existentes están bloqueadas para siempre en
distribución personalizada. Ninguna podrá ir al App Store.

**Resuelto:** se creó una **tercera app** con distribución **pública**
(`409384386561`), y se le desplegó todo el código.

### Lo que NO cambia nada

Se revisó Shopify Editions Spring 2026 buscando alternativas. **No hay
ninguna.** Cero cambios en el acceso a Functions, apps personalizadas, reglas
de distribución, ni ninguna vía nueva para imponer mínimos sin Functions.

También se descartó la idea de alojar la app en servidores de Shopify: existe
(se llama Static Apps) pero es solo frontend y solo para apps personalizadas —
no sirve para Stockly, que necesita webhooks y base de datos.

---

## 4. Lo que se construyó hoy

### Mínimos de pedido recurrentes (desplegado, apagado)

Lo que Ana pidió repetidamente: primer pedido ≥ $300 **y** cada pedido
posterior ≥ importe y ≥ cantidad configurables.

Antes existía un campo `postQualificationMOQ` que se guardaba, se mostraba y
se sincronizaba... pero aparecía **exactamente una vez** en el código de las
Functions, como declaración de tipo. **Cero aplicación real.** Era una
funcionalidad a medio construir.

Ahora está completo: esquema, sincronización, Function, interfaz de admin y
storefront. Desplegado en producción **apagado por defecto** — ninguna tienda
cambia de comportamiento hasta que alguien lo configure.

Se construyó con 9 agentes en paralelo contra un contrato de datos fijado de
antemano, y luego se auditó con 5 revisores adversariales independientes.

### Corrección del símbolo de moneda

La interfaz mostraba € fijo aunque la tienda fuera en dólares. Arreglado en
las dos pantallas de mínimos (quedan ~50 sitios más, anotados como tarea).

### Cifras

- **137 tests** de aplicación (antes 129)
- **14 fixtures** de checkout (antes 5)
- Pipeline de verificación en verde

---

## 5. Lo que casi sale mal (y por qué importa el proceso)

Antes de desplegar, el control de despliegue detectó algo que **ya estaba
activo** y no tenía nada que ver con el despliegue:

- Piro tenía el mínimo de $300 **armado**
- La tabla de clientes mayoristas de Stockly estaba **vacía**
- Piro tiene **5 clientes con etiqueta mayorista**, con **67 pedidos y ~$25.800**
  entre ellos (uno con 40 pedidos y $19.000)
- El webhook que los detecta llevaba activo desde esa mañana

El código trata "no está en mi base de datos" como "debe su primer pedido". El
siguiente evento sobre cualquiera de ellos —editar una dirección, cambiar una
etiqueta, o simplemente hacer un pedido— los habría inscrito como pendientes y
**bloqueado en caja al mejor cliente de Ana** por no llegar a $300.

**Desactivado:** se registraron los 5 como ya cualificados (que es lo
factualmente correcto: llevan 67 pedidos). Verificado después: 5 filas, 0
pendientes.

**La causa de fondo sigue abierta:** Stockly está programado como si siempre
se instalara en tiendas sin historial mayorista. No hay ninguna ruta de
migración para clientes preexistentes. Piro se salvó a mano; el próximo
cliente con mayoristas existentes cae en la misma trampa. **Es la tarea
pendiente de mayor valor.**

---

## 6. Estado concreto de Piro

### Lo que ya tenía (y no sabíamos)

Piro **ya tiene un mínimo de $300 funcionando**, implementado en su tema
(`b2b-minimum-order.liquid`). Y hace algo mejor que Stockly:

```liquid
{% if customer.b2b? %}
```

Detecta clientes B2B con la marca **nativa de Shopify** → alcanza a **las 61
empresas**. Stockly depende de una etiqueta `wholesale` que solo tienen **4**.

| | Sistema del tema | Stockly |
|---|---|---|
| A quién alcanza | **61 empresas** | 4 |
| Cómo bloquea | Desactiva el botón de pago | Validación en servidor |
| ¿Se puede saltar? | Sí | **No** |
| Mínimos recurrentes | No | **Sí** |

**Conclusión honesta:** hoy Stockly solo aportaría a Piro dos cosas que el
tema no da: enforcement imposible de burlar, y mínimos en pedidos posteriores.
El mínimo de primer pedido ya lo tiene, y mejor dirigido.

### Decisión abierta desde junio

Piro aplica su −65% mayorista mediante un **Price List de Markets/Catálogos**.
Stockly aplicaría descuentos con su propia Function. **Dos motores descontando
lo mismo.** Y Editions 2026 añadió apilamiento de descuentos B2B, lo que
empeora el riesgo.

**Sigue sin decidirse** si Stockly reemplaza ese Price List o convive con él
sin tocar precios. Hasta que se decida: configurar solo mínimos, nunca tiers
ni descuento base, y **no completar el asistente de configuración dentro de
Piro** (su paso 2 escribe configuración de precios y la sincroniza al
instante).

---

## 7. El camino que queda

### Publicación en el App Store

**Ya hecho:** app pública creada, código desplegado, webhooks de RGPD,
integración de cobro, panel en Polaris, OAuth, páginas legales, icono.

**Falta de tu parte:**
- Configurar planes en Shopify App Pricing
- 4–7 capturas con datos realistas
- Textos de la ficha
- Tienda de demostración con credenciales para los revisores (**no Piro**)
- Revisión legal de privacidad y términos

**Recomendación:** lanzar solo con el plan **Starter ($39)**. Los planes
Growth y Plus anunciarían funciones que no existen todavía, y eso es motivo de
rechazo. Se añaden después sin volver a pasar revisión.

### Requisitos de datos protegidos (nivel 2)

Shopify exige cuatro cosas que hoy no se cumplen. Se respondió con la verdad y
la validación falló al instante — automática, sin intervención humana.

| Requisito | Estado |
|---|---|
| Política de respuesta a incidentes | ✅ Escrita hoy |
| Estrategia de prevención de pérdida de datos | ✅ Escrita hoy |
| Registro de accesos a datos personales | 🔨 En construcción |
| Separar datos de prueba y producción | 📋 Plan escrito, **falta ejecutarlo** |

Sobre el último: **la misma base de datos contiene tu tienda de desarrollo y
la tienda real de Ana.** Riesgo bajo pero real, y hay que arreglarlo igual.

Queda también una **prueba de restauración de copia de seguridad** sin hacer.
Está documentada pero nunca ejecutada — y una copia que nunca has restaurado
es una hipótesis, no un control.

---

## 8. Decisiones que dependen de ti

1. **¿Qué papel juega Stockly en Piro?** Dado que el mínimo ya existe y cubre
   mejor, y que el motor de precios choca con el Price List. Esto condiciona
   todo lo demás.
2. **Cobro:** confirmado migrar a Shopify App Pricing, pero solo se puede
   configurar una vez la app pública exista (ya existe). Pendiente hacerlo.
3. **ADR-017 sigue abierto:** Shopify regaló el B2B nativo en todos los planes
   en abril. El hueco que le queda a Stockly es real (mínimos por importe,
   formulario de registro, quick order) pero estrecho, y hay 979 apps
   compitiendo. Merece una conversación de estrategia con los mismos datos que
   hemos reunido hoy.

---

## 9. Lectura honesta del día

No se ganó lo que se esperaba ganar. Se esperaba instalar Stockly en Piro y
verla funcionar; se instaló y no funciona el motor.

Pero se ganó algo que no se tenía esta mañana: **saber exactamente por qué, con
las citas textuales de Shopify, y tener ya creada la app correcta con el código
dentro.** El camino que queda es largo pero ya no tiene incógnitas.

Y se evitó, por poco, bloquear en caja al mejor cliente de tu clienta. Eso lo
detectó el proceso —el control de despliegue revisando el estado de la tienda,
no el código—, y solo salió a la luz porque pediste hacerlo bien.

---

## Documentos de referencia

| Documento | Contenido |
|---|---|
| `docs/decisions/ADR-018-*` | Por qué hace falta distribución pública |
| `docs/decisions/ADR-017-*` | B2B nativo gratis invalida la premisa original |
| `docs/app-store-submission-guide.md` | Tus tareas paso a paso |
| `docs/security/incident-response-policy.md` | Requisito de Shopify |
| `docs/security/data-loss-prevention.md` | Requisito de Shopify |
| `docs/security/environment-separation.md` | Plan de separación |
| `progress/2026-08-11-*` | Diario técnico del día |
| `HANDOFF.md` | Estado operativo actual |
