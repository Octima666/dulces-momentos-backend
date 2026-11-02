# 🍰 Dulces Momentos - Backend API

Servidor backend robusto y escalable para la pastelería boutique **Dulces Momentos**, desarrollado con **Node.js 22**, **Express**, base de datos relacional serverless **PostgreSQL (Neon Tech)**, autenticación 2FA mediante **Resend**, inicio de sesión con **Google Identity Services** y pasarela de pagos con **Mercado Pago SDK v2** (Checkout Pro + QR Dinámico).

---

## 🚀 Tecnologías Principales

- **Runtime:** Node.js **≥ 22** (requerido en `engines`)
- **Framework Web:** Express.js
- **Base de Datos:** PostgreSQL en [Neon Tech](https://neon.tech)
- **Driver DB:** `pg` (Pool de conexiones con SSL)
- **Correos Electrónicos:** [Resend](https://resend.com) (plantilla HTML personalizada con estética oscura y rosa neón)
- **Autenticación:** Sistema de seguridad de doble factor (2FA) con PIN de 6 dígitos e inicio de sesión con Google (`google-auth-library`)
- **Seguridad:** Encriptación de contraseñas con BcryptJS, tokens de sesión JWT y validación HMAC-SHA256 de webhooks de MP
- **Pasarela de Pagos:** Mercado Pago SDK v2 — Checkout Pro y **API de Órdenes (QR Dinámico)**
- **QR:** Generación de imagen PNG en base64 con la librería `qrcode`
- **CORS:** Orígenes permitidos configurables vía `ALLOWED_ORIGINS`

---

## 📋 Variables de Entorno (`.env`)

Crea un archivo `.env` en la raíz del proyecto basándote en `.env.example`:

```env
PORT=3000

# Conexión a Neon PostgreSQL
DATABASE_URL=postgresql://usuario:password@host.neon.tech/neondb?sslmode=require

# Seguridad JWT — OBLIGATORIO. El servidor NO arranca si falta.
# Generá una clave con: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=cambiar_por_clave_larga_aleatoria

# Correo electrónico (Resend — https://resend.com)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Google Identity Services (OAuth 2.0)
GOOGLE_CLIENT_ID=tu_google_client_id.apps.googleusercontent.com

# Administradores del sistema (coma-separado, case-insensitive)
ADMIN_EMAILS=dulcesmomentos1112@gmail.com

# Mercado Pago SDK v2
MP_ACCESS_TOKEN=tu_access_token_aqui

# QR Dinámico (API de Órdenes de MP)
MP_POS_EXTERNAL_ID=SUCURSAL01-CAJA01       # external_id de la caja en tu cuenta MP
MP_WEBHOOK_SECRET=tu_webhook_secret        # Clave de firma HMAC en el panel de MP

# CORS (coma-separado; si no está definida, permite *)
ALLOWED_ORIGINS=https://dulcesmomentos.com.ar,https://www.dulcesmomentos.com.ar
```

> ⚠️ **JWT_SECRET es obligatorio.** Si no está definido, el servidor hace `process.exit(1)` con un mensaje claro.

---

## 🛠️ Instalación y Puesta en Marcha

### Requisitos

- **Node.js ≥ 22** ([descargar](https://nodejs.org))
- Una base de datos PostgreSQL en [Neon Tech](https://neon.tech) (gratuita)

### Pasos

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/Octima666/dulces-momentos-backend.git
   cd dulces-momentos-backend
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno:**
   ```bash
   cp .env.example .env
   # Editá .env con tus valores reales
   ```

4. **Iniciar el servidor en desarrollo:**
   ```bash
   npm run dev
   ```
   O en producción:
   ```bash
   npm start
   ```

En desarrollo local, el servidor escucha en `http://localhost:3000`.
En producción, la API oficial en Render se encuentra activa en:
`https://dulces-momentos-backend.onrender.com`

---

## 📡 Endpoints de la API

### Autenticación y 2FA
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/login` | — | Solicita acceso por email, genera PIN de 6 dígitos con expiración de 10 min y lo envía por correo (Resend). |
| `POST` | `/api/register` | — | Registra usuario nuevo en Neon y envía PIN de 6 dígitos para verificación de cuenta. |
| `POST` | `/api/verify-code` | — | Valida el PIN de 6 dígitos (`expires_at > NOW()`), elimina el código usado y devuelve token de sesión JWT con `rol`. |
| `POST` | `/api/auth/google` | — | Autentica con Google Identity Services (ID Token) y devuelve sesión JWT con `rol` sin requerir PIN. |
| `GET` | `/api/auth/me` | JWT | Valida el token JWT guardado en el frontend y devuelve los datos del usuario (incluye `rol`). |
| `POST` | `/api/auth/logout` | — | Cierra la sesión (invalidación del lado del cliente). |

### Admin
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/admin/kds/verificar` | JWT (admin) | Verifica que el token JWT sea de un admin. Devuelve `{ success, user }`. |

### Pagos — Mercado Pago
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/crear-preferencia` | — | Genera una preferencia de pago (Checkout Pro) para el carrito de compras. |
| `POST` | `/api/crear-pago-qr` | JWT | Crea una orden de pago QR dinámico (API de Órdenes MP). Body: `{ items: [{ producto_id, cantidad }] }`. Precio y total SIEMPRE desde la DB. Responde `{ success, order_id, external_reference, total, qr_image }`. |
| `GET` | `/api/estado-pago-qr/:orderId` | JWT | Consulta el estado de una orden QR. Solo el dueño del pedido o un admin puede acceder. |
| `POST` | `/api/webhook-mercadopago` | HMAC | Recibe notificaciones de MP. Valida firma `x-signature` con HMAC-SHA256. Actualiza estado del pedido en DB (`pendiente → pagado/cancelado`). Idempotente. |

### Sistema
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/health` | — | Estado del servidor y comprobación en vivo de la conexión con PostgreSQL. |

---

## 🗄️ Esquema de Base de Datos

```sql
-- Códigos de verificación 2FA
CREATE TABLE verification_codes (
  id         SERIAL PRIMARY KEY,
  email      VARCHAR(255) NOT NULL,
  code       VARCHAR(10)  NOT NULL,
  expires_at TIMESTAMPTZ  NOT NULL,
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

-- Usuarios
CREATE TABLE usuarios (
  id            SERIAL PRIMARY KEY,
  nombre        VARCHAR(50)  NOT NULL,
  apellido      VARCHAR(50)  NOT NULL,
  correo        VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  google_id     VARCHAR(100) UNIQUE,
  rol           VARCHAR(20)  DEFAULT 'cliente',
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- Catálogo de productos
CREATE TABLE productos (
  id     SERIAL PRIMARY KEY,
  nombre VARCHAR(200)    NOT NULL,
  precio NUMERIC(12,2)   NOT NULL CHECK (precio >= 0),
  activo BOOLEAN         NOT NULL DEFAULT TRUE
);

-- Pedidos / órdenes de pago QR
CREATE TABLE pedidos (
  id                 SERIAL PRIMARY KEY,
  external_reference VARCHAR(100)  NOT NULL UNIQUE,  -- ID único generado por el backend
  mp_order_id        VARCHAR(100),                   -- ID de la orden en Mercado Pago
  total              NUMERIC(12,2) NOT NULL,
  items              JSONB         NOT NULL DEFAULT '[]',
  estado             VARCHAR(20)   NOT NULL DEFAULT 'pendiente'
                       CHECK (estado IN ('pendiente','pagado','cancelado')),
  usuario_id         INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  paid_at            TIMESTAMPTZ
);
```

> Las tablas se crean automáticamente con `CREATE TABLE IF NOT EXISTS` al iniciar el servidor.

---

## 🔔 Configuración del Webhook de Mercado Pago

1. Ir a [Developers Panel](https://www.mercadopago.com.ar/developers/panel) → Tu aplicación → **Webhooks**.
2. Registrar la URL: `https://tu-dominio.com/api/webhook-mercadopago`
3. Seleccionar el evento `order` (y/o `payment`).
4. Copiar el **Webhook Secret** que muestra el panel y agregarlo como `MP_WEBHOOK_SECRET` en `.env`.

El backend valida cada notificación con HMAC-SHA256 usando el template oficial:
```
id:{data.id};request-id:{x-request-id};ts:{ts};
```

---

## 📱 Frontend QR

El snippet de integración frontend (botón, modal, cuenta regresiva 30 min, polling cada 4 s) está disponible en:
`docs/frontend-qr.md`

---

## 🛡️ Seguridad

- `JWT_SECRET` se lee **solo** desde variables de entorno. Si no está definida, el servidor termina con `process.exit(1)`.
- `GOOGLE_CLIENT_ID` se lee desde `process.env.GOOGLE_CLIENT_ID`. Si no está configurado, el endpoint `/api/auth/google` responde con 500 y un mensaje descriptivo.
- `ADMIN_EMAILS` define qué correos tienen acceso de administrador al panel KDS. Se configura desde `.env` (separado por comas). Valor por defecto: `dulcesmomentos1112@gmail.com`.
- El middleware `requireAdmin` responde 401 si falta/es inválido el token, y 403 si el correo no está en `ADMIN_EMAILS`.
- El webhook valida la firma HMAC-SHA256 con `MP_WEBHOOK_SECRET`. Si el secret no está configurado, la validación se omite (con aviso en el log).
- El precio y el total del QR **siempre** se leen desde la DB; nunca se confía en datos enviados por el cliente.
- CORS limitado a los orígenes definidos en `ALLOWED_ORIGINS` (si no se define, se permite `*`).

---

## 🛡️ Licencia

Distribuido bajo la licencia ISC. Proyecto desarrollado para **Pastelería Dulces Momentos** © 2026.
