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
  await client.batch([
    'ALTER TABLE account_movements ADD COLUMN detail TEXT',
    'ALTER TABLE account_movements ADD COLUMN user_id INTEGER',
    'ALTER TABLE account_movements ADD COLUMN idempotency_key TEXT',
    'CREATE UNIQUE INDEX test_account_key ON account_movements(business_unit_id,idempotency_key)',
  ],'write');
  const { warehouseSettingsMigration } = await import('../db/warehouseSettingsMigration.js');
  await client.batch(warehouseSettingsMigration.statements,'write');
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

test('Configuración: calendario mensual y semanal, validaciones y nombres normalizados', async()=>{
  const { nextDue, WarehouseSettingsService: settings } = await import('./warehouseSettings.service.js');
  assert.equal(nextDue('2026-02-01','month',31),'2026-02-28');
  assert.equal(nextDue('2028-02-01','month',31),'2028-02-29');
  assert.equal(nextDue('2026-02-28','month',31,true),'2026-03-31');
  assert.equal(nextDue('2026-12-31','week',1),'2027-01-04');
  const method = await settings.save(unit,'method',{name:'Tarjeta crédito',surcharge:10,kind:'other'},1);
  assert.equal(method.surcharge_bps,1000);
  await assert.rejects(()=>settings.save(unit,'method',{name:'  TARJETA   CREDITO ',surcharge:0,kind:'other'},1),e=>e.status===409);
  for(const surcharge of ['abc',NaN,Infinity,-1,100.01,null,'',0.001]) await assert.rejects(()=>settings.save(unit,'method',{name:'Inválido',surcharge,kind:'other'},1),e=>e.status===400);
  await assert.rejects(()=>settings.get({id:1,code:'LOCAL'}),e=>e.status===403);
  const result=await settings.get(unit);
  assert.ok(result.methods.every(m=>m.business_unit_id===unit.id));
});

test('Configuración: recuperación idempotente, snapshots y pago único de gastos fijos',async()=>{
  const { WarehouseSettingsService: settings, materializeFixed, nextDue } = await import('./warehouseSettings.service.js');
  const { runWarehouseTransaction } = await import('./warehouse.service.js');
  const { getArgentinaTime }=await import('../db/timeUtils.js');
  const today=getArgentinaTime().datetime.slice(0,10);
  const date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-14);
  const start=date.toISOString().slice(0,10), day=date.getUTCDay()||7;
  const data={name:'Alquiler fijo prueba',amount:25.15,frequency:'week',dueDay:day,startDate:start,active:true};
  const fixed=await settings.save(unit,'expense',data,1);
  const getOccurrences=async()=> (await client.execute({sql:'SELECT * FROM warehouse_fixed_occurrences WHERE fixed_expense_id=? ORDER BY due_date',args:[fixed.id]})).rows;
  const initial=await getOccurrences();assert.equal(initial.length,3);
  assert.ok(initial.every(e=>e.amount_cents===2515));
  await Promise.all([settings.get(unit),settings.get(unit),service.stats(unit,{period:'all'})]);
  assert.equal((await getOccurrences()).length,3);
  const statsBefore=await service.stats(unit,{period:'all'});
  assert.ok(statsBefore.pendingExpenses.some(e=>e.id===initial[0].id));
  assert.ok((await service.day(unit,start)).pendingExpenses.some(e=>e.id===initial[0].id));
  const changed=await settings.save(unit,'expense',{...data,amount:40,expectedVersion:fixed.version},1,fixed.id);
  assert.equal(changed.version,1);
  assert.ok((await getOccurrences()).every(e=>e.amount_cents===2515));
  const future=nextDue(today,'week',day,true);
  await runWarehouseTransaction(tx=>materializeFixed(tx,unit.id,future));
  const later=await getOccurrences();assert.equal(later.at(-1).amount_cents,4000);
  const beforePay=await service.stats(unit,{date:today});
  const paid=await settings.settle(unit,initial[0].id,{method:'cash',date:today},1);
  assert.equal((await settings.settle(unit,initial[0].id,{method:'cash',date:today},1)).id,paid.id);
  const afterPay=await service.stats(unit,{date:today});
  assert.equal(afterPay.summary.expenseCents-beforePay.summary.expenseCents,2515);
  assert.ok(afterPay.expenses.some(e=>e.id===paid.id&&e.fixed_due_date===start));
  for(const period of ['day','week','month','all']){
    const report=await service.stats(unit,{period,date:today});
    assert.equal(report.summary.netCents,report.days.reduce((s,d)=>s+d.netCents,0));
    assert.equal(report.summary.expenseCents,report.expenses.reduce((s,e)=>s+e.amount_cents,0));
  }
  await assert.rejects(()=>service.expense(unit,{expectedVersion:paid.version},1,paid.id,true),e=>e.status===409);
  await settings.save(unit,'expense',{...data,amount:40,active:false,expectedVersion:changed.version},1,fixed.id);
  await runWarehouseTransaction(tx=>materializeFixed(tx,unit.id,'2030-12-31'));
  assert.equal((await getOccurrences()).length,later.length);
  await assert.rejects(()=>settings.save(unit,'expense',data,1),e=>e.status===409);
  await assert.rejects(()=>settings.save(unit,'expense',{...data,expectedVersion:0},1,fixed.id),e=>e.status===409);
  assert.equal((await client.execute('SELECT count(*) n FROM warehouse_expenses WHERE business_unit_id=1')).rows[0].n,0);
});

