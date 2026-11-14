import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";
import express from "express";

let client, WarehouseService, CustomerService;
let directory;
const local = { id: 1, code: "LOCAL", name: "Local" };
const warehouse = { id: 2, code: "WAREHOUSE", name: "Galpón" };

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "mrtotal-business-integration-"));
  process.env.TURSO_DATABASE_URL = `file:${path.join(directory, "integration.db")}`;
  process.env.JWT_SECRET = "integration-secret";
  ({ client } = await import("../db/client.js"));
  ({ WarehouseService } = await import("./warehouse.service.js"));
  ({ CustomerService } = await import("./customer.service.js"));
  await client.batch([
    "PRAGMA foreign_keys = ON",
    "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, password TEXT, role TEXT, created_at TEXT)",
    "CREATE TABLE business_units (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, type TEXT NOT NULL, is_active INTEGER NOT NULL, created_at TEXT, updated_at TEXT)",
    "CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL)",
    "CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, cod_barra TEXT UNIQUE, category_id INTEGER, price_group_id INTEGER, pack_type_id INTEGER, cost REAL NOT NULL, price REAL NOT NULL, units_per_pack INTEGER NOT NULL, pack_price REAL, use_suggested_price INTEGER NOT NULL DEFAULT 0, suggested_price_percent REAL, stock INTEGER NOT NULL, min_stock INTEGER NOT NULL, icon TEXT NOT NULL, is_available INTEGER NOT NULL, created_at TEXT)",
    "CREATE TABLE business_unit_products (id INTEGER PRIMARY KEY AUTOINCREMENT, business_unit_id INTEGER NOT NULL, product_id INTEGER NOT NULL, stock INTEGER NOT NULL CHECK(stock >= 0), min_stock INTEGER NOT NULL, cost REAL NOT NULL, sale_price REAL NOT NULL, wholesale_price REAL NOT NULL DEFAULT 0, is_available INTEGER NOT NULL, fulfillment_mode TEXT NOT NULL, updated_at TEXT, UNIQUE(business_unit_id, product_id))",
    "CREATE TABLE inventory_movements (id INTEGER PRIMARY KEY AUTOINCREMENT, business_unit_id INTEGER NOT NULL, product_id INTEGER NOT NULL, movement_type TEXT NOT NULL, direction TEXT NOT NULL, quantity INTEGER NOT NULL, unit_cost REAL NOT NULL, stock_before INTEGER NOT NULL, stock_after INTEGER NOT NULL, counterpart_business_unit_id INTEGER, source_type TEXT, source_id TEXT, source_item_id TEXT, idempotency_key TEXT NOT NULL UNIQUE, reversal_of_movement_id INTEGER, user_id INTEGER, notes TEXT, created_at TEXT)",
    "CREATE TABLE inventory_transfers (id INTEGER PRIMARY KEY AUTOINCREMENT, from_business_unit_id INTEGER NOT NULL, to_business_unit_id INTEGER NOT NULL, product_id INTEGER NOT NULL, quantity INTEGER NOT NULL, unit_cost REAL NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, user_id INTEGER, notes TEXT, created_at TEXT)",
    "CREATE TABLE cash_registers (id INTEGER PRIMARY KEY, opened_by INTEGER, initial_cash REAL NOT NULL, is_open INTEGER NOT NULL, opened_at TEXT, closed_at TEXT, expected_cash REAL, counted_cash REAL, cash_difference REAL, arqueo_notes TEXT, next_initial_cash REAL)",
    "CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, register_id INTEGER NOT NULL, total REAL NOT NULL, status TEXT NOT NULL DEFAULT 'completed', discount_percent REAL NOT NULL DEFAULT 0, discount_amount REAL NOT NULL DEFAULT 0, date TEXT NOT NULL, time TEXT NOT NULL, created_at TEXT, business_unit_id INTEGER, idempotency_key TEXT, UNIQUE(business_unit_id, idempotency_key))",
    "CREATE TABLE transaction_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id INTEGER NOT NULL, payment_method_id INTEGER, method_name TEXT NOT NULL, base_amount REAL NOT NULL, surcharge_percent REAL NOT NULL, amount REAL NOT NULL)",
    "CREATE TABLE transaction_items (id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id INTEGER NOT NULL, product_id INTEGER, promotion_id INTEGER, product_name TEXT NOT NULL, unit_cost REAL, category_name TEXT, price REAL NOT NULL, quantity INTEGER NOT NULL, total REAL NOT NULL, sale_mode TEXT NOT NULL, pack_size INTEGER NOT NULL, promotion_composition TEXT)",
    "CREATE TABLE promotions (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, price REAL NOT NULL, is_available INTEGER NOT NULL, created_at TEXT)",
    "CREATE TABLE promotion_items (id INTEGER PRIMARY KEY, promotion_id INTEGER NOT NULL, product_id INTEGER NOT NULL, quantity INTEGER NOT NULL, UNIQUE(promotion_id, product_id))",
    "CREATE TABLE customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, last_name TEXT NOT NULL, document TEXT NOT NULL, phone TEXT, is_active INTEGER NOT NULL, created_at TEXT, business_unit_id INTEGER, internal_code TEXT, is_internal INTEGER NOT NULL DEFAULT 0, UNIQUE(business_unit_id, document))",
    "CREATE TABLE account_movements (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL, type TEXT NOT NULL, amount REAL NOT NULL, transaction_id INTEGER, method_name TEXT, detail TEXT, register_id INTEGER, user_id INTEGER, created_at TEXT, business_unit_id INTEGER, source_type TEXT, source_id TEXT, reversal_of_movement_id INTEGER, idempotency_key TEXT)",
    "CREATE TABLE account_payment_details (id INTEGER PRIMARY KEY AUTOINCREMENT, account_movement_id INTEGER NOT NULL, payment_method_id INTEGER, method_name TEXT NOT NULL, amount REAL NOT NULL)",
    "CREATE UNIQUE INDEX account_movements_source_unique ON account_movements(business_unit_id, source_type, source_id, type) WHERE source_type IS NOT NULL",
    "CREATE UNIQUE INDEX account_movements_payment_idempotency_unique ON account_movements(business_unit_id, idempotency_key) WHERE idempotency_key IS NOT NULL",
    "CREATE TABLE warehouse_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, business_unit_id INTEGER NOT NULL, customer_id INTEGER, status TEXT NOT NULL CHECK(status IN ('draft','confirmed','preparing','dispatched','cancelled')), total REAL NOT NULL, observations TEXT, charge_to_account INTEGER NOT NULL, user_id INTEGER, idempotency_key TEXT, confirmed_at TEXT, dispatched_at TEXT, delivered_at TEXT, ready_at TEXT, version INTEGER NOT NULL DEFAULT 0, cancelled_at TEXT, created_at TEXT, updated_at TEXT, UNIQUE(business_unit_id, idempotency_key))",
    "CREATE TABLE warehouse_customer_details (customer_id INTEGER PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE, business_unit_id INTEGER NOT NULL, address TEXT NOT NULL, contact_key TEXT NOT NULL, UNIQUE(business_unit_id, contact_key))",
    "CREATE TABLE warehouse_order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, product_id INTEGER, product_name TEXT NOT NULL, quantity INTEGER NOT NULL, preparation_status TEXT NOT NULL DEFAULT 'preparing', unit_price REAL NOT NULL, unit_cost REAL NOT NULL, total REAL NOT NULL)",
    "CREATE TABLE warehouse_purchases (id INTEGER PRIMARY KEY AUTOINCREMENT, business_unit_id INTEGER NOT NULL, supplier TEXT NOT NULL, status TEXT NOT NULL, total REAL NOT NULL, observations TEXT, user_id INTEGER, idempotency_key TEXT, received_at TEXT, cancelled_at TEXT, created_at TEXT, updated_at TEXT, UNIQUE(business_unit_id, idempotency_key))",
    "CREATE TABLE warehouse_purchase_items (id INTEGER PRIMARY KEY AUTOINCREMENT, purchase_id INTEGER NOT NULL, product_id INTEGER NOT NULL, product_name TEXT NOT NULL, quantity INTEGER NOT NULL, unit_cost REAL NOT NULL, total REAL NOT NULL)",
    "CREATE TABLE payment_methods (id INTEGER PRIMARY KEY, name TEXT NOT NULL, surcharge REAL NOT NULL)",
    "CREATE TABLE price_groups (id INTEGER PRIMARY KEY, name TEXT, type TEXT, last_increase_percent REAL)",
    "CREATE TABLE pack_types (id INTEGER PRIMARY KEY, name TEXT)",
    "CREATE TABLE product_price_tiers (id INTEGER PRIMARY KEY, product_id INTEGER, quantity INTEGER, price REAL)",
    "CREATE TABLE stock_modifications (id INTEGER PRIMARY KEY, product_id INTEGER, product_name TEXT, old_stock INTEGER, new_stock INTEGER, created_at TEXT)",
    "CREATE TABLE daily_expenses (id INTEGER PRIMARY KEY, reason TEXT, amount REAL, method TEXT, register_id INTEGER, created_at TEXT)",
    "CREATE TABLE fixed_expenses (id INTEGER PRIMARY KEY, name TEXT, amount REAL)",
    "CREATE TABLE internal_withdrawals (id INTEGER PRIMARY KEY, product_id INTEGER, product_name TEXT, quantity INTEGER, created_at TEXT)",
    "CREATE TABLE product_extractions (id INTEGER PRIMARY KEY, user_id INTEGER, user_name TEXT, reason TEXT, reason_detail TEXT, observations TEXT, total_cost REAL, total_units INTEGER, created_at TEXT)",
    "CREATE TABLE product_extraction_items (id INTEGER PRIMARY KEY, extraction_id INTEGER, product_id INTEGER, product_name TEXT, quantity INTEGER, unit_cost REAL, subtotal_cost REAL)",
    "INSERT INTO users VALUES (1, 'Admin', 'admin@test', 'x', 'admin', NULL), (2, 'Caja', 'caja@test', 'x', 'cajero', NULL)",
    "INSERT INTO business_units VALUES (1, 'LOCAL', 'Local', 'retail', 1, NULL, NULL), (2, 'WAREHOUSE', 'Galpón', 'warehouse', 1, NULL, NULL)",
    "INSERT INTO categories VALUES (1, 'General')",
    "INSERT INTO products VALUES (1, 'Producto propio', '1', 1, NULL, NULL, 10, 20, 1, NULL, 0, NULL, 10, 1, 'Package', 1, NULL), (2, 'Producto directo', '2', 1, NULL, NULL, 5, 15, 1, NULL, 0, NULL, 5, 1, 'Package', 1, NULL)",
    "INSERT INTO business_unit_products (business_unit_id, product_id, stock, min_stock, cost, sale_price, wholesale_price, is_available, fulfillment_mode) VALUES (1,1,10,1,10,20,17,1,'OWN_STOCK'), (2,1,20,1,8,18,0,1,'OWN_STOCK'), (1,2,5,1,5,15,13,1,'WAREHOUSE_DIRECT'), (2,2,8,1,4,12,0,1,'OWN_STOCK')",
    "INSERT INTO cash_registers VALUES (1,1,0,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL)",
    "INSERT INTO customers (id,name,last_name,document,is_active,business_unit_id,is_internal) VALUES (1,'Cliente','Local','DUP',1,1,0),(2,'Cliente','Mayorista','DUP',1,2,0),(3,'Local','Mr.Total','INTERNAL-LOCAL',1,2,1)",
    "INSERT INTO payment_methods VALUES (1, 'Efectivo', 0), (2, 'Transferencia', 0), (3, 'Tarjeta de débito', 0)",
    "INSERT INTO promotions VALUES (1, 'Promo mixta', NULL, 35, 1, NULL), (2, '3 productos por $50', NULL, 50, 1, NULL)",
    "INSERT INTO promotion_items VALUES (1,1,1,1),(2,1,2,1),(3,2,1,3)",
  ], "write");
  const { warehouseLiquidsMigration } = await import("../db/warehouseLiquidsMigration.js");
  await client.batch(warehouseLiquidsMigration.statements, "write");
  const { warehouseStockOptionsMigration } = await import("../db/warehouseStockOptionsMigration.js");
  await client.batch(warehouseStockOptionsMigration.statements,"write");
  for (const name of ["Tacho","Tarro","Bidón"]) await client.execute({sql:"INSERT INTO warehouse_stock_options(business_unit_id,type,name,name_key) VALUES(2,'container-type',?,?)",args:[name,name.toLowerCase()]});
});

