import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import jwt from "jsonwebtoken";

let client, service, directory;
const unit = { id: 2, code: "WAREHOUSE" };
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "warehouse-activity-"));
  process.env.TURSO_DATABASE_URL = `file:${path.join(directory, "test.db").replaceAll("\\", "/")}`;
  process.env.TURSO_AUTH_TOKEN = "";
  process.env.JWT_SECRET = "warehouse-activity-test";
  ({ client } = await import("../db/client.js"));
  ({ WarehouseActivityService: service } = await import("./warehouseActivity.service.js"));
  await client.batch([
    "CREATE TABLE business_units(id INTEGER PRIMARY KEY,code TEXT,name TEXT,type TEXT,is_active INTEGER,created_at TEXT,updated_at TEXT)",
    "CREATE TABLE users(id INTEGER PRIMARY KEY,role TEXT)",
    "CREATE TABLE customers(id INTEGER PRIMARY KEY,business_unit_id INTEGER,name TEXT,last_name TEXT)",
    "CREATE TABLE warehouse_orders(id INTEGER PRIMARY KEY,business_unit_id INTEGER,customer_id INTEGER,status TEXT,total REAL,charge_to_account INTEGER,created_at TEXT,ready_at TEXT,delivered_at TEXT)",
    "CREATE TABLE warehouse_order_items(id INTEGER PRIMARY KEY,order_id INTEGER,product_name TEXT,quantity INTEGER,total REAL)",
    "CREATE TABLE account_movements(id INTEGER PRIMARY KEY,business_unit_id INTEGER,customer_id INTEGER,type TEXT,amount REAL,method_name TEXT,created_at TEXT)",
    "CREATE TABLE account_payment_details(id INTEGER PRIMARY KEY,account_movement_id INTEGER,method_name TEXT,amount REAL)",
    "INSERT INTO business_units VALUES(1,'LOCAL','Local','retail',1,NULL,NULL),(2,'WAREHOUSE','Galpón','warehouse',1,NULL,NULL)",
    "INSERT INTO users VALUES(1,'admin'),(2,'EMPLEADO_GALPON')",
    "INSERT INTO customers VALUES(1,1,'Cliente','Local'),(2,2,'Cliente','Galpón')",
    "INSERT INTO warehouse_orders VALUES(1,2,2,'confirmed',1000,0,'2026-11-12 23:59:59',NULL,NULL),(2,2,2,'confirmed',500,0,'2026-11-13 00:00:00',NULL,NULL),(3,2,2,'cancelled',300,0,'2026-11-13 10:00:00',NULL,NULL),(4,2,2,'dispatched',600,1,'2026-11-13 09:00:00',NULL,NULL),(5,1,1,'confirmed',90000,0,'2026-11-13 09:00:00',NULL,NULL)",
    "INSERT INTO warehouse_order_items VALUES(1,1,'Producto',2,1000)",
    "INSERT INTO account_movements VALUES(1,2,2,'pago',200,'Pago combinado','2026-11-13 15:00:00'),(2,2,2,'cargo',600,NULL,'2026-11-13 09:00:00'),(3,1,1,'pago',99000,'Efectivo','2026-11-13 11:00:00'),(4,2,2,'pago',25,'Tarjeta','2026-11-13 16:00:00'),(5,2,2,'pago',10,'Transferencia','2026-11-14 00:00:00')",
    "INSERT INTO account_payment_details VALUES(1,1,'Efectivo',80),(2,1,'Transferencia',120)",
  ], "write");
  const { warehouseFinanceMigration } = await import("../db/warehouseFinanceMigration.js");
  await client.batch(warehouseFinanceMigration.statements, "write");
  await client.batch(warehouseFinanceMigration.statements, "write");
});
after(async () => { client?.close(); if (directory) await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

test("períodos argentinos, días reales y valor comercial independiente de pagos", async () => {
  const { activityPeriod, activityDate } = await import("./warehouseActivity.service.js");
  assert.deepEqual(activityPeriod("week", "2026-11-15"), { period: "week", start: "2026-11-09", end: "2026-11-16" });
  assert.deepEqual(activityPeriod("month", "2026-12-31"), { period: "month", start: "2026-12-01", end: "2027-01-01" });
  assert.deepEqual(activityPeriod("all"), { period: "all", start: null, end: null });
  for (const date of ["2026-02-30", "2026-13-01", "2026-00-01", "bad"]) assert.throws(() => activityDate(date), (e) => e.status === 400);
  const { summary, days } = await service.stats(unit, { date: "2026-11-13" });
  assert.equal(summary.orders, 3);
  assert.equal(summary.orderCents, 140000);
  assert.equal(summary.cashCents, 8000);
  assert.equal(summary.transferCents, 12000);
  assert.equal(summary.otherCents, 2500);
  assert.equal(summary.incomeCents, 22500);
  assert.equal(summary.netCents, 22500);
  assert.equal(days.length, 1);
  assert.equal((await service.stats(unit, { date: "2026-11-12" })).summary.incomeCents, 0);
  assert.equal((await service.stats(unit, { date: "2026-11-14" })).summary.orders, 0);
  await assert.rejects(() => service.stats({ id: 1, code: "LOCAL" }), (e) => e.status === 403);
});

test("cobros parciales, combinados y devolución en fecha real sin duplicación", async () => {
  const data = { cash: 100, transfer: 150, occurredAt: "2026-11-13T23:59", idempotencyKey: "receipt-1" };
  const first = await service.receipt(unit, 1, data, 1);
  assert.equal(first.occurred_at, "2026-11-13 23:59:00");
  assert.equal((await service.receipt(unit, 1, data, 1)).id, first.id);
  assert.equal((await service.stats(unit, { date: "2026-11-13" })).summary.incomeCents, 47500);
  assert.equal((await service.day(unit, "2026-11-12")).orders[0].paidCents, 25000);
  for (const id of [3, 4, 5]) await assert.rejects(() => service.receipt(unit, id, { ...data, idempotencyKey: `invalid-${id}` }, 1), (e) => [404, 409].includes(e.status));
  await assert.rejects(() => service.receipt(unit, 1, { ...data, cash: 900, idempotencyKey: "overpay" }, 1), (e) => e.status === 400);
  const refund = { reversalOfId: first.id, reason: "Corrección", occurredAt: "2026-11-14T00:01", idempotencyKey: "refund-1" };
  await service.receipt(unit, 1, refund, 1);
  await service.receipt(unit, 1, refund, 1);
  assert.equal((await service.stats(unit, { date: "2026-11-14" })).summary.incomeCents, -24000);
  assert.equal((await service.stats(unit, { date: "2026-11-13" })).summary.incomeCents, 47500, "devolver mañana conserva el cobro de hoy");
  await assert.rejects(() => service.receipt(unit, 1, { ...refund, idempotencyKey: "refund-2" }, 1), (e) => e.status === 409);
  const concurrent = await Promise.allSettled([1, 2].map((n) => service.receipt(unit, 2, { cash: 400, idempotencyKey: `parallel-${n}`, occurredAt: "2026-11-13" }, 1)));
  assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
});

test("gastos con fecha propia, revisiones auditadas y borrado lógico; balances consistentes", async () => {
  const payload = { concept: "Flete", amount: 30.15, method: "transfer", occurredAt: "2026-11-15T00:00", idempotencyKey: "expense-1" };
  const expense = await service.expense(unit, payload, 1);
  assert.equal((await service.expense(unit, payload, 1)).id, expense.id);
  assert.equal((await service.stats(unit, { date: "2026-11-15" })).summary.expenseCents, 3015);
  const edited = await service.expense(unit, { ...payload, amount: 40, occurredAt: "2026-11-16T12:00", expectedVersion: 0 }, 1, expense.id);
  assert.equal(edited.version, 1);
  assert.equal((await service.stats(unit, { date: "2026-11-15" })).days.length, 0);
  assert.equal((await service.stats(unit, { date: "2026-11-16" })).summary.netCents, -4000);
  await assert.rejects(() => service.expense(unit, { ...payload, expectedVersion: 0 }, 1, expense.id), (e) => e.status === 409);
  await service.expense(unit, { expectedVersion: 1 }, 1, expense.id, true);
  assert.equal((await service.stats(unit, { date: "2026-11-16" })).days.length, 0);
  assert.equal((await client.execute("SELECT count(*) n FROM warehouse_expense_audit")).rows[0].n, 3);
  assert.equal((await client.execute("SELECT count(*) n FROM warehouse_expenses WHERE deleted_at IS NOT NULL")).rows[0].n, 1);
  for (const bad of [0, -1, 1.001, null, ""]) await assert.rejects(() => service.expense(unit, { ...payload, amount: bad, idempotencyKey: `bad-${bad}` }, 1), (e) => e.status === 400);
  const month = await service.stats(unit, { period: "month", date: "2026-11-13" });
  assert.deepEqual(month.days.map((d) => d.day), ["2026-11-14", "2026-11-13", "2026-11-12"]);
  assert.equal(month.summary.netCents, month.days.reduce((sum, d) => sum + d.netCents, 0));
  assert.equal(month.summary.orders, 4);
  assert.equal((await client.execute("SELECT total FROM warehouse_orders WHERE id=5")).rows[0].total, 90000);
});

test("rutas de actividad y finanzas exigen administrador y unidad Galpón", async () => {
  const { default: routes } = await import("../routes/warehouse.routes.js");
  const app = express(); app.use(express.json()); app.use("/warehouse", routes);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const root = `http://127.0.0.1:${server.address().port}/warehouse`;
  const headers = { Authorization: `Bearer ${jwt.sign({ id: 1, role: "admin" }, process.env.JWT_SECRET)}`, "X-Business-Unit": "WAREHOUSE", "Content-Type": "application/json" };
  const employee = `Bearer ${jwt.sign({ id: 2, role: "EMPLEADO_GALPON" }, process.env.JWT_SECRET)}`;
  try {
    for (const [url, method] of [["/stats?date=2026-11-13", "GET"], ["/activity/2026-11-13", "GET"], ["/expenses", "POST"], ["/expenses/1", "PUT"], ["/expenses/1", "DELETE"], ["/orders/1/receipts", "POST"]]) {
      const request = { method, headers, ...(method !== "GET" ? { body: "{}" } : {}) };
      assert.equal((await fetch(root + url, { ...request, headers: {} })).status, 401);
      assert.equal((await fetch(root + url, { ...request, headers: { ...headers, Authorization: employee } })).status, 403);
      assert.equal((await fetch(root + url, { ...request, headers: { ...headers, "X-Business-Unit": "LOCAL" } })).status, 403);
    }
    const response = await fetch(root + "/stats?date=2026-11-13", { headers });
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).summary.orders, 3);
    assert.equal((await fetch(root + "/activity/2026-11-12", { headers })).status, 200);
    assert.equal((await fetch(root + "/stats?date=2026-13-01", { headers })).status, 400);
    assert.equal((await fetch(root + "/stats?period=year", { headers })).status, 400);
    const historical = await fetch(root + "/stats?period=all", { headers });
    assert.equal(historical.status, 200);
    assert.equal((await historical.json()).summary.orders, 4);
    const body = { concept: "Gasto HTTP", amount: 10, method: "cash", occurredAt: "2026-11-17", idempotencyKey: "http-expense" };
    const saved = await fetch(root + "/expenses", { headers, method: "POST", body: JSON.stringify(body) });
    assert.equal(saved.status, 200);
    const expense = await saved.json();
    const retry = await fetch(root + "/expenses", { headers, method: "POST", body: JSON.stringify(body) });
    assert.equal((await retry.json()).id, expense.id);
    assert.equal((await fetch(root + `/expenses/${expense.id}`, { headers, method: "DELETE", body: JSON.stringify({ expectedVersion: 0 }) })).status, 200);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("la medianoche argentina cambia el día sin depender de UTC ni del servidor", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2027-01-01T02:59:59Z") });
  try {
    const previous = await service.expense(unit, { concept: "Antes de medianoche", amount: 1, method: "cash", idempotencyKey: "midnight-before" }, 1);
    assert.equal(previous.occurred_at, "2026-12-31 23:59:59");
    assert.equal((await service.stats(unit)).summary.expenseCents, 100);
    t.mock.timers.setTime(new Date("2027-01-01T03:00:00Z").getTime());
    const next = await service.expense(unit, { concept: "Después de medianoche", amount: 2, method: "cash", idempotencyKey: "midnight-after" }, 1);
    assert.equal(next.occurred_at, "2027-01-01 00:00:00");
    assert.equal((await service.stats(unit)).summary.expenseCents, 200);
    assert.equal((await service.stats(unit, { date: "2026-12-31" })).summary.expenseCents, 100);
  } finally { t.mock.timers.reset(); }
});

test("Todo incluye eventos de distintos meses y años sin cambiar los cálculos ni la unidad", async () => {
  const all = await service.stats(unit, { period: "all" });
  assert.equal(all.start, null); assert.equal(all.end, null);
  assert.equal(all.summary.orders, 4);
  assert.equal(all.summary.incomeCents, 63500);
  assert.equal(all.summary.expenseCents, 300);
  assert.equal(all.summary.netCents, 63200);
  assert.equal(all.summary.netCents, all.days.reduce((sum, day) => sum + day.netCents, 0));
  assert.equal(all.statuses.reduce((sum, state) => sum + state.count, 0), 4);
  assert.equal(all.expenses.length, 2);
  assert.deepEqual(all.days.map((day) => day.day), ["2027-01-01", "2026-12-31", "2026-11-14", "2026-11-13", "2026-11-12"]);
});
