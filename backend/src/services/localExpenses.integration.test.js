import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { before,after,test } from 'node:test';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import jwt from 'jsonwebtoken';
import { getTableColumns,getTableName } from 'drizzle-orm';

let client,db,daily,fixed,CashRegisterService,directory;
before(async()=>{
  directory=await mkdtemp(path.join(tmpdir(),'local-expense-states-'));
  process.env.TURSO_DATABASE_URL=pathToFileURL(path.join(directory,'test.db')).href;
  process.env.TURSO_AUTH_TOKEN='';process.env.JWT_SECRET='local-expense-tests';
  ({client,db}=await import('../db/client.js'));
  ({DailyExpenseService:daily}=await import('./dailyExpense.service.js'));
  ({FixedExpenseService:fixed}=await import('./fixedExpense.service.js'));
  ({CashRegisterService}=await import('./cashRegister.service.js'));
  await client.batch([
    'PRAGMA foreign_keys=ON',
    'CREATE TABLE users(id INTEGER PRIMARY KEY,role TEXT)',
    'CREATE TABLE business_units(id INTEGER PRIMARY KEY,code TEXT,name TEXT,type TEXT,is_active INTEGER,created_at TEXT,updated_at TEXT)',
    'CREATE TABLE cash_registers(id INTEGER PRIMARY KEY,opened_by INTEGER,initial_cash REAL,is_open INTEGER,opened_at TEXT,closed_at TEXT,expected_cash REAL,counted_cash REAL,cash_difference REAL,arqueo_notes TEXT,next_initial_cash REAL)',
    'CREATE TABLE fixed_expenses(id INTEGER PRIMARY KEY,name TEXT,amount REAL)',
    'CREATE TABLE daily_expenses(id INTEGER PRIMARY KEY,reason TEXT,amount REAL,method TEXT,register_id INTEGER,created_at TEXT)',
    "INSERT INTO users VALUES(1,'admin'),(2,'cajero'),(3,'EMPLEADO_GALPON')",
    "INSERT INTO business_units VALUES(1,'LOCAL','Local','retail',1,NULL,NULL),(2,'WAREHOUSE','Galpón','warehouse',1,NULL,NULL)",
    "INSERT INTO cash_registers(id,initial_cash,is_open,opened_at,closed_at,expected_cash,counted_cash,cash_difference) VALUES(1,1000,0,'2026-11-01 00:00:00','2026-11-10 23:59:59',800,800,0),(2,1000,1,'2026-11-11 00:00:00',NULL,NULL,NULL,NULL)",
    "INSERT INTO fixed_expenses VALUES(1,'Alquiler histórico',350000)",
    "INSERT INTO daily_expenses VALUES(1,'Flete histórico',200,'efectivo',1,'2026-11-02 10:20:30')",
  ],'write');
  const schema=await import('../db/schema.js');
  for(const name of ['transactions','transactionPayments','transactionItems','accountMovements','accountPaymentDetails']) {
    const table=schema[name];
    const columns=Object.values(getTableColumns(table)).map(c=>`"${c.name}" ${c.getSQLType()}`);
    await client.execute(`CREATE TABLE "${getTableName(table)}" (${columns.join(',')})`);
  }
  const {localExpenseStatesMigration}=await import('../db/localExpenseStatesMigration.js');
  await client.batch(localExpenseStatesMigration.statements,'write');
  const {localPartialPaymentsMigration}=await import('../db/localPartialPaymentsMigration.js');
  await client.batch(localPartialPaymentsMigration.statements,'write');
});
after(async()=>{client?.close();if(directory)await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});});

test('migración conserva el gasto/caja originales y crea una sola obligación mensual pendiente',async()=>{
  const rows=await daily.getAll();
  const legacy=rows.find(e=>e.id===1);
  assert.equal(legacy.amount,200);assert.equal(legacy.reason,'Flete histórico');assert.equal(legacy.createdAt,'2026-11-02 10:20:30');assert.equal(legacy.registerId,1);
  assert.equal(legacy.status,'pending');assert.equal(legacy.paidAt,null);assert.equal(legacy.paymentRegisterId,null);
  const obligations=rows.filter(e=>e.fixedExpenseId===1);assert.equal(obligations.length,1);assert.equal(obligations[0].amount,350000);assert.equal(obligations[0].status,'pending');
  assert.equal((await daily.getAll()).length,2);
  const old=(await CashRegisterService.getClosed()).find(c=>c.id===1);
  assert.equal(old.totalGastosEfectivo,0);assert.equal(old.expectedCash,1000);assert.equal(old.recordedExpectedCash,800);
  assert.equal((await client.execute('SELECT expected_cash FROM cash_registers WHERE id=1')).rows[0].expected_cash,800);
});

