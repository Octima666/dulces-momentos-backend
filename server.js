require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const { sendVerificationEmail, sendVerificationCode } = require('./mailer');

// SDK Mercado Pago (opcional para pagos)
let MercadoPagoConfig, Preference;
try {
  const mp = require('mercadopago');
  MercadoPagoConfig = mp.MercadoPagoConfig;
  Preference = mp.Preference;
} catch (e) {
  console.warn('[MercadoPago] Módulo no disponible o no configurado.');
}

// Utilidades para el pago con QR (API de Órdenes de Mercado Pago)
const crypto = require('crypto');
let QRCode;
try {
  QRCode = require('qrcode');
} catch (e) {
  console.warn('[QRCode] Módulo "qrcode" no instalado. Corré: npm install qrcode');
}

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dulces_momentos_secret_key_2026_super_secure_jwt_token!';

// ============================================================================
// 1. MIDDLEWARES & CORS
// ============================================================================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ============================================================================
// 2. RUTAS BASE & SALUD
// ============================================================================

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Pastelería Dulces Momentos - Backend API',
    version: '2.0.0',
    endpoints: {
      health: 'GET /api/health',
      login: 'POST /api/login',
      register: 'POST /api/register',
      verifyCode: 'POST /api/verify-code',
      preferenciaMP: 'POST /api/crear-preferencia'
    }
  });
});

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', port: PORT });
  } catch (err) {
    res.status(500).json({ status: 'error', database: err.message });
  }
});

// ============================================================================
// 3. AUTENTICACIÓN Y 2FA
// ============================================================================

/**
 * POST /api/login
 * Solicita acceso por email, genera PIN de 6 dígitos con expiración de 10 min y lo envía por correo.
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
        error: 'El formato de correo no es válido.'
      });
    }

    // 1. Generar PIN de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 2. Limpiar registros viejos y guardar el nuevo
    await pool.query('DELETE FROM verification_codes WHERE email = $1 OR expires_at < NOW()', [email]);
    await pool.query(
      `INSERT INTO verification_codes (email, code, expires_at) 
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
      [email, code]
    );

    // Obtener nombre del usuario si ya existe
    let nombreUsuario = '';
    const uRes = await pool.query('SELECT nombre FROM usuarios WHERE correo = $1', [email]);
    if (uRes.rows.length > 0) {
      nombreUsuario = uRes.rows[0].nombre;
    }

    // 3. Enviar el correo electrónico
    await sendVerificationEmail(email, code, {
      isRegister: false,
      nombre: nombreUsuario
    });

    console.log(`[2FA Login] 📩 Código PIN enviado a: ${email}`);

    return res.status(200).json({
      success: true,
      requires2FA: true,
      message: 'Código de verificación de 6 dígitos enviado a tu correo.'
    });

  } catch (error) {
    console.error('[Error en POST /api/login]:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al procesar el inicio de sesión.',
      details: error.message
    });
  }
});

/**
 * POST /api/register
 * Registra usuario y envía PIN de 6 dígitos para verificación de cuenta.
 */
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
    await pool.query('DELETE FROM verification_codes WHERE email = $1 OR expires_at < NOW()', [email]);
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

/**
 * Handler común para verificación 2FA (soporta /api/verify-code y /api/verify-2fa)
 */
