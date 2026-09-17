/**
 * ============================================================================
 * PASTELERÍA "DULCES MOMENTOS" - SERVIDOR BACKEND (server.js)
 * Node.js + Express + PostgreSQL (Neon Tech) + Nodemailer + Mercado Pago
 * ============================================================================
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Módulos locales de Base de Datos y Correo
const pool = require('./db');
const { sendVerificationCode } = require('./mailer');

// SDK Mercado Pago (opcional para pagos)
let MercadoPagoConfig, Preference;
try {
  const mp = require('mercadopago');
  MercadoPagoConfig = mp.MercadoPagoConfig;
  Preference = mp.Preference;
} catch (e) {
  console.warn('[MercadoPago] Módulo no disponible o no configurado.');
}

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dulces_momentos_secret_key_2026_super_secure_jwt_token!';

// Regex estricto de validación de correo
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// ----------------------------------------------------------------------------
// 1. MIDDLEWARES
// ----------------------------------------------------------------------------
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Servir archivos estáticos del frontend (HTML, CSS, JS, imágenes)
app.use(express.static(path.join(__dirname, '.')));

// ----------------------------------------------------------------------------
// 2. ENDPOINTS 2FA (LOGIN, REGISTRO Y VERIFICACIÓN)
// ----------------------------------------------------------------------------

/**
 * POST /api/login
 * Recibe email, genera un código de 6 dígitos con expiración de 10 minutos,
 * limpia registros viejos e inserta el nuevo código en la tabla verification_codes de Neon.
 * Luego envía el correo con Nodemailer y devuelve { requires2FA: true }.
 */
app.post('/api/login', async (req, res) => {
  try {
    const rawEmail = req.body.email || req.body.correo;

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
        error: 'El formato de correo electrónico no es válido.'
      });
    }

    // 1. Generar PIN de 6 dígitos numéricos
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 2. Limpiar registros viejos (del mismo email o expirados)
    await pool.query(
      'DELETE FROM verification_codes WHERE email = $1 OR expires_at < NOW()',
      [email]
    );

    // 3. Insertar nuevo código con expiración de 10 minutos en Neon
    await pool.query(
      "INSERT INTO verification_codes (email, code, expires_at) VALUES ($1, $2, NOW() + INTERVAL '10 minutes')",
      [email, code]
    );

    // Obtener nombre del usuario si ya existe
    let nombreUsuario = '';
    const uRes = await pool.query('SELECT nombre FROM usuarios WHERE correo = $1', [email]);
    if (uRes.rows.length > 0) {
      nombreUsuario = uRes.rows[0].nombre;
    }

    // 4. Enviar el correo con Nodemailer (tema oscuro y rosa)
    await sendVerificationCode(email, code, { isRegister: false, nombre: nombreUsuario });

    console.log(`[2FA Login] Código PIN enviado a: ${email}`);

    return res.status(200).json({
      requires2FA: true,
      message: 'Código de verificación de 6 dígitos enviado a tu correo.'
    });

  } catch (error) {
    console.error('[Error en POST /api/login]:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al procesar el inicio de sesión o enviar el correo.',
      details: error.message
    });
  }
});

/**
 * POST /api/register
 * Crea el PIN y envía el correo de verificación para cuentas nuevas.
 * Si se envían datos (nombre, apellido, password), los guarda en la tabla usuarios.
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

    // Registrar o actualizar datos previos del usuario si se enviaron
    if (nombre || apellido || password) {
      const nom = (nombre || email.split('@')[0]).trim();
      const ape = (apellido || 'Cliente').trim();
      const pwd = password ? String(password) : 'auth_2fa_pass';
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
    }

    // 1. Generar PIN de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 2. Limpiar registros viejos del email
    await pool.query(
      'DELETE FROM verification_codes WHERE email = $1 OR expires_at < NOW()',
      [email]
    );

    // 3. Insertar nuevo código con expiración de 10 minutos
    await pool.query(
      "INSERT INTO verification_codes (email, code, expires_at) VALUES ($1, $2, NOW() + INTERVAL '10 minutes')",
      [email, code]
    );

    // 4. Enviar correo de confirmación de registro
    await sendVerificationCode(email, code, {
      isRegister: true,
      nombre: nombre || email.split('@')[0]
    });

    console.log(`[2FA Register] PIN de confirmación enviado a nueva cuenta: ${email}`);

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

/**
 * POST /api/verify-code
 * Recibe email y code, comprueba en Neon que el código exista y no esté expirado (expires_at > NOW()).
 * Si es correcto, borra el registro usado y devuelve { success: true, token, user }.
 */
