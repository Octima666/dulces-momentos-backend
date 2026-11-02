# 📱 Snippet Frontend — Pago con QR Dinámico

> Integrá este snippet en el frontend de Dulces Momentos (`index.html` / `app.js`).
> Requiere que el usuario esté autenticado (JWT en `localStorage`).

---

## HTML — Botón y Modal

```html
<!-- ── Botón para abrir el modal de pago QR ── -->
<button id="btn-pagar-qr" class="btn-primary">
  📱 Pagar con QR
</button>

<!-- ── Modal de QR ── -->
<div id="modal-qr" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="modal-qr-title">
  <div class="modal-content">
    <button id="btn-cerrar-qr" class="modal-close" aria-label="Cerrar">&times;</button>

    <h2 id="modal-qr-title">Escaneá para pagar</h2>

    <!-- Imagen del QR generada por el backend -->
    <div id="qr-container">
      <img id="qr-imagen" src="" alt="Código QR de pago" width="260" height="260" />
    </div>

    <!-- Monto total -->
    <p id="qr-total" class="qr-monto"></p>

    <!-- Cuenta regresiva (30 minutos) -->
    <p id="qr-countdown" class="qr-countdown">Expira en: <span id="qr-timer">30:00</span></p>

    <!-- Estado en tiempo real -->
    <p id="qr-estado" class="qr-estado">Esperando pago...</p>

    <button id="btn-cancelar-qr" class="btn-secondary">Cancelar</button>
  </div>
</div>
```

---

## JavaScript — Lógica completa

```javascript
/**
 * PAGO CON QR DINÁMICO — Dulces Momentos
 * ─────────────────────────────────────────────────────────────────────────────
 * Requiere:
 *   - Usuario autenticado con JWT en localStorage ('token').
 *   - Backend con los endpoints /api/crear-pago-qr y /api/estado-pago-qr/:orderId.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const API_BASE = 'https://dulces-momentos-backend.onrender.com'; // ajustá según entorno
const EXPIRACION_MS = 30 * 60 * 1000;   // 30 minutos en ms
const POLLING_INTERVALO_MS = 4000;       // polling cada 4 segundos

let pollingTimer = null;
let cuentaRegresivaTimer = null;
let ordenActivaId = null;

// ── Referencias al DOM ───────────────────────────────────────────────────────
const btnPagarQR     = document.getElementById('btn-pagar-qr');
const modalQR        = document.getElementById('modal-qr');
const btnCerrarQR    = document.getElementById('btn-cerrar-qr');
const btnCancelarQR  = document.getElementById('btn-cancelar-qr');
const qrImagen       = document.getElementById('qr-imagen');
const qrTotal        = document.getElementById('qr-total');
const qrTimer        = document.getElementById('qr-timer');
const qrEstado       = document.getElementById('qr-estado');

// ── Abrir modal ──────────────────────────────────────────────────────────────
btnPagarQR.addEventListener('click', async () => {
  const token = localStorage.getItem('token');
  if (!token) {
    alert('Debés iniciar sesión para pagar.');
    return;
  }

  // Armá el carrito según tu implementación. Ejemplo genérico:
  const items = obtenerCarritoComoItems(); // [{ producto_id, cantidad }]

  if (!items || items.length === 0) {
    alert('El carrito está vacío.');
    return;
  }

  try {
    btnPagarQR.disabled = true;
    btnPagarQR.textContent = 'Generando QR...';

    const resp = await fetch(`${API_BASE}/api/crear-pago-qr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ items })
    });

    const data = await resp.json();

    if (!data.success) {
      alert('No se pudo generar el QR: ' + (data.error || 'Error desconocido'));
      return;
    }

    // Mostrar el QR
    ordenActivaId = data.order_id;
    qrImagen.src = data.qr_image;
    qrTotal.textContent = `Total: $${Number(data.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
    qrEstado.textContent = 'Esperando pago...';

    abrirModal();
    iniciarCuentaRegresiva();
    iniciarPolling(data.order_id, token);

  } catch (err) {
    console.error('[QR] Error al crear el pago:', err);
    alert('Ocurrió un error al generar el QR. Intentá de nuevo.');
  } finally {
    btnPagarQR.disabled = false;
    btnPagarQR.textContent = '📱 Pagar con QR';
  }
});

// ── Cerrar / cancelar ────────────────────────────────────────────────────────
btnCerrarQR.addEventListener('click', cerrarModal);
btnCancelarQR.addEventListener('click', cerrarModal);

// Cerrar al hacer click fuera del contenido
modalQR.addEventListener('click', (e) => {
  if (e.target === modalQR) cerrarModal();
});

// Cerrar con Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modalQR.classList.contains('hidden')) cerrarModal();
});

// ── Funciones auxiliares ─────────────────────────────────────────────────────

function abrirModal() {
  modalQR.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function cerrarModal() {
  modalQR.classList.add('hidden');
  document.body.style.overflow = '';
  detenerPolling();
  detenerCuentaRegresiva();
  ordenActivaId = null;
  qrImagen.src = '';
}

/**
 * Cuenta regresiva de 30 minutos.
 * Al llegar a 0 cierra el modal con un mensaje.
 */
function iniciarCuentaRegresiva() {
  detenerCuentaRegresiva();
  const fin = Date.now() + EXPIRACION_MS;

  cuentaRegresivaTimer = setInterval(() => {
    const restante = fin - Date.now();

    if (restante <= 0) {
      clearInterval(cuentaRegresivaTimer);
      qrTimer.textContent = '00:00';
      qrEstado.textContent = '⏰ El QR expiró. Generá uno nuevo.';
      detenerPolling();
      return;
    }

    const min = Math.floor(restante / 60000);
    const seg = Math.floor((restante % 60000) / 1000);
    qrTimer.textContent = `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
  }, 1000);
}