after(async () => { client?.close(); if (directory) await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });


test("pedidos y producción del Galpón comparten demanda, disponibilidad y entregas persistentes", async (t) => {
  const localBefore = await stock(1, 1);
  await client.execute("UPDATE business_unit_products SET stock = 15 WHERE business_unit_id = 2 AND product_id = 1");
  let customer;
  await t.test("alta de contacto con domicilio y reintento sin duplicación, sin afectar Local", async () => {
    const form = { name: "Almacén Norte", phone: "+54 (351) 123-4567", address: "San Martín 100, Córdoba" };
    customer = await WarehouseService.createCustomer(form, warehouse);
    const retry = await WarehouseService.createCustomer({ ...form, name: "  Almacen Norte  ", phone: "543511234567" }, warehouse);
    assert.equal(retry.id, customer.id);
    assert.equal(retry.duplicated, true);
    assert.equal(retry.address, form.address);
    assert.equal((await CustomerService.list({}, local)).some((row) => row.id === customer.id), false);
    for (const invalid of [{ ...form, name: "" }, { ...form, phone: "abc" }, { ...form, address: "" }]) {
      await assert.rejects(() => WarehouseService.createCustomer(invalid, warehouse), (error) => error.status === 400);
    }
    await assert.rejects(() => WarehouseService.createCustomer(form, local), (error) => error.status === 403);
  });

  const payload = { customerId: customer.id, status: "confirmed", items: [{ productId: 1, quantity: 25, unitPrice: 18 }], idempotencyKey: "production-first" };
  const first = await WarehouseService.createOrder(payload, 1, warehouse);
  const second = await WarehouseService.createOrder({ ...payload, items: [{ productId: 1, quantity: 20, unitPrice: 18 }, { productId: 2, quantity: 2, unitPrice: 12 }], idempotencyKey: "production-second" }, 1, warehouse);
  await t.test("registra con stock insuficiente y varios productos; dos pedidos suman 45 menos 15", async () => {
    const snapshot = await WarehouseService.operations(warehouse);
    assert.equal(snapshot.production.items.find((row) => row.productId === 1).toProduce, 30);
    assert.equal(snapshot.counts.pending, 2);
    assert.equal(snapshot.orders.find((row) => row.id === first.id).customerAddress, "San Martín 100, Córdoba");
    assert.equal(snapshot.orders.find((row) => row.id === first.id).customerPhone, "+54 (351) 123-4567");
    assert.equal(snapshot.orders.find((row) => row.id === first.id).items[0].assignedStock, 15);
    assert.equal(snapshot.orders.find((row) => row.id === second.id).items[0].assignedStock, 0);
    assert.equal(await stock(2, 1), 15, "registrar no descuenta stock");
    const retry = await WarehouseService.createOrder(payload, 1, warehouse);
    assert.equal(retry.id, first.id);
    assert.equal(retry.duplicated, true);
    const preview = await WarehouseService.operations(warehouse, [{ productId: 1, quantity: 5, unitPrice: 18 }]);
    assert.equal(preview.preview.production.items.find((row) => row.productId === 1).toProduce, 35);
    assert.equal(preview.preview.items[0].toProduce, 5);
    assert.equal(preview.counts.pending, 2, "previsualizar no guarda ni agrega un pedido");
    await assert.rejects(() => WarehouseService.createOrder({ ...payload, customerId: 1, idempotencyKey: "cross-unit" }, 1, warehouse), (error) => error.status === 400);
    await assert.rejects(() => WarehouseService.operations(local), (error) => error.status === 403);
    await assert.rejects(() => WarehouseService.changeOrderStatus(first.id, "dispatched", 1, warehouse), (error) => error.status === 409);
  });
  await t.test("el ingreso real de stock reduce producción; cancelar libera demanda", async () => {
    const purchase = await WarehouseService.createPurchase({ supplier: "Ingreso para prueba", items: [{ productId: 1, quantity: 10, unitCost: 8 }] }, 1, warehouse);
    await WarehouseService.changePurchaseStatus(purchase.id, "received", 1, warehouse);
    assert.equal((await WarehouseService.operations(warehouse)).production.items.find((row) => row.productId === 1).toProduce, 20);
    await WarehouseService.changeOrderStatus(second.id, "cancelled", 1, warehouse);
    assert.equal((await WarehouseService.operations(warehouse)).production.items.length, 0);
  });
  await t.test("despachar y entregar no duplican descuentos; sólo una entrega efectiva cuenta hoy", async () => {
    await client.execute({ sql: "UPDATE warehouse_orders SET created_at = '2020-01-01 10:00:00' WHERE id = ?", args: [first.id] });
    for (const item of first.items) await WarehouseService.changeItemStatus(first.id, item.id, "ready", warehouse);
    await WarehouseService.changeOrderStatus(first.id, "ready", 1, warehouse);
    await WarehouseService.changeOrderStatus(first.id, "dispatched", 1, warehouse);
    let snapshot = await WarehouseService.operations(warehouse);
    assert.equal(snapshot.counts.inDelivery, 1);
    assert.equal(snapshot.counts.soldToday, 0);
    assert.equal(snapshot.production.items.length, 0);
    assert.equal(await stock(2, 1), 0);
    const delivered = await WarehouseService.changeOrderStatus(first.id, "delivered", 1, warehouse);
    assert.equal(delivered.status, "delivered");
    assert.match(delivered.deliveredAt, /^\d{4}-\d{2}-\d{2} /);
    const repeated = await WarehouseService.changeOrderStatus(first.id, "delivered", 1, warehouse);
    assert.equal(repeated.duplicated, true);
    assert.equal(repeated.deliveredAt, delivered.deliveredAt);
    snapshot = await WarehouseService.operations(warehouse);
    assert.equal(snapshot.counts.soldToday, 1);
    assert.equal(snapshot.counts.inDelivery, 0);
    assert.equal(await stock(2, 1), 0);
    await assert.rejects(() => WarehouseService.changeOrderStatus(first.id, "cancelled", 1, warehouse), (error) => error.status === 409);
    await client.execute({ sql: "UPDATE warehouse_orders SET delivered_at = '2020-01-01 10:00:00' WHERE id = ?", args: [first.id] });
    assert.equal((await WarehouseService.operations(warehouse)).counts.soldToday, 0);
  });
  await t.test("stock cero y modificación de borrador recalculan demanda al confirmar", async () => {
    const draft = await WarehouseService.createOrder({ customerId: customer.id, items: [{ productId: 1, quantity: 50, unitPrice: 18 }] }, 1, warehouse);
    assert.equal((await WarehouseService.operations(warehouse)).production.totalUnits, 0);
    await WarehouseService.updateDraftOrder(draft.id, { items: [{ productId: 1, quantity: 7, unitPrice: 18 }] }, warehouse);
    await WarehouseService.changeOrderStatus(draft.id, "confirmed", 1, warehouse);
    assert.equal((await WarehouseService.operations(warehouse)).production.totalUnits, 7);
    await WarehouseService.changeOrderStatus(draft.id, "cancelled", 1, warehouse);
    assert.equal((await WarehouseService.operations(warehouse)).production.totalUnits, 0);
    assert.equal(await stock(1, 1), localBefore);
  });
});

