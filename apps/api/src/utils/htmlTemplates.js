/**
 * Templates HTML para páginas públicas (privacy, terms, data-deletion)
 */

function renderPublicPage(title, bodyHtml) {
    return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; background: #f6f7f9; color: #1f2933; }
      main { max-width: 860px; margin: 32px auto; padding: 28px; background: #ffffff; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); }
      h1 { margin-top: 0; font-size: 28px; }
      h2 { margin-top: 24px; font-size: 20px; }
      p, li { line-height: 1.6; }
      footer { margin-top: 32px; font-size: 12px; color: #6b7280; }
      a { color: #1d4ed8; text-decoration: none; }
      a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      ${bodyHtml}
      <footer>Ultima actualizacion: ${new Date().getFullYear()}</footer>
    </main>
  </body>
</html>`;
}

const PRIVACY_HTML = renderPublicPage(
    "Politica de privacidad",
    `
    <p>
      Esta politica describe como una empresa maneja los datos personales recibidos por
      este bot de WhatsApp y otros canales digitales.
    </p>
    <h2>Datos que recopilamos</h2>
    <ul>
      <li>Nombre y apellido, telefono y correo si usted los proporciona.</li>
      <li>Mensajes, archivos y contenido enviado por WhatsApp.</li>
      <li>Datos de turnos, citas, historial de atencion y preferencias de servicio.</li>
      <li>Datos de pago solo si usted los comparte por este canal.</li>
      <li>Identificadores tecnicos de WhatsApp/Meta necesarios para operar el bot.</li>
    </ul>
    <h2>Finalidad del uso</h2>
    <ul>
      <li>Agendar, confirmar o reprogramar turnos.</li>
      <li>Responder consultas y brindar soporte al cliente.</li>
      <li>Enviar recordatorios o avisos relacionados con el servicio.</li>
      <li>Cumplir obligaciones legales, administrativas y de seguridad.</li>
    </ul>
    <h2>Base legal</h2>
    <p>Tratamos los datos con su consentimiento y para la prestacion de servicios.</p>
    <h2>Comparticion con terceros</h2>
    <p>
      Podemos compartir datos con proveedores tecnologicos (por ejemplo Meta/WhatsApp,
      hosting, mensajeria o CRM) solo para operar el servicio.
    </p>
    <h2>Conservacion</h2>
    <p>
      Conservamos los datos mientras exista la relacion con el cliente y por los plazos
      exigidos por ley.
    </p>
    <h2>Contacto y eliminacion</h2>
    <p>
      Para consultas o para solicitar eliminacion, escriba a
      <strong>privacidad@tuempresa.com</strong> o al mismo numero de WhatsApp.
      Tambien puede seguir las instrucciones en <a href="/data-deletion">/data-deletion</a>.
    </p>
  `
);

const TERMS_HTML = renderPublicPage(
    "Terminos y condiciones",
    `
    <p>
      Estos terminos regulan el uso del bot de WhatsApp de la empresa. Al usar este canal,
      usted acepta estas condiciones.
    </p>
    <h2>Uso permitido</h2>
    <ul>
      <li>El bot es informativo y de apoyo al servicio; no sustituye una consulta profesional.</li>
      <li>No use el bot para emergencias. En caso urgente, contacte a canales oficiales.</li>
      <li>Usted debe brindar informacion veraz y actualizada.</li>
    </ul>
    <h2>Responsabilidad</h2>
    <ul>
      <li>La empresa no garantiza disponibilidad continua del servicio.</li>
      <li>El contenido puede actualizarse sin previo aviso.</li>
    </ul>
    <h2>Privacidad</h2>
    <p>
      El tratamiento de datos personales se rige por la
      <a href="/privacy">Politica de privacidad</a>.
    </p>
    <h2>Contacto</h2>
    <p>Para dudas sobre estos terminos, escriba a <strong>contacto@tuempresa.com</strong>.</p>
  `
);

const DATA_DELETION_HTML = renderPublicPage(
    "Instrucciones de eliminacion de datos",
    `
    <p>
      Usted puede solicitar la eliminacion de sus datos personales asociados a este bot.
    </p>
    <h2>Como solicitar la eliminacion</h2>
    <ol>
      <li>Envie un correo a <strong>privacidad@tuempresa.com</strong> o un mensaje de WhatsApp.</li>
      <li>Indique su nombre completo, numero de telefono y la frase "Eliminar datos".</li>
      <li>Especifique si desea eliminar todo el historial o solo mensajes recientes.</li>
    </ol>
    <h2>Verificacion y plazos</h2>
    <p>
      Podemos pedir informacion adicional para verificar su identidad. Procesaremos la solicitud
      en un plazo razonable (por ejemplo, hasta 30 dias).
    </p>
    <h2>Excepciones</h2>
    <p>
      Algunos datos pueden conservarse por obligaciones legales o administrativas.
    </p>
    <h2>Contacto</h2>
    <p>Si tiene dudas, escriba a <strong>privacidad@tuempresa.com</strong>.</p>
  `
);

module.exports = {
    renderPublicPage,
    PRIVACY_HTML,
    TERMS_HTML,
    DATA_DELETION_HTML,
};
