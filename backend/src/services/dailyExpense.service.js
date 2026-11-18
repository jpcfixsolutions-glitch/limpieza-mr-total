import { sql } from 'drizzle-orm';
import { getArgentinaTime } from '../db/timeUtils.js';
import { runWarehouseTransaction as transaction } from './warehouse.service.js';
import { amountValue, paymentMethod, expenseRow, auditExpense, paidDetails, materializeLocalFixed, fail } from './localExpensePayments.js';

export const DailyExpenseService = {
  async getAll() {
    return transaction(async tx=>{
      await materializeLocalFixed(tx);
      return (await tx.all(sql`SELECT * FROM daily_expenses ORDER BY created_at DESC,id DESC`)).map(expenseRow);
    });
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
      if(duplicate) return {...expenseRow(duplicate),duplicated:true};
      const now=getArgentinaTime().datetime;
      const payment=data.status==='paid'?await paidDetails(tx,data):{paidAt:null,paymentRegisterId:null};
      const [open]=await tx.all(sql`SELECT id FROM cash_registers WHERE is_open=1`);
      const [created]=await tx.all(sql`INSERT INTO daily_expenses(reason,amount,method,register_id,created_at,status,paid_at,status_changed_at,payment_register_id,idempotency_key,user_id)
        VALUES(${reason},${amount},${method},${open?.id??null},${now},${data.status},${payment.paidAt},${now},${payment.paymentRegisterId},${key},${userId??null}) RETURNING *`);
      await auditExpense(tx,null,created,userId,'create');
      return expenseRow(created);
    });
  },
  async changeStatus(id,data,userId) {
    if (!['pending','paid'].includes(data.status)) fail(400,'Estado inválido.');
    return transaction(async tx=>{
      const [before]=await tx.all(sql`SELECT * FROM daily_expenses WHERE id=${Number(id)}`);
      if (!before) fail(404,'Gasto no encontrado.');
      if (data.expectedVersion!==before.version) fail(409,'El gasto cambió. Actualizá antes de reintentar.');
      if (before.status===data.status) return {...expenseRow(before),duplicated:true};
      const payment=data.status==='paid'?await paidDetails(tx,data):{paidAt:null,paymentRegisterId:null,method:before.method};
      const now=getArgentinaTime().datetime;
      const [after]=await tx.all(sql`UPDATE daily_expenses SET status=${data.status},paid_at=${payment.paidAt},payment_register_id=${payment.paymentRegisterId},method=${payment.method},status_changed_at=${now},version=version+1 WHERE id=${before.id} AND version=${before.version} RETURNING *`);
      if (!after) fail(409,'El gasto cambió. Actualizá antes de reintentar.');
      await auditExpense(tx,before,after,userId,data.status==='paid'?'pay':'reverse_payment');
      return expenseRow(after);
    });
  },
};
