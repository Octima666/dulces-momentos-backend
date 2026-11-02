/**
 * ============================================================================
 * SEED DE PRODUCTOS - Pastelería Dulces Momentos
 * Archivo: seed-productos.js
 * Inserta o actualiza el catálogo oficial de productos en PostgreSQL.
 * ============================================================================
 */

require('dotenv').config();
const pool = require('./db');

// Catálogo oficial sincronizado desde el frontend (DulcesMomentos/app.js)
const PRODUCTOS = [
  { id: 1, nombre: 'Tarta Frutos del Bosque', precio: 14500.00, activo: true },
  { id: 2, nombre: 'Cheesecake New York Clásico', precio: 15800.00, activo: true },
  { id: 3, nombre: 'Tarta Húmeda de Chocolate Belga', precio: 16200.00, activo: true },
  { id: 4, nombre: 'Macarons Artesanales', precio: 12000.00, activo: true },
  { id: 5, nombre: 'Croissant Francés con Almendras', precio: 6500.00, activo: true },
  { id: 6, nombre: 'Box Degustación Fiesta', precio: 22000.00, activo: true }
];

async function seed() {
  try {
    console.log('[Seed] Iniciando carga de productos en la base de datos...');

    for (const prod of PRODUCTOS) {
      await pool.query(
        `INSERT INTO productos (id, nombre, precio, activo)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
         SET nombre = EXCLUDED.nombre,
             precio = EXCLUDED.precio,
             activo = EXCLUDED.activo`,
        [prod.id, prod.nombre, prod.precio, prod.activo]
      );
    }

    // Ajustar la secuencia del serial al valor máximo de id
    await pool.query(
      "SELECT setval(pg_get_serial_sequence('productos', 'id'), (SELECT MAX(id) FROM productos))"
    );

    const { rows } = await pool.query('SELECT COUNT(*) AS total FROM productos WHERE activo = TRUE');
    console.log(`[Seed] ✅ Catálogo sincronizado con éxito. Productos activos: ${rows[0].total}`);
  } catch (error) {
    console.error('[Seed Error] Error al sembrar productos:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seed();

