/**
 * POST /api/register
 */
app.post('/api/register', async (req, res) => {
  try {
    const rawEmail = req.body.email || req.body.correo;
    const { nombre, apellido, password } = req.body;

    if (!rawEmail) {
      return res.status(400).json({
        success: false,
        error: 'El correo electrónico es obligatorio para registrarse.'
      });
    }

    const email = String(rawEmail).trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'El formato de correo ingresado no es válido.'
      });
    }

    const nom = (nombre || email.split('@')[0]).trim();
    const ape = (apellido || 'Cliente').trim();
    const pwd = password ? String(password) : 'auth_2fa_pass';

    // 1. Crear o actualizar el usuario de forma segura
    try {
      const hash = await bcrypt.hash(pwd, 10);
      const checkUser = await pool.query('SELECT id FROM usuarios WHERE correo = $1', [email]);

      if (checkUser.rows.length === 0) {
        await pool.query(
          'INSERT INTO usuarios (nombre, apellido, correo, password_hash) VALUES ($1, $2, $3, $4)',
          [nom, ape, email, hash]
        );
      } else {
        await pool.query(
          'UPDATE usuarios SET nombre = $1, apellido = $2, password_hash = $3 WHERE correo = $4',
          [nom, ape, hash, email]
        );
      }
    } catch (dbErr) {
      console.error('[Error guardando usuario en DB]:', dbErr.message);
      // Continuamos la ejecución para no bloquear el flujo de verificación
    }

    // 2. Generar PIN de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 3. Limpiar e insertar PIN en verification_codes
    await pool.query(
      'DELETE FROM verification_codes WHERE email = $1 OR expires_at < NOW()',
      [email]
    );

    await pool.query(
      "INSERT INTO verification_codes (email, code, expires_at) VALUES ($1, $2, NOW() + INTERVAL '10 minutes')",
      [email, code]
    );

    // 4. Enviar correo de verificación por Resend
    await sendVerificationEmail(email, code, {
      isRegister: true,
      nombre: nom
    });

    console.log(`[2FA Register] ✅ PIN de confirmación enviado a: ${email}`);

    return res.status(200).json({
      requires2FA: true,
      message: 'Código de verificación de 6 dígitos enviado para activar tu cuenta.'
    });

  } catch (error) {
    console.error('[Error en POST /api/register]:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al generar o enviar el código de registro.',
      details: error.message
    });
  }
});