import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let client;
let applyDatabaseMigrations;
let directory;

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "mrtotal-business-migration-"));
  process.env.TURSO_DATABASE_URL = `file:${path.join(directory, "legacy.db")}`;
  ({ client } = await import("./client.js"));
  ({ applyDatabaseMigrations } = await import("./databaseLifecycle.js"));
  await client.batch([
    "PRAGMA foreign_keys = ON",
    "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, password TEXT, role TEXT, created_at TEXT)",
    "CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, cod_barra TEXT, category_id INTEGER, price_group_id INTEGER, pack_type_id INTEGER, cost REAL NOT NULL, price REAL NOT NULL, units_per_pack INTEGER, pack_price REAL, use_suggested_price INTEGER, suggested_price_percent REAL, stock INTEGER NOT NULL, min_stock INTEGER NOT NULL, icon TEXT, is_available INTEGER NOT NULL, created_at TEXT)",
    "CREATE TABLE cash_registers (id INTEGER PRIMARY KEY)",
    "CREATE TABLE transactions (id INTEGER PRIMARY KEY, register_id INTEGER NOT NULL, total REAL NOT NULL, status TEXT NOT NULL DEFAULT 'completed', discount_percent REAL NOT NULL DEFAULT 0, discount_amount REAL NOT NULL DEFAULT 0, date TEXT, time TEXT, created_at TEXT)",
    "CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, last_name TEXT NOT NULL, document TEXT NOT NULL, phone TEXT, is_active INTEGER NOT NULL, created_at TEXT)",
    "CREATE UNIQUE INDEX customers_document_unique ON customers(document)",
    "CREATE TABLE account_movements (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, type TEXT NOT NULL, amount REAL NOT NULL, transaction_id INTEGER, method_name TEXT, detail TEXT, register_id INTEGER, user_id INTEGER, created_at TEXT)",
    "CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    "CREATE TABLE app_migrations (id TEXT PRIMARY KEY, applied_at TEXT)",
    "INSERT INTO products VALUES (7, 'Producto histórico', NULL, NULL, NULL, NULL, 125.5, 250, 1, NULL, 0, NULL, 23, 4, 'Package', 1, '2026-01-01')",
    "INSERT INTO transactions VALUES (3, 1, 500, 'completed', 0, 0, '01/01/2026', '10:00', '2026-01-01 10:00:00')",
    "INSERT INTO customers VALUES (5, 'Ana', 'Pérez', '123', NULL, 1, '2026-01-01')",
  ], "write");
  const previousIds = [
    "20261011_011_transaction_discount_metadata", "20261011_010_transaction_item_historical_cost", "20261010_009_product_extractions",
    "20261009_008_combined_promotions", "20260903_001_customer_accounts", "20260903_002_round_product_prices_to_tens",
    "20260903_003_cash_register_arqueo", "20260905_004_single_open_cash_register", "20260919_005_disposable_product_icons",
    "20260919_006_refine_disposable_product_icons", "20260919_007_accented_disposable_icons",
  ];
  for (const id of previousIds) await client.execute({ sql: "INSERT INTO app_migrations (id) VALUES (?)", args: [id] });
});

after(async () => { client?.close(); if (directory) await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

test("la migración conserva los datos históricos y los asigna al Local de forma idempotente", async () => {
  await applyDatabaseMigrations();
  await applyDatabaseMigrations();
  const [units, inventory, transaction, customer, internalCustomer, migrations] = await client.batch([
    "SELECT code FROM business_units ORDER BY code",
    "SELECT stock, min_stock, cost, sale_price, wholesale_price, is_available FROM business_unit_products WHERE product_id = 7 AND business_unit_id = (SELECT id FROM business_units WHERE code = 'LOCAL')",
    "SELECT business_unit_id = (SELECT id FROM business_units WHERE code = 'LOCAL') AS is_local FROM transactions WHERE id = 3",
    "SELECT business_unit_id = (SELECT id FROM business_units WHERE code = 'LOCAL') AS is_local FROM customers WHERE id = 5",
    "SELECT internal_code, is_internal FROM customers WHERE internal_code = 'LOCAL_INTERNAL' AND business_unit_id = (SELECT id FROM business_units WHERE code = 'WAREHOUSE')",
    "SELECT count(*) AS total FROM app_migrations WHERE id = '20261011_012_business_units_and_warehouse'",
  ], "read");
  assert.deepEqual(units.rows.map((row) => row.code), ["LOCAL", "WAREHOUSE"]);
  assert.deepEqual(Array.from(inventory.rows[0]), [23, 4, 125.5, 250, 0, 1]);
  assert.equal(transaction.rows[0].is_local, 1);
  assert.equal(customer.rows[0].is_local, 1);
  assert.deepEqual(Array.from(internalCustomer.rows[0]), ["LOCAL_INTERNAL", 1]);
  assert.equal(Number(migrations.rows[0].total), 1);
});