test("cuatro estados, preparación individual, versiones y entrega atómica", async (t) => {
  const localBefore = await stock(1, 1);
  await client.execute("UPDATE business_unit_products SET stock = 10 WHERE business_unit_id = 2 AND product_id = 1");
  const order = await WarehouseService.createOrder({ customerId: 2, status: "confirmed", items: [{ productId: 1, quantity: 2, unitPrice: 18 }, { productId: 2, quantity: 1, unitPrice: 12 }] }, 1, warehouse);
  assert.ok(["confirmed", "preparing"].includes(order.status));
  assert.ok(order.items.every((item) => item.status === "preparing"));
  await assert.rejects(() => WarehouseService.changeOrderStatus(order.id, "ready", 1, warehouse, order.version), (error) => error.status === 409);
  await assert.rejects(() => WarehouseService.changeOrderStatus(order.id, "dispatched", 1, warehouse, order.version), (error) => error.status === 409);
  await assert.rejects(() => WarehouseService.changeOrderStatus(order.id, "delivered", 1, warehouse, order.version), (error) => error.status === 409);
  await assert.rejects(() => WarehouseService.changeItemStatus(order.id, order.items[0].id, "delivered", warehouse), (error) => error.status === 400);
  await assert.rejects(() => WarehouseService.changeItemStatus(order.id, order.items[0].id, "ready", local), (error) => error.status === 403);
  let current = await WarehouseService.changeItemStatus(order.id, order.items[0].id, "ready", warehouse, order.version);
  assert.equal(current.items.filter((item) => item.status === "ready").length, 1);
  assert.notEqual(current.status, "ready", "un producto pendiente impide completar el pedido");
  await assert.rejects(() => WarehouseService.changeOrderStatus(order.id, "ready", 1, warehouse, current.version), (error) => error.status === 409);
  await assert.rejects(() => WarehouseService.changeItemStatus(order.id, order.items[1].id, "ready", warehouse, order.version), (error) => error.status === 409);
  current = await WarehouseService.changeItemStatus(order.id, order.items[1].id, "ready", warehouse, current.version);
  current = await WarehouseService.changeOrderStatus(order.id, "ready", 1, warehouse, current.version);
  assert.equal(current.status, "ready");
  assert.ok(current.readyAt);
  let snapshot = await WarehouseService.operations(warehouse);
  assert.equal(snapshot.counts.pending, 0);
  assert.equal(snapshot.counts.inDelivery, 1);
  assert.equal(snapshot.orders.find((row) => row.id === order.id).status, "ready", "persiste al volver a consultar");
  assert.equal(await stock(2, 1), 10, "preparar y marcar Listo no mueven stock");
  current = await WarehouseService.changeItemStatus(order.id, order.items[0].id, "preparing", warehouse, current.version);
  assert.ok(["confirmed", "preparing"].includes(current.status));
  assert.equal(current.readyAt, null);
  snapshot = await WarehouseService.operations(warehouse);
  assert.equal(snapshot.counts.pending, 1);
  assert.equal(snapshot.counts.inDelivery, 0);
  current = await WarehouseService.changeItemStatus(order.id, order.items[0].id, "ready", warehouse, current.version);
  current = await WarehouseService.changeOrderStatus(order.id, "ready", 1, warehouse, current.version);
  const beforeSend = current.version;
  current = await WarehouseService.changeOrderStatus(order.id, "dispatched", 1, warehouse, beforeSend);
  assert.ok(current.items.every((item) => item.status === "dispatched"));
  assert.equal(await stock(2, 1), 8);
  await assert.rejects(() => WarehouseService.changeOrderStatus(order.id, "dispatched", 1, warehouse, beforeSend), (error) => error.status === 409);
  assert.equal(await stock(2, 1), 8, "un reintento antiguo no duplica el descuento");
  await assert.rejects(() => WarehouseService.changeItemStatus(order.id, order.items[0].id, "preparing", warehouse, current.version), (error) => error.status === 409);
  current = await WarehouseService.changeOrderStatus(order.id, "delivered", 1, warehouse, current.version);
  assert.ok(current.items.every((item) => item.status === "delivered"));
  assert.equal(await stock(2, 1), 8);
  snapshot = await WarehouseService.operations(warehouse);
  assert.equal(snapshot.counts.soldToday, 1);
  assert.equal(snapshot.counts.inDelivery, 0);
  assert.equal(snapshot.orders.find((row) => row.id === order.id).deliveredAt, current.deliveredAt);
  assert.equal(await stock(1, 1), localBefore);

  await t.test("dos cambios simultáneos sobre la misma versión no se pisan", async () => {
    const concurrent = await WarehouseService.createOrder({ customerId: 2, status: "confirmed", items: [{ productId: 1, quantity: 1, unitPrice: 18 }, { productId: 2, quantity: 1, unitPrice: 12 }] }, 1, warehouse);
    const results = await Promise.allSettled(concurrent.items.map((item) => WarehouseService.changeItemStatus(concurrent.id, item.id, "ready", warehouse, concurrent.version)));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.find((result) => result.status === "rejected").reason.status, 409);
    const persisted = (await WarehouseService.listOrders(warehouse)).find((row) => row.id === concurrent.id);
    assert.equal(persisted.items.filter((item) => item.status === "ready").length, 1);
    assert.equal(persisted.version, 1);
    await WarehouseService.changeOrderStatus(concurrent.id, "cancelled", 1, warehouse, persisted.version);
  });

  await t.test("la venta del día cambia a medianoche de Córdoba, no de UTC", async () => {
    await client.execute({ sql: "UPDATE warehouse_orders SET delivered_at = '2026-11-09 23:58:00' WHERE id = ?", args: [order.id] });
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-10T02:59:00Z") });
    try {
      assert.equal((await WarehouseService.operations(warehouse)).counts.soldToday, 1);
      t.mock.timers.setTime(new Date("2026-11-10T03:00:00Z").getTime());
      assert.equal((await WarehouseService.operations(warehouse)).counts.soldToday, 0);
    } finally { t.mock.timers.reset(); }
  });
  // Restaurar stock para la prueba HTTP independiente que sigue.
  await client.execute("UPDATE business_unit_products SET stock = 0 WHERE business_unit_id = 2 AND product_id = 1");
});

