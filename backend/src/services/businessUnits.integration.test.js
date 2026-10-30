import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";

let client, db, WarehouseService, InventoryService, TransactionService, CustomerService, ProductService, StatsService, authenticate;
let directory;
const local = { id: 1, code: "LOCAL", name: "Local" };
const warehouse = { id: 2, code: "WAREHOUSE", name: "Galpón" };

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "mrtotal-business-integration-"));
  process.env.TURSO_DATABASE_URL = `file:${path.join(directory, "integration.db")}`;
  process.env.JWT_SECRET = "integration-secret";
  ({ client, db } = await import("../db/client.js"));
  ({ WarehouseService } = await import("./warehouse.service.js"));
  ({ InventoryService } = await import("./inventory.service.js"));
  ({ TransactionService } = await import("./transaction.service.js"));
  ({ CustomerService } = await import("./customer.service.js"));
  ({ ProductService } = await import("./product.service.js"));
  ({ StatsService } = await import("./stats.service.js"));
  ({ authenticate } = await import("../middleware/auth.middleware.js"));
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
    "CREATE TABLE account_movements (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL, type TEXT NOT NULL, amount REAL NOT NULL, transaction_id INTEGER, method_name TEXT, detail TEXT, register_id INTEGER, user_id INTEGER, created_at TEXT, business_unit_id INTEGER, source_type TEXT, source_id TEXT, reversal_of_movement_id INTEGER)",
    "CREATE UNIQUE INDEX account_movements_source_unique ON account_movements(business_unit_id, source_type, source_id, type) WHERE source_type IS NOT NULL",
    "CREATE TABLE warehouse_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, business_unit_id INTEGER NOT NULL, customer_id INTEGER, status TEXT NOT NULL, total REAL NOT NULL, observations TEXT, charge_to_account INTEGER NOT NULL, user_id INTEGER, idempotency_key TEXT, confirmed_at TEXT, dispatched_at TEXT, cancelled_at TEXT, created_at TEXT, updated_at TEXT, UNIQUE(business_unit_id, idempotency_key))",
    "CREATE TABLE warehouse_order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, product_id INTEGER, product_name TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price REAL NOT NULL, unit_cost REAL NOT NULL, total REAL NOT NULL)",
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
    "INSERT INTO payment_methods VALUES (1, 'Efectivo', 0)",
    "INSERT INTO promotions VALUES (1, 'Promo mixta', NULL, 35, 1, NULL), (2, '3 productos por $50', NULL, 50, 1, NULL)",
    "INSERT INTO promotion_items VALUES (1,1,1,1),(2,1,2,1),(3,2,1,3)",
  ], "write");
});

