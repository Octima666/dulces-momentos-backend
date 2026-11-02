# 📱 Snippet Frontend — Pago con QR Dinámico

> Guía de integración oficial para el frontend de Pastelería Dulces Momentos (`index.html` / `app.js`).
> Requiere que el usuario esté autenticado con JWT Bearer (`localStorage.getItem('token')`).

---

## 1. Mapa de IDs Numéricos

La base de datos PostgreSQL (`productos`) maneja identificadores numéricos. Si el sitio utiliza slugs o strings (como `'prod-001'`), se utiliza este mapeo explícito:

```javascript
const MAPA_PRODUCTO_IDS = {
  'prod-001': 1, // Tarta Frutos del Bosque
  'prod-002': 2, // Cheesecake New York Clásico
  'prod-003': 3, // Tarta Húmeda de Chocolate Belga
  'prod-004': 4, // Macarons Artesanales
  'prod-005': 5, // Croissant Francés con Almendras
  'prod-006': 6  // Box Degustación Fiesta
};
```

---

## 2. HTML — Recuadro de QR

```html
<!-- Contenedor del QR de Mercado Pago -->
<div id="seccion-qr" class="p-4 rounded-2xl bg-[#1c1619] border border-brand-500/30 space-y-3.5">
  
  <!-- Estado Cargando -->
  <div id="qr-estado-cargando" class="flex flex-col items-center justify-center gap-2 py-8 text-center">
    <div class="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
    <span class="text-xs text-stone-400 font-medium">Generando código QR de pago...</span>
  </div>

  <!-- Estado Esperando Pago (QR Listo) -->
  <div id="qr-estado-esperando" class="hidden flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
    <div class="bg-white p-2 rounded-2xl shrink-0 flex items-center justify-center">
      <img id="qr-imagen-dinamica" src="" alt="Código QR Mercado Pago" class="w-36 h-36 sm:w-40 sm:h-40 rounded-xl object-contain">
    </div>

    <div class="flex-1 space-y-2 text-xs text-stone-200 w-full">
      <div class="flex items-center justify-between pb-1 border-b border-[#352331]">
        <span class="font-bold text-sm text-white flex items-center gap-1.5">
          <span>🏦</span> Escaneá para pagar
        </span>
        <span id="qr-cuenta-regresiva" class="text-xs font-mono font-bold text-pink-400 bg-brand-950 px-2 py-0.5 rounded border border-brand-800">30:00</span>
      </div>
      <p class="text-stone-400 text-[11px] leading-relaxed pt-1">
        Escaneá este código desde la app de Mercado Pago para pagar
        <span id="qr-monto-texto" class="font-bold text-brand-400">$ 0</span>.
      </p>
      <div class="flex items-center gap-2 pt-1 text-amber-400 font-semibold">
        <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
        <span id="qr-estado-texto">⏳ Esperando confirmación de pago...</span>
      </div>
    </div>
  </div>

  <!-- Estado Pago Confirmado -->
  <div id="qr-estado-confirmado" class="hidden flex items-center gap-3 py-5 justify-center text-center">
    <span class="text-2xl">✅</span>
    <span id="qr-confirmado-mensaje" class="text-sm font-bold text-emerald-400">¡Pago recibido! Ya podés enviar tu pedido.</span>
  </div>

  <!-- Estado Error / Expirado -->
  <div id="qr-estado-error" class="hidden flex-col items-center gap-2 py-5 text-center">
    <!-- Nunca vacío: muestra data.error o 'El QR venció' -->
    <span id="qr-error-mensaje" class="text-sm font-bold text-red-400">No pudimos generar o confirmar el QR de pago.</span>
    <button type="button" id="btn-reintentar-qr" class="text-xs font-bold text-brand-400 hover:underline">
      🔄 Generar un nuevo QR
    </button>
  </div>

</div>
```

---

## 3. JavaScript Completo (`app.js`)

