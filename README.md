# 🍰 Dulces Momentos - Backend API

Servidor backend robusto y escalable para la pastelería boutique **Dulces Momentos**, desarrollado con **Node.js**, **Express**, base de datos relacional serverless **PostgreSQL (Neon Tech)**, autenticación 2FA mediante **Nodemailer** y pasarela de pagos con **Mercado Pago SDK v2**.

---

## 🚀 Tecnologías Principales

- **Runtime:** Node.js (v18+)
- **Framework Web:** Express.js
- **Base de Datos:** PostgreSQL en [Neon Tech](https://neon.tech)
- **Driver DB:** `pg` (Pool de conexiones con SSL)
- **Correos Electrónicos:** Nodemailer (Plantilla HTML personalizada con estética oscura y rosa neón)
- **Autenticación:** Sistema de seguridad de doble factor (2FA) con PIN de 6 dígitos
- **Seguridad:** Encriptación de contraseñas con BcryptJS y tokens de sesión JWT
- **Pasarela de Pagos:** Mercado Pago SDK v2 (Oficial)
- **CORS:** Configuración segura de orígenes cruzados

---

## 📋 Variables de Entorno (`.env`)

Crea un archivo `.env` en la raíz del proyecto basándote en `.env.example`:

```env
PORT=3000

# Conexión a Neon PostgreSQL
DATABASE_URL=postgresql://usuario:password@host.neon.tech/neondb?sslmode=require&channel_binding=require

# Configuración de Nodemailer (Gmail)
EMAIL_USER=tu_correo@gmail.com
EMAIL_PASS=tu_contraseña_de_aplicacion

# Seguridad JWT
JWT_SECRET=tu_clave_secreta_jwt_aqui

# Mercado Pago SDK v2
MP_ACCESS_TOKEN=tu_access_token_aqui
```

---

## 🛠️ Instalación y Puesta en Marcha

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/Octima666/dulces-momentos-backend.git
   cd dulces-momentos-backend
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Iniciar el servidor en desarrollo:**
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
| `POST` | `/api/verify-code` | Valida el PIN de 6 dígitos (`expires_at > NOW()`), elimina el código usado y devuelve token de sesión. |

### Pagos y Sistema
| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/api/crear-preferencia` | Genera una preferencia de pago en Mercado Pago para el carrito de compras. |
| `GET` | `/api/health` | Estado del servidor y comprobación en vivo de la conexión con PostgreSQL. |

---

## 🛡️ Licencia

Distribuido bajo la licencia ISC. Proyecto desarrollado para **Pastelería Dulces Momentos** © 2026.