test("las rutas reales de operaciones y previsualización exigen administrador del Galpón", async () => {
  const { default: warehouseRoutes } = await import("../routes/warehouse.routes.js");
  const app = express();
  app.use(express.json());
  app.use("/warehouse", warehouseRoutes);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/warehouse`;
  const token = jwt.sign({ id: 1, role: "admin" }, process.env.JWT_SECRET);
  const headers = { Authorization: `Bearer ${token}`, "X-Business-Unit": "WAREHOUSE", "Content-Type": "application/json" };
  try {
    assert.equal((await fetch(`${url}/operations`)).status, 401);
    assert.equal((await fetch(`${url}/operations`, { headers: { ...headers, "X-Business-Unit": "LOCAL" } })).status, 403);
    const cashier = jwt.sign({ id: 2, role: "cajero" }, process.env.JWT_SECRET);
    assert.equal((await fetch(`${url}/operations`, { headers: { ...headers, Authorization: `Bearer ${cashier}` } })).status, 403);
    const response = await fetch(`${url}/operations`, { headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const data = await response.json();
    assert.ok(data.orders.every((order) => order.businessUnitId === 2));
    assert.ok(data.customers.every((customer) => customer.id !== 1));
    const preview = await fetch(`${url}/production-preview`, { method: "POST", headers, body: JSON.stringify({ items: [{ productId: 1, quantity: 9, unitPrice: 18 }] }) });
    assert.equal(preview.status, 200);
    assert.equal((await preview.json()).production.totalUnits, 9);
    for (const items of [[], [null], [{ productId: 1, quantity: -1, unitPrice: 18 }], [{ productId: 1, quantity: 1.5, unitPrice: 18 }]]) {
      assert.equal((await fetch(`${url}/production-preview`, { method: "POST", headers, body: JSON.stringify({ items }) })).status, 400);
    }
    const order = await WarehouseService.createOrder({ customerId: 2, status: "confirmed", items: [{ productId: 1, quantity: 1, unitPrice: 18 }] }, 1, warehouse);
    const itemUrl = `${url}/orders/${order.id}/items/${order.items[0].id}/status`;
    assert.equal((await fetch(itemUrl, { method: "PATCH", headers: { ...headers, "X-Business-Unit": "LOCAL" }, body: JSON.stringify({ status: "ready", expectedVersion: 0 }) })).status, 403);
    const prepared = await fetch(itemUrl, { method: "PATCH", headers, body: JSON.stringify({ status: "ready", expectedVersion: 0 }) });
    assert.equal(prepared.status, 200);
    assert.equal((await prepared.json()).items[0].status, "ready");
    assert.equal((await fetch(itemUrl, { method: "PATCH", headers, body: JSON.stringify({ status: "preparing", expectedVersion: 0 }) })).status, 409);
    const customer = { name: "Contacto HTTP", phone: "+54 351 777-8888", address: "Ruta 9, Córdoba" };
    const created = await fetch(`${url}/customers`, { method: "POST", headers, body: JSON.stringify(customer) });
    assert.equal(created.status, 201);
    const retry = await fetch(`${url}/customers`, { method: "POST", headers, body: JSON.stringify(customer) });
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).id, (await created.json()).id);
    const liquidPayload={name:'Prueba HTTP líquido',cost:10,price:20,minStock:1,containers:[{kind:'Granel',capacity:0,count:1,content:1,location:'WAREHOUSE'}],idempotencyKey:'http-liquid-create'};
    assert.equal((await fetch(`${url}/liquids`,{method:'POST',headers:{...headers,'X-Business-Unit':'LOCAL'},body:JSON.stringify(liquidPayload)})).status,403);
    assert.equal((await fetch(`${url}/liquids`,{method:'POST',headers,body:JSON.stringify(liquidPayload)})).status,200);
    const liquidList=await (await fetch(`${url}/liquids`,{headers})).json();
    let liquid=liquidList.find(p=>p.name===liquidPayload.name);
    await client.execute("INSERT INTO users(id,name,email,password,role) VALUES(999,'Operario HTTP','liquid-worker@test','x','EMPLEADO_GALPON')");
    const workerHeaders={...headers,Authorization:`Bearer ${jwt.sign({id:999,role:'EMPLEADO_GALPON'},process.env.JWT_SECRET)}`};
    const workerProducts=await (await fetch(`${url}/liquids`,{headers:workerHeaders})).json();
    assert.ok(workerProducts.every(p=>!('cost' in p) && !('price' in p)));
    assert.equal((await fetch(`${url}/liquids`,{method:'POST',headers:workerHeaders,body:JSON.stringify(liquidPayload)})).status,403);
    assert.equal((await fetch(`${url}/liquids/${liquid.liquidProductId}/history`,{headers:workerHeaders})).status,403);
    assert.equal((await fetch(`${url}/liquids/${liquid.liquidProductId}`,{method:'DELETE',headers:workerHeaders,body:JSON.stringify({expectedVersion:liquid.version})})).status,403);
    assert.equal((await fetch(`${url}/liquids/${liquid.liquidProductId}`,{method:'PUT',headers:workerHeaders,body:JSON.stringify({...liquidPayload,expectedVersion:liquid.version})})).status,403);
    const adjustment={containers:[{kind:'Granel',capacity:0,count:1,content:1.25,location:'WAREHOUSE'}],expectedVersion:liquid.version,idempotencyKey:'http-worker-adjust'};
    assert.equal((await fetch(`${url}/liquids/${liquid.liquidProductId}`,{method:'PUT',headers:workerHeaders,body:JSON.stringify(adjustment)})).status,200);
    liquid=(await (await fetch(`${url}/liquids`,{headers})).json()).find(p=>p.liquidProductId===liquid.liquidProductId);
    assert.equal(liquid.stock,1.25); assert.equal(liquid.cost,10);
    assert.equal((await fetch(`${url}/liquids/${liquid.liquidProductId}`,{method:'PUT',headers,body:JSON.stringify({containers:[],expectedVersion:liquid.version,idempotencyKey:'http-empty'})})).status,200);
    assert.equal((await fetch(`${url}/liquids/${liquid.liquidProductId}`,{method:'DELETE',headers,body:JSON.stringify({expectedVersion:liquid.version+1})})).status,200);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('líquidos: aislamiento, envases, concurrencia, permisos, producción y despacho transaccional', async (t) => {
  const { WarehouseLiquidsService: service } = await import('./warehouseLiquids.service.js');
  const { ProductService } = await import('./product.service.js');
  const localSnapshot = async () => {
    const results = await client.batch(['SELECT * FROM products ORDER BY id', 'SELECT * FROM business_unit_products WHERE business_unit_id = 1 ORDER BY id'], 'read');
    return JSON.stringify(results.map(r => r.rows));
  };
  const before = await localSnapshot();
  const save = (id, data, employee = false) => service.save(id, { ...data, idempotencyKey: data.idempotencyKey || crypto.randomUUID() }, 1, warehouse, employee);
  const get = async id => (await service.list(warehouse)).find(p => p.liquidProductId === id);
  const row = (kind, capacity, count, content, location = 'WAREHOUSE') => ({kind,capacity,count,content,location});
  const result = await save(null, { name: 'Jabón líquido exclusivo', barcode: '990099', cost: 100, price: 200, minStock: 5,
    containers: [row('Tacho',20,1,20),row('Tarro',5,1,5),row('Tarro',5,2,10,'LOCAL')] });
  const id = result.liquidProductId;
  await t.test('25 L en Galpón, 10 L En Local y dos tarros agrupados; nunca aparece en Local', async () => {
    const p = await get(id);
    assert.deepEqual([p.stock,p.inLocal,p.total], [25,10,35]);
    assert.equal(p.containers.find(c=>c.location==='LOCAL').count,2);
    assert.equal((await service.list(warehouse)).length,1);
    assert.ok(!(await ProductService.getAll(local)).some(p=>p.name==='Jabón líquido exclusivo'));
    assert.equal(await localSnapshot(),before);
    await assert.rejects(()=>ProductService.update(1,{name:'Cambio desde Galpón'},warehouse,1),e=>e.status===409);
    await assert.rejects(()=>ProductService.create({name:'Catálogo compartido',price:1},warehouse),e=>e.status===409);
    assert.equal(await localSnapshot(),before);
  });
  await t.test('traslado físico conserva total y Local; envases parciales cuentan contenido real', async () => {
    let p = await get(id);
    await save(id,{expectedVersion:p.version,containers:[row('Tacho',20,1,20),row('Tarro',5,3,15,'LOCAL')]});
    p = await get(id); assert.deepEqual([p.stock,p.inLocal,p.total],[20,15,35]);
    await save(id,{expectedVersion:p.version,containers:[row('Tacho',20,1,12),row('Bidón',5,1,5),row('Tarro',5,3,15,'LOCAL')]});
    p = await get(id); assert.equal(p.stock,17);
    await save(id,{expectedVersion:p.version,containers:p.containers.map(c=>({...c,content:c.kind==='Tacho'?9:c.content}))});
    assert.equal((await get(id)).stock,14);
    const {createClient} = await import('@libsql/client');
    const independentClient = createClient({url:process.env.TURSO_DATABASE_URL});
    try {
      const persisted = await independentClient.execute({sql:"SELECT SUM(content_ml) AS ml FROM warehouse_liquid_containers WHERE product_id=? AND location='WAREHOUSE'",args:[id]});
      assert.equal(persisted.rows[0].ml,14000);
    } finally { independentClient.close(); }
    assert.equal(await localSnapshot(),before);
  });
  await t.test('rechaza negativos, grupos parciales, capacidad excedida y cambios comerciales del empleado',async()=>{
    const p=await get(id);
    for(const containers of [[row('Tacho',20,1,-1)],[row('Tarro',5,2,9)],[row('Tarro',5,1,6)]]) {
      await assert.rejects(()=>save(id,{expectedVersion:p.version,containers}),e=>e.status===400);
    }
    await assert.rejects(()=>save(id,{expectedVersion:p.version,price:999,containers:p.containers},true),e=>e.status===403);
    await assert.rejects(()=>service.list(local),e=>e.status===403);
    await assert.rejects(()=>service.archive(id,{expectedVersion:p.version},1,warehouse),e=>e.status===409);
  });
  await t.test('reintentos idempotentes y dos sesiones no pisan cantidades; auditoría persistida',async()=>{
    const p=await get(id), payload={expectedVersion:p.version,containers:p.containers,idempotencyKey:'liquid-retry'};
    await save(id,payload); assert.equal((await save(id,payload)).duplicated,true);
    const current=await get(id);
    const attempts=await Promise.allSettled([save(id,{expectedVersion:current.version,containers:current.containers}),save(id,{expectedVersion:current.version,containers:current.containers})]);
    assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(attempts.find(r=>r.status==='rejected').reason.status,409);
    const history=await service.history(id,warehouse);
    assert.ok(history.length>=5); assert.ok(history.every(r=>r.userId===1 && r.createdAt));
    assert.equal((await get(id)).stock,14);
  });
  await t.test('estados y faltantes excluyen litros En Local; admite pedidos decimales',async()=>{
    let p=await get(id);
    await save(id,{expectedVersion:p.version,containers:[row('Granel',0,1,5),row('Tarro',5,2,10,'LOCAL')]},true);
    p=await get(id); assert.equal(p.status,'Bajo stock');
    const preview=await WarehouseService.operations(warehouse,[{productId:p.id,quantity:7.125,unitPrice:200}]);
    assert.equal(preview.preview.items[0].toProduce,2.125);
    assert.equal(preview.preview.production.totalLiters,2.125);
    await save(id,{expectedVersion:p.version,containers:[row('Granel',0,1,0),row('Tarro',5,2,10,'LOCAL')]},true);
    p=await get(id); assert.equal(p.status,'Sin stock'); assert.equal(p.inLocal,10);
  });
  await t.test('despacho exige asignación, revierte errores, descuenta una vez y cancela sin duplicar',async()=>{
    let p=await get(id);
    await save(id,{expectedVersion:p.version,containers:[row('Bidón',5,2,10),row('Tarro',5,2,10,'LOCAL')]});
    p=await get(id);
    let order=await WarehouseService.createOrder({customerId:2,status:'confirmed',items:[{productId:p.id,quantity:3.125,unitPrice:200}]},1,warehouse);
    const item=order.items[0];
    order=await WarehouseService.changeItemStatus(order.id,item.id,'ready',warehouse);
    order=await WarehouseService.changeOrderStatus(order.id,'ready',1,warehouse);
    await assert.rejects(()=>WarehouseService.changeOrderStatus(order.id,'dispatched',1,warehouse),e=>e.status===400);
    const localContainer=p.containers.find(c=>c.location==='LOCAL');
    await assert.rejects(()=>WarehouseService.changeOrderStatus(order.id,'dispatched',1,warehouse,order.version,{[item.id]:[{containerId:localContainer.id,liters:3.125}]}),e=>e.status===409);
    const source=p.containers.find(c=>c.location==='WAREHOUSE');
    await assert.rejects(()=>WarehouseService.changeOrderStatus(order.id,'dispatched',1,warehouse,order.version,{[item.id]:[{containerId:source.id,liters:2}]}),e=>e.status===400);
    assert.equal((await get(id)).stock,10);
    await WarehouseService.changeOrderStatus(order.id,'dispatched',1,warehouse,order.version,{[item.id]:[{containerId:source.id,liters:3.125}]});
    await WarehouseService.changeOrderStatus(order.id,'dispatched',1,warehouse);
    p=await get(id); assert.equal(p.stock,6.875); assert.equal(p.inLocal,10);
    assert.ok(p.containers.some(c=>c.count===1 && c.content===1.875));
    await WarehouseService.changeOrderStatus(order.id,'cancelled',1,warehouse);
    await WarehouseService.changeOrderStatus(order.id,'cancelled',1,warehouse);
    assert.equal((await get(id)).stock,10);
    assert.equal(await localSnapshot(),before);
  });
});

async function stock(unitId, productId) {
  const result = await client.execute({ sql: "SELECT stock FROM business_unit_products WHERE business_unit_id=? AND product_id=?", args: [unitId, productId] });
  return Number(result.rows[0].stock);
}
