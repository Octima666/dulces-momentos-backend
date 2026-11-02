require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const pool = require('./db');
const { sendVerificationEmail, sendVerificationCode } = require('./mailer');

// Crear el cliente de Google OAuth2 usando GOOGLE_CLIENT_ID del entorno
const googleOAuthClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || '');

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

// ============================================================================
// JWT_SECRET es OBLIGATORIO en producción: no se usa valor por defecto.
// Si falta, el servidor se detiene con un mensaje claro.
// ============================================================================
if (!process.env.JWT_SECRET) {
  console.error(
    '[FATAL] La variable de entorno JWT_SECRET no está definida.\n' +
    '        Agrega JWT_SECRET=<clave-larga-aleatoria> en tu archivo .env'
  );
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

// ============================================================================
// 1. MIDDLEWARES & CORS
// ============================================================================

// CORS limitado a ALLOWED_ORIGINS (coma-separado).
// Si la variable no está definida, se permite cualquier origen (*).
const CORS_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : '*';

app.use(cors({
  origin: CORS_ORIGINS,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// El webhook de MP necesita el body raw para poder validar la firma HMAC.
// Se registra ANTES de express.json() para que el buffer quede disponible.
app.use('/api/webhook-mercadopago', express.raw({ type: 'application/json' }));

// Para el resto de las rutas, parseo JSON normal
app.use(express.json());

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ============================================================================
// PERMISOS DE ADMINISTRADOR
// ADMIN_EMAILS: lista separada por comas en .env, con valor por defecto.
// ============================================================================
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'dulcesmomentos1112@gmail.com')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Devuelve true si el correo corresponde a un administrador.
 * Comparación case-insensitive.
 */
const esAdminEmail = (email) => {
  if (!email) return false;
  return ADMIN_EMAILS.includes(String(email).trim().toLowerCase());
};

/**
 * Middleware que protege rutas de administrador.
 * 401 si no hay token válido, 403 si el usuario no es admin.
 */
const requireAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Token de autorización no proporcionado.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Token inválido o expirado.' });
  }

  const emailUsuario = payload.correo || payload.email;
  if (!esAdminEmail(emailUsuario)) {
    return res.status(403).json({ success: false, error: 'Acceso denegado: se requieren permisos de administrador.' });
  }

  req.user = { ...payload, correo: emailUsuario };
  next();
};

/**
 * Middleware que verifica JWT Bearer y adjunta req.user.
 * Responde 401 si el token falta, es inválido o expiró.
 */
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Token de autorización no proporcionado.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Token inválido o expirado.' });
  }

  req.user = {
    ...payload,
    correo: payload.correo || payload.email,
    rol: payload.rol || 'cliente'
  };
  next();
};

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
      googleAuth: 'POST /api/auth/google',
      preferenciaMP: 'POST /api/crear-preferencia',
      crearPagoQR: 'POST /api/crear-pago-qr',
      estadoPagoQR: 'GET /api/estado-pago-qr/:orderId',
      webhookMP: 'POST /api/webhook-mercadopago'
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
        'INSERT INTO usuarios (nombre, apellido, correo, password_hash) VALUES ($1, $2, $3, $4) ON CONFLICT (correo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id, nombre, apellido, correo, rol',
        [nombre, apellido, cleanEmail, hash]
      );
      user = newUser.rows[0];
    } else {
      const existingUser = await pool.query('SELECT id, nombre, apellido, correo, rol FROM usuarios WHERE correo = $1', [cleanEmail]);
      if (existingUser.rows.length > 0) {
        user = existingUser.rows[0];
      } else {
        const defaultName = cleanEmail.split('@')[0];
        const inserted = await pool.query(
          'INSERT INTO usuarios (nombre, apellido, correo, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, nombre, apellido, correo, rol',
          [defaultName, 'Cliente', cleanEmail, 'verified_via_2fa']
        );
        user = inserted.rows[0];
      }
    }

    // 4. Determinar rol: admin si está en ADMIN_EMAILS, si no usar el de la DB o 'cliente'
    const rolFinal = esAdminEmail(user.correo) ? 'admin' : (user.rol || 'cliente');

    // 5. Generar token de sesión JWT con rol incluido
    const token = jwt.sign(
      { id: user.id, nombre: user.nombre, apellido: user.apellido, correo: user.correo, rol: rolFinal },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`[2FA Verify] ✅ PIN verificado exitosamente para: ${cleanEmail}`);

    return res.status(200).json({
      success: true,
      message: 'Verificación exitosa. ¡Bienvenido/a a Dulces Momentos!',
      token,
      user: { id: user.id, nombre: user.nombre, apellido: user.apellido, correo: user.correo, rol: rolFinal }
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
      'SELECT id, nombre, apellido, correo, rol FROM usuarios WHERE id = $1 OR correo = $2',
      [payload.id || 0, String(payload.correo || payload.email || '').trim().toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Usuario no encontrado.' });
    }

    const user = result.rows[0];
    // Rol definitivo: admin si está en ADMIN_EMAILS, si no el de la DB o 'cliente'
    const rolFinal = esAdminEmail(user.correo) ? 'admin' : (user.rol || 'cliente');

    return res.json({ success: true, user: { ...user, rol: rolFinal } });
  } catch (error) {
    console.error('[Error en /api/auth/me]:', error);
    return res.status(500).json({ success: false, error: 'Error al verificar la sesión.' });
  }
});

