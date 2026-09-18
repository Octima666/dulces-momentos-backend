/**
 * ============================================================================
 * SERVICIO DE CORREOS ELECTRÓNICOS (Gmail SMTP con Nodemailer)
 * Archivo: mailer.js - Pastelería Dulces Momentos
 * ============================================================================
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

// Configuración explícita para puerto 465 (evita bloqueos de Render)
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // TLS directo
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  connectionTimeout: 10000, // Timeout de 10s para no congelar el servidor
  greetingTimeout: 10000,
  socketTimeout: 10000
});

/**
 * Envía un correo estilizado con tema oscuro y rosa con el PIN de 6 dígitos usando Gmail SMTP
 * @param {string} email - Dirección de correo de destino
 * @param {string} code - Código de 6 dígitos
 * @param {object} options - Opciones adicionales
 * @returns {Promise<boolean>} Éxito del envío
 */
async function sendVerificationEmail(email, code, options = {}) {
  const isRegister = options.isRegister || false;
  const nombre = options.nombre || '';
  const greeting = nombre ? `¡Hola, ${nombre}!` : '¡Hola!';

  const subject = isRegister 
    ? 'Confirma tu cuenta - Pastelería Dulces Momentos' 
    : 'Código de acceso (2FA) - Pastelería Dulces Momentos';

  const actionText = isRegister
    ? 'Estás a un solo paso de activar tu cuenta en Dulces Momentos. Utiliza el siguiente código de verificación:'
    : 'Has solicitado iniciar sesión en Dulces Momentos. Utiliza el siguiente código de seguridad:';

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <style>
        body { background-color: #121212; color: #f1f1f1; font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 30px auto; background: #1e1e1e; border-radius: 12px; overflow: hidden; border: 1px solid #333; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
        .header { background: linear-gradient(135deg, #ff69b4, #d147a3); padding: 30px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 24px; letter-spacing: 1px; font-weight: 700; }
        .content { padding: 40px 30px; text-align: center; }
        .greeting { font-size: 20px; font-weight: 600; color: #ff8da1; margin-bottom: 20px; }
        .text { font-size: 16px; color: #cccccc; line-height: 1.6; margin-bottom: 30px; }
        .code-box { background-color: #2a2a2a; border: 2px dashed #ff69b4; border-radius: 8px; padding: 20px; display: inline-block; margin-bottom: 30px; }
        .code { font-size: 36px; font-weight: bold; letter-spacing: 6px; color: #ff69b4; margin: 0; }
        .footer { background-color: #181818; padding: 20px; text-align: center; font-size: 12px; color: #777777; border-top: 1px solid #282828; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🍰 Pastelería Dulces Momentos</h1>
        </div>
        <div class="content">
          <div class="greeting">${greeting}</div>
          <p class="text">${actionText}</p>
          <div class="code-box">
            <p class="code">${code}</p>
          </div>
          <p class="text" style="font-size: 14px; color: #999999;">Este código expirará en 10 minutos. Si no solicitaste este código, puedes ignorar este mensaje.</p>
        </div>
        <div class="footer">
          <p>&copy; 2026 Pastelería Dulces Momentos. Todos los derechos reservados.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const senderEmail = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;

  if (!emailPass || !senderEmail) {
    console.error('[Gmail SMTP Error] Faltan las credenciales EMAIL_PASS o EMAIL_USER en el entorno.');
    throw new Error('Credenciales de correo no configuradas en el servidor.');
  }

  try {
    const info = await transporter.sendMail({
      from: `"Dulces Momentos" <${senderEmail}>`,
      to: email,
      subject: subject,
      html: htmlContent
    });

    console.log(`[Gmail SMTP] ✅ Correo enviado exitosamente a: ${email} (ID: ${info.messageId})`);
    return true;
  } catch (error) {
    console.error('[Error al enviar el correo via Gmail SMTP]:', error.message);
    throw error;
  }
}

module.exports = {
  sendVerificationEmail
};