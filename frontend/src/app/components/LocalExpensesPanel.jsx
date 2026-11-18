import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import api from '../../services/api.js';
import { DailyExpenseModal } from './DailyExpenseModal.jsx';
import { WarehouseModal } from './WarehouseModal.jsx';

const button='rounded-xl border border-foreground/20 px-3 py-2 text-sm font-bold hover:bg-primary/10 disabled:opacity-50';
const input='w-full rounded-xl bg-background border border-foreground/20 p-3 mt-1';
const money=v=>Number(v||0).toLocaleString('es-AR',{style:'currency',currency:'ARS'});
const date=v=>v?`${v.slice(0,10).split('-').reverse().join('/')} ${v.slice(11,19)}`:'—';

export function LocalExpensesPanel({onChange}) {
  const [expenses,setExpenses]=useState([]),[filter,setFilter]=useState('all'),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [adding,setAdding]=useState(false),[record,setRecord]=useState(null),[paidAt,setPaidAt]=useState(''),[method,setMethod]=useState('efectivo'),[busy,setBusy]=useState(false),[saveError,setSaveError]=useState('');
  const changed=useRef(onChange);changed.current=onChange;
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
  const open=e=>{setRecord(e);setMethod(e.method);setPaidAt('');setSaveError('');};
  async function save(e) {
    e.preventDefault();if(busy)return;setBusy(true);setSaveError('');
    try {
      await api.patch(`/daily-expenses/${record.id}/status`,{status:record.status==='paid'?'pending':'paid',expectedVersion:record.version,method,paidAt});
      setRecord(null);toast.success('Estado del gasto actualizado.');window.dispatchEvent(new Event('local-expenses-changed'));
    } catch(e){setSaveError(e.response?.data?.message||'No se pudo guardar.');}
    finally{setBusy(false);}
  }
  const visible=expenses.filter(e=>filter==='all'||e.status===filter);
  return <section className="bg-surface border border-foreground/15 rounded-2xl p-4 sm:p-6 min-w-0">
    <div className="flex flex-wrap justify-between items-center gap-3"><div><h2 className="text-xl font-black text-primary">Gastos del Local</h2><p className="text-sm text-foreground/60 mt-1">Todos los períodos · Sólo los pagados se descuentan del balance.</p></div><button type="button" className={button} onClick={()=>setAdding(true)}>Agregar gasto variable</button></div>
    <p className="my-4 text-sm font-bold">Pendientes: {money(expenses.filter(e=>e.status==='pending').reduce((s,e)=>s+Number(e.amount),0))} · Pagados: {money(expenses.filter(e=>e.status==='paid').reduce((s,e)=>s+Number(e.amount),0))}</p>
    <label className="block text-sm font-bold mb-4">Estado del gasto<select className={input} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todos</option><option value="pending">Pendientes</option><option value="paid">Pagados</option></select></label>
    {loading&&<p role="status">Cargando gastos…</p>}{error&&<p role="alert" className="text-red-600">{error} <button className={button} onClick={load}>Reintentar</button></p>}
    {!loading&&!error&&!visible.length&&<p className="text-foreground/60">Sin gastos para este filtro.</p>}
    <div className="space-y-3 max-h-[32rem] overflow-y-auto">{visible.map(e=><article key={e.id} className="rounded-xl bg-background border border-foreground/10 p-3">
      <div className="flex flex-wrap justify-between gap-3 items-start"><div className="min-w-0"><p className="text-xs font-bold text-foreground/60">{e.fixedExpenseId?'Fijo':'Variable'}{e.period&&` · Período ${e.period.split('-').reverse().join('/')}`}</p><h3 className="font-bold break-words">{e.reason}</h3><p className="font-black">{money(e.amount)}</p></div>
        <button type="button" className={`rounded-full px-3 py-2 text-sm font-bold ${e.status==='paid'?'bg-green-600/15 text-green-700 dark:text-green-400':'bg-amber-500/15 text-amber-800 dark:text-amber-400'}`} aria-label={`${e.status==='paid'?'Revertir pago de':'Pagar'} ${e.reason}`} onClick={()=>open(e)}>{e.status==='paid'?'Pagado':'Pendiente'}</button></div>
      <p className="text-xs mt-2 text-foreground/65">Registro: {date(e.createdAt)}</p><p className="text-xs mt-1 text-foreground/65">Pago: {date(e.paidAt)}{e.status==='paid'&&` · ${e.method==='efectivo'?'Efectivo':'Transferencia'}${e.paymentRegisterId?` · Caja #${e.paymentRegisterId}`:''}`}</p><p className="text-xs mt-1 text-foreground/65">Último cambio: {date(e.statusChangedAt)}</p>
    </article>)}</div>
    {adding&&<DailyExpenseModal onClose={()=>setAdding(false)} onSubmit={async data=>{try{await api.post('/daily-expenses',data);setAdding(false);toast.success('Gasto registrado.');}catch(e){toast.error(e.response?.data?.message||'No se pudo guardar.');throw e;}}}/>}
    {record&&<WarehouseModal title={record.status==='paid'?'Confirmar reversión del pago':'Confirmar pago del gasto'} busy={busy} onClose={()=>{if(!busy)setRecord(null);}}><form onSubmit={save} className="space-y-4">
      <p className="font-bold">{record.reason} · {money(record.amount)}{record.period&&` · Período ${record.period}`}</p>
      <p>{record.status==='paid'?'El gasto volverá a Pendiente. Se corregirá su balance y caja de pago; el pago anterior queda registrado en auditoría.':'Confirmá la salida efectiva de dinero. Se descontará una sola vez, por su fecha real de pago.'}</p>
      {record.status!=='paid'&&<><label className="block text-sm font-bold">Fecha y hora efectiva de pago (Argentina)<input className={input} type="datetime-local" required value={paidAt} onChange={e=>setPaidAt(e.target.value)}/></label><label className="block text-sm font-bold">Método de pago<select className={input} value={method} onChange={e=>setMethod(e.target.value)}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option></select></label></>}
      {saveError&&<p role="alert" className="text-red-600">{saveError}</p>}<div className="flex justify-end gap-2"><button type="button" className={button} disabled={busy} onClick={()=>setRecord(null)}>Cancelar</button><button className={`${button} bg-primary text-white`} disabled={busy}>{busy?'Guardando…':'Confirmar'}</button></div>
    </form></WarehouseModal>}
  </section>;
}
