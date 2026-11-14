// Exclusivamente aditiva: no lee, copia ni modifica inventarios existentes.
export async function verifyWarehouseLiquidsCompatibility(client) {
  const columns = await client.execute('PRAGMA table_info(warehouse_order_items)');
  const product = columns.rows.find(row => row.name === 'product_id');
  if (!product || Number(product.notnull) !== 0) throw new Error('Migración de líquidos detenida: warehouse_order_items.product_id debe admitir NULL. No se modificaron datos.');
  if (columns.rows.some(row => row.name === 'liquid_product_id')) throw new Error('Migración de líquidos detenida: existe liquid_product_id sin registro de migración. Revisar el esquema antes de continuar.');
}
export const warehouseLiquidsMigration = {
  id: '20261114_021_warehouse_liquids',
  statements: [
    `CREATE TABLE IF NOT EXISTS warehouse_liquid_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, barcode TEXT,
      category TEXT NOT NULL DEFAULT '', cost REAL NOT NULL DEFAULT 0 CHECK(cost >= 0),
      price REAL NOT NULL DEFAULT 0 CHECK(price >= 0), min_stock_ml INTEGER NOT NULL DEFAULT 0 CHECK(min_stock_ml >= 0),
      version INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS warehouse_liquid_barcode_unique ON warehouse_liquid_products(barcode) WHERE barcode IS NOT NULL`,
    `CREATE TABLE IF NOT EXISTS warehouse_liquid_containers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL REFERENCES warehouse_liquid_products(id) ON DELETE RESTRICT,
      kind TEXT NOT NULL, capacity_ml INTEGER NOT NULL CHECK(capacity_ml >= 0),
      count INTEGER NOT NULL CHECK(count > 0), content_ml INTEGER NOT NULL CHECK(content_ml >= 0),
      location TEXT NOT NULL CHECK(location IN ('WAREHOUSE','LOCAL')),
      CHECK((kind = 'Granel' AND capacity_ml = 0 AND count = 1) OR (capacity_ml > 0 AND content_ml <= capacity_ml * count)),
      CHECK(count = 1 OR content_ml = capacity_ml * count OR content_ml = 0)
    )`,
    `CREATE INDEX IF NOT EXISTS warehouse_liquid_containers_product ON warehouse_liquid_containers(product_id)`,
    `CREATE TABLE IF NOT EXISTS warehouse_liquid_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL REFERENCES warehouse_liquid_products(id) ON DELETE RESTRICT,
      user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT, operation TEXT NOT NULL,
      before_json TEXT NOT NULL, after_json TEXT NOT NULL, notes TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE, request_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `ALTER TABLE warehouse_order_items ADD COLUMN liquid_product_id INTEGER REFERENCES warehouse_liquid_products(id) ON DELETE RESTRICT`,
  ],
};
