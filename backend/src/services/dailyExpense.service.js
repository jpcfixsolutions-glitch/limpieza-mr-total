import { sql } from 'drizzle-orm';
import { getArgentinaTime } from '../db/timeUtils.js';
import { runWarehouseTransaction as transaction } from './warehouse.service.js';
import { amountValue, paymentMethod, auditExpense, paidDetails, materializeLocalFixed, fail } from './localExpensePayments.js';
import { expensesWithPayments } from '../models/dailyExpense.model.js';
import { paymentTimestamp } from './warehouseExpensePayments.js';

const result = async (tx,id) => (await expensesWithPayments(tx)).find(e=>e.id===id);
async function insertPayment(tx,expense,amount,data,userId,key) {
  await tx.run(sql`INSERT INTO local_expense_payments(expense_id,amount_cents,method,paid_at,payment_register_id,observation,idempotency_key,user_id,created_at)
    VALUES(${expense.id},${Math.round(amount*100)},${data.method},${data.paidAt},${data.paymentRegisterId},${data.observation||''},${key},${userId??null},${getArgentinaTime().datetime})`);
}
export const DailyExpenseService = {
  async getAll() {
    return transaction(async tx=>{await materializeLocalFixed(tx);return expensesWithPayments(tx);});
  },
  async create(data,userId) {
    const reason=String(data.reason||'').trim();
    if (!reason || reason.length>200) fail(400,'Ingresá un motivo de hasta 200 caracteres.');
    const amount=amountValue(data.amount),method=paymentMethod(data.method);
    if (!['pending','paid'].includes(data.status)) fail(400,'Seleccioná el estado del gasto.');
    const key=String(data.idempotencyKey||'').trim();
    if (!key || key.length>150 || key.startsWith('fixed:')) fail(400,'Se requiere una clave de operación válida.');
    return transaction(async tx=>{
      const [duplicate]=await tx.all(sql`SELECT * FROM daily_expenses WHERE idempotency_key=${key}`);
      if(duplicate) return {...await result(tx,duplicate.id),duplicated:true};
      const now=getArgentinaTime().datetime;
      const payment=data.status==='paid'?await paidDetails(tx,data):{paidAt:null,paymentRegisterId:null};
      const [open]=await tx.all(sql`SELECT id FROM cash_registers WHERE is_open=1`);
      const [created]=await tx.all(sql`INSERT INTO daily_expenses(reason,amount,method,register_id,created_at,status,paid_at,status_changed_at,payment_register_id,idempotency_key,user_id)
        VALUES(${reason},${amount},${method},${open?.id??null},${now},${data.status},${payment.paidAt},${now},${payment.paymentRegisterId},${key},${userId??null}) RETURNING *`);
      if(data.status==='paid') await insertPayment(tx,created,amount,payment,userId,'create:'+key);
      await auditExpense(tx,null,created,userId,'create');
      return result(tx,created.id);
    });
  },
  async registerPayment(id,data,userId) {
    const amount=amountValue(data.amount),method=paymentMethod(data.method);
    const key=String(data.idempotencyKey||'').trim(),observation=String(data.observation||'').trim();
    if(!key || key.length>150 || observation.length>1000) fail(400,'Clave de operación u observación inválida.');
    return transaction(async tx=>{
      const [before]=await tx.all(sql`SELECT * FROM daily_expenses WHERE id=${Number(id)}`);
      if(!before) fail(404,'Gasto no encontrado.');
      const operationKey='payment:'+key;
      const [duplicate]=await tx.all(sql`SELECT * FROM local_expense_payments WHERE idempotency_key=${operationKey}`);
      if(duplicate) {
        if(duplicate.expense_id!==before.id || duplicate.amount_cents!==Math.round(amount*100) || duplicate.method!==method || duplicate.observation!==observation || (data.paidAt && duplicate.paid_at!==paymentTimestamp(data.paidAt))) fail(409,'La clave de operación ya fue utilizada.');
        return {...await result(tx,before.id),duplicated:true};
      }
      if(data.expectedVersion!==before.version) fail(409,'El gasto cambió. Actualizá antes de reintentar.');
      const current=await result(tx,before.id);
      const remaining=Math.round(current.balance*100)-Math.round(amount*100);
      if(current.balance<=0 || remaining<0) fail(400,'El importe supera el saldo pendiente o el gasto ya está pagado.');
      const payment=await paidDetails(tx,data),now=getArgentinaTime().datetime;
      const [after]=await tx.all(sql`UPDATE daily_expenses SET status=${remaining===0?'paid':'pending'},paid_at=${remaining===0?payment.paidAt:null},payment_register_id=${remaining===0?payment.paymentRegisterId:null},status_changed_at=${now},version=version+1 WHERE id=${before.id} AND version=${before.version} RETURNING *`);
      if(!after) fail(409,'El gasto cambió. Actualizá antes de reintentar.');
      await insertPayment(tx,before,amount,{...payment,observation},userId,operationKey);
      await auditExpense(tx,before,after,userId,'register_payment');
      return result(tx,before.id);
    });
  },
  async changeStatus(id,data,userId) {
    if (!['pending','paid'].includes(data.status)) fail(400,'Estado inválido.');
    return transaction(async tx=>{
      const [before]=await tx.all(sql`SELECT * FROM daily_expenses WHERE id=${Number(id)}`);
      if (!before) fail(404,'Gasto no encontrado.');
      if (data.expectedVersion!==before.version) fail(409,'El gasto cambió. Actualizá antes de reintentar.');
      const current=await result(tx,before.id);
      if (current.status===data.status) return {...current,duplicated:true};
      // La reversión heredada sólo admite un pago total. Las cuotas conservan su trazabilidad.
      if(current.status==='partial' || current.payments.filter(p=>!p.reversedAt).length>1) fail(409,'Usá Registrar pago para completar el saldo. No se pueden revertir cuotas en conjunto.');
      const payment=data.status==='paid'?await paidDetails(tx,data):{paidAt:null,paymentRegisterId:null,method:before.method};
      const now=getArgentinaTime().datetime;
      const [after]=await tx.all(sql`UPDATE daily_expenses SET status=${data.status},paid_at=${payment.paidAt},payment_register_id=${payment.paymentRegisterId},method=${payment.method},status_changed_at=${now},version=version+1 WHERE id=${before.id} AND version=${before.version} RETURNING *`);
      if (!after) fail(409,'El gasto cambió. Actualizá antes de reintentar.');
      if(data.status==='paid') await insertPayment(tx,before,before.amount,payment,userId,'status:'+before.id+':'+before.version);
      else await tx.run(sql`UPDATE local_expense_payments SET reversed_at=${now} WHERE expense_id=${before.id} AND reversed_at IS NULL`);
      await auditExpense(tx,before,after,userId,data.status==='paid'?'pay':'reverse_payment');
      return result(tx,after.id);
    });
  },
};