after(async () => { client?.close(); if (directory) await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

async function stock(unitId, productId) {
  const result = await client.execute({ sql: "SELECT stock FROM business_unit_products WHERE business_unit_id=? AND product_id=?", args: [unitId, productId] });
  return Number(result.rows[0].stock);
}

function authResponse() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

const cashPayment = [{ methodId: 1, type: "Efectivo", amount: 20, baseAmount: 20 }];

test("flujos multiunidad, idempotencia, reversiones y concurrencia", async (t) => {
  await t.test("el administrador accede a ambas unidades y el cajero queda forzado al Local", async () => {
    for (const code of ["LOCAL", "WAREHOUSE"]) {
      const token = jwt.sign({ id: 1, role: "admin" }, process.env.JWT_SECRET);
      const req = { headers: { authorization: `Bearer ${token}`, "x-business-unit": code } }; const res = authResponse(); let next = false;
      await authenticate(req, res, () => { next = true; });
      assert.equal(next, true); assert.equal(req.businessUnit.code, code);
    }
    const token = jwt.sign({ id: 2, role: "cajero" }, process.env.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}`, "x-business-unit": "WAREHOUSE" } }; const res = authResponse();
    await authenticate(req, res, () => {});
    assert.equal(res.statusCode, 403);
  });

  await t.test("clientes con igual documento quedan separados por unidad", async () => {
    const localCustomers = await CustomerService.list({}, local);
    const warehouseCustomers = await CustomerService.list({}, warehouse);
    assert.deepEqual(localCustomers.map((c) => c.id), [1]);
    assert.deepEqual(new Set(warehouseCustomers.map((c) => c.id)), new Set([2, 3]));
    assert.equal(warehouseCustomers.find((c) => c.id === 3).isInternal, true);
  });

  await t.test("el catálogo local expone el precio mayorista separado", async () => {
    const catalog = await ProductService.getAll(local);
    assert.equal(catalog.find((product) => product.id === 1).wholesalePrice, 17);
  });

  await t.test("recibir una compra aumenta stock una vez y cancelarla lo revierte una vez", async () => {
    const purchase = await WarehouseService.createPurchase({ supplier: "Proveedor", idempotencyKey: "purchase-1", items: [{ productId: 1, quantity: 5, unitCost: 9 }] }, 1, warehouse);
    await WarehouseService.changePurchaseStatus(purchase.id, "received", 1, warehouse);
    await WarehouseService.changePurchaseStatus(purchase.id, "received", 1, warehouse);
    assert.equal(await stock(2, 1), 25);
    await WarehouseService.changePurchaseStatus(purchase.id, "cancelled", 1, warehouse);
    await WarehouseService.changePurchaseStatus(purchase.id, "cancelled", 1, warehouse);
    assert.equal(await stock(2, 1), 20);
  });

  await t.test("despachar un pedido descuenta una vez y cancelarlo crea una sola reversión", async () => {
    const order = await WarehouseService.createOrder({ customerId: 2, idempotencyKey: "order-1", items: [{ productId: 1, quantity: 3, unitPrice: 18 }] }, 1, warehouse);
    await WarehouseService.changeOrderStatus(order.id, "confirmed", 1, warehouse);
    await WarehouseService.changeOrderStatus(order.id, "dispatched", 1, warehouse);
    await WarehouseService.changeOrderStatus(order.id, "dispatched", 1, warehouse);
    assert.equal(await stock(2, 1), 17);
    await WarehouseService.changeOrderStatus(order.id, "cancelled", 1, warehouse);
    await WarehouseService.changeOrderStatus(order.id, "cancelled", 1, warehouse);
    assert.equal(await stock(2, 1), 20);
    const reversals = await client.execute("SELECT count(*) AS n FROM inventory_movements WHERE movement_type='ORDER_DISPATCH_REVERSAL'");
    assert.equal(Number(reversals.rows[0].n), 1);
  });

  await t.test("la transferencia es atómica e idempotente", async () => {
    await InventoryService.transfer({ productId: 1, quantity: 4, idempotencyKey: "transfer-1" }, 1);
    await InventoryService.transfer({ productId: 1, quantity: 4, idempotencyKey: "transfer-1" }, 1);
    assert.equal(await stock(2, 1), 16); assert.equal(await stock(1, 1), 14);
  });

  await t.test("una venta local normal sólo descuenta Local", async () => {
    const sale = await TransactionService.create({ total: 34, payments: cashPayment, items: [{ productId: 1, quantity: 2, price: 17, total: 34, saleMode: "mayorista" }], idempotencyKey: "sale-normal" }, 1, local);
    assert.equal(await stock(1, 1), 12); assert.equal(await stock(2, 1), 16);
    assert.equal(sale.items[0].saleMode, "mayorista");
    assert.equal(sale.items[0].price, 17);

    const printableSale = await TransactionService.getById(sale.id, local);
    assert.equal(printableSale.id, sale.id);
    assert.equal(printableSale.payments[0].methodName, "Efectivo");
    assert.equal(printableSale.items[0].productName, "Producto propio");
    await assert.rejects(
      () => TransactionService.getById(sale.id, warehouse),
      (error) => error.status === 400
    );
  });

  await t.test("abastecimiento directo descuenta exactamente una vez el Galpón", async () => {
    const payload = { total: 45, payments: cashPayment, items: [{ productId: 2, quantity: 3, price: 15, total: 45 }], idempotencyKey: "sale-direct" };
    await TransactionService.create(payload, 1, local); await TransactionService.create(payload, 1, local);
    assert.equal(await stock(1, 2), 5); assert.equal(await stock(2, 2), 5);
    const rows = await client.execute("SELECT count(*) AS n FROM inventory_movements WHERE movement_type='LOCAL_SALE_WAREHOUSE_FULFILLMENT'");
    assert.equal(Number(rows.rows[0].n), 1);
  });

  await t.test("falta de stock del Galpón revierte toda la venta local", async () => {
    const before = await client.execute("SELECT count(*) AS n FROM transactions");
    await assert.rejects(() => TransactionService.create({ total: 999, payments: cashPayment, items: [{ productId: 2, quantity: 99, price: 15, total: 999 }], idempotencyKey: "sale-fail" }, 1, local), (error) => error.status === 409);
    const after = await client.execute("SELECT count(*) AS n FROM transactions");
    assert.equal(after.rows[0].n, before.rows[0].n); assert.equal(await stock(2, 2), 5);
  });

  await t.test("una promoción mixta descuenta cada componente de su unidad abastecedora", async () => {
    await TransactionService.create({ total: 35, payments: cashPayment, items: [{ promotionId: 1, quantity: 1, total: 35 }], idempotencyKey: "sale-promo" }, 1, local);
    assert.equal(await stock(1, 1), 11); assert.equal(await stock(2, 2), 4); assert.equal(await stock(1, 2), 5);
  });

  await t.test("una promoción puede ofrecer varias unidades del mismo producto", async () => {
    const before = await stock(1, 1);
    const sale = await TransactionService.create({
      total: 50,
      payments: [{ methodId: 1, type: "Efectivo", amount: 50, baseAmount: 50 }],
      items: [{ promotionId: 2, quantity: 1, total: 50 }],
      idempotencyKey: "sale-single-product-promo",
    }, 1, local);
    assert.equal(await stock(1, 1), before - 3);
    assert.equal(JSON.parse(sale.items[0].promotionComposition)[0].quantity, 3);
  });

  await t.test("solicitudes concurrentes no permiten stock negativo", async () => {
    const make = (key) => TransactionService.create({ total: 120, payments: cashPayment, items: [{ productId: 1, quantity: 6, price: 20, total: 120 }], idempotencyKey: key }, 1, local);
    const results = await Promise.allSettled([make("concurrent-a"), make("concurrent-b")]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await stock(1, 1), 2);
  });

  await t.test("las estadísticas permanecen separadas por unidad", async () => {
    const warehouseStats = await WarehouseService.stats(warehouse);
    const localProfitability = await StatsService.getProfitability({}, local);
    const warehouseProfitability = await StatsService.getProfitability({}, warehouse);
    const localRestock = await StatsService.getRestockCost({}, local);
    const futureRestock = await StatsService.getRestockCost({ from: "2099-01-01", to: "2099-12-31" }, local);
    const topProducts = await StatsService.getTopProducts({}, local);
    assert.ok(localProfitability.summary.netRevenue > 0);
    assert.equal(warehouseProfitability.summary.netRevenue, 0);
    assert.equal(localRestock.restockCost, localProfitability.summary.totalCost);
    assert.ok(localRestock.restockCost > 0);
    assert.equal(futureRestock.restockCost, 0);
    assert.deepEqual(topProducts.map((product) => [product.productName, product.quantitySold]), [["Producto propio", 12], ["Producto directo", 4]]);
    assert.equal(warehouseStats.stockUnits, (await stock(2, 1)) + (await stock(2, 2)));
  });
});

test("la baja lógica oculta el catálogo de una sola unidad y conserva el historial", async () => {
  const historicalItems = await client.execute("SELECT count(*) AS n FROM transaction_items WHERE product_id = 1");
  assert.ok(Number(historicalItems.rows[0].n) > 0, "la prueba parte de un producto con ventas históricas");

  const result = await ProductService.remove(1, local);
  assert.match(result.message, /baja lógica/i);
  assert.equal((await ProductService.getAll(local)).some((product) => product.id === 1), false);
  assert.equal((await ProductService.getAll(warehouse)).some((product) => product.id === 1), true);
  await assert.rejects(() => ProductService.getByCodbarra("1", local), (error) => error.status === 404);
  assert.equal((await ProductService.getByCodbarra("1", warehouse)).id, 1);

  const localInventory = await client.execute("SELECT is_available FROM business_unit_products WHERE business_unit_id = 1 AND product_id = 1");
  const warehouseInventory = await client.execute("SELECT is_available FROM business_unit_products WHERE business_unit_id = 2 AND product_id = 1");
  const historyAfter = await client.execute("SELECT count(*) AS n FROM transaction_items WHERE product_id = 1");
  assert.equal(Number(localInventory.rows[0].is_available), 0);
  assert.equal(Number(warehouseInventory.rows[0].is_available), 1);
  assert.equal(Number(historyAfter.rows[0].n), Number(historicalItems.rows[0].n));

  await assert.doesNotReject(() => ProductService.remove(1, local), "la baja repetida es idempotente");
});

test("un código dado de baja recupera el producto existente sin crear un duplicado", async () => {
  const inactive = await ProductService.getByCodbarra("1", local, true);
  assert.equal(inactive.id, 1);
  assert.equal(inactive.isAvailable, false);

  const recovered = await ProductService.create({
    name: "Producto propio recuperado",
    codbarra: "1",
    categoryId: 1,
    cost: 10,
    price: 20,
    wholesalePrice: 17,
    stock: 5,
    minStock: 1,
    isAvailable: true,
    unitsPerPack: 1,
    priceTiers: [],
    fulfillmentMode: "OWN_STOCK",
  }, local);

  assert.equal(recovered.id, 1);
  assert.equal(recovered.reactivated, true);
  assert.equal(recovered.isAvailable, true);
  assert.equal((await ProductService.getAll(local)).some((product) => product.id === 1), true);
  const catalogRows = await client.execute("SELECT count(*) AS n FROM products WHERE cod_barra = '1'");
  assert.equal(Number(catalogRows.rows[0].n), 1);
});

test("la baja de un producto migrado sin fila de inventario crea una baja controlada", async () => {
  await client.execute("INSERT INTO products (id, name, cod_barra, category_id, price_group_id, pack_type_id, cost, price, units_per_pack, pack_price, use_suggested_price, suggested_price_percent, stock, min_stock, icon, is_available, created_at) VALUES (3, 'Producto migrado', '3', 1, NULL, NULL, 7, 20, 1, NULL, 0, NULL, 2, 1, 'Package', 1, NULL)");
  await client.execute("INSERT INTO transaction_items (transaction_id, product_id, product_name, unit_cost, category_name, price, quantity, total, sale_mode, pack_size) VALUES (1, 3, 'Producto migrado', 7, 'General', 20, 1, 20, 'unitario', 1)");

  assert.equal((await ProductService.getAll(local)).some((product) => product.id === 3), true);
  await ProductService.remove(3, local);
  assert.equal((await ProductService.getAll(local)).some((product) => product.id === 3), false);
  assert.equal((await ProductService.getAll(warehouse)).some((product) => product.id === 3), true);

  const inventory = await client.execute("SELECT is_available FROM business_unit_products WHERE business_unit_id = 1 AND product_id = 3");
  const historical = await client.execute("SELECT product_name FROM transaction_items WHERE product_id = 3");
  assert.equal(Number(inventory.rows[0].is_available), 0);
  assert.equal(historical.rows[0].product_name, "Producto migrado");
});
