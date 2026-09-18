const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const pool = require('./db');
const { sendVerificationEmail } = require('./mailer');

const app = express();

app.use(cors());
app.use(express.json());

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ============================================================================
// RUTAS DE LA API
// ============================================================================

app.post('/api/register', async (req, res) => {
  try {
    const rawEmail = req.body.email || req.body.correo;
    const { nombre, apellido, password, contraseña } = req.body;
    const rawPassword = password || contraseña;

    if (!rawEmail) {
      return res.status(400).json({
        success: false,
        error: 'El correo electrónico es obligatorio.'
      });
    }

    const email = String(rawEmail).trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'El formato de correo no es válido.'
      });
    }

    // 1. Verificar si el usuario ya existe en la DB
    const checkUser = await pool.query('SELECT id FROM usuarios WHERE correo = $1', [email]);
    if (checkUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Este correo electrónico ya se encuentra registrado.'
      });
    }

    // 2. Preparar datos y generar hash
    const nom = (nombre || email.split('@')[0]).trim();
    const ape = (apellido || 'Cliente').trim();
    const pwd = rawPassword ? String(rawPassword) : 'auth_2fa_pass';
    const hash = await bcrypt.hash(pwd, 10);

    // 3. Generar PIN de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 4. Limpiar PINs viejos y guardar el nuevo
    await pool.query('DELETE FROM verification_codes WHERE email = $1', [email]);
    await pool.query(
      `INSERT INTO verification_codes (email, code, expires_at) 
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
      [email, code]
    );

    // 5. Enviar el correo electrónico
    await sendVerificationEmail(email, code, {
      isRegister: true,
      nombre: nom
    });

    console.log(`[2FA Register] 📩 Código enviado a: ${email}`);

    return res.status(200).json({
      success: true,
      requires2FA: true,
      tempUserData: { email, nombre: nom, apellido: ape, hash },
      message: 'Código de verificación enviado a tu correo.'
    });

  } catch (error) {
    console.error('[Error en POST /api/register]:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al procesar el registro.',
      details: error.message
    });
  }
});

app.post('/api/verify-2fa', async (req, res) => {
  try {
    const { email, code, isRegister, userData } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        error: 'Email y código son requeridos.'
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // 1. Validar el PIN
    const result = await pool.query(
      'SELECT * FROM verification_codes WHERE email = $1 AND code = $2 AND expires_at > NOW()',
      [cleanEmail, code]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Código inválido o expirado.'
      });
    }

    // 2. Borrar PIN usado
    await pool.query('DELETE FROM verification_codes WHERE email = $1', [cleanEmail]);

    // 3. Crear usuario en la base de datos tras verificar PIN
    let user;
    if (isRegister && userData) {
      const { nombre, apellido, hash } = userData;
      const newUser = await pool.query(
        'INSERT INTO usuarios (nombre, apellido, correo, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, nombre, apellido, correo',
        [nombre, apellido, cleanEmail, hash]
      );
      user = newUser.rows[0];
    } else {
      const existingUser = await pool.query('SELECT id, nombre, apellido, correo FROM usuarios WHERE correo = $1', [cleanEmail]);
      user = existingUser.rows[0];
    }

    console.log(`[2FA Verify] ✅ PIN verificado exitosamente para: ${cleanEmail}`);

    return res.status(200).json({
      success: true,
      message: 'Verificación exitosa.',
      user
    });

  } catch (error) {
    console.error('[Error en /api/verify-2fa]:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al verificar el código.'
    });
  }
});

// Inicio del servidor
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});