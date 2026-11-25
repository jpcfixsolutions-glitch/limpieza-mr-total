import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const TARGET_ID = 1389;
const TARGET_KEY = 'dd23083b-c7f1-4bce-a78d-91deb366df04';
const PAYMENT_IDS = [24,25];
const ARCHIVE = 'local_expense_cleanup_audit';
const quote = name => '"'+name.replaceAll('"','""')+'"';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const query = async (tx,sql,args=[]) => (await tx.execute({sql,args})).rows;

async function inspect(tx) {
  const candidates=await query(tx,'SELECT * FROM daily_expenses WHERE reason=? COLLATE BINARY AND amount=?',['prueba',100]);
  assert.equal(candidates.length,1,'Debe existir exactamente un gasto prueba de $100; no se elimina nada.');
  const expense=candidates[0];
  assert.equal(expense.id,TARGET_ID,'El gasto no es el identificado previamente.');
  assert.equal(expense.idempotency_key,TARGET_KEY,'La identidad del gasto cambió.');
  assert.equal(expense.status,'paid');
  assert.equal(expense.fixed_expense_id,null,'No se permite borrar una obligación fija.');
  const payments=await query(tx,'SELECT * FROM local_expense_payments WHERE expense_id=? ORDER BY id',[TARGET_ID]);
  assert.deepEqual(payments.map(p=>p.id),PAYMENT_IDS,'Deben existir únicamente los dos pagos identificados.');
  for(const p of payments){assert.equal(p.amount_cents,5000);assert.equal(p.reversed_at,null);assert.equal(p.method,'efectivo');assert.equal(p.payment_register_id,27);}
  assert.equal(payments[0].paid_at,'2026-11-25 19:34:00');assert.equal(payments[1].paid_at,'2026-11-25 19:36:00');
  const audit=await query(tx,'SELECT * FROM local_expense_audit WHERE expense_id=? ORDER BY id',[TARGET_ID]);
  assert.deepEqual(audit.map(a=>a.id),[50,51,52]);
  return {expense,payments,audit};
}

// Compara todo el contenido ajeno a la prueba, sin imprimir información de otras tablas.
async function fingerprints(tx,tables) {
  const result={};
  const batches=await tx.batch(tables.map(table=>'SELECT * FROM '+quote(table)));
  for(const [index,table] of tables.entries()){
    let rows=batches[index].rows;
    if(table==='daily_expenses')rows=rows.filter(r=>r.id!==TARGET_ID);
    if(['local_expense_payments','local_expense_audit',ARCHIVE].includes(table))rows=rows.filter(r=>r.expense_id!==TARGET_ID);
    result[table]=hash(rows.map(r=>JSON.stringify(r)).sort());
  }
  return result;
}
async function totals(tx) {
  return query(tx,`SELECT substr(paid_at,1,10) AS day,method,payment_register_id, SUM(amount_cents) AS cents
    FROM local_expense_payments WHERE reversed_at IS NULL GROUP BY day,method,payment_register_id ORDER BY day,method,payment_register_id`);
}
const totalMap = rows=>new Map(rows.map(r=>[JSON.stringify([r.day,r.method,r.payment_register_id]),Number(r.cents)]));

