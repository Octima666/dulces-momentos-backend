/**
 * ============================================================================
 * PASTELERÍA "DULCES MOMENTOS" - SERVIDOR BACKEND (server.js)
 * Node.js + Express + PostgreSQL (Neon Tech) + Gmail SMTP + Mercado Pago
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
const { sendVerificationEmail } = require('./mailer');

// SDK Mercado Pago
let MercadoPagoConfig, Preference;
try {
  const mp = require('mercadopago');
  MercadoPagoConfig = mp.MercadoPagoConfig;
  Preference = mp.Preference;
} catch (e) {
  console.warn('[MercadoPago] Módulo no disponible o no configurado.');
}

const app = express();
const PORT = process.env.PORT || 10000;
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

// ----------------------------------------------------------------------------
// 2. ENDPOINTS 2FA (LOGIN, REGISTRO Y VERIFICACIÓN)
// ----------------------------------------------------------------------------

/**
 * POST /api/login
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

    // Generar PIN de 6 dígitos numéricos
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Limpiar registros viejos (del mismo email o expirados)
    await pool.query(
      'DELETE FROM verification_codes WHERE email = $1 OR expires_at < NOW()',
      [email]
    );

    // Insertar nuevo código con expiración de 10 minutos
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

    // Enviar correo vía Gmail SMTP
    await sendVerificationEmail(email, code, { isRegister: false, nombre: nombreUsuario });

    console.log(`[2FA Login] ✅ Código PIN enviado exitosamente a: ${email}`);

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

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.query(
      'DELETE FROM verification_codes WHERE email = $1 OR expires_at < NOW()',
      [email]
    );

    await pool.query(
      "INSERT INTO verification_codes (email, code, expires_at) VALUES ($1, $2, NOW() + INTERVAL '10 minutes')",
      [email, code]
    );

    await sendVerificationEmail(email, code, {
      isRegister: true,
      nombre: nombre || email.split('@')[0]
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

/**
 * POST /api/verify-code
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

    await pool.query('DELETE FROM verification_codes WHERE email = $1', [email]);

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
// 3. ENDPOINTS ADICIONALES
// ----------------------------------------------------------------------------

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
  console.log(`🚀 Servidor ejecutándose en puerto: ${PORT}`);
  console.log(`======================================================\n`);
});

module.exports = app;