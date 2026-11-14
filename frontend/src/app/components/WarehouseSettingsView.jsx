import { WarehouseStockSettings } from './WarehouseStockSettings.jsx';
import { CreditCard, ReceiptText } from 'lucide-react';
import { SettingsSectionCard, SettingsItemCard, SettingsEmptyState } from './WarehouseSettingsCards.jsx';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../../services/api.js';
import { WarehouseModal } from './WarehouseModal.jsx';
import { warehouseMoney } from './WarehousePaymentEditor.jsx';
const button='rounded-xl border border-foreground/20 px-3 py-2 font-bold text-sm hover:bg-primary/10 disabled:opacity-50';
const input='w-full mt-1 rounded-xl border border-foreground/20 p-2.5 bg-background';
const card='bg-surface border border-foreground/10 rounded-2xl p-4 sm:p-6 min-w-0';
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Argentina/Buenos_Aires'}).format(new Date());
const expenseForm=e=>({name:e?.name||'',description:e?.description||'',amount:e?e.amount_cents/100:'',frequency:e?.frequency||'month',dueDay:e?.due_day||1,startDate:e?.start_date||today(),active:e?!!e.active:true,expectedVersion:e?.version});
const methodForm=m=>({name:m?.name||'',surcharge:m?m.surcharge_bps/100:0,kind:m?.kind||'other',active:m?!!m.active:true,expectedVersion:m?.version});
export function WarehouseSettingsView() {
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [modal,setModal]=useState(null),[form,setForm]=useState({}),[busy,setBusy]=useState(false),[saveError,setSaveError]=useState('');
  const load=useCallback(async()=>{setLoading(true);try{setData((await api.get('/warehouse/settings')).data);setError('');}catch(e){setError(e.response?.data?.message||'No se pudo cargar la configuración.');}finally{setLoading(false);}},[]);
  useEffect(()=>{load();},[load]);
  const open=(entity,record=null,toggle=false)=>{setForm(entity==='expense'?expenseForm(record):methodForm(record));setSaveError('');setModal({entity,record,toggle});};
  async function save(e){
    e.preventDefault();if(busy)return;setBusy(true);setSaveError('');
    try{
      const body=modal.toggle?{...form,active:!form.active}:form;
      if(modal.record) await api.put(`/warehouse/settings/${modal.entity}/${modal.record.id}`,body);
      else await api.post(`/warehouse/settings/${modal.entity}`,body);
      setModal(null);toast.success('Configuración guardada.');await load();
    }catch(e){setSaveError(e.response?.data?.message||'No se pudo guardar la configuración.');}finally{setBusy(false);}
  }
  const field=(name,label,props={})=><label className="block text-sm font-bold">{label}<input className={input} value={form[name]??''} onChange={e=>setForm({...form,[name]:e.target.value})} {...props}/></label>;
  return <main className="flex-1 min-w-0 p-4 sm:p-6 md:p-10 pb-24"><div className="max-w-7xl mx-auto space-y-6">
    <header><p className="text-primary text-xs font-black uppercase tracking-wider">Galpón mayorista</p><h1 className="text-3xl font-black">Configuración</h1><p className="mt-1 text-foreground/60">Stock, gastos recurrentes y medios de cobro exclusivos del Galpón.</p></header>
    {loading&&<p role="status">Cargando configuración…</p>}{error&&<div role="alert" className={card}>{error}<button className={`${button} ml-3`} onClick={load}>Reintentar</button></div>}
    {data&&<div className="grid grid-cols-1 lg:grid-cols-2 gap-5 xl:gap-7 items-stretch" aria-busy={loading}>
      <SettingsSectionCard id="warehouse-methods-title" icon={CreditCard} title="Métodos de Pago y Cargos"
        description="Administrá los medios de cobro y sus recargos."
        addLabel="Agregar método de pago" onAdd={()=>open('method')}
        footer="Los nuevos recargos se aplican a futuros cobros. Cada pago conserva los valores registrados.">
        {data.methods.length ? data.methods.map(m=><SettingsItemCard key={m.id} name={m.name}
          value={new Intl.NumberFormat('es-AR',{maximumFractionDigits:2}).format(m.surcharge_bps/100)+'%'} valueLabel="Recargo"
          active={!!m.active} onEdit={()=>open('method',m)} onToggle={()=>open('method',m,true)} />)
          : <SettingsEmptyState icon={CreditCard} title="Sin métodos de pago" description="Agregá el primer medio de cobro con el botón + de esta sección." />}
      </SettingsSectionCard>
      <SettingsSectionCard id="warehouse-expenses-title" icon={ReceiptText} title="Gastos Fijos"
        description="Organizá las obligaciones recurrentes del Galpón."
        addLabel="Agregar gasto fijo" onAdd={()=>open('expense')}
        footer={<><div className="flex flex-wrap justify-between items-center gap-2 rounded-xl bg-primary/5 px-4 py-3"><span className="text-sm font-bold text-foreground/70">Total mensual estimado</span><strong className="text-xl tabular-nums text-primary">{warehouseMoney(data.monthlyEstimateCents)}</strong></div><p className="mt-3">Activos · Semanales × 52 ÷ 12. La estimación no se descuenta del balance: registrá el pago de cada vencimiento en Estadísticas.</p><p className="mt-2">Los vencimientos del 29 al 31 se ajustan al último día disponible del mes.</p></>}>
        {data.expenses.length ? data.expenses.map(e=><SettingsItemCard key={e.id} name={e.name}
          value={warehouseMoney(e.amount_cents)} valueLabel={e.frequency==='week'?'Semanal':'Mensual'} active={!!e.active}
          description={e.description} metadata={e.active?'Próximo: '+e.next_due.split('-').reverse().join('/'):null}
          onEdit={()=>open('expense',e)} onToggle={()=>open('expense',e,true)} />)
          : <SettingsEmptyState icon={ReceiptText} title="Sin gastos fijos" description="Agregá alquiler, servicios u otras obligaciones con el botón + de esta sección." />}
      </SettingsSectionCard>
    </div>}
    <WarehouseStockSettings />
    {modal&&<WarehouseModal title={modal.toggle?`${form.active?'Desactivar':'Activar'} ${form.name}`:modal.entity==='expense'?(modal.record?'Editar gasto fijo':'Agregar gasto fijo'):(modal.record?'Editar método de pago':'Agregar método de pago')} busy={busy} onClose={()=>setModal(null)}><form className="space-y-4" onSubmit={save}>
      {modal.toggle?<p>{form.active?'Se impedirán nuevas operaciones con esta configuración.':'Se habilitarán nuevas operaciones con esta configuración.'} Los movimientos anteriores se conservan.</p>:<>
        {field('name',modal.entity==='expense'?'Concepto':'Nombre del método',{required:true,maxLength:200})}
        {modal.entity==='expense'?<>
          <label className="block text-sm font-bold">Descripción opcional<textarea className={input} value={form.description} maxLength={2000} onChange={e=>setForm({...form,description:e.target.value})}/></label>
          <div className="grid sm:grid-cols-2 gap-4">{field('amount','Importe ($)',{type:'number',min:'0.01',step:'0.01',required:true})}<label className="block text-sm font-bold">Frecuencia<select className={input} value={form.frequency} onChange={e=>setForm({...form,frequency:e.target.value,dueDay:1})}><option value="month">Mensual</option><option value="week">Semanal</option></select></label>
          {field('startDate','Fecha de inicio',{type:'date',min:'2000-01-01',required:true})}{form.frequency==='month'?field('dueDay','Día del mes',{type:'number',min:1,max:31,required:true}):<label className="block text-sm font-bold">Día de la semana<select className={input} value={form.dueDay} onChange={e=>setForm({...form,dueDay:e.target.value})}>{['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map((d,i)=><option key={d} value={i+1}>{d}</option>)}</select></label>}</div>
          {modal.record&&<p className="text-sm text-foreground/60">Los vencimientos ya generados conservan su importe original. Los cambios se aplican desde el próximo vencimiento.</p>}
        </>:<div className="grid sm:grid-cols-2 gap-4">{field('surcharge','Recargo (%)',{type:'number',min:0,max:100,step:'0.01',required:true})}<label className="block text-sm font-bold">Clasificación financiera<select className={input} value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})}><option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="other">Otros (tarjetas, etc.)</option></select></label></div>}
        <label className="flex items-center gap-2 font-bold text-sm"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/>Activo</label>
      </>}
      {saveError&&<p role="alert" className="text-red-600">{saveError}</p>}<div className="flex justify-end gap-2"><button type="button" className={button} disabled={busy} onClick={()=>setModal(null)}>Cancelar</button><button className={`${button} bg-primary text-white`} disabled={busy}>{busy?'Guardando…':modal.toggle?'Confirmar':'Guardar'}</button></div>
    </form></WarehouseModal>}
  </div></main>;
}