/**
 * POST /api/auth/google
 * Autentica usuarios mediante Google Identity Services (ID Token).
 * Verifica el token con OAuth2Client y sincroniza el usuario en PostgreSQL (Neon).
 */
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(401).json({
        success: false,
        error: 'Credencial de Google no proporcionada.'
      });
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      console.error('[Google OAuth] Error: GOOGLE_CLIENT_ID no configurado en variables de entorno.');
      return res.status(500).json({
        success: false,
        error: 'El servicio de autenticación con Google no está configurado.'
      });
    }

    // 1. Verificar el ID Token oficial de Google
    let ticket;
    try {
      ticket = await googleOAuthClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID
      });
    } catch (verifyErr) {
      console.error('[Google OAuth] Error al verificar ID Token:', verifyErr.message);
      return res.status(401).json({
        success: false,
        error: 'Token de Google inválido o expirado.'
      });
    }

    const payload = ticket.getPayload();

    // 2. Rechazar con 401 si no hay email o email_verified es false
    if (!payload || !payload.email || !payload.email_verified) {
      return res.status(401).json({
        success: false,
        error: 'Correo de Google no verificado o inválido.'
      });
    }

    // 3. Normalizar correo y campos de nombre/apellido (máx 50 caracteres)
    const email = String(payload.email).trim().toLowerCase();
    const fallbackLocal = email.split('@')[0] || 'Cliente';
    const nombre = String(payload.given_name || fallbackLocal).trim().slice(0, 50) || 'Cliente';
    const apellido = String(payload.family_name || 'Cliente').trim().slice(0, 50) || 'Cliente';
    const googleId = String(payload.sub || '');

    // 4. INSERT ... ON CONFLICT (correo) DO UPDATE SET google_id = COALESCE(...)
    // Si ya exista por email/PIN se le vincula google_id en vez de duplicarla
    const query = `
      INSERT INTO usuarios (nombre, apellido, correo, password_hash, google_id)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (correo)
      DO UPDATE SET google_id = COALESCE(usuarios.google_id, EXCLUDED.google_id)
      RETURNING id, nombre, apellido, correo, rol;
    `;
    const result = await pool.query(query, [nombre, apellido, email, 'google_oauth', googleId]);
    const user = result.rows[0];

    // 5. Determinar rol: admin si está en ADMIN_EMAILS, si no el de la DB o 'cliente'
    const rolFinal = esAdminEmail(user.correo) ? 'admin' : (user.rol || 'cliente');

    // 6. Firmar JWT con rol incluido (mismo formato que verifyHandler, expiresIn 7d)
    const token = jwt.sign(
      { id: user.id, nombre: user.nombre, apellido: user.apellido, correo: user.correo, rol: rolFinal },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`[Google OAuth] ✅ Usuario autenticado exitosamente: ${user.correo}`);

    // Respuesta con EXACTAMENTE el mismo formato que POST /api/verify-code
    return res.status(200).json({
      success: true,
      message: 'Inicio de sesión con Google exitoso. ¡Bienvenido/a a Dulces Momentos!',
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        apellido: user.apellido,
        correo: user.correo,
        rol: rolFinal
      }
    });

  } catch (error) {
    console.error('[Error en POST /api/auth/google]:', error.message);
    return res.status(401).json({
      success: false,
      error: 'Error al procesar la autenticación con Google.'
    });
  }
});

