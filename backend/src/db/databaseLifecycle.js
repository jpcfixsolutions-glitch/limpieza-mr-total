import { getTableColumns, getTableName } from "drizzle-orm";
import * as schema from "./schema.js";
import { client } from "./client.js";

const MIGRATIONS_TABLE = "app_migrations";

const migrations = [
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
