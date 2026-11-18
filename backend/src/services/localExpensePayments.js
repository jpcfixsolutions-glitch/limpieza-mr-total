import { sql } from 'drizzle-orm';
import { getArgentinaTime } from '../db/timeUtils.js';
import { paymentTimestamp } from './warehouseExpensePayments.js';

export const fail = (status,message) => { throw {status,message}; };
export function amountValue(value,zero=false) {
  const n=Number(value), cents=Math.round(n*100);
  if (!['string','number'].includes(typeof value) || String(value).trim()==='' || !Number.isSafeInteger(cents) || cents<(zero?0:1) || Math.abs(n*100-cents)>0.000001) fail(400,'Ingresá un importe válido con hasta dos decimales.');
  return cents/100;
}
export function paymentMethod(method) {
  if (!['efectivo','transferencia'].includes(method)) fail(400,'Seleccioná efectivo o transferencia.');
  return method;
}
export function expenseRow(row) {
  return {id:row.id,reason:row.reason,amount:row.amount,method:row.method,registerId:row.register_id,createdAt:row.created_at,
    status:row.status,paidAt:row.paid_at,statusChangedAt:row.status_changed_at,paymentRegisterId:row.payment_register_id,
    fixedExpenseId:row.fixed_expense_id,period:row.period,idempotencyKey:row.idempotency_key,version:row.version,userId:row.user_id};
}
export async function auditExpense(tx,before,after,userId,action) {
  await tx.run(sql`INSERT INTO local_expense_audit(expense_id,action,snapshot,user_id,created_at)
    VALUES(${after.id},${action},${JSON.stringify({before,after})},${userId??null},${getArgentinaTime().datetime})`);
}
export async function paidDetails(tx,data) {
  const paidAt=paymentTimestamp(data.paidAt), method=paymentMethod(data.method);
  // El pago pertenece a la caja que contiene su fecha efectiva, nunca a la de creación.
  const [register]=await tx.all(sql`SELECT id FROM cash_registers WHERE opened_at<=${paidAt} AND (closed_at IS NULL OR closed_at>=${paidAt}) ORDER BY opened_at DESC,id DESC LIMIT 1`);
  if (method==='efectivo' && !register) fail(400,'No existe una caja para esa fecha y hora de pago en efectivo. Abrí una caja o revisá la fecha.');
  return {paidAt,method,paymentRegisterId:register?.id??null};
}
export async function materializeLocalFixed(tx, through=getArgentinaTime().datetime.slice(0,7)) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(through)) fail(400,'Período inválido.');
  const configs=await tx.all(sql`SELECT * FROM fixed_expenses WHERE active=1 AND amount>0 AND start_period<=${through}`);
  const now=getArgentinaTime().datetime;
  for (const config of configs) {
    let period=config.start_period;
    while(period<=through) {
      const [created]=await tx.all(sql`INSERT OR IGNORE INTO daily_expenses(reason,amount,method,created_at,status_changed_at,fixed_expense_id,period,idempotency_key)
        VALUES(${config.name},${config.amount},'efectivo',${now},${now},${config.id},${period},${'fixed:'+config.id+':'+period}) RETURNING *`);
      if(created) await auditExpense(tx,null,created,null,'create_obligation');
      const date=new Date(period+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);period=date.toISOString().slice(0,7);
    }
  }
}
