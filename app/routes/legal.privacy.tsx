/**
 * Public route: Privacy Policy.
 *
 * URL: /legal/privacy
 *
 * NOT authenticated — must be accessible to:
 *   - Shopify App Store reviewers
 *   - Browsers / search engines / crawlers
 *   - Merchants and end-customers BEFORE installing the app
 *
 * Content language: Spanish (Stockly's primary market is ES/EU).
 * English translation can be added later as /legal/privacy.en or
 * via Accept-Language negotiation.
 *
 * ⚠️ DRAFT — REQUIRES LEGAL REVIEW BEFORE PRODUCTION USE.
 * Adapted from common GDPR-compliant SaaS templates and aligned to
 * the actual data Stockly collects (see prisma/schema.prisma).
 * A Spanish abogado specialised in data protection or a service
 * like Iubenda should review this before the App Store submission.
 *
 * Last reviewed: 2026-05-27 (initial scaffold)
 * Effective date: TBD (set when Jonatan signs off)
 */
import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy — Stockly" },
  {
    name: "description",
    content:
      "Stockly's Privacy Policy: what personal data we collect, why, and your GDPR rights.",
  },
  { name: "robots", content: "index, follow" },
];

export default function PrivacyPolicy() {
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
          Stockly · Política de Privacidad
        </p>
        <h1 style={{ fontSize: "32px", margin: "8px 0 0", fontWeight: 600 }}>
          Política de Privacidad
        </h1>
        <p style={{ fontSize: "14px", color: "#8c9196", marginTop: "8px" }}>
          Última actualización: 27 de mayo de 2026
        </p>
      </header>

      <p>
        Esta Política de Privacidad describe cómo <strong>Stockly</strong> (la
        &quot;Aplicación&quot;), desarrollada por{" "}
        <strong>Adspubli S.L.</strong> (&quot;Adspubli&quot;, &quot;nosotros&quot;),
        con domicilio en Barcelona, España, recopila, utiliza y protege los
        datos personales cuando un comercio Shopify instala la Aplicación o
        cuando un cliente de ese comercio interactúa con funcionalidades
        provistas por la Aplicación.
      </p>

      <p>
        Esta política se aplica al cumplimiento del Reglamento (UE) 2016/679
        (RGPD), la Ley Orgánica 3/2018 de Protección de Datos Personales
        (LOPDGDD) de España, y demás normativa aplicable de protección de
        datos.
      </p>

      <h2>1. Responsable del tratamiento</h2>
      <ul>
        <li>
          <strong>Responsable:</strong> Adspubli S.L.
        </li>
        <li>
          <strong>Dirección:</strong> Barcelona, España
        </li>
        <li>
          <strong>Email de privacidad:</strong>{" "}
          <a href="mailto:privacy@adspubli.com">privacy@adspubli.com</a>
        </li>
      </ul>

      <h2>2. Datos que recopilamos</h2>

      <h3>2.1 Del comercio (Merchant)</h3>
      <ul>
        <li>Dominio de la tienda Shopify (ej. tutienda.myshopify.com)</li>
        <li>
          Identificadores de instalación y tokens de sesión emitidos por
          Shopify
        </li>
        <li>Configuración de la Aplicación (tarifas, niveles, formularios)</li>
      </ul>

      <h3>2.2 De los clientes de la tienda (Buyers)</h3>
      <p>
        Cuando un cliente solicita acceso mayorista a través del formulario de
        Stockly, o cuando Stockly procesa información del cliente para aplicar
        precios mayoristas, podemos almacenar:
      </p>
      <ul>
        <li>Nombre y apellidos</li>
        <li>Correo electrónico</li>
        <li>Teléfono</li>
        <li>Empresa, sitio web, CIF/NIF/Tax ID, país</li>
        <li>Identificador interno del cliente en Shopify</li>
        <li>
          Estado de cualificación mayorista (fecha de aprobación,
          identificador del pedido que dispara la cualificación)
        </li>
        <li>Notas internas añadidas por el comercio</li>
      </ul>

      <h3>2.3 Datos técnicos</h3>
      <ul>
        <li>Registros de servidor (logs) con direcciones IP y user-agents</li>
        <li>Métricas de rendimiento y errores</li>
        <li>Eventos de webhook recibidos de Shopify</li>
      </ul>

      <h2>3. Finalidad y base legal del tratamiento</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
            <th style={{ textAlign: "left", padding: "8px 12px 8px 0" }}>
              Finalidad
            </th>
            <th style={{ textAlign: "left", padding: "8px 12px 8px 0" }}>
              Base legal (RGPD)
            </th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
            <td style={{ padding: "8px 12px 8px 0", verticalAlign: "top" }}>
              Prestación del servicio contratado por el comercio
            </td>
            <td style={{ padding: "8px 12px 8px 0", verticalAlign: "top" }}>
              Art. 6.1.b — ejecución de contrato
            </td>
          </tr>
          <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
            <td style={{ padding: "8px 12px 8px 0", verticalAlign: "top" }}>
              Procesamiento de solicitudes de cuenta mayorista
            </td>
            <td style={{ padding: "8px 12px 8px 0", verticalAlign: "top" }}>
              Art. 6.1.b — ejecución de contrato del comercio con su cliente
            </td>
          </tr>
          <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
            <td style={{ padding: "8px 12px 8px 0", verticalAlign: "top" }}>
              Seguridad, prevención de fraude y depuración de errores
            </td>
            <td style={{ padding: "8px 12px 8px 0", verticalAlign: "top" }}>
              Art. 6.1.f — interés legítimo
            </td>
          </tr>
          <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
            <td style={{ padding: "8px 12px 8px 0", verticalAlign: "top" }}>
              Cumplimiento de obligaciones legales (RGPD, fiscales)
            </td>
            <td style={{ padding: "8px 12px 8px 0", verticalAlign: "top" }}>
              Art. 6.1.c — obligación legal
            </td>
          </tr>
        </tbody>
      </table>

      <h2>4. Conservación de datos</h2>
      <ul>
        <li>
          <strong>Mientras la Aplicación esté instalada:</strong> conservamos
          los datos del comercio y de sus clientes mientras dure el contrato
          de prestación del servicio.
        </li>
        <li>
          <strong>Tras la desinstalación:</strong> Shopify envía el webhook{" "}
          <code>shop/redact</code> 48 horas después. Al recibirlo, eliminamos
          íntegramente los datos del comercio y de sus clientes de nuestras
          bases de datos en un plazo máximo de 30 días.
        </li>
        <li>
          <strong>A petición individual de un cliente:</strong> Shopify envía{" "}
          <code>customers/redact</code> cuando un cliente solicita la
          supresión. Eliminamos los datos en un plazo máximo de 30 días.
        </li>
        <li>
          <strong>Logs técnicos:</strong> conservados durante un máximo de 30
          días para depuración y auditoría de seguridad.
        </li>
      </ul>

      <h2>5. Destinatarios y transferencias de datos</h2>
      <p>Compartimos datos únicamente con los siguientes encargados:</p>
      <ul>
        <li>
          <strong>Shopify Inc.</strong> — proveedor de la plataforma sobre la
          cual opera la Aplicación. Los datos se procesan en sus servidores
          conforme a su propia política de privacidad y al Data Processing
          Addendum (DPA) que Shopify mantiene con sus partners.
        </li>
        <li>
          <strong>Railway</strong> — infraestructura de hosting de los
          servidores de Stockly. Datos almacenados en su región{" "}
          <code>sfo</code> (San Francisco, California, Estados Unidos).
        </li>
      </ul>
      <p>
        Las transferencias internacionales a Estados Unidos se realizan bajo
        las cláusulas contractuales tipo (SCC) aprobadas por la Comisión
        Europea y, cuando aplicable, bajo el Data Privacy Framework UE-EE.UU.
        actualmente en vigor.
      </p>

      <h2>6. Derechos de los interesados</h2>
      <p>De conformidad con el RGPD, usted tiene derecho a:</p>
      <ul>
        <li>
          <strong>Acceso</strong> — solicitar copia de los datos que tratamos
          sobre usted.
        </li>
        <li>
          <strong>Rectificación</strong> — corregir datos inexactos.
        </li>
        <li>
          <strong>Supresión</strong> — solicitar la eliminación de sus datos.
        </li>
        <li>
          <strong>Limitación</strong> del tratamiento bajo ciertas
          circunstancias.
        </li>
        <li>
          <strong>Portabilidad</strong> — recibir sus datos en formato
          estructurado y legible por máquina.
        </li>
        <li>
          <strong>Oposición</strong> al tratamiento basado en interés
          legítimo.
        </li>
        <li>
          <strong>Reclamación ante la AEPD</strong> (Agencia Española de
          Protección de Datos,{" "}
          <a
            href="https://www.aepd.es"
            target="_blank"
            rel="noopener noreferrer"
          >
            aepd.es
          </a>
          ) si considera que sus derechos no han sido atendidos.
        </li>
      </ul>
      <p>
        Para ejercer cualquiera de estos derechos, escríbanos a{" "}
        <a href="mailto:privacy@adspubli.com">privacy@adspubli.com</a> con el
        asunto &quot;Derechos RGPD — Stockly&quot;.
      </p>
      <p>
        Si usted es cliente de un comercio que utiliza Stockly, también puede
        ejercer estos derechos directamente con dicho comercio, quien es el
        responsable del tratamiento de sus datos personales en primera
        instancia.
      </p>

      <h2>7. Seguridad</h2>
      <p>
        Aplicamos medidas técnicas y organizativas razonables para proteger
        los datos personales, incluyendo cifrado en tránsito (HTTPS/TLS),
        cifrado en reposo en la base de datos, control de acceso al servidor
        mediante claves SSH, y revisión periódica de las dependencias de
        software por vulnerabilidades conocidas.
      </p>

      <h2>8. Cookies</h2>
      <p>
        Stockly opera embebida dentro del panel de administración de Shopify
        y NO instala cookies de seguimiento propias ni de terceros con fines
        publicitarios. Las cookies técnicas necesarias para la autenticación
        son gestionadas por la propia plataforma Shopify.
      </p>

      <h2>9. Menores de edad</h2>
      <p>
        Stockly no está dirigida a menores de 16 años. No recopilamos
        conscientemente datos de menores. Si tiene conocimiento de que un
        menor nos ha facilitado datos sin el consentimiento de sus padres o
        tutores, contáctenos para proceder a su supresión.
      </p>

      <h2>10. Cambios en esta política</h2>
      <p>
        Podemos actualizar esta Política de Privacidad para reflejar cambios
        en la Aplicación, en la legislación o en nuestras prácticas. La fecha
        de &quot;Última actualización&quot; al inicio del documento indica la
        versión vigente. Para cambios sustanciales notificaremos al comercio
        instalador con al menos 30 días de antelación a través del panel de
        la Aplicación.
      </p>

      <h2>11. Contacto</h2>
      <p>
        Para cualquier consulta sobre esta política o sobre el tratamiento de
        sus datos personales por Stockly:
      </p>
      <ul>
        <li>
          Email:{" "}
          <a href="mailto:privacy@adspubli.com">privacy@adspubli.com</a>
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
          <a href="/legal/terms" style={{ color: "#8c9196" }}>
            Términos del Servicio
          </a>
        </p>
      </footer>
    </article>
  );
}