test('Recargos por tramo, historial, redondeo y devolución íntegra',async()=>{
  const { WarehouseSettingsService: settings }=await import('./warehouseSettings.service.js');
  await client.execute("INSERT INTO warehouse_orders VALUES(100,2,2,'confirmed',100000,0,'2026-11-13 08:00:00',NULL,NULL)");
  const methods=(await settings.get(unit)).methods;
  const card=methods.find(m=>m.name==='Tarjeta crédito'),cash=methods.find(m=>m.name==='Efectivo');
  const payload={payments:[{paymentMethodId:cash.id,amount:40000},{paymentMethodId:card.id,amount:60000,expectedSurchargeBps:1000}],occurredAt:'2026-11-13',idempotencyKey:'combined-surcharge'};
  const before=await service.stats(unit,{date:'2026-11-13'});
  const receipt=await service.receipt(unit,100,payload,1);
  assert.equal(receipt.payments.reduce((s,p)=>s+p.surcharge_cents,0),600000);
  assert.equal((await service.stats(unit,{date:'2026-11-13'})).summary.incomeCents-before.summary.incomeCents,10600000);
  assert.equal((await service.day(unit,'2026-11-13')).orders.find(o=>o.id===100).paidCents,10000000);
  assert.equal((await service.receipt(unit,100,payload,1)).id,receipt.id);
  await settings.save(unit,'method',{name:card.name,surcharge:20,kind:'other',active:false,expectedVersion:card.version},1,card.id);
  assert.equal((await client.execute({sql:'SELECT surcharge_bps FROM warehouse_payment_parts WHERE receipt_id=? AND method_id=?',args:[receipt.id,card.id]})).rows[0].surcharge_bps,1000);
  const refund=await service.receipt(unit,100,{reversalOfId:receipt.id,reason:'Prueba devolución',occurredAt:'2026-11-14',idempotencyKey:'refund-surcharge'},1);
  assert.equal(refund.payments.reduce((s,p)=>s+p.base_cents+p.surcharge_cents,0),-10600000);
  await assert.rejects(()=>service.receipt(unit,100,{...payload,idempotencyKey:'inactive-card'},1),e=>e.status===400);
  const half=await settings.save(unit,'method',{name:'Redondeo',surcharge:50,kind:'other'},1);
  const rounded=await service.receipt(unit,100,{payments:[{paymentMethodId:half.id,amount:0.01}],idempotencyKey:'round-half-cent'},1);
  assert.equal(rounded.payments[0].surcharge_cents,1);
  await assert.rejects(()=>service.receipt(unit,100,{payments:[{paymentMethodId:half.id,amount:1,expectedSurchargeBps:1000}],idempotencyKey:'stale-rate'},1),e=>e.status===409);
});

