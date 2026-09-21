/**
 * ============================================================================
 * PASTELERÍA "DULCES MOMENTOS" - MÓDULO DE CORREO (mailer.js)
 * Envío de correos 2FA vía Nodemailer + Gmail SMTP
 * ============================================================================
 */

const nodemailer = require('nodemailer');

// Configuración del servicio SMTP de Gmail usando variables de entorno
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // joalugo45@gmail.com
    pass: process.env.EMAIL_PASS  // wbumziuonzjdflqk
  }
});

/**
 * Función principal para enviar códigos de verificación PIN (2FA)
 */
async function sendVerificationEmail(email, code, options = {}) {
  const isRegister = options.isRegister || false;
  const nombre = options.nombre || email.split('@')[0];

  const subject = isRegister
    ? 'Confirma tu cuenta - Pastelería Dulces Momentos'
    : 'Código de verificación - Pastelería Dulces Momentos';

  const titulo = isRegister ? `¡Bienvenido/a, ${nombre}!` : `Hola, ${nombre}`;
  const mensaje = isRegister
    ? 'Gracias por registrarte en Dulces Momentos. Usa el siguiente código de 6 dígitos para activar tu cuenta:'
    : 'Usa el siguiente código de 6 dígitos para iniciar sesión en tu cuenta:';

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; background-color: #ffffff;">
      <h2 style="color: #d63384; text-align: center;">🍰 Dulces Momentos</h2>
      <h3 style="color: #333;">${titulo}</h3>
      <p style="color: #555; line-height: 1.5;">${mensaje}</p>
      <div style="text-align: center; margin: 30px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #d63384; background-color: #f8f9fa; padding: 10px 20px; border-radius: 8px; border: 1px dashed #d63384;">${code}</span>
      </div>
      <p style="color: #777; font-size: 13px; text-align: center;">Este código expira en 10 minutos. Si no solicitaste este código, ignora este mensaje.</p>
    </div>
  `;

  const mailOptions = {
    from: `"Dulces Momentos" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: subject,
    html: htmlContent
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Nodemailer] ✅ Correo enviado exitosamente a: ${email} (ID: ${info.messageId})`);
    return true;
  } catch (error) {
    console.error('[Nodemailer Error]:', error);
    throw error;
  }
}

module.exports = { 
  sendVerificationEmail,
  sendVerificationCode: sendVerificationEmail
};