const verifyHandler = async (req, res) => {
  try {
    const rawEmail = req.body.email || req.body.correo;
    const { code, isRegister, userData } = req.body;

    if (!rawEmail || !code) {
      return res.status(400).json({
        success: false,
        error: 'Email y código son requeridos.'
      });
    }

    const cleanEmail = String(rawEmail).trim().toLowerCase();
    const cleanCode = String(code).trim();

    // 1. Validar el PIN en verification_codes
    const result = await pool.query(
      'SELECT * FROM verification_codes WHERE email = $1 AND code = $2 AND expires_at > NOW() ORDER BY id DESC LIMIT 1',
      [cleanEmail, cleanCode]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Código inválido o expirado.'
      });
    }

    // 2. Borrar PIN usado
    await pool.query('DELETE FROM verification_codes WHERE email = $1', [cleanEmail]);

    // 3. Crear o recuperar usuario en la base de datos
    let user;
    if (isRegister && userData) {
      const { nombre, apellido, hash } = userData;
      const newUser = await pool.query(
        'INSERT INTO usuarios (nombre, apellido, correo, password_hash) VALUES ($1, $2, $3, $4) ON CONFLICT (correo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id, nombre, apellido, correo',
        [nombre, apellido, cleanEmail, hash]
      );
      user = newUser.rows[0];
    } else {
      const existingUser = await pool.query('SELECT id, nombre, apellido, correo FROM usuarios WHERE correo = $1', [cleanEmail]);
      if (existingUser.rows.length > 0) {
        user = existingUser.rows[0];
      } else {
        const defaultName = cleanEmail.split('@')[0];
        const inserted = await pool.query(
          'INSERT INTO usuarios (nombre, apellido, correo, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, nombre, apellido, correo',
          [defaultName, 'Cliente', cleanEmail, 'verified_via_2fa']
        );
        user = inserted.rows[0];
      }
    }

    // 4. Generar token de sesión JWT
    const token = jwt.sign(
      { id: user.id, nombre: user.nombre, apellido: user.apellido, correo: user.correo },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`[2FA Verify] ✅ PIN verificado exitosamente para: ${cleanEmail}`);

    return res.status(200).json({
      success: true,
      message: 'Verificación exitosa. ¡Bienvenido/a a Dulces Momentos!',
      token,
      user
    });

  } catch (error) {
    console.error('[Error en verificación de código]:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al verificar el código.',
      details: error.message
    });
  }
};

app.post('/api/verify-code', verifyHandler);
app.post('/api/verify-2fa', verifyHandler);

// Compatibilidad de rutas de sesión
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

/**
 * GET /api/auth/me
 * Valida el token JWT guardado en el frontend (localStorage) y devuelve
 * los datos del usuario. Esto es lo que permite mantener la sesión
 * iniciada al refrescar la página o volver a abrir la app.
 */
app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ success: false, error: 'Token no proporcionado.' });
    }

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, error: 'Token inválido o expirado.' });
    }

    const result = await pool.query(
      'SELECT id, nombre, apellido, correo FROM usuarios WHERE id = $1',
      [payload.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Usuario no encontrado.' });
    }

    return res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('[Error en /api/auth/me]:', error);
    return res.status(500).json({ success: false, error: 'Error al verificar la sesión.' });
  }
});

// ============================================================================
// 4. PASARELA DE PAGOS (Mercado Pago)
// ============================================================================

app.post('/api/crear-preferencia', async (req, res) => {
  try {
    if (!Preference || !process.env.MP_ACCESS_TOKEN) {
      return res.status(503).json({ error: 'Mercado Pago no configurado o token no definido.' });
    }

    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const preference = new Preference(client);

    const { items, cliente } = req.body;
    const mpItems = (items || []).map((item, idx) => ({
      id: item.id || `item-${idx + 1}`,
      title: item.title || item.nombre || 'Producto Dulces Momentos',
      quantity: Number(item.quantity || item.cantidad || 1),
      unit_price: Number(item.unit_price || item.precio || 0),
      currency_id: 'ARS'
    }));

    const result = await preference.create({
      body: {
        items: mpItems,
        payer: { email: cliente?.email || 'cliente@dulcesmomentos.com' },
        back_urls: {
          success: 'https://dulcesmomentos.com.ar/?status=success',
          failure: 'https://dulcesmomentos.com.ar/?status=failure'
        },
        auto_return: 'approved'
      }
    });

    return res.json({ id: result.id, init_point: result.init_point });
  } catch (err) {
    console.error('[Error en /api/crear-preferencia]:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/crear-pago-qr
 * Crea una orden de pago con QR dinámico (API de Órdenes de Mercado Pago).
 * Devuelve el string qr_data (EMVCo) y una imagen PNG en base64 lista para mostrar.
 */
app.post('/api/crear-pago-qr', async (req, res) => {
  try {
    if (!process.env.MP_ACCESS_TOKEN) {
      return res.status(503).json({ success: false, error: 'Mercado Pago no configurado (falta MP_ACCESS_TOKEN).' });
    }

    const { items, external_reference, descripcion } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Debes enviar al menos un producto en "items".' });
    }

    // Calcular el total (debe ser un número entero, sin decimales)
    const totalAmount = items.reduce((sum, item) => {
      const precio = Number(item.unit_price ?? item.precio ?? 0);
      const cantidad = Number(item.quantity ?? item.cantidad ?? 1);
      return sum + precio * cantidad;
    }, 0);

    if (!totalAmount || totalAmount <= 0) {
      return res.status(400).json({ success: false, error: 'El monto total debe ser mayor a 0.' });
    }

    const orderResponse = await fetch('https://api.mercadopago.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'X-Idempotency-Key': crypto.randomUUID(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'qr',
        total_amount: String(Math.round(totalAmount)),
        external_reference: external_reference || `PEDIDO-${Date.now()}`,
        description: (descripcion || 'Compra en Dulces Momentos').slice(0, 150),
        // La API no permite borrar la orden, por eso conviene poner expiración
        expiration_date: new Date(Date.now() + 30 * 60 * 1000).toISOString()
      })
    });

    const orderData = await orderResponse.json();

    if (!orderResponse.ok) {
      console.error('[MercadoPago QR Error]:', orderData);
      return res.status(orderResponse.status).json({
        success: false,
        error: 'No se pudo crear la orden de pago QR.',
        details: orderData
      });
    }

    // Generar la imagen del QR a partir del string qr_data (formato EMVCo)
    let qrImage = null;
    if (QRCode && orderData.qr_data) {
      qrImage = await QRCode.toDataURL(orderData.qr_data);
    }

    console.log(`[MercadoPago QR] ✅ Orden creada: ${orderData.id}`);

    return res.status(201).json({
      success: true,
      order_id: orderData.id,
      qr_data: orderData.qr_data,     // string EMVCo, por si querés generar el QR en el frontend
      qr_image: qrImage               // data:image/png;base64,... listo para <img src="...">
    });

  } catch (error) {
    console.error('[Error en /api/crear-pago-qr]:', error);
    return res.status(500).json({ success: false, error: 'Error al crear el pago con QR.', details: error.message });
  }
});