test('Cuentas del Galpón: capital cancela deuda, recargo ingresa una vez y se conserva por medio',async()=>{
  const { CustomerService }=await import('./customer.service.js');
  const { WarehouseSettingsService: settings }=await import('./warehouseSettings.service.js');
  const { getArgentinaTime }=await import('../db/timeUtils.js');
  const today=getArgentinaTime().datetime.slice(0,10);
  const card=await settings.save(unit,'method',{name:'Tarjeta cuenta',surcharge:10,kind:'other'},1);
  const cash=(await settings.get(unit)).methods.find(m=>m.kind==='cash');
  await client.execute("INSERT INTO account_movements(id,business_unit_id,customer_id,type,amount,created_at) VALUES(100,2,2,'cargo',100000,'2026-11-13 09:00:00')");
  const before=await service.stats(unit,{date:today});
  const data={payments:[{paymentMethodId:cash.id,amount:40000},{paymentMethodId:card.id,amount:60000}],idempotencyKey:'account-surcharge'};
  const payment=await CustomerService.registerPayment(2,data,1,unit);
  assert.equal(payment.amount,100000);
  assert.equal(payment.payments.reduce((s,p)=>s+p.base_cents+p.surcharge_cents,0),10600000);
  assert.equal((await service.stats(unit,{date:today})).summary.incomeCents-before.summary.incomeCents,10600000);
  assert.equal((await CustomerService.registerPayment(2,data,1,unit)).id,payment.id);
  await settings.save(unit,'method',{name:card.name,surcharge:90,kind:'transfer',active:false,expectedVersion:card.version},1,card.id);
  assert.equal((await service.stats(unit,{date:today})).summary.otherCents-before.summary.otherCents,6600000);
  const detail=await service.day(unit,today);
  assert.equal(detail.accountPayments.find(p=>p.id===payment.id).snapshots.find(p=>p.method_id===card.id).surcharge_bps,1000);
  await assert.rejects(()=>CustomerService.registerPayment(1,data,1,unit),e=>e.status===404);
});

test('Configuración: endpoints protegidos y auditoría',async()=>{
  const { default: routes }=await import('../routes/warehouse.routes.js');
  const app=express();app.use(express.json());app.use('/warehouse',routes);
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const root=`http://127.0.0.1:${server.address().port}/warehouse`;
  const headers={Authorization:`Bearer ${jwt.sign({id:1,role:'admin'},process.env.JWT_SECRET)}`,'X-Business-Unit':'WAREHOUSE','Content-Type':'application/json'};
  try{
    for(const [url,method] of [['/settings','GET'],['/settings/expense','POST'],['/settings/method/1','PUT'],['/fixed-occurrences/1/pay','POST']]){
      const request={method,headers,...(method!=='GET'?{body:'{}'}:{})};
      assert.equal((await fetch(root+url,{...request,headers:{}})).status,401);
      assert.equal((await fetch(root+url,{...request,headers:{...headers,Authorization:`Bearer ${jwt.sign({id:2,role:'EMPLEADO_GALPON'},process.env.JWT_SECRET)}`}})).status,403);
      assert.equal((await fetch(root+url,{...request,headers:{...headers,'X-Business-Unit':'LOCAL'}})).status,403);
    }
    assert.equal((await fetch(root+'/settings',{headers})).status,200);
    assert.ok((await client.execute('SELECT count(*) n FROM warehouse_settings_audit')).rows[0].n>0);
  }finally{await new Promise(r=>server.close(r));}
});
