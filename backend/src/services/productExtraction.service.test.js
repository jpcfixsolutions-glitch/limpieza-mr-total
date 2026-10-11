import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let client;
let ProductExtractionService;
let testDirectory;

before(async () => {
  testDirectory = await mkdtemp(path.join(tmpdir(), "yofre-extractions-"));
  process.env.TURSO_DATABASE_URL = `file:${path.join(testDirectory, "extractions.db")}`;
  ({ client } = await import("../db/client.js"));
  ({ ProductExtractionService } = await import("./productExtraction.service.js"));
  await client.batch([
    "PRAGMA foreign_keys = ON",
    "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)",
    `CREATE TABLE products (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, cod_barra TEXT, category_id INTEGER,
      price_group_id INTEGER, pack_type_id INTEGER, cost REAL NOT NULL, price REAL NOT NULL,
      units_per_pack INTEGER NOT NULL DEFAULT 1, pack_price REAL, use_suggested_price INTEGER NOT NULL DEFAULT 0,
      suggested_price_percent REAL, stock INTEGER NOT NULL, min_stock INTEGER NOT NULL DEFAULT 0,
      icon TEXT NOT NULL DEFAULT 'Package', is_available INTEGER NOT NULL DEFAULT 1, created_at TEXT
    )`,
    "CREATE TABLE product_extractions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, user_name TEXT NOT NULL, reason TEXT NOT NULL, reason_detail TEXT, observations TEXT, total_cost REAL NOT NULL, total_units INTEGER NOT NULL, created_at TEXT)",
    "CREATE TABLE product_extraction_items (id INTEGER PRIMARY KEY AUTOINCREMENT, extraction_id INTEGER NOT NULL, product_id INTEGER, product_name TEXT NOT NULL, quantity INTEGER NOT NULL, unit_cost REAL NOT NULL, subtotal_cost REAL NOT NULL)",
    "INSERT INTO users (id, name) VALUES (1, 'Admin')",
    "INSERT INTO products (id, name, cost, price, stock) VALUES (1, 'Vaso', 25.5, 80, 10), (2, 'Bolsa', 10, 30, 4)",
  ], "write");
});

after(async () => { client?.close(); if (testDirectory) await rm(testDirectory, { recursive: true, force: true }); });

test("extrae varios productos, conserva el costo histórico y no genera movimientos financieros", async () => {
  const result = await ProductExtractionService.create({
    items: [{ productId: 1, quantity: 2 }, { productId: 2, quantity: 3 }], reason: "donacion", observations: "Prueba",
  }, { id: 1, name: "Admin" });
  assert.equal(result.totalUnits, 5);
  assert.equal(result.totalCost, 81);
  const rows = await client.batch([
    "SELECT stock, cost FROM products WHERE id = 1",
    "SELECT stock FROM products WHERE id = 2",
    "SELECT product_name, unit_cost, subtotal_cost FROM product_extraction_items ORDER BY product_id",
  ], "read");
  assert.equal(rows[0].rows[0].stock, 8);
  assert.equal(rows[1].rows[0].stock, 1);
  assert.deepEqual(Array.from(rows[2].rows[0]), ["Vaso", 25.5, 51]);
  await client.execute("UPDATE products SET cost = 999 WHERE id = 1");
  const historic = await client.execute("SELECT unit_cost FROM product_extraction_items WHERE product_id = 1");
  assert.equal(historic.rows[0].unit_cost, 25.5);
});

test("rechaza falta de stock sin descuentos ni historial parcial", async () => {
  await assert.rejects(() => ProductExtractionService.create({
    items: [{ productId: 1, quantity: 1 }, { productId: 2, quantity: 2 }], reason: "uso_interno",
  }, { id: 1, name: "Admin" }), (error) => error.status === 400);
  const [stock, history] = await client.batch([
    "SELECT stock FROM products WHERE id = 1",
    "SELECT count(*) AS total FROM product_extractions",
  ], "read");
  assert.equal(stock.rows[0].stock, 8);
  assert.equal(Number(history.rows[0].total), 1);
});

test("resume e incluye el detalle persistido", async () => {
  const summary = await ProductExtractionService.getSummary({});
  const page = await ProductExtractionService.getByPeriod({});
  assert.deepEqual(summary, { totalCost: 81, operations: 1 });
  assert.equal(page.rows[0].items.length, 2);
});
