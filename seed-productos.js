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
  {
    id: 1,
    nombre: 'Tarta Frutos del Bosque',
    categoria: 'Tortas',
    precio: 14500,
    descripcion: 'Masa sableé crocante rellena de suave crema pastelera artesanal y decorada con frutos rojos.',
    imagen: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=700&q=85',
    badge: 'MÁS VENDIDO',
    tags: ['tarta', 'torta', 'frutos rojos', 'frutos del bosque', 'frutilla', 'arandanos', 'pastel'],
    tipo: 'producto',
    toppings_ids: [101, 102]
  },
  {
    id: 2,
    nombre: 'Cheesecake New York Clásico',
    categoria: 'Postres',
    precio: 15800,
    descripcion: 'Textura ultra cremosa homemade a base de Mafá con base de galletas Graham y coulis de frutos silvestres.',
    imagen: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=700&q=85',
    badge: 'FAVORITO',
    tags: ['cheesecake', 'cheese', 'tarta de queso', 'torta de queso', 'postre'],
    tipo: 'producto',
    toppings_ids: [103, 104]
  },
  {
    id: 3,
    nombre: 'Tarta Húmeda de Chocolate Belga',
    categoria: 'Tortas',
    precio: 16200,
    descripcion: 'Intensa bizcocho de cacao 70% con ganache de chocolate semi amargo y un toque de café espresso.',
    imagen: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=700&q=85',
    badge: 'GOURMET',
    tags: ['torta', 'tarta', 'chocolate', 'belga', 'cacao', 'dulce de leche', 'pastel'],
    tipo: 'producto',
    toppings_ids: [105, 106]
  },
  {
    id: 4,
    nombre: 'Macarons Artesanales',
    categoria: 'Especialidades',
    precio: 12000,
    descripcion: 'Suaves, crujientes y rellenos de ganache de sabores unicos.',
    imagen: 'https://images.unsplash.com/photo-1569864358642-9d1684040f43?auto=format&fit=crop&w=700&q=85',
    badge: 'ESPECIAL',
    tags: ['macaron', 'macarons', 'dulce', 'merengue', 'especialidad'],
    tipo: 'producto',
    toppings_ids: [107]
  },
  {
    id: 5,
    nombre: 'Croissant Francés con Almendras',
    categoria: 'Masas',
    precio: 6500,
    descripcion: 'Hojaldre artesanal 100% manteca con crema de almendras tostadas y azúcar impalpable.',
    imagen: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=700&q=85',
    badge: 'ARTESANAL',
    tags: ['croissant', 'medialuna', 'masas', 'panaderia', 'almendras', 'factura'],
    tipo: 'producto',
    toppings_ids: [108]
  },
  {
    id: 6,
    nombre: 'Box Degustación Fiesta',
    categoria: 'Promociones',
    precio: 22000,
    descripcion: 'Surtido exclusivo de 2 porciones de torta, 4 macarons y 2 mini postres para compartir.',
    imagen: 'https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=700&q=85',
    badge: 'PROMO DULCE',
    tags: ['box', 'caja', 'degustacion', 'fiesta', 'promo', 'promocion', 'combo', 'surtido', 'regalo'],
    tipo: 'producto',
    toppings_ids: [109]
  },
  { id: 101, nombre: 'Extra: Arándanos Frescos', precio: 1200, categoria: 'Toppings', descripcion: null, imagen: null, badge: null, tags: [], tipo: 'topping', toppings_ids: [] },
  { id: 102, nombre: 'Extra: Rulos de Chocolate Blanco Belga', precio: 900, categoria: 'Toppings', descripcion: null, imagen: null, badge: null, tags: [], tipo: 'topping', toppings_ids: [] },
  { id: 103, nombre: 'Extra: Salsa Reducción de Maracuyá', precio: 1500, categoria: 'Toppings', descripcion: null, imagen: null, badge: null, tags: [], tipo: 'topping', toppings_ids: [] },
  { id: 104, nombre: 'Extra: Frutillas maceradas', precio: 1100, categoria: 'Toppings', descripcion: null, imagen: null, badge: null, tags: [], tipo: 'topping', toppings_ids: [] },
  { id: 105, nombre: 'Extra: Praliné de Avellanas Tostadas', precio: 1400, categoria: 'Toppings', descripcion: null, imagen: null, badge: null, tags: [], tipo: 'topping', toppings_ids: [] },
  { id: 106, nombre: 'Extra: Corazón de Dulce de Leche Repostero', precio: 1000, categoria: 'Toppings', descripcion: null, imagen: null, badge: null, tags: [], tipo: 'topping', toppings_ids: [] },
  { id: 107, nombre: 'Extra: Packaging de Regalo + Moño de Seda', precio: 800, categoria: 'Toppings', descripcion: null, imagen: null, badge: null, tags: [], tipo: 'topping', toppings_ids: [] },
  { id: 108, nombre: 'Extra: Baño de Chocolate Belga', precio: 700, categoria: 'Toppings', descripcion: null, imagen: null, badge: null, tags: [], tipo: 'topping', toppings_ids: [] },
  { id: 109, nombre: 'Extra: Tarjeta de Felicitaciones Artesanal', precio: 500, categoria: 'Toppings', descripcion: null, imagen: null, badge: null, tags: [], tipo: 'topping', toppings_ids: [] }
];

async function seed() {
  try {
    console.log('[Seed] Iniciando carga de productos en la base de datos...');

    for (const prod of PRODUCTOS) {
      await pool.query(
        `INSERT INTO productos (id, nombre, precio, categoria, descripcion, imagen, badge, tags, tipo, toppings_ids, activo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
         ON CONFLICT (id) DO UPDATE
         SET nombre       = COALESCE(productos.nombre, EXCLUDED.nombre),
             precio       = COALESCE(productos.precio, EXCLUDED.precio),
             categoria    = COALESCE(productos.categoria, EXCLUDED.categoria),
             descripcion  = COALESCE(productos.descripcion, EXCLUDED.descripcion),
             imagen       = COALESCE(productos.imagen, EXCLUDED.imagen),
             badge        = COALESCE(productos.badge, EXCLUDED.badge),
             tags         = COALESCE(productos.tags, EXCLUDED.tags),
             tipo         = COALESCE(productos.tipo, EXCLUDED.tipo),
             toppings_ids = COALESCE(productos.toppings_ids, EXCLUDED.toppings_ids),
             activo       = COALESCE(productos.activo, EXCLUDED.activo)`,
        [
          prod.id,
          prod.nombre,
          prod.precio,
          prod.categoria || null,
          prod.descripcion || null,
          prod.imagen || null,
          prod.badge || null,
          JSON.stringify(prod.tags || []),
          prod.tipo || 'producto',
          JSON.stringify(prod.toppings_ids || [])
        ]
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
