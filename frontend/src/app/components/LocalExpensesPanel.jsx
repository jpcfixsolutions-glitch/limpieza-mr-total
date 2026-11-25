import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import api from '../../services/api.js';
import { DailyExpenseModal } from './DailyExpenseModal.jsx';
import { WarehouseModal } from './WarehouseModal.jsx';
import { paidExpensesInRange, sumExpenses } from '../../utils/localExpenses.js';

const button='rounded-xl border border-foreground/20 px-3 py-2 text-sm font-bold hover:bg-primary/10 disabled:opacity-50';
const input='w-full rounded-xl bg-background border border-foreground/20 p-3 mt-1';
const money=v=>Number(v||0).toLocaleString('es-AR',{style:'currency',currency:'ARS'});
const date=v=>v?`${v.slice(0,10).split('-').reverse().join('/')} ${v.slice(11,19)}`:'—';
const nowArgentina=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()).replace(' ','T');
const states={pending:'Pendiente',partial:'Parcialmente pagado',paid:'Pagado'};

export function LocalExpensesPanel({onChange}) {
  const [expenses,setExpenses]=useState([]),[filter,setFilter]=useState('pending'),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [adding,setAdding]=useState(false),[record,setRecord]=useState(null),[paidAt,setPaidAt]=useState(''),[method,setMethod]=useState('efectivo'),[busy,setBusy]=useState(false),[saveError,setSaveError]=useState('');
  const [amount,setAmount]=useState('0'),[observation,setObservation]=useState(''),[operationKey,setOperationKey]=useState(''),[history,setHistory]=useState(null),[reversing,setReversing]=useState(null);
  const saving=useRef(false),changed=useRef(onChange);changed.current=onChange;
  const load=useCallback(async()=>{
    try {const {data}=await api.get('/daily-expenses');setExpenses(data);changed.current?.(data);setError('');}
    catch(e){setError(e.response?.data?.message||'No se pudieron cargar los gastos.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{
    load();const refresh=()=>{if(!document.hidden)load();};
    window.addEventListener('local-expenses-changed',refresh);window.addEventListener('focus',refresh);
    return()=>{window.removeEventListener('local-expenses-changed',refresh);window.removeEventListener('focus',refresh);};
  },[load]);
  const open=e=>{setRecord(e);setMethod(e.method);setPaidAt(nowArgentina());setAmount('0');setObservation('');setOperationKey(crypto.randomUUID());setSaveError('');};
  async function save(e) {
    e.preventDefault();if(saving.current)return;saving.current=true;setBusy(true);setSaveError('');
    try {
      await api.post(`/daily-expenses/${record.id}/payments`,{amount,expectedVersion:record.version,method,paidAt,observation,idempotencyKey:operationKey});
      setRecord(null);toast.success('Pago registrado.');window.dispatchEvent(new Event('local-expenses-changed'));await load();
    } catch(e){setSaveError(e.response?.data?.message||'No se pudo guardar.');if(e.response?.status===409){await load();setSaveError('El gasto cambió. Cerrá esta ventana y volvé a abrir Registrar pago para revisar el saldo actual.');}}
    finally{saving.current=false;setBusy(false);}
  }
  async function reversePayment() {
    if(saving.current)return;saving.current=true;setBusy(true);setSaveError('');
    try {await api.patch('/daily-expenses/'+reversing.id+'/status',{status:'pending',expectedVersion:reversing.version});setReversing(null);toast.success('Pago revertido.');window.dispatchEvent(new Event('local-expenses-changed'));await load();}
    catch(e){setSaveError(e.response?.data?.message||'No se pudo revertir el pago.');}
    finally{saving.current=false;setBusy(false);}
  }
  const visible=expenses.filter(e=>filter==='all'||(filter==='pending'?e.balance>0:e.status===filter));
  const movements=paidExpensesInRange(expenses);
  const remaining=record?(Math.round(record.balance*100)-Math.round(Number(amount||0)*100))/100:0;
  const invalid=!Number.isFinite(remaining)||Number(amount)<=0||remaining<0;
  return <section className="bg-surface border border-foreground/15 rounded-2xl p-4 sm:p-6 min-w-0">
    <div className="flex flex-wrap justify-between items-center gap-3"><div><h2 className="text-xl font-black text-primary">Gastos del Local</h2><p className="text-sm text-foreground/60 mt-1">Todos los períodos · Cada pago se descuenta por su fecha efectiva.</p></div><button type="button" className={button} onClick={()=>setAdding(true)}>Agregar gasto variable</button></div>
    <p className="my-4 text-sm font-bold">Saldo pendiente: {money(sumExpenses(expenses.map(e=>({amount:e.balance}))))} · Total abonado: {money(sumExpenses(movements))}</p>
    <label className="block text-sm font-bold mb-4">Ver gastos<select className={input} value={filter} onChange={e=>setFilter(e.target.value)}><option value="pending">Pagos pendientes</option><option value="partial">Parcialmente pagados</option><option value="payments">Pagos efectuados</option><option value="paid">Gastos completamente pagados</option><option value="all">Todos los gastos</option></select></label>
    {loading&&<p role="status">Cargando gastos…</p>}{error&&<p role="alert" className="text-red-600">{error} <button className={button} onClick={load}>Reintentar</button></p>}
    {!loading&&!error&&!(filter==='payments'?movements:visible).length&&<p className="text-foreground/60">Sin gastos para este filtro.</p>}
    <div className="space-y-3 max-h-[32rem] overflow-y-auto">{filter==='payments'?movements.sort((a,b)=>b.paidAt.localeCompare(a.paidAt)).map(p=><article key={p.id} className="rounded-xl bg-background border border-green-600/25 p-3"><h3 className="font-bold">{p.reason}</h3><p className="font-black">{money(p.amount)}</p><p className="text-sm">{date(p.paidAt)} · {p.method==='efectivo'?'Efectivo':'Transferencia'}{p.paymentRegisterId&&` · Caja #${p.paymentRegisterId}`}</p>{p.observation&&<p className="text-sm break-words">{p.observation}</p>}<button className={`${button} mt-2`} onClick={()=>setHistory(expenses.find(e=>e.id===p.expenseId))}>Historial de pagos</button></article>):visible.map(e=><article key={e.id} className={`rounded-xl bg-background border p-3 ${e.status==='partial'?'border-blue-500/50':'border-foreground/10'}`}>
      <div className="flex flex-wrap justify-between gap-3 items-start"><div className="min-w-0"><p className="text-xs font-bold text-foreground/60">{e.fixedExpenseId?'Fijo':'Variable'}{e.period&&` · Período ${e.period.split('-').reverse().join('/')}`}</p><h3 className="font-bold break-words">{e.reason}</h3></div><span className={`rounded-full px-3 py-2 text-sm font-bold ${e.status==='paid'?'bg-green-600/15 text-green-700 dark:text-green-400':e.status==='partial'?'bg-blue-500/15 text-blue-700 dark:text-blue-400':'bg-amber-500/15 text-amber-800 dark:text-amber-400'}`}>{states[e.status]}</span></div>
      <dl className="grid sm:grid-cols-3 gap-2 my-3 text-sm">{[['Importe original',e.amount],['Total abonado',e.totalPaid],['Saldo pendiente',e.balance]].map(([label,value])=><div key={label}><dt className="text-foreground/65">{label}</dt><dd className="font-black">{money(value)}</dd></div>)}</dl>
      <p className="text-xs mt-2 text-foreground/65">Registro: {date(e.createdAt)}</p><div className="flex gap-2 flex-wrap mt-3">{e.balance>0&&<button type="button" className={`${button} bg-primary text-white`} onClick={()=>open(e)}>Registrar pago</button>}<button type="button" className={button} onClick={()=>setHistory(e)}>Historial de pagos</button>{e.status==='paid'&&e.payments.filter(p=>!p.reversedAt).length===1&&<button type="button" className={button} onClick={()=>{setReversing(e);setSaveError('');}}>Revertir pago</button>}</div>
    </article>)}</div>
    {adding&&<DailyExpenseModal onClose={()=>setAdding(false)} onSubmit={async data=>{try{await api.post('/daily-expenses',data);setAdding(false);toast.success('Gasto registrado.');window.dispatchEvent(new Event('local-expenses-changed'));await load();}catch(e){toast.error(e.response?.data?.message||'No se pudo guardar.');throw e;}}}/>}
    {record&&<WarehouseModal title="Registrar pago" busy={busy} onClose={()=>{if(!busy)setRecord(null);}}><form onSubmit={save} className="space-y-4">
      <p className="font-bold break-words">{record.reason}{record.period&&` · Período ${record.period}`}</p><dl className="space-y-1 text-sm">{[['Importe original',record.amount],['Total abonado',record.totalPaid],['Saldo pendiente actual',record.balance]].map(([label,value])=><div className="flex justify-between gap-3" key={label}><dt>{label}</dt><dd className="font-bold">{money(value)}</dd></div>)}</dl>
      <fieldset disabled={busy} className="space-y-4"><label className="block text-sm font-bold">Importe a abonar<input autoFocus className={input} type="number" min="0.01" max={record.balance} step="0.01" required value={amount} onFocus={()=>{if(amount!==''&&Number(amount)===0)setAmount('');}} onClick={()=>{if(amount!==''&&Number(amount)===0)setAmount('');}} onBlur={()=>{if(amount==='')setAmount('0');}} onChange={e=>setAmount(e.target.value)}/></label><button type="button" className={button} onClick={()=>setAmount(String(record.balance))}>Abonar la totalidad del saldo pendiente</button>
      <p aria-live="polite" className={`font-bold ${remaining<0?'text-red-600':'text-primary'}`}>Saldo después del pago: {money(remaining)}</p>
      <label className="block text-sm font-bold">Fecha y hora efectiva de pago (Argentina)<input className={input} type="datetime-local" required max={nowArgentina()} value={paidAt} onChange={e=>setPaidAt(e.target.value)}/></label><label className="block text-sm font-bold">Método de pago<select className={input} value={method} onChange={e=>setMethod(e.target.value)}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option></select></label><label className="block text-sm font-bold">Observación (opcional)<textarea className={input} maxLength={1000} value={observation} onChange={e=>setObservation(e.target.value)}/></label></fieldset>
      {saveError&&<p role="alert" className="text-red-600">{saveError}</p>}<div className="flex justify-end gap-2"><button type="button" className={button} disabled={busy} onClick={()=>setRecord(null)}>Cancelar</button><button className={`${button} bg-primary text-white`} disabled={busy||invalid}>{busy?'Guardando…':'Confirmar pago'}</button></div>
    </form></WarehouseModal>}
    {reversing&&<WarehouseModal title="Confirmar reversión del pago" busy={busy} onClose={()=>{if(!busy)setReversing(null);}}><p className="font-bold mb-3">{reversing.reason} · {money(reversing.amount)}</p><p>El gasto volverá a Pendiente. Se corregirá su balance y caja de pago. El pago anterior se conservará en el historial como revertido.</p>{saveError&&<p role="alert" className="text-red-600 my-3">{saveError}</p>}<div className="flex justify-end gap-2 mt-4"><button className={button} disabled={busy} onClick={()=>setReversing(null)}>Cancelar</button><button className={button} disabled={busy} onClick={reversePayment}>{busy?'Guardando…':'Confirmar reversión'}</button></div></WarehouseModal>}
    {history&&<WarehouseModal title="Historial de pagos" onClose={()=>setHistory(null)}><h3 className="font-bold mb-3">{history.reason} · Original: {money(history.amount)}</h3><p className="text-sm mb-3">Abonado: {money(history.totalPaid)} · Pendiente: {money(history.balance)}</p><div className="space-y-3">{!history.payments.length&&<p>Este gasto todavía no recibió pagos.</p>}{history.payments.map(p=><article key={p.id} className="border border-foreground/15 rounded-xl p-3"><p className="font-bold">{money(p.amount)}{p.reversedAt&&' · Revertido'}</p><p className="text-sm">{date(p.paidAt)} · {p.method==='efectivo'?'Efectivo':'Transferencia'}{p.paymentRegisterId&&` · Caja #${p.paymentRegisterId}`}</p>{p.observation&&<p className="text-sm break-words">{p.observation}</p>}{p.reversedAt&&<p className="text-xs">Reversión: {date(p.reversedAt)}</p>}</article>)}</div></WarehouseModal>}
  </section>;
}