app.post('/api/verify-code', async (req, res) => {
  try {
    const rawEmail = req.body.email || req.body.correo;
    const { code } = req.body;

    if (!rawEmail || !code) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere el correo electrónico y el código de verificación.'
      });
    }

    const email = String(rawEmail).trim().toLowerCase();
    const cleanCode = String(code).trim();

    // 1. Comprobar en Neon que el código exista y no esté expirado
    const query = `
      SELECT id, email, code, expires_at 
      FROM verification_codes 
      WHERE email = $1 AND code = $2 AND expires_at > NOW() 
      ORDER BY id DESC LIMIT 1
    `;
    const result = await pool.query(query, [email, cleanCode]);

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'El código ingresado es incorrecto o ya ha expirado.'
      });
    }

    // 2. Si es correcto, borrar el registro usado
    await pool.query('DELETE FROM verification_codes WHERE email = $1', [email]);

    // 3. Obtener o crear perfil del usuario para devolver sesión
    let userRes = await pool.query('SELECT id, nombre, apellido, correo FROM usuarios WHERE correo = $1', [email]);
    let user;

    if (userRes.rows.length > 0) {
      user = userRes.rows[0];
    } else {
      const defaultName = email.split('@')[0];
      const inserted = await pool.query(
        'INSERT INTO usuarios (nombre, apellido, correo, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, nombre, apellido, correo',
        [defaultName, 'Cliente', email, 'verified_via_2fa']
      );
      user = inserted.rows[0];
    }

    const token = jwt.sign(
      { id: user.id, nombre: user.nombre, apellido: user.apellido, correo: user.correo },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`[2FA Verify] ✅ PIN validado exitosamente para: ${email}`);

    return res.status(200).json({
      success: true,
      message: 'Código validado correctamente. ¡Bienvenido/a a Dulces Momentos!',
      token,
      user
    });

  } catch (error) {
    console.error('[Error en POST /api/verify-code]:', error);
    return res.status(500).json({
      success: false,
      error: 'Error en el servidor al validar el código.',
      details: error.message
    });
  }
});

// ----------------------------------------------------------------------------
// 3. ENDPOINTS ADICIONALES (Compatibilidad Frontend & Checkout)
// ----------------------------------------------------------------------------

// Rutas de compatibilidad con /api/auth/*
app.post('/api/auth/register', (req, res, next) => {
  req.url = '/api/register';
  app.handle(req, res, next);
});

app.post('/api/auth/login', (req, res, next) => {
  req.url = '/api/login';
  app.handle(req, res, next);
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Sesión cerrada.' });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ success: true });
});

// Creación de preferencia de Mercado Pago
app.post('/api/crear-preferencia', async (req, res) => {
  try {
    if (!Preference || !process.env.MP_ACCESS_TOKEN) {
      return res.status(503).json({ error: 'Mercado Pago no disponible.' });
    }

    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const preference = new Preference(client);

    const { items, cliente } = req.body;
    const mpItems = (items || []).map((item, idx) => ({
      id: item.id || `item-${idx + 1}`,
      title: item.title || item.nombre || 'Producto',
      quantity: Number(item.quantity || item.cantidad || 1),
      unit_price: Number(item.unit_price || item.precio || 0),
      currency_id: 'ARS'
    }));

    const result = await preference.create({
      body: {
        items: mpItems,
        payer: { email: cliente?.email || 'cliente@dulcesmomentos.com' },
        back_urls: {
          success: 'https://octima666.github.io/DulcesMomentos/?status=success',
          failure: 'https://octima666.github.io/DulcesMomentos/?status=failure'
        },
        auto_return: 'approved'
      }
    });

    return res.json({ id: result.id, init_point: result.init_point });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Endpoint de salud
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', port: PORT });
  } catch (err) {
    res.status(500).json({ status: 'error', database: err.message });
  }
});

// ----------------------------------------------------------------------------
// 4. INICIAR SERVIDOR
// ----------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🍰 Pastelería Dulces Momentos - Backend`);
  console.log(`🚀 Servidor ejecutándose en: http://localhost:${PORT}`);
  console.log(`🔑 Endpoint Login (2FA): POST http://localhost:${PORT}/api/login`);
  console.log(`📝 Endpoint Register (2FA): POST http://localhost:${PORT}/api/register`);
  console.log(`🛡️ Endpoint Verify 2FA: POST http://localhost:${PORT}/api/verify-code`);
  console.log(`======================================================\n`);
});

module.exports = app;