export async function cleanupTestExpense(client,{apply=false,expectedSnapshot}={}) {
  const tx=await client.transaction(apply?'write':'read');
  try {
    const snapshot=await inspect(tx),snapshotHash=hash(snapshot);
    const tables=(await query(tx,"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).map(r=>r.name);
    // Ante una referencia nueva desconocida, detenerse: nunca borrar otras entidades por cascada.
    const references=await tx.batch(tables.map(table=>'PRAGMA foreign_key_list('+quote(table)+')'));
    for(const [index,table] of tables.entries()){
      const keys=references[index].rows;
      for(const key of keys.filter(k=>['daily_expenses','local_expense_payments','local_expense_audit'].includes(k.table))){
        assert.ok(key.table==='daily_expenses'&&['local_expense_payments','local_expense_audit'].includes(table)&&key.from==='expense_id'&&key.on_delete==='NO ACTION','Referencia inesperada: '+table);
      }
    }
    const summary={expenseId:TARGET_ID,concept:snapshot.expense.reason,originalAmount:100,paymentIds:PAYMENT_IDS,paymentAmounts:[50,50],auditIds:snapshot.audit.map(r=>r.id),snapshotHash};
    if(!apply){await tx.commit();return {dryRun:true,...summary};}
    assert.equal(expectedSnapshot,snapshotHash,'El snapshot cambió o falta su huella; no se elimina nada.');
    const before=await fingerprints(tx,tables),beforeTotals=totalMap(await totals(tx));
    const foreignKeysBefore=await query(tx,'PRAGMA foreign_key_check');
    // La auditoría original se conserva íntegra sin una FK hacia el registro eliminado.
    await tx.execute(`CREATE TABLE IF NOT EXISTS ${ARCHIVE} (
      expense_id INTEGER PRIMARY KEY,action TEXT NOT NULL,snapshot TEXT NOT NULL,snapshot_sha256 TEXT NOT NULL,
      reason TEXT NOT NULL,created_at TEXT NOT NULL
    )`);
    await tx.execute({sql:`INSERT INTO ${ARCHIVE}(expense_id,action,snapshot,snapshot_sha256,reason,created_at) VALUES(?,?,?,?,?,datetime('now','-3 hours'))`,args:[TARGET_ID,'delete_test_expense',JSON.stringify(snapshot),snapshotHash,'Limpieza puntual solicitada por el usuario: prueba $100, dos pagos de $50.']});
    const removedPayments=await tx.execute({sql:'DELETE FROM local_expense_payments WHERE expense_id=? AND id IN (?,?)',args:[TARGET_ID,...PAYMENT_IDS]});
    assert.equal(removedPayments.rowsAffected,2);
    const archivedAudit=await tx.execute({sql:'DELETE FROM local_expense_audit WHERE expense_id=?',args:[TARGET_ID]});
    assert.equal(archivedAudit.rowsAffected,snapshot.audit.length);
    const removedExpense=await tx.execute({sql:'DELETE FROM daily_expenses WHERE id=? AND reason=? COLLATE BINARY AND amount=? AND version=?',args:[TARGET_ID,'prueba',100,snapshot.expense.version]});
    assert.equal(removedExpense.rowsAffected,1);
    assert.deepEqual(await fingerprints(tx,tables),before,'Se alteraron registros ajenos: rollback.');
    assert.deepEqual(await query(tx,'PRAGMA foreign_key_check'),foreignKeysBefore,'Cambió la integridad referencial: rollback.');
    const archive=(await query(tx,`SELECT snapshot,snapshot_sha256 FROM ${ARCHIVE} WHERE expense_id=?`,[TARGET_ID]))[0];
    assert.deepEqual(JSON.parse(archive.snapshot),snapshot);assert.equal(archive.snapshot_sha256,snapshotHash);
    const afterTotals=totalMap(await totals(tx));
    const expectedDelta=new Map();
    for(const p of snapshot.payments){const key=JSON.stringify([p.paid_at.slice(0,10),p.method,p.payment_register_id]);expectedDelta.set(key,(expectedDelta.get(key)||0)+p.amount_cents);}
    for(const key of new Set([...beforeTotals.keys(),...afterTotals.keys()]))assert.equal((beforeTotals.get(key)||0)-(afterTotals.get(key)||0),expectedDelta.get(key)||0,'Diferencia financiera inesperada.');
    assert.equal((await query(tx,'SELECT COUNT(*) AS n FROM daily_expenses WHERE id=?',[TARGET_ID]))[0].n,0);
    assert.equal((await query(tx,'SELECT COUNT(*) AS n FROM local_expense_payments WHERE expense_id=?',[TARGET_ID]))[0].n,0);
    const result={dryRun:false,...summary,removedExpenses:1,removedPayments:2,archivedAuditRecords:snapshot.audit.length,archiveTable:ARCHIVE,expenseReduction:100,balanceIncrease:100,day:'2026-11-25',cashRegisterId:27,unrelatedTablesVerified:tables.length,unrelatedRowsUnchanged:true};
    await tx.commit();
    return result;
  }catch(error){await tx.rollback();throw error;}
  finally{tx.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  await import('dotenv/config');
  const {client}=await import('../src/db/client.js');
  try {console.log(JSON.stringify(await cleanupTestExpense(client,{apply:process.argv.includes('--apply'),expectedSnapshot:process.argv.find(a=>a.startsWith('--snapshot='))?.slice(11)}),null,2));}
  catch(error){console.error(error.message);process.exitCode=1;}
  finally{client.close();}
}