```javascript
const API_BASE_URL = 'https://dulces-momentos-backend.onrender.com';
const MAPA_PRODUCTO_IDS = {
  'prod-001': 1,
  'prod-002': 2,
  'prod-003': 3,
  'prod-004': 4,
  'prod-005': 5,
  'prod-006': 6
};

let pollingTimer = null;
let timerCuentaRegresiva = null;

const detenerTimerQr = () => {
  if (timerCuentaRegresiva) {
    clearInterval(timerCuentaRegresiva);
    timerCuentaRegresiva = null;
  }
};

const detenerPollingPagoQr = () => {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
};

const mostrarEstadoQr = (idVisible) => {
  ['qr-estado-cargando', 'qr-estado-esperando', 'qr-estado-confirmado', 'qr-estado-error'].forEach((id) => {
    document.getElementById(id)?.classList.toggle('hidden', id !== idVisible);
  });
};

const mostrarErrorEnRecuadro = (mensaje) => {
  const errorEl = document.getElementById('qr-error-mensaje');
  if (errorEl) {
    errorEl.textContent = mensaje || 'No pudimos generar o confirmar el QR de pago.';
  }
  mostrarEstadoQr('qr-estado-error');
};

const iniciarCuentaRegresivaQr = (segundosTotales = 1800) => {
  detenerTimerQr();
  let restantes = segundosTotales;

  const actualizarUI = () => {
    const min = Math.floor(restantes / 60);
    const seg = restantes % 60;
    const txt = `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
    const el = document.getElementById('qr-cuenta-regresiva');
    if (el) el.textContent = txt;
  };

  actualizarUI();

  timerCuentaRegresiva = setInterval(() => {
    restantes -= 1;
    if (restantes <= 0) {
      detenerTimerQr();
      detenerPollingPagoQr();
      mostrarErrorEnRecuadro('El QR venció');
      return;
    }
    actualizarUI();
  }, 1000);
};

const iniciarPollingPagoQr = (orderId, token) => {
  detenerPollingPagoQr();

  pollingTimer = setInterval(async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/estado-pago-qr/${orderId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await resp.json();
      if (!resp.ok) return;

      // El backend devuelve { success: true, estado: 'pendiente' | 'pagado' | 'cancelado' }
      if (data.estado === 'pagado') {
        detenerPollingPagoQr();
        detenerTimerQr();
        const confMsg = document.getElementById('qr-confirmado-mensaje');
        if (confMsg) confMsg.textContent = '¡Pago recibido!';
        mostrarEstadoQr('qr-estado-confirmado');
      } else if (data.estado === 'cancelado') {
        detenerPollingPagoQr();
        detenerTimerQr();
        mostrarErrorEnRecuadro('El QR venció');
      }
    } catch (err) {
      console.warn('[Polling QR] Error de red:', err.message);
    }
  }, 4000);
};

const generarPagoQr = async () => {
  const token = localStorage.getItem('dulces_momentos_auth_token_v2') || localStorage.getItem('token');
  if (!token) {
    alert('Debés iniciar sesión para pagar.');
    return;
  }

  // Mapear items del carrito a producto_id numérico de la base de datos
  const items = carrito.map(item => ({
    producto_id: MAPA_PRODUCTO_IDS[item.id] || Number(item.producto_id || item.id),
    cantidad: Number(item.cantidad)
  }));

  const esDelivery = tipoEntrega === 'delivery';

  mostrarEstadoQr('qr-estado-cargando');

  try {
    const resp = await fetch(`${API_BASE_URL}/api/crear-pago-qr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        items,
        delivery: esDelivery
      })
    });

    const data = await resp.json();

    // Si la respuesta no es ok, nunca dejamos el recuadro vacío
    if (!resp.ok || !data.success) {
      const motivo = data.error || 'No se pudo generar el código QR de pago.';
      mostrarErrorEnRecuadro(motivo);
      return;
    }

    // Renderizar imagen del QR y total
    const imgQr = document.getElementById('qr-imagen-dinamica');
    const montoTexto = document.getElementById('qr-monto-texto');
    if (imgQr) imgQr.src = data.qr_image;
    if (montoTexto) montoTexto.textContent = `$ ${Number(data.total).toLocaleString('es-AR')}`;

    mostrarEstadoQr('qr-estado-esperando');
    iniciarCuentaRegresivaQr(1800); // 30 minutos
    iniciarPollingPagoQr(data.order_id, token);

  } catch (err) {
    mostrarErrorEnRecuadro(err.message || 'Error de conexión con el servidor.');
  }
};
```
