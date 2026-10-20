import { getTableColumns, getTableName } from "drizzle-orm";
import * as schema from "./schema.js";
import { client } from "./client.js";

const MIGRATIONS_TABLE = "app_migrations";

const migrations = [
  {
    id: "20261011_012_business_units_and_warehouse",
    statements: [
      `CREATE TABLE IF NOT EXISTS business_units (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      )`,
      `INSERT OR IGNORE INTO business_units (code, name, type, is_active)
       VALUES ('LOCAL', 'Local', 'retail', 1), ('WAREHOUSE', 'Galpón', 'warehouse', 1)`,
      `CREATE TABLE IF NOT EXISTS business_unit_products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_unit_id INTEGER NOT NULL REFERENCES business_units(id) ON DELETE RESTRICT,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
        min_stock INTEGER NOT NULL DEFAULT 0 CHECK(min_stock >= 0),
        cost REAL NOT NULL DEFAULT 0 CHECK(cost >= 0),
        sale_price REAL NOT NULL DEFAULT 0 CHECK(sale_price >= 0),
        is_available INTEGER NOT NULL DEFAULT 1,
        fulfillment_mode TEXT NOT NULL DEFAULT 'OWN_STOCK',
        updated_at TEXT DEFAULT (datetime('now','localtime')),
        UNIQUE(business_unit_id, product_id),
        CHECK(fulfillment_mode IN ('OWN_STOCK', 'WAREHOUSE_DIRECT'))
      )`,
      `INSERT OR IGNORE INTO business_unit_products
         (business_unit_id, product_id, stock, min_stock, cost, sale_price, is_available, fulfillment_mode)
       SELECT bu.id, p.id, p.stock, p.min_stock, p.cost, p.price, p.is_available, 'OWN_STOCK'
       FROM products p CROSS JOIN business_units bu WHERE bu.code = 'LOCAL'`,
      `CREATE TABLE IF NOT EXISTS inventory_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_unit_id INTEGER NOT NULL REFERENCES business_units(id) ON DELETE RESTRICT,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        movement_type TEXT NOT NULL,
        direction TEXT NOT NULL CHECK(direction IN ('IN', 'OUT')),
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        unit_cost REAL NOT NULL DEFAULT 0,
        stock_before INTEGER NOT NULL,
        stock_after INTEGER NOT NULL,
        counterpart_business_unit_id INTEGER REFERENCES business_units(id) ON DELETE SET NULL,
        source_type TEXT,
        source_id TEXT,
        source_item_id TEXT,
        idempotency_key TEXT NOT NULL UNIQUE,
        reversal_of_movement_id INTEGER,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      )`,
      "CREATE INDEX IF NOT EXISTS inventory_movements_unit_created_idx ON inventory_movements (business_unit_id, created_at)",
      "CREATE INDEX IF NOT EXISTS inventory_movements_product_idx ON inventory_movements (product_id)",
      "ALTER TABLE transactions ADD COLUMN business_unit_id INTEGER REFERENCES business_units(id) ON DELETE RESTRICT",
      "ALTER TABLE transactions ADD COLUMN idempotency_key TEXT",
      "UPDATE transactions SET business_unit_id = (SELECT id FROM business_units WHERE code = 'LOCAL') WHERE business_unit_id IS NULL",
      "CREATE UNIQUE INDEX IF NOT EXISTS transactions_unit_idempotency_unique ON transactions (business_unit_id, idempotency_key) WHERE idempotency_key IS NOT NULL",
      "ALTER TABLE customers ADD COLUMN business_unit_id INTEGER REFERENCES business_units(id) ON DELETE RESTRICT",
      "ALTER TABLE customers ADD COLUMN internal_code TEXT",
      "ALTER TABLE customers ADD COLUMN is_internal INTEGER NOT NULL DEFAULT 0",
      "UPDATE customers SET business_unit_id = (SELECT id FROM business_units WHERE code = 'LOCAL') WHERE business_unit_id IS NULL",
      "DROP INDEX IF EXISTS customers_document_unique",
      "CREATE UNIQUE INDEX IF NOT EXISTS customers_unit_document_unique ON customers (business_unit_id, document)",
      "CREATE UNIQUE INDEX IF NOT EXISTS customers_internal_code_unique ON customers (internal_code) WHERE internal_code IS NOT NULL",
      `INSERT OR IGNORE INTO customers
         (name, last_name, document, phone, is_active, business_unit_id, internal_code, is_internal)
       SELECT 'Local', 'Mr.Total', 'INTERNAL-LOCAL', NULL, 1, id, 'LOCAL_INTERNAL', 1
       FROM business_units WHERE code = 'WAREHOUSE'`,
      "ALTER TABLE account_movements ADD COLUMN business_unit_id INTEGER REFERENCES business_units(id) ON DELETE RESTRICT",
      `UPDATE account_movements
       SET business_unit_id = COALESCE(
         (SELECT business_unit_id FROM customers WHERE customers.id = account_movements.customer_id),
         (SELECT id FROM business_units WHERE code = 'LOCAL')
       ) WHERE business_unit_id IS NULL`,
      `CREATE TABLE IF NOT EXISTS warehouse_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_unit_id INTEGER NOT NULL REFERENCES business_units(id) ON DELETE RESTRICT,
        customer_id INTEGER REFERENCES customers(id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'draft',
        total REAL NOT NULL DEFAULT 0,
        observations TEXT,
        charge_to_account INTEGER NOT NULL DEFAULT 0,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        idempotency_key TEXT,
        confirmed_at TEXT,
        dispatched_at TEXT,
        cancelled_at TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime')),
        CHECK(status IN ('draft','confirmed','preparing','dispatched','cancelled'))
      )`,
      "CREATE UNIQUE INDEX IF NOT EXISTS warehouse_orders_unit_idempotency_unique ON warehouse_orders (business_unit_id, idempotency_key) WHERE idempotency_key IS NOT NULL",
      `CREATE TABLE IF NOT EXISTS warehouse_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES warehouse_orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        unit_price REAL NOT NULL,
        unit_cost REAL NOT NULL,
        total REAL NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS warehouse_purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_unit_id INTEGER NOT NULL REFERENCES business_units(id) ON DELETE RESTRICT,
        supplier TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        total REAL NOT NULL DEFAULT 0,
        observations TEXT,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        idempotency_key TEXT,
        received_at TEXT,
        cancelled_at TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime')),
        CHECK(status IN ('draft','received','cancelled'))
      )`,
      "CREATE UNIQUE INDEX IF NOT EXISTS warehouse_purchases_unit_idempotency_unique ON warehouse_purchases (business_unit_id, idempotency_key) WHERE idempotency_key IS NOT NULL",
      `CREATE TABLE IF NOT EXISTS warehouse_purchase_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id INTEGER NOT NULL REFERENCES warehouse_purchases(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        unit_cost REAL NOT NULL,
        total REAL NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS inventory_transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_business_unit_id INTEGER NOT NULL REFERENCES business_units(id) ON DELETE RESTRICT,
        to_business_unit_id INTEGER NOT NULL REFERENCES business_units(id) ON DELETE RESTRICT,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        unit_cost REAL NOT NULL DEFAULT 0,
        idempotency_key TEXT NOT NULL UNIQUE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        CHECK(from_business_unit_id <> to_business_unit_id)
      )`,
      `INSERT OR IGNORE INTO app_settings (key, value)
       VALUES ('warehouse_internal_sale_mode', 'inventory_only'),
              ('warehouse_transfer_price_mode', 'cost')`,
    ],
  },
  {
    id: "20261017_014_local_wholesale_price",
    statements: [
      "ALTER TABLE business_unit_products ADD COLUMN wholesale_price REAL NOT NULL DEFAULT 0 CHECK(wholesale_price >= 0)",
      `UPDATE business_unit_products AS local_inventory
       SET wholesale_price = COALESCE((
         SELECT warehouse_inventory.sale_price
         FROM business_unit_products AS warehouse_inventory
         JOIN business_units AS warehouse_unit ON warehouse_unit.id = warehouse_inventory.business_unit_id
         WHERE warehouse_unit.code = 'WAREHOUSE'
           AND warehouse_inventory.product_id = local_inventory.product_id
       ), 0)
       WHERE local_inventory.business_unit_id = (SELECT id FROM business_units WHERE code = 'LOCAL')
         AND local_inventory.wholesale_price = 0`,
      `UPDATE business_unit_products AS warehouse_inventory
       SET sale_price = COALESCE((
         SELECT local_inventory.sale_price
         FROM business_unit_products AS local_inventory
         JOIN business_units AS local_unit ON local_unit.id = local_inventory.business_unit_id
         WHERE local_unit.code = 'LOCAL'
           AND local_inventory.product_id = warehouse_inventory.product_id
       ), warehouse_inventory.sale_price)
       WHERE warehouse_inventory.business_unit_id = (SELECT id FROM business_units WHERE code = 'WAREHOUSE')`,
    ],
  },
  {
    id: "20261017_015_generic_product_icons",
    statements: [
      "UPDATE products SET icon = 'Package' WHERE icon IS NULL OR icon <> 'Package'",
    ],
  },
  {
    id: "20261011_013_account_movement_reversals",
    statements: [
      "ALTER TABLE account_movements ADD COLUMN source_type TEXT",
      "ALTER TABLE account_movements ADD COLUMN source_id TEXT",
      "ALTER TABLE account_movements ADD COLUMN reversal_of_movement_id INTEGER",
      "CREATE UNIQUE INDEX IF NOT EXISTS account_movements_source_unique ON account_movements (business_unit_id, source_type, source_id, type) WHERE source_type IS NOT NULL AND source_id IS NOT NULL",
    ],
  },
  {
    id: "20261011_011_transaction_discount_metadata",
    statements: [
      "ALTER TABLE transactions ADD COLUMN discount_percent REAL NOT NULL DEFAULT 0",
      "ALTER TABLE transactions ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0",
    ],
  },
  {
    id: "20261011_010_transaction_item_historical_cost",
    statements: [
      "ALTER TABLE transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'",
      "ALTER TABLE transaction_items ADD COLUMN unit_cost REAL",
      "ALTER TABLE transaction_items ADD COLUMN category_name TEXT",
      // Las ventas anteriores no tenían snapshot. Se preserva el dato disponible al migrar,
      // mientras que todas las ventas nuevas guardan el costo exacto de la operación.
      `UPDATE transaction_items
       SET unit_cost = COALESCE((SELECT cost FROM products WHERE products.id = transaction_items.product_id), 0)
       WHERE unit_cost IS NULL`,
      `UPDATE transaction_items
       SET category_name = (SELECT categories.name FROM products LEFT JOIN categories ON categories.id = products.category_id WHERE products.id = transaction_items.product_id)
       WHERE category_name IS NULL`,
      "CREATE INDEX IF NOT EXISTS transaction_items_product_id_idx ON transaction_items (product_id)",
      "CREATE INDEX IF NOT EXISTS transactions_created_at_idx ON transactions (created_at)",
    ],
  },
  {
    id: "20261010_009_product_extractions",
    statements: [
      `CREATE TABLE IF NOT EXISTS product_extractions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        user_name TEXT NOT NULL,
        reason TEXT NOT NULL,
        reason_detail TEXT,
        observations TEXT,
        total_cost REAL NOT NULL,
        total_units INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      )`,
      `CREATE TABLE IF NOT EXISTS product_extraction_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        extraction_id INTEGER NOT NULL REFERENCES product_extractions(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        unit_cost REAL NOT NULL,
        subtotal_cost REAL NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS product_extractions_created_idx ON product_extractions (created_at)",
      "CREATE INDEX IF NOT EXISTS product_extraction_items_extraction_idx ON product_extraction_items (extraction_id)",
    ],
  },
  {
    id: "20261009_008_combined_promotions",
    statements: [
      `CREATE TABLE IF NOT EXISTS promotions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        price REAL NOT NULL,
        is_available INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      )`,
      `CREATE TABLE IF NOT EXISTS promotion_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        promotion_id INTEGER NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        UNIQUE(promotion_id, product_id)
      )`,
      "CREATE INDEX IF NOT EXISTS promotion_items_product_idx ON promotion_items (product_id)",
      "ALTER TABLE transaction_items ADD COLUMN promotion_id INTEGER REFERENCES promotions(id) ON DELETE SET NULL",
      "ALTER TABLE transaction_items ADD COLUMN promotion_composition TEXT",
    ],
  },
  {
    id: "20260903_001_customer_accounts",
    statements: [
      `CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        document TEXT NOT NULL,
        phone TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      )`,
      "CREATE UNIQUE INDEX IF NOT EXISTS customers_document_unique ON customers (document)",
      `CREATE TABLE IF NOT EXISTS account_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
        method_name TEXT,
        detail TEXT,
        register_id INTEGER REFERENCES cash_registers(id) ON DELETE SET NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      )`,
      "CREATE INDEX IF NOT EXISTS account_movements_customer_created_idx ON account_movements (customer_id, created_at)",
      "CREATE INDEX IF NOT EXISTS account_movements_register_type_idx ON account_movements (register_id, type)",
      "CREATE INDEX IF NOT EXISTS account_movements_transaction_idx ON account_movements (transaction_id)",
    ],
  },
  {
    id: "20260903_002_round_product_prices_to_tens",
    statements: [
      `UPDATE products
       SET price = CASE
           WHEN price > 0 THEN CAST(price / 10 AS INTEGER) * 10
             + CASE WHEN price > CAST(price / 10 AS INTEGER) * 10 THEN 10 ELSE 0 END
           ELSE price
         END,
         pack_price = CASE
           WHEN pack_price > 0 THEN CAST(pack_price / 10 AS INTEGER) * 10
             + CASE WHEN pack_price > CAST(pack_price / 10 AS INTEGER) * 10 THEN 10 ELSE 0 END
           ELSE pack_price
         END`,
      `UPDATE product_price_tiers
       SET price = CASE
         WHEN price > 0 THEN CAST(price / 10 AS INTEGER) * 10
           + CASE WHEN price > CAST(price / 10 AS INTEGER) * 10 THEN 10 ELSE 0 END
         ELSE price
       END`,
    ],
  },
  {
    id: "20260903_003_cash_register_arqueo",
    statements: [
      "ALTER TABLE cash_registers ADD COLUMN expected_cash REAL",
      "ALTER TABLE cash_registers ADD COLUMN counted_cash REAL",
      "ALTER TABLE cash_registers ADD COLUMN cash_difference REAL",
      "ALTER TABLE cash_registers ADD COLUMN arqueo_notes TEXT",
      "ALTER TABLE cash_registers ADD COLUMN next_initial_cash REAL",
    ],
  },
  {
    id: "20260905_004_single_open_cash_register",
    statements: [
      // Una restricción en la base evita aperturas duplicadas por doble clic o
      // por solicitudes concurrentes desde distintas sesiones.
      "CREATE UNIQUE INDEX IF NOT EXISTS cash_registers_single_open_idx ON cash_registers (is_open) WHERE is_open = 1",
    ],
  },
  {
    id: "20260919_005_disposable_product_icons",
    statements: [
      `UPDATE products
       SET icon = CASE
         WHEN lower(name) LIKE '%guante%'
           OR lower(name) LIKE '%trapo%'
           OR lower(name) LIKE '%esponja%'
           OR lower(name) LIKE '%detergente%'
           OR lower(name) LIKE '%limpieza%' THEN 'SprayCan'
         WHEN lower(name) LIKE '%bolsa%'
           OR lower(name) LIKE 'ppp %'
           OR lower(name) LIKE '%film%' THEN 'ShoppingBag'
         WHEN lower(name) LIKE '%cuchara%'
           OR lower(name) LIKE '%cucharita%'
           OR lower(name) LIKE '%cuchillo%'
           OR lower(name) LIKE '%tenedor%'
           OR lower(name) LIKE '%cubierto%'
           OR lower(name) LIKE '%escarbadiente%'
           OR lower(name) LIKE '%brochette%'
           OR lower(name) LIKE '%pincho%'
           OR lower(name) LIKE '%pinche%'
           OR lower(name) LIKE '%palito%' THEN 'Utensils'
         WHEN lower(name) LIKE '%copa%' THEN 'GlassWater'
         WHEN lower(name) LIKE '%vaso%'
           OR lower(name) LIKE '%sorbete%'
           OR lower(name) LIKE '%agitador%' THEN 'CupSoda'
         WHEN lower(name) LIKE '%pote%'
           OR lower(name) LIKE '%envase%'
           OR lower(name) LIKE '%tapa%'
           OR lower(name) LIKE '%marmita%'
           OR lower(name) LIKE '%ensaladera%'
           OR lower(name) LIKE '%frasco%' THEN 'Soup'
         WHEN lower(name) LIKE '%caja%'
           OR lower(name) LIKE '%estuche%' THEN 'Box'
         WHEN lower(name) LIKE '%servilleta%'
           OR lower(name) LIKE '%toalla%'
           OR lower(name) LIKE '%papel%'
           OR lower(name) LIKE '%blonda%'
           OR lower(name) LIKE '%pirotin%'
           OR lower(name) LIKE '%molde%' THEN 'ScrollText'
         WHEN lower(name) LIKE '%bandeja%'
           OR lower(name) LIKE '%plato%'
           OR lower(name) LIKE '%budinera%'
           OR lower(name) LIKE '%oblea%' THEN 'Layers3'
         WHEN lower(name) LIKE '%cinta decorativa%'
           OR lower(name) LIKE '%moño%'
           OR name LIKE '%MOÑO%' THEN 'PartyPopper'
         WHEN category_id IN (SELECT id FROM categories WHERE lower(name) = 'cotillon') THEN 'PartyPopper'
         WHEN category_id IN (SELECT id FROM categories WHERE lower(name) IN ('bolsa', 'ppp')) THEN 'ShoppingBag'
         WHEN category_id IN (SELECT id FROM categories WHERE lower(name) = 'vaso,tapas y pote') THEN 'CupSoda'
         WHEN category_id IN (SELECT id FROM categories WHERE lower(name) = 'envases') THEN 'Soup'
         WHEN category_id IN (SELECT id FROM categories WHERE lower(name) IN ('bandejas', 'aluminio', 'telgopor')) THEN 'Layers3'
         WHEN category_id IN (SELECT id FROM categories WHERE lower(name) = 'papel') THEN 'ScrollText'
         WHEN category_id IN (SELECT id FROM categories WHERE lower(name) = 'cajas') THEN 'Box'
         ELSE 'Package'
       END`,
    ],
  },
  {
    id: "20260919_006_refine_disposable_product_icons",
    statements: [
      `UPDATE products
       SET icon = 'Utensils'
       WHERE lower(name) LIKE '%cucharita%'
          OR lower(name) LIKE '%pinche%'`,
      `UPDATE products
       SET icon = 'PartyPopper'
       WHERE lower(name) LIKE '%cinta decorativa%'
          OR lower(name) LIKE '%moño%'
          OR name LIKE '%MOÑO%'`,
    ],
  },
  {
    id: "20260919_007_accented_disposable_icons",
    statements: [
      `UPDATE products
       SET icon = 'PartyPopper'
       WHERE name LIKE '%MOÑO%'`,
    ],
  },
];

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function expectedSchema() {
  return Object.values(schema).map((table) => ({
    name: getTableName(table),
    columns: Object.values(getTableColumns(table)).map((column) => column.name),
  }));
}

export async function applyDatabaseMigrations() {
  await client.execute(`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const appliedResult = await client.execute(`SELECT id FROM ${MIGRATIONS_TABLE}`);
  const applied = new Set(appliedResult.rows.map((row) => String(row.id)));

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;

    await client.batch(
      [
        ...migration.statements,
        {
          sql: `INSERT OR IGNORE INTO ${MIGRATIONS_TABLE} (id) VALUES (?)`,
          args: [migration.id],
        },
      ],
      "write"
    );
    console.log(`✅ Migración aplicada: ${migration.id}`);
  }
}

export async function verifyDatabaseSchema() {
  const expected = expectedSchema();
  const results = await client.batch(
    expected.map(({ name }) => `PRAGMA table_info(${quoteIdentifier(name)})`),
    "read"
  );
  const issues = [];

  expected.forEach(({ name, columns }, index) => {
    const actualColumns = new Set(results[index].rows.map((row) => String(row.name)));
    if (actualColumns.size === 0) {
      issues.push(`falta la tabla ${name}`);
      return;
    }

    const missingColumns = columns.filter((column) => !actualColumns.has(column));
    if (missingColumns.length > 0) {
      issues.push(`faltan columnas en ${name}: ${missingColumns.join(", ")}`);
    }
  });

  if (issues.length > 0) {
    throw new Error(`Esquema de base de datos incompleto: ${issues.join("; ")}`);
  }

  return { tablesChecked: expected.length };
}

export async function initializeDatabase() {
  await applyDatabaseMigrations();
  return verifyDatabaseSchema();
}
