import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createClient} from '@libsql/client';
import {cleanupTestExpense} from './cleanup-prueba-local-expense.mjs';

async function fixture(run) {
  const dir=await mkdtemp(path.join(tmpdir(),'cleanup-local-test-'));
  const client=createClient({url:pathToFileURL(path.join(dir,'test.db')).href});
  try {
    await client.batch([
      'PRAGMA foreign_keys=ON',
      'CREATE TABLE daily_expenses(id INTEGER PRIMARY KEY,reason TEXT,amount REAL,idempotency_key TEXT,status TEXT,fixed_expense_id INTEGER,version INTEGER)',
      "INSERT INTO daily_expenses VALUES(1389,'prueba',100,'dd23083b-c7f1-4bce-a78d-91deb366df04','paid',NULL,2),(1400,'Real',500,'other','paid',NULL,1)",
      'CREATE TABLE local_expense_payments(id INTEGER PRIMARY KEY,expense_id INTEGER REFERENCES daily_expenses(id),amount_cents INTEGER,reversed_at TEXT,method TEXT,payment_register_id INTEGER,paid_at TEXT)',
      "INSERT INTO local_expense_payments VALUES(24,1389,5000,NULL,'efectivo',27,'2026-11-25 19:34:00'),(25,1389,5000,NULL,'efectivo',27,'2026-11-25 19:36:00'),(26,1400,50000,NULL,'efectivo',27,'2026-11-25 19:36:00')",
      'CREATE TABLE local_expense_audit(id INTEGER PRIMARY KEY,expense_id INTEGER REFERENCES daily_expenses(id),snapshot TEXT)',
      "INSERT INTO local_expense_audit VALUES(50,1389,'create'),(51,1389,'first payment'),(52,1389,'second payment'),(53,1400,'unrelated')",
      'CREATE TABLE cash_registers(id INTEGER PRIMARY KEY,expected_cash REAL)',
      'INSERT INTO cash_registers VALUES(27,1000)',
      'CREATE TABLE products(id INTEGER PRIMARY KEY,stock INTEGER)',
      'INSERT INTO products VALUES(1,40)',
      'CREATE TABLE account_movements(id INTEGER PRIMARY KEY,amount REAL)',
      'INSERT INTO account_movements VALUES(1,200)',
    ],'write');
    await run(client);
  }finally{
    client.close();
    // libsql puede retener conexiones transaccionales hasta el GC en Windows.
    // El archivo está exclusivamente en el directorio temporal de esta prueba.
    await rm(dir,{recursive:true,force:true,maxRetries:2,retryDelay:100}).catch(error=>{if(process.platform!=='win32'||error.code!=='EBUSY')throw error;});
  }
}
test('simulación no escribe y limpieza conserva auditoría, caja y registros ajenos',()=>fixture(async client=>{
  const dry=await cleanupTestExpense(client);assert.equal(dry.dryRun,true);
  assert.equal((await client.execute('SELECT COUNT(*) AS n FROM daily_expenses')).rows[0].n,2);
  const summary=await cleanupTestExpense(client,{apply:true,expectedSnapshot:dry.snapshotHash});
  assert.equal(summary.expenseReduction,100);assert.equal(summary.balanceIncrease,100);assert.equal(summary.unrelatedRowsUnchanged,true);
  assert.deepEqual((await client.execute('SELECT id FROM daily_expenses')).rows.map(r=>r.id),[1400]);
  assert.deepEqual((await client.execute('SELECT id FROM local_expense_payments')).rows.map(r=>r.id),[26]);
  assert.deepEqual((await client.execute('SELECT id FROM local_expense_audit')).rows.map(r=>r.id),[53]);
  const archived=JSON.parse((await client.execute('SELECT snapshot FROM local_expense_cleanup_audit')).rows[0].snapshot);
  assert.deepEqual(archived.audit.map(r=>r.id),[50,51,52]);assert.deepEqual(archived.payments.map(r=>r.id),[24,25]);
  assert.equal((await client.execute('SELECT expected_cash FROM cash_registers')).rows[0].expected_cash,1000);
  assert.equal((await client.execute('PRAGMA foreign_key_check')).rows.length,0);
}));
test('más de una coincidencia detiene toda la limpieza',()=>fixture(async client=>{
  await client.execute("INSERT INTO daily_expenses VALUES(1500,'prueba',100,'duplicate','paid',NULL,2)");
  await assert.rejects(()=>cleanupTestExpense(client,{apply:true}),/exactamente un gasto/);
  assert.equal((await client.execute('SELECT COUNT(*) AS n FROM daily_expenses')).rows[0].n,3);
}));
test('pagos diferentes de los identificados o snapshot cambiado no eliminan nada',()=>fixture(async client=>{
  const dry=await cleanupTestExpense(client);
  await client.execute('UPDATE daily_expenses SET version=3 WHERE id=1389');
  await assert.rejects(()=>cleanupTestExpense(client,{apply:true,expectedSnapshot:dry.snapshotHash}),/snapshot/);
  await client.execute('UPDATE local_expense_payments SET amount_cents=4000 WHERE id=25');
  await assert.rejects(()=>cleanupTestExpense(client,{apply:true,expectedSnapshot:dry.snapshotHash}));
  assert.equal((await client.execute('SELECT COUNT(*) AS n FROM local_expense_payments')).rows[0].n,3);
}));
test('cambio inesperado de otro registro provoca rollback incluso después de los DELETE',()=>fixture(async client=>{
  const dry=await cleanupTestExpense(client);
  await client.execute('CREATE TRIGGER unexpected AFTER DELETE ON daily_expenses BEGIN UPDATE products SET stock=0; END');
  await assert.rejects(()=>cleanupTestExpense(client,{apply:true,expectedSnapshot:dry.snapshotHash}),/registros ajenos/);
  assert.equal((await client.execute('SELECT stock FROM products')).rows[0].stock,40);
  assert.equal((await client.execute('SELECT COUNT(*) AS n FROM daily_expenses')).rows[0].n,2);
  assert.equal((await client.execute('SELECT COUNT(*) AS n FROM local_expense_payments')).rows[0].n,3);
  assert.equal((await client.execute("SELECT name FROM sqlite_master WHERE name='local_expense_cleanup_audit'")).rows.length,0);
}));