// ============================================================================
// 4. ENDPOINT ADMIN KDS
// ============================================================================

/**
 * GET /api/admin/kds/verificar
 * Verifica que el usuario autenticado tenga permisos de administrador.
 * Usado por el frontend para proteger el acceso al panel de Cocina (KDS).
 * Requiere: Authorization: Bearer <token>
 * Respuesta: { success: true, user: { id, nombre, correo, rol: 'admin' } }
 */
app.get('/api/admin/kds/verificar', requireAdmin, (req, res) => {
  return res.json({
    success: true,
    user: {
      id: req.user.id,
      nombre: req.user.nombre,
      correo: req.user.correo,
      rol: 'admin'
    }
  });
});

// ============================================================================
// 5. PASARELA DE PAGOS (Mercado Pago)
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

// ── Helpers de formato ──────────────────────────────────────────────────────

/**
 * Formatea un número como string con exactamente dos decimales ("1500.00").
 * La API de Órdenes de MP requiere los montos como string decimal.
 */
const formatMonto = (n) => Number(n).toFixed(2);

/**
 * Genera un external_reference único con prefijo legible y timestamp.
 * Ejemplo: "DM-1730000000000-a1b2c3d4"
 */
const generarExternalRef = () =>
  `DM-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

// ── Creación de pago QR ─────────────────────────────────────────────────────

/**
 * POST /api/crear-pago-qr  (requiere JWT)
 *
 * Body: { items: [{ producto_id: number, cantidad: number }] }
 *
 * - Precio y total SIEMPRE desde la DB (nunca desde el body).
 * - Cantidad: entero entre 1 y 50.
 * - Crea orden en MP con type "qr" y mode "dynamic".
 * - Genera imagen PNG del QR en base64 con la lib `qrcode`.
 * - Guarda el pedido en estado "pendiente".
 * - Responde { success, order_id, external_reference, total, qr_image }.
 * - Errores de MP solo al log; el cliente recibe mensaje genérico.
 */
app.post('/api/crear-pago-qr', requireAuth, async (req, res) => {
  try {
    if (!process.env.MP_ACCESS_TOKEN) {
      return res.status(503).json({ success: false, error: 'Mercado Pago no configurado (falta MP_ACCESS_TOKEN).' });
    }
    if (!process.env.MP_POS_EXTERNAL_ID) {
      return res.status(503).json({ success: false, error: 'Caja de Mercado Pago no configurada (falta MP_POS_EXTERNAL_ID).' });
    }

    // ── Validar body ───────────────────────────────────────────────────────
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Debés enviar al menos un producto en "items".' });
    }

    // Validar estructura de cada ítem
    for (const item of items) {
      const cantidad = Number(item.cantidad);
      if (!item.producto_id || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 50) {
        return res.status(400).json({
          success: false,
          error: 'Cada ítem debe tener producto_id y cantidad (entero entre 1 y 50).'
        });
      }
    }

    // ── Obtener precios desde la DB ───────────────────────────────────────
    const ids = items.map(i => Number(i.producto_id));
    const { rows: productos } = await pool.query(
      'SELECT id, nombre, precio FROM productos WHERE id = ANY($1) AND activo = TRUE',
      [ids]
    );

    if (productos.length !== ids.length) {
      const encontrados = productos.map(p => p.id);
      const faltantes = ids.filter(id => !encontrados.includes(id));
      return res.status(400).json({
        success: false,
        error: `Productos no encontrados o inactivos: ${faltantes.join(', ')}.`
      });
    }

    // Indexar por id para acceso rápido
    const mapaProductos = Object.fromEntries(productos.map(p => [p.id, p]));

    // Construir ítems para MP y calcular total
    let totalAmount = 0;
    const mpItems = items.map(item => {
      const prod = mapaProductos[Number(item.producto_id)];
      const cantidad = Number(item.cantidad);
      const precioUnitario = Number(prod.precio);
      totalAmount += precioUnitario * cantidad;

      return {
        title: prod.nombre,
        unit_price: formatMonto(precioUnitario),   // string "0.00" requerido por MP
        quantity: cantidad,
        unit_measure: 'unit'
      };
    });

    if (totalAmount <= 0) {
      return res.status(400).json({ success: false, error: 'El monto total debe ser mayor a 0.' });
    }

    // ── Crear orden en Mercado Pago ───────────────────────────────────────
    const externalReference = generarExternalRef();
    const idempotencyKey = crypto.randomUUID();

    const mpPayload = {
      type: 'qr',
      total_amount: formatMonto(totalAmount),       // string "0.00"
      external_reference: externalReference,
      description: 'Compra en Dulces Momentos',
      expiration_time: 'PT30M',                     // ISO 8601 duration: 30 minutos
      items: mpItems,
      config: {
        qr: {
          external_pos_id: process.env.MP_POS_EXTERNAL_ID,
          mode: 'dynamic'
        }
      }
    };

    let orderData;
    let mpResponse;
    try {
      mpResponse = await fetch('https://api.mercadopago.com/v1/orders', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          'X-Idempotency-Key': idempotencyKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(mpPayload)
      });
      orderData = await mpResponse.json();
    } catch (fetchErr) {
      console.error('[MercadoPago QR] Error de red al crear la orden:', fetchErr);
      return res.status(502).json({ success: false, error: 'No se pudo conectar con Mercado Pago.' });
    }

    if (!mpResponse.ok) {
      // Solo al log; el cliente recibe mensaje genérico
      console.error('[MercadoPago QR Error] Status:', mpResponse.status, 'Body:', JSON.stringify(orderData));
      return res.status(502).json({ success: false, error: 'No se pudo crear la orden de pago QR en Mercado Pago.' });
    }

    // ── Generar imagen QR ─────────────────────────────────────────────────
    // La API devuelve qr_data en el nivel raíz de la respuesta (no en type_response).
    let qrImage = null;
    if (QRCode && orderData.qr_data) {
      try {
        qrImage = await QRCode.toDataURL(orderData.qr_data);
      } catch (qrErr) {
        console.error('[QRCode] Error generando imagen:', qrErr.message);
      }
    }

    // ── Guardar pedido en DB ──────────────────────────────────────────────
    const itemsSnapshot = items.map(item => {
      const prod = mapaProductos[Number(item.producto_id)];
      return {
        producto_id: prod.id,
        nombre: prod.nombre,
        precio: Number(prod.precio),
        cantidad: Number(item.cantidad)
      };
    });

    await pool.query(
      `INSERT INTO pedidos (external_reference, mp_order_id, total, items, estado, usuario_id)
       VALUES ($1, $2, $3, $4, 'pendiente', $5)`,
      [
        externalReference,
        String(orderData.id),
        totalAmount,
        JSON.stringify(itemsSnapshot),
        req.user.id
      ]
    );

    console.log(`[MercadoPago QR] ✅ Orden creada: ${orderData.id} | ref: ${externalReference}`);

    return res.status(201).json({
      success: true,
      order_id: String(orderData.id),
      external_reference: externalReference,
      total: totalAmount,
      qr_image: qrImage   // data:image/png;base64,... listo para <img src="...">
    });

  } catch (error) {
    console.error('[Error en POST /api/crear-pago-qr]:', error);
    return res.status(500).json({ success: false, error: 'Error interno al crear el pago con QR.' });
  }
});

// ── Estado de pago QR ───────────────────────────────────────────────────────

/**
 * GET /api/estado-pago-qr/:orderId  (requiere JWT)
 *
 * Solo el dueño del pedido (mismo usuario_id) o un admin puede consultar el estado.
 * Devuelve el estado guardado en DB y también consulta MP para el estado en tiempo real.
 */
app.get('/api/estado-pago-qr/:orderId', requireAuth, async (req, res) => {
  try {
    if (!process.env.MP_ACCESS_TOKEN) {
      return res.status(503).json({ success: false, error: 'Mercado Pago no configurado.' });
    }

    const { orderId } = req.params;

    // Buscar el pedido en la DB por mp_order_id
    const { rows } = await pool.query(
      'SELECT * FROM pedidos WHERE mp_order_id = $1',
      [String(orderId)]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Pedido no encontrado.' });
    }

    const pedido = rows[0];

    // Verificar autorización: solo el dueño o un admin
    const esAdmin = esAdminEmail(req.user.correo) || req.user.rol === 'admin';
    if (!esAdmin && pedido.usuario_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'No tenés permiso para consultar este pedido.' });
    }

    // Consultar estado en tiempo real a MP
    let mpStatus = null;
    try {
      const mpResponse = await fetch(`https://api.mercadopago.com/v1/orders/${orderId}`, {
        headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` }
      });
      if (mpResponse.ok) {
        const mpData = await mpResponse.json();
        mpStatus = mpData.status || null;
      }
    } catch (fetchErr) {
      console.warn('[MercadoPago] No se pudo consultar estado en tiempo real:', fetchErr.message);
    }

    return res.json({
      success: true,
      estado: pedido.estado,
      mp_status: mpStatus,
      pedido: {
        id: pedido.id,
        external_reference: pedido.external_reference,
        mp_order_id: pedido.mp_order_id,
        total: pedido.total,
        items: pedido.items,
        estado: pedido.estado,
        created_at: pedido.created_at,
        paid_at: pedido.paid_at
      }
    });

  } catch (error) {
    console.error('[Error en GET /api/estado-pago-qr]:', error);
    return res.status(500).json({ success: false, error: 'Error interno al consultar el estado del pago.' });
  }
});

// ── Webhook de Mercado Pago ─────────────────────────────────────────────────

/**
 * Valida la firma HMAC-SHA256 del webhook de Mercado Pago.
 *
 * El header x-signature tiene el formato: ts=<timestamp>,v1=<hash>
 * El template firmado es: id:{data.id};request-id:{x-request-id};ts:{ts};
 *
 * @param {object} headers  - Cabeceras HTTP de la petición
 * @param {string} dataId   - ID del recurso (req.query['data.id'] o body.data?.id)
 * @param {string} secret   - MP_WEBHOOK_SECRET
 * @returns {boolean}
 */
function validarFirmaWebhook(headers, dataId, secret) {
  try {
    const xSignature = headers['x-signature'] || '';
    const xRequestId = headers['x-request-id'] || '';

    // Extraer ts y v1 del header x-signature
    let ts = '';
    let v1 = '';
    for (const part of xSignature.split(',')) {
      const [key, val] = part.split('=');
      if (key === 'ts') ts = val;
      if (key === 'v1') v1 = val;
    }

    if (!ts || !v1) return false;

    // Construir el manifest según la doc oficial
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

    // Calcular HMAC-SHA256 y comparar con timing-safe
    const expected = crypto
      .createHmac('sha256', secret)
      .update(manifest)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(v1, 'utf8')
    );
  } catch {
    return false;
  }
}

/**
 * POST /api/webhook-mercadopago
 *
 * Mercado Pago llama a esta URL cuando cambia el estado de un pago/orden.
 * Configurá esta URL en:
 * https://www.mercadopago.com.ar/developers/panel/notifications/webhooks
 *
 * Flujo:
 * 1. Validar firma HMAC (401 si falla).
 * 2. Responder 200 rápido (MP reintenta si no recibe 200 en ~2s).
 * 3. Procesar en background: consultar MP, verificar monto, actualizar DB.
 */
app.post('/api/webhook-mercadopago', async (req, res) => {
  try {
    // El body llegó como Buffer (express.raw) — parsearlo
    let body;
    try {
      body = JSON.parse(req.body.toString('utf8'));
    } catch {
      body = {};
    }

    // Identificar el ID del recurso notificado
    const dataId = (req.query && req.query['data.id']) || body?.data?.id || '';

    // Validar firma HMAC si el secret está configurado
    const webhookSecret = process.env.MP_WEBHOOK_SECRET;
    if (webhookSecret) {
      const firmaValida = validarFirmaWebhook(req.headers, String(dataId), webhookSecret);
      if (!firmaValida) {
        console.warn('[Webhook MP] ⚠️ Firma inválida rechazada.');
        return res.status(401).json({ success: false, error: 'Firma inválida.' });
      }
    } else {
      console.warn('[Webhook MP] MP_WEBHOOK_SECRET no configurado — validación de firma omitida.');
    }

    console.log('[Webhook MP] Notificación recibida. tipo:', body.type, '| id:', dataId);

    // Responder 200 rápido para que MP no reintente
    res.sendStatus(200);

    // ── Procesamiento asíncrono en background ─────────────────────────────
    // No bloqueamos la respuesta HTTP.
    setImmediate(async () => {
      try {
        // Solo nos interesan eventos de tipo "order" o "payment"
        if (!['order', 'payment', 'merchant_order'].includes(body.type)) return;

        // Si no tenemos dataId, no podemos procesar
        if (!dataId || !process.env.MP_ACCESS_TOKEN) return;

        // Consultar la orden a MP
        const mpResponse = await fetch(`https://api.mercadopago.com/v1/orders/${dataId}`, {
          headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` }
        });

        if (!mpResponse.ok) {
          console.error('[Webhook MP] No se pudo consultar la orden a MP:', await mpResponse.text());
          return;
        }

        const orden = await mpResponse.json();

        // Buscar el pedido en la DB por external_reference
        const { rows } = await pool.query(
          'SELECT * FROM pedidos WHERE external_reference = $1 OR mp_order_id = $2',
          [orden.external_reference || '', String(dataId)]
        );

        if (rows.length === 0) {
          console.warn('[Webhook MP] Pedido no encontrado en DB. order_id:', dataId);
          return;
        }

        const pedido = rows[0];

        // Idempotencia: si ya está en estado final, no hacer nada
        if (pedido.estado === 'pagado' || pedido.estado === 'cancelado') {
          console.log(`[Webhook MP] Pedido ${pedido.id} ya en estado final: ${pedido.estado}. Ignorado.`);
          return;
        }

        // Verificar monto: el total de MP debe coincidir con el de la DB
        const totalMP = Number(orden.total_amount);
        const totalDB = Number(pedido.total);
        if (Math.abs(totalMP - totalDB) > 0.01) {
          console.error(
            `[Webhook MP] ⚠️ Discrepancia de monto en pedido ${pedido.id}: ` +
            `MP=${totalMP}, DB=${totalDB}. No se actualiza el estado.`
          );
          return;
        }

        // Determinar nuevo estado según el estado de MP
        // Estados MP: "pending" → pendiente | "processed"/"closed" → pagado | "expired"/"cancelled" → cancelado
        let nuevoEstado = null;
        if (['processed', 'closed', 'paid'].includes(orden.status)) {
          nuevoEstado = 'pagado';
        } else if (['expired', 'cancelled', 'canceled'].includes(orden.status)) {
          nuevoEstado = 'cancelado';
        }

        if (!nuevoEstado) {
          console.log(`[Webhook MP] Estado de MP "${orden.status}" no requiere acción.`);
          return;
        }

        await pool.query(
          `UPDATE pedidos
           SET estado = $1, paid_at = $2
           WHERE id = $3`,
          [
            nuevoEstado,
            nuevoEstado === 'pagado' ? new Date() : null,
            pedido.id
          ]
        );

        console.log(`[Webhook MP] ✅ Pedido ${pedido.id} actualizado a "${nuevoEstado}".`);
      } catch (bgErr) {
        console.error('[Webhook MP] Error en procesamiento background:', bgErr);
      }
    });

  } catch (error) {
    console.error('[Error en webhook Mercado Pago]:', error);
    res.sendStatus(500);
  }
});

// ============================================================================
// 6. INICIO DEL SERVIDOR
// ============================================================================
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🍰 Pastelería Dulces Momentos - Backend API`);
  console.log(`🚀 Servidor ejecutándose en puerto: ${PORT}`);
  console.log(`🔑 Endpoint Login (2FA): POST /api/login`);
  console.log(`📝 Endpoint Register (2FA): POST /api/register`);
  console.log(`🛡️ Endpoint Verify 2FA: POST /api/verify-code`);
  console.log(`🌐 Endpoint Google Auth: POST /api/auth/google`);
  console.log(`💳 Endpoint Mercado Pago (Checkout Pro): POST /api/crear-preferencia`);
  console.log(`📱 Endpoint Mercado Pago (QR): POST /api/crear-pago-qr`);
  console.log(`🔍 Endpoint Estado Pago QR: GET /api/estado-pago-qr/:orderId`);
  console.log(`🔔 Webhook Mercado Pago: POST /api/webhook-mercadopago`);
  console.log(`======================================================\n`);
});

module.exports = app;
