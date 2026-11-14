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
    "CREATE TABLE subscription_config (id INTEGER PRIMARY KEY, cutoff_day INTEGER, last_paid_at TEXT, updated_at TEXT)",
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
});

after(async () => { client?.close(); if (directory) await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

async function stock(unitId, productId) {
  const result = await client.execute({ sql: "SELECT stock FROM business_unit_products WHERE business_unit_id=? AND product_id=?", args: [unitId, productId] });
  return Number(result.rows[0].stock);
}

test("Empleado del galpón: alta, sesión, permisos mínimos, stock auditado y estados", async (t) => {
  const { default: authRoutes } = await import("../routes/auth.routes.js");
  const { default: warehouseRoutes } = await import("../routes/warehouse.routes.js");
  const { default: userRoutes } = await import("../routes/user.routes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  app.use("/api/warehouse", warehouseRoutes);
  app.use("/api/users", userRoutes);
  for (const routeName of ["product", "category", "customer", "cashRegister", "transaction", "stats", "inventory", "businessUnit", "subscription", "paymentMethod", "priceGroup", "packType", "promotion", "fixedExpense", "dailyExpense", "internalWithdrawal", "productExtraction"]) {
    const { default: router } = await import(`../routes/${routeName}.routes.js`);
    const urls = { product: "products", category: "categories", customer: "customers", cashRegister: "cash-register", transaction: "transactions", businessUnit: "business-units", paymentMethod: "payment-methods", priceGroup: "price-groups", packType: "pack-types", promotion: "promotions", fixedExpense: "fixed-expenses", dailyExpense: "daily-expenses", internalWithdrawal: "internal-withdrawals", productExtraction: "product-extractions" };
    app.use(`/api/${urls[routeName] || routeName}`, router);
  }
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api`;
  const adminHeaders = { Authorization: `Bearer ${jwt.sign({ id: 1, role: "admin" }, process.env.JWT_SECRET)}`, "Content-Type": "application/json", "X-Business-Unit": "LOCAL" };
  let employee, employeeHeaders;
  const request = (path, method = "GET", body, headers = employeeHeaders) => fetch(`${url}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try {
    await t.test("el administrador crea el rol y el empleado inicia sesión con credenciales propias", async () => {
      const created = await request("/auth/register", "POST", { name: "Empleado Operativo", email: "empleado@test", password: "test-only-password", role: "EMPLEADO_GALPON" }, adminHeaders);
      assert.equal(created.status, 201);
      employee = await created.json();
      assert.equal(employee.role, "EMPLEADO_GALPON");
      assert.equal(employee.password, undefined);
      const login = await request("/auth/login", "POST", { email: "empleado@test", password: "test-only-password" }, { "Content-Type": "application/json" });
      assert.equal(login.status, 200);
      const session = await login.json();
      assert.equal(session.user.name, employee.name);
      assert.equal(session.user.role, "EMPLEADO_GALPON");
      employeeHeaders = { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json", "X-Business-Unit": "WAREHOUSE" };
      const record = await client.execute({ sql: "SELECT password, role FROM users WHERE id = ?", args: [employee.id] });
      assert.notEqual(record.rows[0].password, "test-only-password");
      assert.equal(record.rows[0].role, "EMPLEADO_GALPON");
      assert.equal((await request("/auth/login", "POST", { email: "empleado@test", password: "incorrecta" })).status, 401);
    });

    const first = await WarehouseService.createOrder({ customerId: 2, status: "confirmed", chargeToAccount: true, items: [{ productId: 1, quantity: 25, unitPrice: 18 }] }, 1, warehouse);
    const second = await WarehouseService.createOrder({ customerId: 2, status: "confirmed", items: [{ productId: 1, quantity: 20, unitPrice: 18 }] }, 1, warehouse);
    await client.execute({ sql: "UPDATE warehouse_orders SET created_at = '2026-10-01 10:00:00' WHERE id = ?", args: [first.id] });
    await client.execute({ sql: "UPDATE warehouse_orders SET created_at = '2026-10-02 10:00:00' WHERE id = ?", args: [second.id] });
    await t.test("puede leer pedidos, stock y faltantes acumulados sin datos comerciales", async () => {
      const response = await request("/warehouse/operations");
      assert.equal(response.status, 200);
      const snapshot = await response.json();
      assert.equal(snapshot.production.items.find((row) => row.productId === 1).toProduce, 25);
      assert.deepEqual(snapshot.production.items[0].orders.map((row) => row.id), [first.id, second.id]);
      assert.equal(snapshot.production.items[0].oldestOrderAt, "2026-10-01 10:00:00");
      assert.equal(snapshot.customers.length, 0);
      assert.deepEqual(Object.keys(snapshot.access).sort(), ["daysRemaining", "isExpired", "isWarningPhase"]);
      assert.ok(snapshot.orders.every((row) => row.customerName === "Cliente"));
      assert.ok(snapshot.products.every((row) => !Object.hasOwn(row, "price") && !Object.hasOwn(row, "cost")));
      for (const row of snapshot.orders) {
        for (const key of ["total", "chargeToAccount", "observations", "customerPhone", "customerAddress"]) assert.equal(Object.hasOwn(row, key), false);
        assert.ok(row.items.every((item) => !Object.hasOwn(item, "unitCost") && !Object.hasOwn(item, "unitPrice") && !Object.hasOwn(item, "total")));
      }
      const list = await request("/warehouse/orders");
      assert.equal(list.status, 200);
      assert.ok((await list.json()).every((order) => order.total === undefined));
      assert.equal((await request("/warehouse/operations", "GET", undefined, { ...employeeHeaders, "X-Business-Unit": "LOCAL" })).status, 403);
      const noUnit = { ...employeeHeaders }; delete noUnit["X-Business-Unit"];
      assert.equal((await request("/warehouse/operations", "GET", undefined, noUnit)).status, 200);
    });

    await t.test("las URL directas y métodos no autorizados devuelven 403", async () => {
      const denied = [
        ["/users"], ["/users/1", "PUT", { role: "admin" }], ["/users/1", "DELETE"],
        ["/auth/register", "POST", { name: "Intruso", email: "intruso@test", password: "x", role: "admin" }],
        ["/products"], ["/products/by-barcode/1"], ["/products", "POST", { name: "Nuevo" }], ["/products/1", "PUT", { stock: 999, price: 1 }], ["/products/1", "DELETE"], ["/products/bulk-assign", "POST", {}],
        ["/categories"], ["/customers"], ["/customers/2"], ["/customers", "POST", {}], ["/cash-register/status"], ["/cash-register/open", "POST", {}],
        ["/transactions/1"], ["/transactions", "POST", {}], ["/stats/activity-log"], ["/inventory/movements"], ["/inventory/transfers", "POST", {}],
        ["/business-units"], ["/subscription/status"], ["/payment-methods"], ["/price-groups"], ["/pack-types"], ["/promotions"], ["/fixed-expenses"], ["/daily-expenses"], ["/internal-withdrawals", "POST", {}], ["/product-extractions"],
        ["/warehouse/stats"], ["/warehouse/purchases"], ["/warehouse/customers", "POST", {}], ["/warehouse/production-preview", "POST", { items: [] }],
        ["/warehouse/orders", "POST", {}], [`/warehouse/orders/${first.id}`, "PUT", { items: [] }], [`/warehouse/orders/${first.id}`, "DELETE"],
        [`/warehouse/orders/${first.id}/status`, "PATCH", { status: "cancelled" }], [`/warehouse/orders/${first.id}/status`, "PATCH", { status: "confirmed" }],
      ];
      for (const [path, method = "GET", body] of denied) assert.equal((await request(path, method, body)).status, 403, `${method} ${path}`);
      assert.equal((await request("/users", "GET", undefined, adminHeaders)).status, 200, "el administrador conserva su acceso");
      const cashierHeaders = { ...adminHeaders, Authorization: `Bearer ${jwt.sign({ id: 2, role: "cajero" }, process.env.JWT_SECRET)}` };
      assert.equal((await request("/warehouse/operations", "GET", undefined, { ...cashierHeaders, "X-Business-Unit": "WAREHOUSE" })).status, 403);
      assert.equal((await request("/products", "GET", undefined, cashierHeaders)).status, 200, "el cajero conserva el catálogo del Local");
    });

    await t.test("actualiza sólo cantidades, audita al empleado, recalcula faltantes y evita duplicados", async () => {
      const localBefore = await stock(1, 1);
      const form = { stock: 35, expectedStock: 20, idempotencyKey: "employee-stock-1" };
      const saved = await request("/warehouse/stock/1", "PATCH", form);
      assert.equal(saved.status, 200);
      assert.equal((await saved.json()).stock, 35);
      const retry = await request("/warehouse/stock/1", "PATCH", form);
      assert.equal(retry.status, 200);
      assert.equal((await retry.json()).duplicated, true);
      assert.equal((await (await request("/warehouse/operations")).json()).production.items[0].toProduce, 10);
      const audit = await client.execute({ sql: "SELECT user_id, business_unit_id, stock_before, stock_after, created_at FROM inventory_movements WHERE idempotency_key = ?", args: [`warehouse-stock:${employee.id}:employee-stock-1`] });
      assert.equal(audit.rows.length, 1);
      assert.equal(audit.rows[0].user_id, employee.id); assert.equal(audit.rows[0].business_unit_id, 2);
      assert.equal(audit.rows[0].stock_before, 20); assert.equal(audit.rows[0].stock_after, 35); assert.ok(audit.rows[0].created_at);
      for (const invalid of [{ ...form, price: 1 }, { ...form, name: "Cambio" }, { ...form, cost: 1 }, { ...form, stock: -1 }, { ...form, stock: 1.5 }, { ...form, stock: "35" }, { stock: 36 }, { ...form, isAvailable: false }]) {
        assert.equal((await request("/warehouse/stock/1", "PATCH", invalid)).status, 400);
      }
      assert.equal((await request("/warehouse/stock/1", "PATCH", { stock: 45, expectedStock: 20, idempotencyKey: "stale-stock" })).status, 409);
      assert.equal(await stock(1, 1), localBefore);
      const product = await client.execute("SELECT sale_price, cost FROM business_unit_products WHERE business_unit_id = 2 AND product_id = 1");
      assert.equal(product.rows[0].sale_price, 18); assert.equal(product.rows[0].cost, 8);
      const concurrent = await Promise.all([
        request("/warehouse/stock/1", "PATCH", { stock: 40, expectedStock: 35, idempotencyKey: "race-a" }),
        request("/warehouse/stock/1", "PATCH", { stock: 45, expectedStock: 35, idempotencyKey: "race-b" }),
      ]);
      assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 409]);
    });

    await t.test("gestiona preparación, Listo, En envío y Entregado sin crear pedidos", async () => {
      let order = first;
      const prepared = await request(`/warehouse/orders/${order.id}/items/${order.items[0].id}/status`, "PATCH", { status: "ready", expectedVersion: order.version });
      assert.equal(prepared.status, 200); order = await prepared.json(); assert.equal(order.items[0].status, "ready"); assert.equal(order.total, undefined);
      for (const status of ["ready", "dispatched", "delivered"]) {
        const response = await request(`/warehouse/orders/${order.id}/status`, "PATCH", { status, expectedVersion: order.version });
        assert.equal(response.status, 200); order = await response.json(); assert.equal(order.status, status); assert.equal(order.total, undefined);
      }
      assert.ok(order.deliveredAt);
      const persisted = (await (await request("/warehouse/operations")).json()).orders.find((row) => row.id === order.id);
      assert.equal(persisted.status, "delivered"); assert.equal(persisted.deliveredAt, order.deliveredAt);
      const count = await client.execute("SELECT count(*) AS n FROM warehouse_orders"); assert.equal(count.rows[0].n, 2);
    });

    await t.test("un cambio de rol o baja revoca los permisos de tokens anteriores", async () => {
      assert.equal((await request(`/users/${employee.id}`, "PUT", { role: "cajero" }, adminHeaders)).status, 200);
      assert.equal((await request("/warehouse/operations")).status, 401);
      assert.equal((await request(`/users/${employee.id}`, "PUT", { role: "EMPLEADO_GALPON" }, adminHeaders)).status, 200);
      assert.equal((await request("/warehouse/operations")).status, 200);
      assert.equal((await request(`/users/${employee.id}`, "DELETE", undefined, adminHeaders)).status, 200);
      assert.equal((await request("/warehouse/operations")).status, 401);
    });
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

