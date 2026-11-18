export function paidExpensesInRange(expenses,start=null,end=null) {
  return expenses.filter(e=>e.status==='paid' && e.paidAt && (!start||e.paidAt.slice(0,10)>=start) && (!end||e.paidAt.slice(0,10)<=end));
}
export function sumExpenses(expenses) {
  return expenses.reduce((sum,e)=>sum+Math.round(Number(e.amount||0)*100),0)/100;
}
export function cashExpensesForRegister(expenses,registerId) {
  return sumExpenses(paidExpensesInRange(expenses).filter(e=>e.paymentRegisterId===registerId&&e.method==='efectivo'));
}