/**
 * GET /api/estado-pago-qr/:orderId
 * Consulta el estado de una orden QR (útil para hacer polling desde el frontend
 * mientras el cliente escanea y paga).
 */
app.get('/api/estado-pago-qr/:orderId', async (req, res) => {
  try {
    if (!process.env.MP_ACCESS_TOKEN) {
      return res.status(503).json({ success: false, error: 'Mercado Pago no configurado.' });
    }

    const { orderId } = req.params;

    const response = await fetch(`https://api.mercadopago.com/v1/orders/${orderId}`, {
      headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ success: false, error: 'No se pudo consultar la orden.', details: data });
    }

    return res.json({ success: true, status: data.status, order: data });

  } catch (error) {
    console.error('[Error en /api/estado-pago-qr]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/webhook-mercadopago
 * Mercado Pago llama a esta URL cuando cambia el estado de un pago/orden.
 * Configurá esta URL (https://tu-dominio.com/api/webhook-mercadopago) en:
 * https://www.mercadopago.com.ar/developers/panel/notifications/webhooks
 */
app.post('/api/webhook-mercadopago', async (req, res) => {
  try {
    console.log('[Webhook MercadoPago] Notificación recibida:', JSON.stringify(req.body));

    // Acá es donde deberías:
    // 1. Identificar la orden/pago según req.body (topic/type + data.id)
    // 2. Consultar GET /api/estado-pago-qr/:orderId (o GET /v1/orders/:id directo)
    // 3. Si status === 'processed' o 'closed', marcar el pedido como pagado en tu DB

    res.sendStatus(200); // Mercado Pago reintenta si no recibe 200/201
  } catch (error) {
    console.error('[Error en webhook Mercado Pago]:', error);
    res.sendStatus(500);
  }
});

// ============================================================================
// 5. INICIO DEL SERVIDOR
// ============================================================================
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🍰 Pastelería Dulces Momentos - Backend API`);
  console.log(`🚀 Servidor ejecutándose en puerto: ${PORT}`);
  console.log(`🔑 Endpoint Login (2FA): POST /api/login`);
  console.log(`📝 Endpoint Register (2FA): POST /api/register`);
  console.log(`🛡️ Endpoint Verify 2FA: POST /api/verify-code`);
  console.log(`💳 Endpoint Mercado Pago (Checkout Pro): POST /api/crear-preferencia`);
  console.log(`📱 Endpoint Mercado Pago (QR): POST /api/crear-pago-qr`);
  console.log(`🔔 Webhook Mercado Pago: POST /api/webhook-mercadopago`);
  console.log(`======================================================\n`);
});

module.exports = app;