import { useEffect, useState } from 'react';
import api from '../../services/api.js';
import { WarehouseModal } from './WarehouseModal.jsx';

export const warehouseMoney = cents => (Number(cents||0)/100).toLocaleString('es-AR',{style:'currency',currency:'ARS'});
const input = 'w-full bg-background border border-foreground/20 rounded-xl p-2.5 mt-1';
const button = 'rounded-xl border border-foreground/20 px-3 py-2 font-bold text-sm disabled:opacity-50';
export function WarehousePaymentEditor({ payments, onChange, onReady }) {
  const [methods,setMethods] = useState(null), [error,setError] = useState('');
  useEffect(()=>{
    const controller = new AbortController();
    onReady?.(false);
    api.get('/warehouse/settings',{signal:controller.signal}).then(r=>{
      const active = r.data.methods.filter(m=>m.active); setMethods(active); onReady?.(active.length>0);
    }).catch(e=>{if(!controller.signal.aborted) setError(e.response?.data?.message||'No se pudieron cargar los métodos. Cerrá y volvé a abrir el formulario.');});
    return ()=>controller.abort();
  },[]);
  const selected = payments.map(p=>({...p, method:methods?.find(m=>m.id===Number(p.paymentMethodId))}));
  const totals = selected.reduce((t,p)=>{
    const base = Math.round(Number(p.amount||0)*100);
    const fee = Math.floor((base*(p.method?.surcharge_bps||0)+5000)/10000);
    return {base:t.base+base,fee:t.fee+fee};
  },{base:0,fee:0});
  const update = (index,patch)=>onChange(payments.map((p,i)=>i===index?{...p,...patch}:p));
  if(error) return <p role="alert" className="text-red-600">{error}</p>;
  if(!methods) return <p role="status">Cargando métodos de pago…</p>;
  return <div className="space-y-3">
    <p className="text-sm text-foreground/60">Ingresá el capital que cancela cada medio. El recargo se cobra aparte y se confirma en el servidor.</p>
    {!methods.length && <p role="alert">Activá un método en Configuración para registrar cobros.</p>}
    {selected.map((p,index)=><div key={index} className="border border-foreground/15 rounded-xl p-3 grid sm:grid-cols-2 gap-3">
      <label className="text-sm font-bold">Método<select required className={input} value={p.paymentMethodId||''} onChange={e=>{const m=methods.find(m=>m.id===Number(e.target.value));update(index,{paymentMethodId:m?.id||'',expectedSurchargeBps:m?.surcharge_bps});}}><option value="">Seleccionar método</option>{methods.map(m=><option key={m.id} value={m.id}>{m.name} · {m.surcharge_bps/100}%</option>)}</select></label>
      <label className="text-sm font-bold">Capital ($)<input required className={input} type="number" min="0.01" step="0.01" value={p.amount} onChange={e=>update(index,{amount:e.target.value})}/></label>
      {payments.length>1 && <button type="button" className={button} onClick={()=>onChange(payments.filter((_,i)=>i!==index))}>Quitar medio</button>}
    </div>)}
    <button type="button" className={button} disabled={!methods.length||payments.length>=20} onClick={()=>onChange([...payments,{paymentMethodId:'',amount:''}])}>Agregar otro medio</button>
    <dl className="bg-primary/5 rounded-xl p-4 space-y-2">{[['Subtotal',totals.base],['Recargo',totals.fee],['Total a cobrar',totals.base+totals.fee]].map(([label,value])=><div className="flex justify-between gap-3 font-bold" key={label}><dt>{label}</dt><dd>{warehouseMoney(value)}</dd></div>)}</dl>
  </div>;
}
export function WarehouseAccountPaymentModal({ customer, onClose, onSaved }) {
  const [payments,setPayments]=useState([{paymentMethodId:'',amount:String(customer.debt)}]);
  const [ready,setReady]=useState(false), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const [key]=useState(()=>crypto.randomUUID());
  async function submit(e) {
    e.preventDefault(); if(busy||!ready) return; setBusy(true);setError('');
    try {await api.post(`/customers/${customer.id}/payments`,{payments,idempotencyKey:key,description:'Cobro Galpón'});onSaved();}
    catch(e){setError(e.response?.data?.message||'No se pudo registrar el cobro.');}
    finally{setBusy(false);}
  }
  return <WarehouseModal title={`Cobro de ${customer.name}`} busy={busy} onClose={onClose}><form onSubmit={submit} className="space-y-4"><p>Deuda: {warehouseMoney(Math.round(customer.debt*100))}</p><WarehousePaymentEditor payments={payments} onChange={setPayments} onReady={setReady}/>{error&&<p role="alert" className="text-red-600">{error}</p>}<div className="flex justify-end gap-2"><button type="button" className={button} disabled={busy} onClick={onClose}>Cancelar</button><button className={`${button} bg-primary text-white`} disabled={busy||!ready}>{busy?'Guardando…':'Confirmar cobro'}</button></div></form></WarehouseModal>;
}
