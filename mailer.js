/**
 * ============================================================================
 * SERVICIO DE CORREOS ELECTRÓNICOS (Nodemailer)
 * Archivo: mailer.js - Pastelería Dulces Momentos
 * ============================================================================
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

// Configuración del transporte de correo con Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * Envía un correo estilizado con tema oscuro y rosa con el PIN de 6 dígitos
 * @param {string} email - Dirección de correo de destino
 * @param {string} code - Código de 6 dígitos
 * @param {object} [options] - Opciones adicionales (ej: { isRegister: true, nombre: 'Sofía' })
 * @returns {Promise<object>} Información del envío
 */
async function sendVerificationCode(email, code, options = {}) {
  const isRegister = options.isRegister || false;
  const nombre = options.nombre ? options.nombre : '';

  const tituloAccion = isRegister ? 'Confirmá tu Nueva Cuenta' : 'Tu Código de Acceso';
  const saludo = nombre ? `¡Hola ${nombre}!` : '¡Hola!';
  const descripcion = isRegister
    ? `Gracias por unirte a <strong style="color: #f472b6;">Pastelería Dulces Momentos</strong>. Ingresá el siguiente código PIN de 6 dígitos para verificar tu cuenta y comenzar a disfrutar de nuestras delicias:`
    : `Has solicitado iniciar sesión en tu cuenta de <strong style="color: #f472b6;">Dulces Momentos</strong>. Ingresá el siguiente código de verificación de 6 dígitos para continuar:`;

  const asunto = isRegister
    ? `🧁 ${code} es tu PIN para activar tu cuenta - Dulces Momentos`
    : `🧁 ${code} es tu código de verificación - Dulces Momentos`;

  const htmlTemplate = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${tituloAccion} - Dulces Momentos</title>
</head>
<body style="margin: 0; padding: 0; background-color: #120e11; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f3f4f6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #120e11; padding: 40px 15px;">
    <tr>
      <td align="center">
        <!-- Tarjeta Principal con aura rosa y fondo oscuro -->
        <table role="presentation" width="100%" style="max-width: 520px; background: linear-gradient(180deg, #1f141a 0%, #160d13 100%); border: 1px solid #3d2231; border-radius: 24px; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(236, 72, 153, 0.15); overflow: hidden;" cellspacing="0" cellpadding="0" border="0">
          
          <!-- Encabezado con detalles en rosa brillante -->
          <tr>
            <td style="padding: 40px 30px 20px 30px; text-align: center; border-bottom: 1px solid #2b1823;">
              <div style="display: inline-block; width: 64px; height: 64px; line-height: 64px; border-radius: 50%; background: linear-gradient(135deg, #db2777 0%, #be185d 100%); box-shadow: 0 0 22px rgba(219, 39, 119, 0.45); font-size: 32px;">
                🍰
              </div>
              <h1 style="margin: 16px 0 6px 0; font-size: 26px; font-weight: 800; letter-spacing: 0.5px; color: #ffffff;">
                Dulces <span style="color: #f472b6;">Momentos</span>
              </h1>
              <p style="margin: 0; font-size: 12px; color: #fbcfe8; text-transform: uppercase; letter-spacing: 2px; font-weight: 600;">
                Pastelería Boutique Artesanal
              </p>
            </td>
          </tr>

          <!-- Contenido Central -->
          <tr>
            <td style="padding: 35px 35px 25px 35px; text-align: center;">
              <h2 style="margin: 0 0 12px 0; font-size: 20px; color: #ffffff; font-weight: 700;">
                ${tituloAccion}
              </h2>
              <p style="margin: 0 0 8px 0; font-size: 15px; font-weight: 600; color: #f472b6;">
                ${saludo}
              </p>
              <p style="margin: 0 0 28px 0; font-size: 14px; line-height: 1.6; color: #d1d5db;">
                ${descripcion}
              </p>

              <!-- Caja del Código PIN con diseño glowing rosa neón -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 25px;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background: #281420; border: 2px solid #ec4899; border-radius: 16px; padding: 18px 32px; box-shadow: 0 0 25px rgba(236, 72, 153, 0.3);">
                      <span style="font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 900; letter-spacing: 12px; color: #f472b6; text-shadow: 0 0 12px rgba(244, 114, 182, 0.65); display: inline-block; margin-left: 12px;">
                        ${code}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Aviso de Expiración -->
              <div style="background-color: rgba(236, 72, 153, 0.08); border: 1px dashed #be185d; border-radius: 12px; padding: 12px; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 13px; color: #fbcfe8;">
                  ⏰ Este código expira en <strong>10 minutos</strong>.
                </p>
              </div>

              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #9ca3af;">
                Si no solicitaste este código, puedes ignorar este mensaje de forma segura. Nadie de Dulces Momentos te pedirá este PIN.
              </p>
            </td>
          </tr>

          <!-- Pie de Página -->
          <tr>
            <td style="padding: 22px 30px; background-color: #10080d; border-top: 1px solid #24131d; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 11px; color: #6b7280;">
                © 2026 Pastelería Dulces Momentos. Todos los derechos reservados.
              </p>
              <p style="margin: 0; font-size: 11px; color: #db2777; font-weight: 500;">
                Horneando momentos inolvidables ✨
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const mailOptions = {
    from: `"Pastelería Dulces Momentos 🍰" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: asunto,
    text: `${saludo} Tu código para Dulces Momentos es: ${code}. Válido por 10 minutos.`,
    html: htmlTemplate
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`[Nodemailer] ✉️ Correo enviado a ${email} (${isRegister ? 'Registro' : 'Login'}) - ID: ${info.messageId}`);
  return info;
}

module.exports = {
  transporter,
  sendVerificationCode
};
