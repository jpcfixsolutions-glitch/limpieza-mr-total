// Catálogos exclusivos del Galpón. Sin copia ni modificación de stock existente.
export const warehouseStockOptionsMigration = {
  id: '20261114_022_warehouse_stock_options',
  statements: [
    `CREATE TABLE warehouse_stock_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_unit_id INTEGER NOT NULL REFERENCES business_units(id) ON DELETE RESTRICT,
      type TEXT NOT NULL CHECK(type IN ('category','container-type')),
      name TEXT NOT NULL, name_key TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      version INTEGER NOT NULL DEFAULT 0,
      UNIQUE(business_unit_id,type,name_key)
    )`,
    `CREATE TABLE warehouse_stock_options_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      option_id INTEGER NOT NULL REFERENCES warehouse_stock_options(id) ON DELETE RESTRICT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      before_json TEXT NOT NULL, after_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  ],
};
