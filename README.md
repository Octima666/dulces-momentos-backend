# 🍰 Dulces Momentos - Backend API

Servidor backend robusto y escalable para la pastelería boutique **Dulces Momentos**, desarrollado con **Node.js 22**, **Express**, base de datos relacional serverless **PostgreSQL (Neon Tech)**, autenticación 2FA mediante **Nodemailer**, inicio de sesión con **Google Identity Services** y pasarela de pagos con **Mercado Pago SDK v2**.

---

## 🚀 Tecnologías Principales

- **Runtime:** Node.js **≥ 22** (requerido en `engines`)
- **Framework Web:** Express.js
- **Base de Datos:** PostgreSQL en [Neon Tech](https://neon.tech)
- **Driver DB:** `pg` (Pool de conexiones con SSL)
- **Correos Electrónicos:** Nodemailer (Plantilla HTML personalizada con estética oscura y rosa neón)
- **Autenticación:** Sistema de seguridad de doble factor (2FA) con PIN de 6 dígitos e inicio de sesión con Google (`google-auth-library`)
- **Seguridad:** Encriptación de contraseñas con BcryptJS y tokens de sesión JWT
- **Pasarela de Pagos:** Mercado Pago SDK v2 (Oficial)
- **CORS:** Configuración segura de orígenes cruzados

---

## 📋 Variables de Entorno (`.env`)

Crea un archivo `.env` en la raíz del proyecto basándote en `.env.example`:

```env
PORT=3000

# Conexión a Neon PostgreSQL
DATABASE_URL=postgresql://usuario:password@host.neon.tech/neondb?sslmode=require

# Configuración de Nodemailer (Gmail)
EMAIL_USER=tu_correo@gmail.com
EMAIL_PASS=tu_contrasena_de_aplicacion_google

# Seguridad JWT — OBLIGATORIO. El servidor NO arranca si falta.
# Generá una clave con: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=cambiar_por_clave_larga_aleatoria

# Mercado Pago SDK v2
MP_ACCESS_TOKEN=tu_access_token_aqui

# Google Identity Services (OAuth 2.0)
# Debe coincidir con el Client ID configurado en el frontend (app.js)
GOOGLE_CLIENT_ID=tu_google_client_id.apps.googleusercontent.com

# Administradores del sistema (coma-separado, case-insensitive)
# Estos correos reciben rol 'admin' en el JWT y acceso al panel de Cocina (KDS)
ADMIN_EMAILS=dulcesmomentos1112@gmail.com
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
| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/api/login` | Solicita acceso por email, genera PIN de 6 dígitos con expiración de 10 min y lo envía por correo. |
| `POST` | `/api/register` | Registra usuario nuevo en Neon y envía PIN de 6 dígitos para verificación de cuenta. |
| `POST` | `/api/verify-code` | Valida el PIN de 6 dígitos (`expires_at > NOW()`), elimina el código usado y devuelve token de sesión JWT con `rol`. |
| `POST` | `/api/auth/google` | Autentica con Google Identity Services (ID Token) y devuelve sesión JWT con `rol` sin requerir PIN. |
| `GET` | `/api/auth/me` | Valida el token JWT guardado en el frontend y devuelve los datos del usuario (incluye `rol`). |
| `POST` | `/api/auth/logout` | Cierra la sesión (invalidación del lado del cliente). |

### Admin
| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/api/admin/kds/verificar` | Verifica que el token JWT sea de un admin. Devuelve `{ success, user: { id, nombre, correo, rol: 'admin' } }`. Requiere `Authorization: Bearer <token>`. |

### Pagos y Sistema
| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/api/crear-preferencia` | Genera una preferencia de pago en Mercado Pago para el carrito de compras. |
| `POST` | `/api/crear-pago-qr` | Genera un QR dinámico de pago (API de Órdenes de Mercado Pago). |
| `GET` | `/api/estado-pago-qr/:orderId` | Consulta el estado de una orden de pago QR. |
| `GET` | `/api/health` | Estado del servidor y comprobación en vivo de la conexión con PostgreSQL. |

---

## 🛡️ Seguridad

- `JWT_SECRET` se lee **solo** desde variables de entorno. Si no está definida, el servidor termina con `process.exit(1)`.
- `GOOGLE_CLIENT_ID` se lee desde `process.env.GOOGLE_CLIENT_ID`. Si no está configurado, el endpoint `/api/auth/google` responde con 500 y un mensaje descriptivo.
- `ADMIN_EMAILS` define qué correos tienen acceso de administrador al panel KDS. Se configura desde `.env` (separado por comas). Valor por defecto: `dulcesmomentos1112@gmail.com`.
- El middleware `requireAdmin` responde 401 si falta/es inválido el token, y 403 si el correo no está en `ADMIN_EMAILS`.

---

## 🛡️ Licencia

Distribuido bajo la licencia ISC. Proyecto desarrollado para **Pastelería Dulces Momentos** © 2026.