test('pendiente no descuenta, pago se asigna a su caja efectiva y reversión corrige sin duplicar',async()=>{
  const pending=await daily.create({reason:'Insumos',amount:30.15,method:'efectivo',status:'pending',idempotencyKey:'local-pending'},1);
  assert.equal(pending.registerId,2);assert.equal(pending.paymentRegisterId,null);
  const {DailyExpenseModel:model}=await import('../models/dailyExpense.model.js');
  assert.equal((await model.findByRegisterId(2)).length,0);
  const payload={status:'paid',method:'efectivo',paidAt:'2026-11-12T14:35',expectedVersion:pending.version};
  const results=await Promise.allSettled([1,2].map(()=>daily.changeStatus(pending.id,payload,1)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
  const paid=results.find(r=>r.status==='fulfilled').value;
  assert.equal(paid.paidAt,'2026-11-12 14:35:00');assert.equal(paid.paymentRegisterId,2);
  assert.equal((await model.findByRegisterId(2)).reduce((s,e)=>s+e.amount,0),30.15);
  const reversed=await daily.changeStatus(paid.id,{status:'pending',expectedVersion:paid.version},1);
  assert.equal(reversed.paymentRegisterId,null);assert.equal(reversed.paidAt,null);assert.equal((await model.findByRegisterId(2)).length,0);
  await assert.rejects(()=>daily.changeStatus(paid.id,payload,1),e=>e.status===409);
  const actions=(await client.execute({sql:'SELECT action,snapshot FROM local_expense_audit WHERE expense_id=? ORDER BY id',args:[paid.id]})).rows;
  assert.deepEqual(actions.map(a=>a.action),['create','pay','reverse_payment']);assert.equal(JSON.parse(actions[2].snapshot).before.paid_at,paid.paidAt);
  const legacyPaid=await daily.changeStatus(1,{status:'paid',method:'efectivo',paidAt:'2026-11-12T11:00',expectedVersion:0},1);
  assert.equal(legacyPaid.registerId,1);assert.equal(legacyPaid.paymentRegisterId,2);
  assert.equal((await model.findByRegisterId(1)).length,0);
});

test('crear pagado es idempotente, respeta caja histórica y conserva snapshots de cierre',async()=>{
  const payload={reason:'Pago al crear',amount:25,method:'efectivo',status:'paid',paidAt:'2026-11-03T12:00',idempotencyKey:'local-paid'};
  const created=await daily.create(payload,1);assert.equal((await daily.create(payload,1)).id,created.id);assert.equal(created.paymentRegisterId,1);
  const closed=(await CashRegisterService.getClosed()).find(c=>c.id===1);
  assert.equal(closed.totalGastosEfectivo,25);assert.equal(closed.expectedCash,975);assert.equal(closed.cashDifference,-175);assert.equal(closed.recordedExpectedCash,800);
  const old=(await client.execute('SELECT expected_cash,cash_difference FROM cash_registers WHERE id=1')).rows[0];assert.equal(old.expected_cash,800);assert.equal(old.cash_difference,0);
  const reversed=await daily.changeStatus(created.id,{status:'pending',expectedVersion:created.version},1);
  assert.equal((await CashRegisterService.getClosed()).find(c=>c.id===1).totalGastosEfectivo,0);
  assert.equal(reversed.paidAt,null);
  for(const amount of [0,-1,Infinity,NaN,1.001,'',null]) await assert.rejects(()=>daily.create({...payload,amount,idempotencyKey:`bad-${amount}`},1),e=>e.status===400);
  await assert.rejects(()=>daily.create({...payload,paidAt:'2026-02-30T10:00',idempotencyKey:'bad-date'},1),e=>e.status===400);
  await assert.rejects(()=>daily.create({...payload,paidAt:'2026-10-01T10:00',idempotencyKey:'no-register'},1),e=>e.status===400);
});

test('meses fijos independientes, edición no reescribe períodos y baja conserva historial',async()=>{
  const {materializeLocalFixed}=await import('./localExpensePayments.js');
  const {runWarehouseTransaction}=await import('./warehouse.service.js');
  const config=await fixed.create({name:'Servicio mensual',amount:50});
  const through=new Date();through.setUTCMonth(through.getUTCMonth()+1);
  await runWarehouseTransaction(tx=>materializeLocalFixed(tx,through.toISOString().slice(0,7)));
  let periods=(await daily.getAll()).filter(e=>e.fixedExpenseId===config.id).sort((a,b)=>a.period.localeCompare(b.period));assert.equal(periods.length,2);
  const paid=await daily.changeStatus(periods[0].id,{status:'paid',method:'transferencia',paidAt:'2026-11-12T12:00',expectedVersion:0},1);
  assert.equal(paid.id,periods[0].id);assert.equal((await daily.getAll()).find(e=>e.id===periods[1].id).status,'pending');
  await fixed.update(config.id,{name:'Servicio actualizado',amount:75,expectedVersion:config.version});
  periods=(await daily.getAll()).filter(e=>e.fixedExpenseId===config.id);assert.ok(periods.every(e=>e.amount===50));
  await fixed.remove(config.id);assert.ok(!(await fixed.getAll()).some(e=>e.id===config.id));
  assert.equal((await daily.getAll()).filter(e=>e.fixedExpenseId===config.id).length,2);
  const reversed=await daily.changeStatus(paid.id,{status:'pending',expectedVersion:paid.version},1);assert.equal(reversed.id,paid.id);
});

test('registro pendiente sin caja, transferencia sin caja y cierre descuentan sólo pagos',async()=>{
  await CashRegisterService.close(2,{countedCash:800});
  assert.equal((await client.execute('SELECT expected_cash FROM cash_registers WHERE id=2')).rows[0].expected_cash,800,'sólo descuenta el flete pagado de 200');
  const pending=await daily.create({reason:'Sin caja abierta',amount:10,method:'efectivo',status:'pending',idempotencyKey:'no-cashbox'},1);assert.equal(pending.registerId,null);
  const transfer=await daily.create({reason:'Transferencia histórica sin caja',amount:10,method:'transferencia',status:'paid',paidAt:'2026-10-01T10:00',idempotencyKey:'transfer-no-cashbox'},1);assert.equal(transfer.paymentRegisterId,null);
  assert.equal(transfer.status,'paid');
});

test('endpoints Local exigen sesión, rol y aislamiento de unidad',async()=>{
  const {default:routes}=await import('../routes/dailyExpense.routes.js');
  const app=express();app.use(express.json());app.use('/daily-expenses',routes);
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const url=`http://127.0.0.1:${server.address().port}/daily-expenses/1/status`;
  const headers={Authorization:`Bearer ${jwt.sign({id:1,role:'admin'},process.env.JWT_SECRET)}`,'Content-Type':'application/json','X-Business-Unit':'LOCAL'};
  try {
    const request={method:'PATCH',headers,body:JSON.stringify({status:'pending',expectedVersion:1})};
    assert.equal((await fetch(url,{...request,headers:{}})).status,401);
    assert.equal((await fetch(url,{...request,headers:{...headers,'X-Business-Unit':'WAREHOUSE'}})).status,403);
    assert.equal((await fetch(url,{...request,headers:{...headers,Authorization:`Bearer ${jwt.sign({id:3,role:'EMPLEADO_GALPON'},process.env.JWT_SECRET)}`}})).status,403);
    assert.equal((await fetch(url,request)).status,200);
    const expense=await daily.create({reason:'Pago HTTP parcial',amount:100,method:'transferencia',status:'pending',idempotencyKey:'http-partial'},1);
    const paymentUrl=url.replace('/1/status', '/'+expense.id+'/payments');
    const body={amount:25,expectedVersion:expense.version,method:'transferencia',paidAt:'2026-11-12T12:00',observation:'HTTP',idempotencyKey:'http-payment'};
    const post={method:'POST',headers,body:JSON.stringify(body)};
    assert.equal((await fetch(paymentUrl,{...post,headers:{}})).status,401);
    assert.equal((await fetch(paymentUrl,{...post,headers:{...headers,'X-Business-Unit':'WAREHOUSE'}})).status,403);
    assert.equal((await fetch(paymentUrl,{...post,headers:{...headers,Authorization:'Bearer '+jwt.sign({id:3,role:'EMPLEADO_GALPON'},process.env.JWT_SECRET)}})).status,403);
    const first=await fetch(paymentUrl,post);assert.equal(first.status,201);assert.equal((await first.json()).balance,75);
    const retry=await fetch(paymentUrl,post);assert.equal(retry.status,201);assert.equal((await retry.json()).payments.length,1);
    const stale=await fetch(paymentUrl,{...post,body:JSON.stringify({...body,idempotencyKey:'http-stale'})});assert.equal(stale.status,409);
    const reload=await fetch(url.replace('/1/status',''),{headers});assert.equal((await reload.json()).find(e=>e.id===expense.id).balance,75);
  } finally {await new Promise(r=>server.close(r));}
});


test('cuotas en efectivo corrigen sólo la caja efectiva y completar no vuelve a descontar el original',async()=>{
  const before=(await CashRegisterService.getClosed()).find(c=>c.id===1);
  let e=await daily.create({reason:'Cuotas en caja cerrada',amount:90,method:'efectivo',status:'pending',idempotencyKey:'cash-installments'},1);
  const pay=amount=>daily.registerPayment(e.id,{amount,method:'efectivo',paidAt:'2026-11-03T12:00',expectedVersion:e.version,idempotencyKey:'cash-'+amount},1);
  e=await pay(30);
  const partial=(await CashRegisterService.getClosed()).find(c=>c.id===1);
  assert.equal(partial.totalGastosEfectivo,before.totalGastosEfectivo+30);assert.equal(partial.expectedCash,before.expectedCash-30);
  e=await pay(60);
  const full=(await CashRegisterService.getClosed()).find(c=>c.id===1);
  assert.equal(full.totalGastosEfectivo,before.totalGastosEfectivo+90);assert.equal(full.expectedCash,before.expectedCash-90);
  assert.equal(full.recordedExpectedCash,before.recordedExpectedCash);assert.equal(e.amount,90);
});
