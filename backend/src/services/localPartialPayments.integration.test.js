import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
let client,daily,model,directory;
before(async()=>{
  directory=await mkdtemp(path.join(tmpdir(),'partial-payments-'));
  process.env.TURSO_DATABASE_URL=pathToFileURL(path.join(directory,'test.db')).href;process.env.TURSO_AUTH_TOKEN='';
  ({client}=await import('../db/client.js'));
  ({DailyExpenseService:daily}=await import('./dailyExpense.service.js'));
  ({DailyExpenseModel:model}=await import('../models/dailyExpense.model.js'));
  await client.batch([
    'CREATE TABLE users(id INTEGER PRIMARY KEY)', 'INSERT INTO users VALUES(1)',
    'CREATE TABLE cash_registers(id INTEGER PRIMARY KEY,is_open INTEGER,opened_at TEXT,closed_at TEXT)',
    "INSERT INTO cash_registers VALUES(1,0,'2026-09-01 00:00:00','2026-09-30 23:59:59'),(2,1,'2026-10-01 00:00:00',NULL)",
    'CREATE TABLE fixed_expenses(id INTEGER PRIMARY KEY,name TEXT,amount REAL)',
    'CREATE TABLE daily_expenses(id INTEGER PRIMARY KEY,reason TEXT,amount REAL,method TEXT,register_id INTEGER,created_at TEXT)',
    "INSERT INTO daily_expenses VALUES(1,'Histórico pendiente',150000,'efectivo',1,'2026-09-01 12:00:00'),(2,'Histórico pagado',1234.56,'transferencia',1,'2026-09-02 12:00:00')",
  ],'write');
  const {localExpenseStatesMigration}=await import('../db/localExpenseStatesMigration.js');
  await client.batch(localExpenseStatesMigration.statements,'write');
  await client.execute("UPDATE daily_expenses SET status='paid',paid_at='2026-09-03 12:30:00',payment_register_id=1,version=7 WHERE id=2");
  const before=(await client.execute('SELECT * FROM daily_expenses ORDER BY id')).rows;
  const {localPartialPaymentsMigration:m}=await import('../db/localPartialPaymentsMigration.js');
  await client.batch(m.statements,'write');
  assert.deepEqual((await client.execute('SELECT * FROM daily_expenses ORDER BY id')).rows,before);
});
after(async()=>{client?.close();if(directory)await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
const pay=(e,amount,key,paidAt='2026-10-02T12:00',method='transferencia')=>daily.registerPayment(e.id,{amount,idempotencyKey:key,expectedVersion:e.version,paidAt,method,observation:'Comprobante de prueba'},1);

test('migración conserva históricos pagados y pendientes con un único egreso por pago anterior',async()=>{
  const rows=await daily.getAll(),paid=rows.find(e=>e.id===2),pending=rows.find(e=>e.id===1);
  assert.equal(paid.amount,1234.56);assert.equal(paid.totalPaid,1234.56);assert.equal(paid.balance,0);assert.equal(paid.version,7);
  assert.equal(paid.payments.length,1);assert.equal(paid.payments[0].paidAt,'2026-09-03 12:30:00');
  assert.equal(pending.balance,150000);assert.equal(pending.payments.length,0);
  assert.equal((await model.findByRegisterId(1)).reduce((s,e)=>s+e.amount,0),1234.56);
});
test('tres cuotas en distintos días/meses conservan original, saldos e historial al recargar',async()=>{
  let e=(await daily.getAll()).find(e=>e.id===1);
  e=await pay(e,50000,'first','2026-09-29T15:30','efectivo');
  assert.equal(e.status,'partial');assert.equal(e.balance,100000);assert.equal(e.totalPaid,50000);
  assert.equal(e.amount,150000);assert.equal(e.payments[0].paymentRegisterId,1);
  e=(await daily.getAll()).find(x=>x.id===e.id);assert.equal(e.balance,100000);
  e=await pay(e,40000,'second','2026-10-01T00:01');assert.equal(e.balance,60000);assert.equal(e.totalPaid,90000);
  e=await pay(e,60000,'third','2026-10-02T12:00','efectivo');
  assert.equal(e.status,'paid');assert.equal(e.balance,0);assert.equal(e.totalPaid,150000);assert.equal(e.amount,150000);
  assert.equal(e.payments.length,3);assert.ok(e.payments.every(p=>p.observation==='Comprobante de prueba'));
  const cash1=(await model.findByRegisterId(1)).filter(p=>p.expenseId===e.id);
  const cash2=(await model.findByRegisterId(2)).filter(p=>p.expenseId===e.id);
  assert.equal(cash1.reduce((s,p)=>s+p.amount,0),50000);assert.equal(cash2.filter(p=>p.method==='efectivo').reduce((s,p)=>s+p.amount,0),60000);
  const {paidExpensesInRange,sumExpenses}=await import('../../../frontend/src/utils/localExpenses.js');
  const rows=[e];assert.equal(sumExpenses(paidExpensesInRange(rows,'2026-09-01','2026-09-30')),50000);
  assert.equal(sumExpenses(paidExpensesInRange(rows,'2026-10-01','2026-10-31')),100000);
  assert.equal(sumExpenses(paidExpensesInRange(rows,'2026-10-01','2026-10-01')),40000);
  assert.equal(sumExpenses(paidExpensesInRange(rows)),150000);
  await assert.rejects(()=>pay(e,1,'already-paid'),x=>x.status===400);
});
test('cero, negativos, sobrepago, precisión y versiones inválidas no escriben movimientos',async()=>{
  const e=await daily.create({reason:'Validaciones',amount:100,method:'transferencia',status:'pending',idempotencyKey:'validations'},1);
  for(const a of [0,-1,100.01,0.001,'',null,Infinity,NaN]) await assert.rejects(()=>pay(e,a,'invalid-'+String(a)),x=>x.status===400);
  const partial=await pay(e,40,'valid-partial');
  await assert.rejects(()=>pay(partial,60.01,'over-partial'),x=>x.status===400);
  await assert.rejects(()=>pay(e,10,'stale'),x=>x.status===409);
  const reloaded=(await daily.getAll()).find(x=>x.id===e.id);assert.equal(reloaded.payments.length,1);assert.equal(reloaded.balance,60);
  const complete=await pay(partial,60,'finish');assert.equal(complete.status,'paid');
});
test('clics simultáneos, reintentos y claves reutilizadas no duplican egresos',async()=>{
  const e=await daily.create({reason:'Concurrencia',amount:0.3,method:'transferencia',status:'pending',idempotencyKey:'concurrency'},1);
  const same=await Promise.all([pay(e,0.1,'same'),pay(e,0.1,'same')]);
  assert.equal(same[1].duplicated,true);assert.equal(same[1].payments.length,1);
  const a=same[0];assert.equal(a.balance,0.2);
  const different=await Promise.allSettled([pay(a,0.1,'different-a'),pay(a,0.1,'different-b')]);
  assert.equal(different.filter(x=>x.status==='fulfilled').length,1);assert.equal(different.find(x=>x.status==='rejected').reason.status,409);
  await assert.rejects(()=>pay(a,0.2,'same'),x=>x.status===409);
  const current=(await daily.getAll()).find(x=>x.id===e.id);
  const done=await pay(current,0.1,'last-cent');assert.equal(done.totalPaid,0.3);assert.equal(done.balance,0);assert.equal(done.payments.length,3);
  const replay=await pay(e,0.1,'same');assert.equal(replay.duplicated,true);assert.equal(replay.totalPaid,0.3);
});
test('pago completo directo y rollback por fecha/caja inválida',async()=>{
  const e=await daily.create({reason:'Completo',amount:10,method:'efectivo',status:'pending',idempotencyKey:'full'},1);
  await assert.rejects(()=>pay(e,10,'no-register','2026-08-01T12:00','efectivo'),x=>x.status===400);
  const fresh=(await daily.getAll()).find(x=>x.id===e.id);assert.equal(fresh.version,e.version);assert.equal(fresh.payments.length,0);
  const paid=await pay(e,10,'full-payment');assert.equal(paid.status,'paid');assert.equal(paid.totalPaid,10);assert.equal(paid.payments.length,1);
});
