/**
 * Public route: Terms of Service.
 *
 * URL: /legal/terms
 *
 * NOT authenticated — must be accessible to:
 *   - Shopify App Store reviewers
 *   - Browsers / search engines / crawlers
 *   - Merchants BEFORE installing the app
 *
 * Content language: Spanish (Stockly's primary market is ES/EU).
 *
 * ⚠️ DRAFT — REQUIRES LEGAL REVIEW BEFORE PRODUCTION USE.
 * Adapted from common SaaS Terms templates for the Shopify ecosystem.
 * A Spanish abogado specialised in SaaS/digital contracts should
 * review this before the App Store submission.
 *
 * Last reviewed: 2026-05-27 (initial scaffold)
 * Effective date: TBD (set when Jonatan signs off)
 */
import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => [
  { title: "Terms of Service — Stockly" },
  {
    name: "description",
    content:
      "Terms of Service for Stockly, the Shopify wholesale B2B app by Adspubli.",
  },
  { name: "robots", content: "index, follow" },
];

export default function TermsOfService() {
  return (
    <article
      style={{
        maxWidth: "780px",
        margin: "40px auto",
        padding: "0 24px 80px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        lineHeight: 1.6,
        color: "#202223",
      }}
    >
      <header style={{ marginBottom: "32px" }}>
        <p
          style={{
            fontSize: "12px",
            color: "#8c9196",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            margin: 0,
          }}
        >
          Stockly · Términos del Servicio
        </p>
        <h1 style={{ fontSize: "32px", margin: "8px 0 0", fontWeight: 600 }}>
          Términos del Servicio
        </h1>
        <p style={{ fontSize: "14px", color: "#8c9196", marginTop: "8px" }}>
          Última actualización: 27 de mayo de 2026
        </p>
      </header>

      <p>
        Estos Términos del Servicio (los &quot;Términos&quot;) regulan el uso
        de <strong>Stockly</strong> (la &quot;Aplicación&quot;), una
        aplicación para la plataforma Shopify desarrollada y operada por{" "}
        <strong>Adspubli S.L.</strong> (&quot;Adspubli&quot;,
        &quot;nosotros&quot;), con domicilio en Barcelona, España.
      </p>

      <p>
        Al instalar la Aplicación en su tienda Shopify, usted (el
        &quot;Merchant&quot; o &quot;Comerciante&quot;) acepta quedar
        vinculado por estos Términos. Si no está de acuerdo, no instale ni
        utilice la Aplicación.
      </p>

      <h2>1. Descripción del servicio</h2>
      <p>
        Stockly es una aplicación que añade funcionalidades B2B y mayoristas
        a tiendas Shopify, incluyendo: gestión de tarifas por volumen,
        formularios de registro mayorista, segmentación de clientes
        mayoristas, y aplicación de precios mayoristas en checkout mediante
        Shopify Discount Functions.
      </p>

      <h2>2. Cuenta y elegibilidad</h2>
      <ul>
        <li>
          La cuenta del Merchant está vinculada a su tienda Shopify; no
          existe una cuenta independiente en Stockly.
        </li>
        <li>
          El Merchant debe tener al menos 18 años y capacidad legal para
          contratar en nombre del negocio que opera la tienda.
        </li>
        <li>
          El Merchant es responsable de mantener la seguridad de su cuenta
          Shopify y de las credenciales asociadas.
        </li>
      </ul>

      <h2>3. Planes, precios y facturación</h2>
      <p>
        Stockly ofrece distintos planes de suscripción con tarifas mensuales.
        Los detalles de cada plan están disponibles dentro de la Aplicación.
      </p>
      <ul>
        <li>
          La facturación se procesa a través de la <strong>Shopify Billing
          API</strong>. Los importes aparecen en la factura mensual de
          Shopify del Merchant.
        </li>
        <li>
          La suscripción se renueva automáticamente cada mes hasta que el
          Merchant la cancele o desinstale la Aplicación.
        </li>
        <li>
          Las tarifas se muestran en USD por convención de Shopify, sin
          impuestos. Los impuestos aplicables (IVA español, sales tax, etc.)
          los gestiona Shopify según la jurisdicción del Merchant.
        </li>
        <li>
          Adspubli puede modificar las tarifas con un preaviso de al menos
          30 días, notificado a través del panel de la Aplicación. Si el
          Merchant no acepta el nuevo precio, puede desinstalar la
          Aplicación antes de la fecha efectiva sin penalización.
        </li>
      </ul>

      <h2>4. Periodo de prueba</h2>
      <p>
        Cuando Stockly ofrezca un periodo de prueba gratuito, éste se
        aplicará automáticamente al instalar la Aplicación, sin cargo. Al
        finalizar el periodo de prueba, se inicia la facturación mensual del
        plan seleccionado salvo que el Merchant haya desinstalado o
        cancelado la suscripción.
      </p>

      <h2>5. Uso aceptable</h2>
      <p>El Merchant se compromete a NO:</p>
      <ul>
        <li>
          Utilizar la Aplicación para actividades ilegales o que infrinjan
          derechos de terceros.
        </li>
        <li>
          Realizar ingeniería inversa, descompilar o intentar extraer el
          código fuente de la Aplicación.
        </li>
        <li>
          Sobrecargar deliberadamente la infraestructura mediante
          peticiones automatizadas excesivas (más allá de los rate limits
          razonables de Shopify y de la propia Aplicación).
        </li>
        <li>
          Utilizar la Aplicación para vender productos ilegales o
          restringidos según las{" "}
          <a
            href="https://www.shopify.com/legal/aup"
            target="_blank"
            rel="noopener noreferrer"
          >
            Acceptable Use Policy de Shopify
          </a>
          .
        </li>
        <li>
          Suplantar la identidad de otro merchant, cliente o personal de
          Adspubli.
        </li>
      </ul>

      <h2>6. Propiedad intelectual</h2>
      <ul>
        <li>
          <strong>Stockly</strong> (código, diseño, marcas) es propiedad
          intelectual de Adspubli S.L. Estos Términos otorgan al Merchant
          una licencia no exclusiva, no transferible y revocable para usar
          la Aplicación durante la vigencia de la suscripción.
        </li>
        <li>
          <strong>Datos del Merchant</strong> (productos, clientes, pedidos,
          tarifas configuradas) son propiedad del Merchant. Stockly los
          procesa únicamente para prestar el servicio contratado, conforme a
          nuestra{" "}
          <a href="/legal/privacy">Política de Privacidad</a>.
        </li>
      </ul>

      <h2>7. Disponibilidad y garantías</h2>
      <p>
        Stockly se proporciona &quot;tal cual&quot; y &quot;según
        disponibilidad&quot;. Aunque hacemos esfuerzos razonables para
        mantener un nivel alto de disponibilidad (objetivo: 99.5% mensual),
        no garantizamos que la Aplicación esté libre de errores, sea
        ininterrumpida o cumpla todos los requisitos específicos del
        Merchant.
      </p>
      <p>
        Adspubli no es responsable de las interrupciones causadas por:
        Shopify, proveedores de infraestructura (Railway), redes de
        telecomunicaciones, fuerza mayor, o cualquier circunstancia ajena al
        control razonable de Adspubli.
      </p>

      <h2>8. Limitación de responsabilidad</h2>
      <p>
        En la medida máxima permitida por la ley aplicable, la
        responsabilidad total acumulada de Adspubli derivada o relacionada
        con la Aplicación o estos Términos no excederá del importe pagado
        por el Merchant a Stockly durante los <strong>12 meses</strong>{" "}
        previos al hecho que origina la responsabilidad.
      </p>
      <p>
        Adspubli no será responsable de daños indirectos, consecuentes,
        pérdida de beneficios, pérdida de datos, ni pérdida de oportunidad
        comercial.
      </p>
      <p>
        Las limitaciones de este apartado no aplican a daños causados por
        dolo o culpa grave de Adspubli, ni a daños que la ley no permita
        excluir.
      </p>

      <h2>9. Indemnización</h2>
      <p>
        El Merchant se compromete a mantener indemne a Adspubli frente a
        reclamaciones de terceros derivadas de:
      </p>
      <ul>
        <li>
          El uso de la Aplicación por parte del Merchant en violación de
          estos Términos.
        </li>
        <li>
          Los productos o servicios vendidos por el Merchant en su tienda
          Shopify.
        </li>
        <li>
          Cualquier disputa entre el Merchant y sus propios clientes
          relativa a precios, promociones o cualificación mayorista
          aplicada por Stockly según la configuración elegida por el
          Merchant.
        </li>
      </ul>

      <h2>10. Suspensión y terminación</h2>
      <ul>
        <li>
          El Merchant puede terminar el contrato en cualquier momento
          desinstalando la Aplicación desde el panel de Shopify. La
          desinstalación cancela automáticamente la suscripción.
        </li>
        <li>
          Adspubli puede suspender o terminar el acceso a la Aplicación con
          aviso razonable en caso de impago, incumplimiento material de
          estos Términos, o uso abusivo de los recursos del servicio.
        </li>
        <li>
          Tras la terminación, los datos del Merchant se eliminan conforme
          al webhook <code>shop/redact</code> que Shopify dispara a las 48
          horas — ver nuestra{" "}
          <a href="/legal/privacy">Política de Privacidad</a>.
        </li>
      </ul>

      <h2>11. Modificaciones a los términos</h2>
      <p>
        Podemos actualizar estos Términos para reflejar cambios en el
        servicio, en la legislación o en nuestras prácticas comerciales. La
        fecha de &quot;Última actualización&quot; al inicio del documento
        indica la versión vigente. Para cambios sustanciales notificaremos
        al Merchant con al menos 30 días de antelación a través del panel
        de la Aplicación. El uso continuado tras esa fecha implica
        aceptación de los nuevos Términos.
      </p>

      <h2>12. Legislación aplicable y jurisdicción</h2>
      <p>
        Estos Términos se rigen por la legislación española. Para cualquier
        controversia derivada o relacionada con estos Términos, las partes
        se someten a la jurisdicción exclusiva de los Juzgados y Tribunales
        de Barcelona, con renuncia expresa a cualquier otro fuero que les
        pudiera corresponder.
      </p>
      <p>
        Si el Merchant es consumidor (persona física actuando con fines
        ajenos a su actividad empresarial o profesional), serán aplicables
        las normas imperativas de protección al consumidor de su lugar de
        residencia habitual.
      </p>

      <h2>13. Contacto</h2>
      <ul>
        <li>
          Email:{" "}
          <a href="mailto:legal@adspubli.com">legal@adspubli.com</a>
        </li>
        <li>Adspubli S.L., Barcelona, España</li>
      </ul>

      <footer
        style={{
          marginTop: "60px",
          paddingTop: "20px",
          borderTop: "1px solid #e1e3e5",
          fontSize: "13px",
          color: "#8c9196",
        }}
      >
        <p style={{ margin: 0 }}>
          © 2026 Adspubli S.L. · Stockly ·{" "}
          <a href="/legal/privacy" style={{ color: "#8c9196" }}>
            Política de Privacidad
          </a>
        </p>
      </footer>
    </article>
  );
}
