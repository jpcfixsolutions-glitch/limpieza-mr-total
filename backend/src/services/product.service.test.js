import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let client;
let ProductService;
let testDirectory;

before(async () => {
  testDirectory = await mkdtemp(path.join(tmpdir(), "yofre-products-"));
  process.env.TURSO_DATABASE_URL = `file:${path.join(testDirectory, "products.db")}`;

  ({ client } = await import("../db/client.js"));
  ({ ProductService } = await import("./product.service.js"));

  await client.batch([
    "PRAGMA foreign_keys = ON",
    `CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )`,
    `CREATE TABLE price_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL
    )`,
    `CREATE TABLE pack_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )`,
    `CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cod_barra TEXT UNIQUE,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      price_group_id INTEGER REFERENCES price_groups(id) ON DELETE SET NULL,
      pack_type_id INTEGER REFERENCES pack_types(id) ON DELETE SET NULL,
      cost REAL NOT NULL DEFAULT 0,
      price REAL NOT NULL,
      units_per_pack INTEGER NOT NULL DEFAULT 1,
      pack_price REAL,
      use_suggested_price INTEGER NOT NULL DEFAULT 0,
      suggested_price_percent REAL,
      stock INTEGER NOT NULL DEFAULT 0,
      min_stock INTEGER NOT NULL DEFAULT 5,
      icon TEXT NOT NULL DEFAULT 'Package',
      is_available INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE product_price_tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      UNIQUE(product_id, quantity)
    )`,
    `CREATE TABLE stock_modifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      old_stock INTEGER NOT NULL,
      new_stock INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    "INSERT INTO categories (name) VALUES ('Descartables')",
    "INSERT INTO price_groups (name, type) VALUES ('Proveedor prueba', 'proveedor')",
    "INSERT INTO pack_types (name) VALUES ('Caja')",
  ], "write");
});

after(async () => {
  client?.close();
  if (testDirectory) await rm(testDirectory, { recursive: true, force: true });
});

test("crea el producto y devuelve sus relaciones sin una recarga completa", async () => {
  const product = await ProductService.create({
    name: "Vaso de prueba",
    codbarra: "779000000001",
    categoryId: 1,
    priceGroupId: 1,
    packTypeId: 1,
    cost: 100,
    price: 151,
    stock: 12,
    minStock: 3,
    unitsPerPack: 6,
    packPrice: 901,
    priceTiers: [{ quantity: 3, price: 481 }],
  });

  assert.equal(product.name, "Vaso de prueba");
  assert.equal(product.category, "Descartables");
  assert.equal(product.priceGroupName, "Proveedor prueba");
  assert.equal(product.packTypeName, "Caja");
  assert.equal(product.price, 160);
  assert.equal(product.packPrice, 910);
  assert.deepEqual(product.priceTiers, [{ quantity: 3, price: 490 }]);
});

test("actualiza stock, precios por cantidad y auditoría en el mismo guardado", async () => {
  const updated = await ProductService.update(1, {
    stock: 20,
    priceTiers: [{ quantity: 10, price: 1200 }],
    recordStockModification: true,
  });

  assert.equal(updated.stock, 20);
  assert.deepEqual(updated.priceTiers, [{ quantity: 10, price: 1200 }]);

  const audit = await client.execute(
    "SELECT product_id, product_name, old_stock, new_stock FROM stock_modifications"
  );
  assert.deepEqual(Array.from(audit.rows[0]), [1, "Vaso de prueba", 12, 20]);
});

test("rechaza códigos de barra duplicados sin una consulta previa", async () => {
  await assert.rejects(
    () => ProductService.create({
      name: "Producto con código repetido",
      codbarra: "779000000001",
      price: 100,
    }),
    (error) => error.status === 409 && error.message.includes("779000000001")
  );
});

test("revierte todo el guardado si una de las escrituras falla", async () => {
  await assert.rejects(() => ProductService.update(1, {
    categoryId: 999,
    stock: 30,
    priceTiers: [],
    recordStockModification: true,
  }));

  const product = await client.execute("SELECT category_id, stock FROM products WHERE id = 1");
  const audit = await client.execute("SELECT count(*) AS count FROM stock_modifications");
  assert.equal(product.rows[0].category_id, 1);
  assert.equal(product.rows[0].stock, 20);
  assert.equal(Number(audit.rows[0].count), 1);
});
