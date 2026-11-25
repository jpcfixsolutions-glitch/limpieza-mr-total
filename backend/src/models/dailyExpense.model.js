import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { expenseRow } from '../services/localExpensePayments.js';

export const paymentRow = p => ({id:p.id,expenseId:p.expense_id,amount:Number(p.amount_cents)/100,method:p.method,paidAt:p.paid_at,paymentRegisterId:p.payment_register_id,observation:p.observation,createdAt:p.created_at,reversedAt:p.reversed_at,userId:p.user_id});
export async function expensesWithPayments(tx=db) {
  const rows=await tx.all(sql`SELECT * FROM daily_expenses ORDER BY created_at DESC,id DESC`);
  const payments=await tx.all(sql`SELECT * FROM local_expense_payments ORDER BY paid_at DESC,id DESC`);
  const grouped=new Map();
  for(const p of payments){if(!grouped.has(p.expense_id))grouped.set(p.expense_id,[]);grouped.get(p.expense_id).push(paymentRow(p));}
  return rows.map(row=>{
    const history=grouped.get(row.id)||[];
    const totalCents=history.filter(p=>!p.reversedAt).reduce((s,p)=>s+Math.round(p.amount*100),0);
    const remainingCents=Math.round(row.amount*100)-totalCents;
    return {...expenseRow(row),payments:history,totalPaid:totalCents/100,balance:remainingCents/100,status:remainingCents===0?'paid':totalCents>0?'partial':'pending'};
  });
}
export async function paymentMovements(tx=db) {
  return (await expensesWithPayments(tx)).flatMap(e=>e.payments.filter(p=>!p.reversedAt).map(p=>({...e,...p,id:`${e.id}:${p.id}`,expenseId:e.id,status:'paid',originalAmount:e.amount})));
}
export const DailyExpenseModel = {
  findAll: expensesWithPayments,
  async findByRegisterId(id) {return (await paymentMovements()).filter(p=>p.paymentRegisterId===id);},
};
