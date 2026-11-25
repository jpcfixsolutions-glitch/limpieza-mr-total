import test from 'node:test';
import assert from 'node:assert/strict';
import { paidExpensesInRange, sumExpenses, cashExpensesForRegister } from './localExpenses.js';

test('pendientes no afectan saldos y los pagos se agrupan por su fecha efectiva y caja',()=>{
  const expenses=[
    {amount:150000,status:'paid',createdAt:'2026-10-30 08:00:00',paidAt:'2026-11-05 11:00:00',method:'efectivo',registerId:1,paymentRegisterId:2,fixedExpenseId:1},
    {amount:40000,status:'pending',createdAt:'2026-11-02 10:00:00',method:'efectivo',registerId:2},
    {amount:30000,status:'paid',createdAt:'2026-11-02 10:00:00',paidAt:'2026-11-05 12:00:00',method:'transferencia',registerId:1,paymentRegisterId:2},
  ];
  assert.equal(500000-sumExpenses(paidExpensesInRange(expenses)),320000);
  for(const [start,end] of [['2026-11-05','2026-11-05'],['2026-11-02','2026-11-08'],['2026-11-01','2026-11-30']]) assert.equal(sumExpenses(paidExpensesInRange(expenses,start,end)),180000);
  assert.equal(sumExpenses(paidExpensesInRange(expenses,'2026-10-01','2026-10-31')),0);
  assert.equal(cashExpensesForRegister(expenses,1),0);
  assert.equal(cashExpensesForRegister(expenses,2),150000);
  const reversed=expenses.map(e=>e.fixedExpenseId?{...e,status:'pending',paidAt:null,paymentRegisterId:null}:e);
  assert.equal(cashExpensesForRegister(reversed,2),0);
  assert.equal(sumExpenses(paidExpensesInRange(reversed)),30000);
});

test('los importes se suman en centavos sin errores de punto flotante',()=>{
  assert.equal(sumExpenses([{amount:0.1},{amount:0.2}]),0.3);
});

test('cuotas de un mismo gasto se imputan por pago y no se suma el original al completarlo',()=>{
  const expense={id:10,amount:150000,status:'paid',paidAt:'2026-11-02 12:00:00',payments:[
    {id:1,amount:50000,paidAt:'2026-10-31 23:59:00',method:'efectivo',paymentRegisterId:1},
    {id:2,amount:40000,paidAt:'2026-11-01 00:01:00',method:'transferencia',paymentRegisterId:2},
    {id:3,amount:60000,paidAt:'2026-11-02 12:00:00',method:'efectivo',paymentRegisterId:2},
    {id:4,amount:1000,paidAt:'2026-11-02 12:00:00',method:'efectivo',paymentRegisterId:2,reversedAt:'2026-11-02 13:00:00'},
  ]};
  assert.equal(sumExpenses(paidExpensesInRange([expense])),150000);
  assert.equal(sumExpenses(paidExpensesInRange([expense],'2026-10-01','2026-10-31')),50000);
  assert.equal(sumExpenses(paidExpensesInRange([expense],'2026-11-01','2026-11-01')),40000);
  assert.equal(cashExpensesForRegister([expense],1),50000);assert.equal(cashExpensesForRegister([expense],2),60000);
  assert.equal(sumExpenses(paidExpensesInRange([{...expense,status:'partial',payments:expense.payments.slice(0,1)}])),50000);
});