function detenerCuentaRegresiva() {
  if (cuentaRegresivaTimer) {
    clearInterval(cuentaRegresivaTimer);
    cuentaRegresivaTimer = null;
  }
}

/**
 * Polling cada 4 s para consultar el estado de la orden en el backend.
 * Para cuando recibe "pagado" o "cancelado".
 */
function iniciarPolling(orderId, token) {
  detenerPolling();

  pollingTimer = setInterval(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/estado-pago-qr/${orderId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!resp.ok) return; // silencioso; reintenta en 4 s

      const data = await resp.json();
      if (!data.success) return;

      const estado = data.estado; // 'pendiente' | 'pagado' | 'cancelado'

      if (estado === 'pagado') {
        detenerPolling();
        detenerCuentaRegresiva();
        qrEstado.textContent = '✅ ¡Pago confirmado! Gracias por tu compra.';
        // Opcional: redirigir, actualizar carrito, etc.
        setTimeout(() => {
          cerrarModal();
          onPagoConfirmado(); // implementá esta función según tu app
        }, 3000);

      } else if (estado === 'cancelado') {
        detenerPolling();
        detenerCuentaRegresiva();
        qrEstado.textContent = '❌ La orden fue cancelada.';
        setTimeout(cerrarModal, 3000);
      }

    } catch (err) {
      // Silencioso: el polling reintenta automáticamente
      console.warn('[QR Polling] Error de red:', err.message);
    }
  }, POLLING_INTERVALO_MS);
}

function detenerPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

/**
 * Callback ejecutado cuando el pago se confirma exitosamente.
 * Adaptá esto a tu lógica de negocio (vaciar carrito, mostrar confirmación, etc.).
 */
function onPagoConfirmado() {
  console.log('[QR] 🎉 Pago confirmado. Actualizando estado de la app...');
  // Ejemplo: limpiarCarrito(); mostrarMensajeExito();
}

/**
 * Devuelve el carrito actual en el formato que espera el backend.
 * Adaptá esta función a tu implementación del carrito.
 *
 * @returns {Array<{ producto_id: number, cantidad: number }>}
 */
function obtenerCarritoComoItems() {
  // Ejemplo: leer de una variable global, localStorage, etc.
  // return carrito.map(item => ({ producto_id: item.id, cantidad: item.cantidad }));
  return [];
}
```

---

## CSS sugerido (Tailwind equivalente en clases)

```css
/* Variables básicas — adaptá al tema de Dulces Momentos */
.modal {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.75);
  display: flex; align-items: center; justify-content: center;
  z-index: 9999;
}
.modal.hidden { display: none; }

.modal-content {
  background: #181317;
  border: 1px solid #2a1e27;
  border-radius: 1rem;
  padding: 2rem;
  text-align: center;
  max-width: 360px;
  width: 90%;
  color: #fff;
}

.modal-close {
  position: absolute; top: 1rem; right: 1rem;
  background: none; border: none;
  font-size: 1.5rem; cursor: pointer; color: #aaa;
}

#qr-imagen { border-radius: 0.5rem; margin: 1rem auto; display: block; }

.qr-monto  { font-size: 1.25rem; font-weight: bold; color: #d63384; }
.qr-countdown { color: #aaa; font-size: 0.9rem; }
.qr-estado { margin-top: 0.75rem; font-size: 1rem; }
```

---

> **Nota:** El QR expira en 30 minutos (configurable en el backend con `expiration_time: "PT30M"`).
> Si el usuario no pagó en ese tiempo, simplemente hacé clic en "Cancelar" y generá un nuevo QR.

