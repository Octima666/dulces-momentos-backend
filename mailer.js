const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendVerificationEmail(email, code, options = {}) {
  const isRegister = options.isRegister || false;
  const nombre = options.nombre || email.split('@')[0];

  const subject = isRegister
    ? 'Confirma tu cuenta - Pastelería Dulces Momentos'
    : 'Código de verificación - Pastelería Dulces Momentos';

  const titulo = isRegister
    ? `¡Bienvenido/a, ${nombre}!`
    : `Hola, ${nombre}`;

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

  if (!process.env.RESEND_API_KEY) {
    console.error('[Resend Error] Falta la variable RESEND_API_KEY en el entorno.');
    throw new Error('Credenciales de Resend no configuradas.');
  }

  try {
    const data = await resend.emails.send({
      from: 'Dulces Momentos <onboarding@resend.dev>',
      to: [email],
      subject: subject,
      html: htmlContent
    });

    console.log(`[Resend API] ✅ Correo enviado exitosamente a: ${email} (ID: ${data.id})`);
    return true;
  } catch (error) {
    console.error('[Resend API Error]:', error);
    throw error;
  }
}

module.exports = { sendVerificationEmail };