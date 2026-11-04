/**
 * ============================================================================
 * SEED DE PRODUCTOS - Pastelería Dulces Momentos
 * Archivo: seed-productos.js
 * Inserta o actualiza el catálogo oficial de productos y extras en PostgreSQL.
 * ============================================================================
 */

require('dotenv').config();
const pool = require('./db');

const PRODUCTOS = [
  { id: 1, nombre: 'Tarta Frutos del Bosque', precio: 14500 },
  { id: 2, nombre: 'Cheesecake New York Clásico', precio: 15800 },
  { id: 3, nombre: 'Tarta Húmeda de Chocolate Belga', precio: 16200 },
  { id: 4, nombre: 'Macarons Artesanales', precio: 12000 },
  { id: 5, nombre: 'Croissant Francés con Almendras', precio: 6500 },
  { id: 6, nombre: 'Box Degustación Fiesta', precio: 22000 },
  { id: 101, nombre: 'Extra: Arándanos Frescos', precio: 1200 },
  { id: 102, nombre: 'Extra: Rulos de Chocolate Blanco Belga', precio: 900 },
  { id: 103, nombre: 'Extra: Salsa Reducción de Maracuyá', precio: 1500 },
  { id: 104, nombre: 'Extra: Frutillas maceradas', precio: 1100 },
  { id: 105, nombre: 'Extra: Praliné de Avellanas Tostadas', precio: 1400 },
  { id: 106, nombre: 'Extra: Corazón de Dulce de Leche Repostero', precio: 1000 },
  { id: 107, nombre: 'Extra: Packaging de Regalo + Moño de Seda', precio: 800 },
  { id: 108, nombre: 'Extra: Baño de Chocolate Belga', precio: 700 },
  { id: 109, nombre: 'Extra: Tarjeta de Felicitaciones Artesanal', precio: 500 }
];

async function seed() {
  try {
    console.log('[Seed] Iniciando carga de productos en la base de datos...');

    for (const prod of PRODUCTOS) {
      await pool.query(
        `INSERT INTO productos (id, nombre, precio, activo)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (id) DO UPDATE
         SET nombre = EXCLUDED.nombre,
             precio = EXCLUDED.precio,
             activo = TRUE`,
        [prod.id, prod.nombre, prod.precio]
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
