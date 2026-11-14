import { calculateProfitabilityPercent } from '../../utils/price.js';
import { canRemoveContainer, removeDraftContainer, newDraftContainer, splitDraftContainer } from '../../utils/warehouseStockDraft.js';
import { useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, History, RefreshCw } from 'lucide-react';
import api from '../../services/api.js';
import { WarehouseModal } from './WarehouseModal.jsx';

const input = 'w-full min-w-0 rounded-xl border-2 border-slate-300 bg-white p-2.5 text-slate-900 shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:bg-slate-100 disabled:text-slate-500';
const button = 'rounded-xl bg-primary text-white px-4 py-2 font-bold disabled:opacity-50';
const secondary = 'rounded-xl border border-foreground/15 px-3 py-2 text-sm font-bold disabled:opacity-50';
const liters = n => `${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 3 })} L`;
const money = n => Number(n || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

function DistributionEditor({ product, employee, onClose, onSaved }) {
  const [form, setForm] = useState(product || { name: '', barcode: '', category: '', cost: 0, price: 0, minStock: 5, containers: [] });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [movement, setMovement] = useState(null);
  const [options,setOptions] = useState({categories:[],containerTypes:[]});
  const [optionsLoading,setOptionsLoading] = useState(true), [optionsError,setOptionsError] = useState('');
  const [notice,setNotice] = useState('');
  const loadOptions = async () => {
    setOptionsLoading(true); setOptionsError('');
    try { setOptions((await api.get('/warehouse/stock-options')).data); }
    catch {setOptionsError('No se pudieron cargar las categorías y los tipos de envase.');}
    finally {setOptionsLoading(false);}
  };
  useEffect(()=>{loadOptions();},[]);
  const lock = useRef(false), key = useRef(crypto.randomUUID());
  const change = patch => { setForm(f => ({ ...f, ...patch })); key.current = crypto.randomUUID(); setError(''); };
  const rowChange = (i, patch) => {
    if (patch.location && patch.location !== form.containers[i].location) {
      setMovement(null);
      setNotice('Envase movido a '+(patch.location==='LOCAL'?'En Local':'Galpón')+'. Revisá los subtotales y guardá para confirmar el traslado.');
    }
    change({ containers: form.containers.map((c, j) => i === j ? { ...c, ...patch } : c) });
  };
  const total = location => form.containers.filter(c => !location || c.location === location).reduce((s, c) => s + Number(c.content || 0), 0);
  const applyMovement = () => {
    const ml = Math.round(Number(movement.liters) * 1000), source = form.containers[movement.index];
    if (!Number.isFinite(ml) || ml <= 0) { setError('Indicá litros mayores a cero.'); return; }
    const current = Math.round(Number(source.content) * 1000), capacity = Math.round(Number(source.capacity) * 1000);
    const remaining = current + (movement.type === 'IN' ? ml : -ml);
    if (remaining < 0 || (source.kind !== 'Granel' && remaining > capacity * Number(source.count))) { setError('El movimiento supera el contenido o la capacidad disponible.'); return; }
    const replacement = [];
    if (Number(source.count) > 1 && remaining > 0) {
      const full = Math.floor(remaining / capacity), partial = remaining % capacity, empty = Number(source.count) - full - (partial ? 1 : 0);
      if (full) replacement.push({...source,count:full,content:full*capacity/1000});
      if (partial) replacement.push({...source,...(replacement.length?{id:undefined,draft:true,persistedOrigin:!!source.id || !!source.persistedOrigin}:{}),count:1,content:partial/1000});
      if (empty) replacement.push({...source,...(replacement.length?{id:undefined,draft:true,persistedOrigin:!!source.id || !!source.persistedOrigin}:{}),count:empty,content:0});
    } else replacement.push({...source,content:remaining/1000});
    const rows = form.containers.flatMap((c,i)=>i===movement.index?replacement:[c]);
    if (movement.type === 'TRANSFER') rows.push({kind:'Granel',capacity:0,count:1,content:ml/1000,location:source.location==='LOCAL'?'WAREHOUSE':'LOCAL',draft:true,persistedOrigin:!!source.id || !!source.persistedOrigin});
    change({containers:rows,notes:`${movement.type==='IN'?'Ingreso':movement.type==='OUT'?'Salida':'Traslado físico'} de ${liters(ml/1000)} · ${source.kind} · ${source.location==='LOCAL'?'En Local':'Galpón'}`});
    setNotice(movement.type==='TRANSFER'?'Traslado aplicado al borrador. El total general se conserva. Guardá para confirmarlo.':'Movimiento aplicado al borrador. Guardá para confirmarlo.');
    setMovement(null);
  };
  const save = async event => {
    event.preventDefault(); if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const payload = { ...(employee ? {} : { name: form.name, barcode: form.barcode, category: form.category, cost: form.cost, price: form.price, minStock: form.minStock }),
      containers: form.containers, expectedVersion: product?.version, notes: form.notes || 'Distribución del stock', idempotencyKey: key.current };
    try {
      if (product) await api.put(`/warehouse/liquids/${product.liquidProductId}`, payload);
      else await api.post('/warehouse/liquids', payload);
      onSaved();
    } catch (e) { setError(e.response?.data?.message || 'No se pudo guardar. Conservamos los datos para reintentar.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <WarehouseModal title={product ? `Editar · ${product.name}` : 'Nuevo producto del Galpón'} onClose={onClose} busy={busy}>
    <form onSubmit={save} className="space-y-5">
      {optionsError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">{optionsError}<button type="button" className={secondary} onClick={loadOptions}>Reintentar</button></div>}
      {optionsLoading && <p role="status">Cargando opciones de stock…</p>}
      <fieldset disabled={busy || optionsLoading || !!optionsError} className="space-y-5">
      {!employee && <div className="grid sm:grid-cols-2 gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">{[['name','Producto','text'],['barcode','Código de barras (opcional)','text'],['cost','Costo por litro','number'],['price','Precio por litro','number'],['minStock','Stock mínimo (L)','number']].map(([field,label,type]) => <label key={field} className="text-sm font-bold">{label}<input className={`${input} mt-1`} required={field === 'name'} type={type} min={type === 'number' ? 0 : undefined} step="0.001" value={form[field] ?? ''} onChange={e => change({ [field]: e.target.value })} /></label>)}
        <label className="text-sm font-bold">Categoría<select className={`${input} mt-1`} value={form.category || ''} onChange={e=>change({category:e.target.value})}><option value="">Sin categoría</option>{form.category && !options.categories.some(c=>c.name===form.category) && <option value={form.category}>{form.category} (actual)</option>}{options.categories.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}</select><span className="mt-1 block text-xs font-normal text-foreground/60">Se administra en Configuración → Categorías.</span></label>
      </div>}
      <section className="space-y-3"><div className="flex justify-between gap-3 items-center"><h3 className="font-black text-lg">Distribución del stock</h3><button type="button" className={secondary} onClick={() => change({ containers: [...form.containers, newDraftContainer(options.containerTypes[0]?.name || 'Granel')] })}>+ Agregar envase</button></div>
        <p className="text-sm text-foreground/60">El contenido es el total real de litros de cada fila. Agrupá envases llenos o vacíos; separá los parcialmente utilizados. Para granel, usá cantidad 1 y capacidad 0.</p>
        {notice && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">{notice}</p>}
        {['WAREHOUSE','LOCAL'].map(location => <section key={location} className={`overflow-hidden rounded-2xl border-2 ${location==='WAREHOUSE'?'border-emerald-200 bg-emerald-50/60':'border-sky-200 bg-sky-50/60'}`}>
          <header className={`flex flex-wrap justify-between items-center gap-3 border-b px-4 py-3 ${location==='WAREHOUSE'?'border-emerald-200 bg-emerald-100/80 text-emerald-950':'border-sky-200 bg-sky-100/80 text-sky-950'}`}><div><h4 className="flex items-center gap-2 text-base font-black"><span aria-hidden="true" className={`size-3 rounded-full ${location==='WAREHOUSE'?'bg-emerald-600':'bg-sky-600'}`}/>{location==='WAREHOUSE'?'En Galpón':'En Local'}</h4><p className="mt-1 text-xs opacity-80">{location==='WAREHOUSE'?'Disponible físicamente para preparar pedidos':'Almacenado en Local · pertenece al inventario del Galpón'}</p></div><span className="rounded-xl bg-white/80 px-3 py-2 text-lg font-black tabular-nums">{liters(total(location))}</span></header>
          <div className="p-3 sm:p-4 space-y-3">
          {!form.containers.some(c=>c.location===location) && <p className="py-3 text-center text-sm text-slate-500">Sin envases en esta ubicación</p>}
          {form.containers.map((c,i) => c.location !== location ? null : <div key={i} className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-2"><p className="text-sm font-bold text-slate-700">Envase {i+1}<span className="ml-2 text-xs font-normal text-slate-500">{c.persistedOrigin?'De un envase registrado':!c.id?'Sin guardar':'Registrado'}</span></p><button type="button" className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40" disabled={!canRemoveContainer(c)} title={canRemoveContainer(c)?'Quitar esta fila del borrador':'Registrá una salida de litros antes de retirar un envase guardado con contenido'} onClick={()=>{change({containers:removeDraftContainer(form.containers,i)});setMovement(null);}}><Trash2 size={15}/>{!c.id && !c.persistedOrigin?'Eliminar envase':'Retirar vacío'}</button></div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <label className="text-xs font-semibold text-slate-600">Tipo de envase<select className={`${input} mt-1`} value={c.kind} required onChange={e=>rowChange(i,{kind:e.target.value,...(e.target.value==='Granel'?{capacity:0,count:1}:c.kind==='Granel'?{capacity:5}:{})})}>{c.kind && c.kind!=='Granel' && !options.containerTypes.some(t=>t.name===c.kind) && <option value={c.kind}>{c.kind} (actual)</option>}{options.containerTypes.map(t=><option key={t.id} value={t.name}>{t.name}</option>)}<option value="Granel">A granel / sin envase</option></select></label>
              <label className="text-xs font-semibold text-slate-600">Capacidad nominal (L)<input list="liquid-capacities" className={`${input} mt-1`} type="number" step="0.001" min="0" required disabled={c.kind==='Granel'} value={c.capacity} onChange={e => rowChange(i,{capacity:e.target.value})} /></label>
              <label className="text-xs font-semibold text-slate-600">Cantidad de envases<input className={`${input} mt-1`} type="number" step="1" min="1" required disabled={c.kind==='Granel'} value={c.count} onChange={e => rowChange(i,{count:e.target.value})} /></label>
              <label className="text-xs font-semibold text-slate-600">Contenido real total (L)<input className={`${input} mt-1`} type="number" step="0.001" min="0" required value={c.content} onChange={e => rowChange(i,{content:e.target.value})} /></label>
              <label className="text-xs font-semibold text-slate-600">Ubicación física<select className={`${input} mt-1 font-bold ${c.location==='WAREHOUSE'?'!border-emerald-400 !bg-emerald-50 !text-emerald-950':'!border-sky-400 !bg-sky-50 !text-sky-950'}`} value={c.location} onChange={e => rowChange(i,{location:e.target.value})}><option value="WAREHOUSE">Galpón</option><option value="LOCAL">En Local</option></select></label>
            </div>
            <div className="flex flex-wrap gap-2">
              {[['IN','Ingreso de litros'],['OUT','Salida de litros'],['TRANSFER','Trasladar litros']].map(([type,label])=><button key={type} type="button" className={secondary} onClick={()=>setMovement({index:i,type,liters:''})}>{label}</button>)}
              {Number(c.count)>1 && <button type="button" className={secondary} onClick={()=>{change({containers:splitDraftContainer(form.containers,i)});setMovement(null);}}>Separar un envase</button>}
            </div>
            {movement?.index===i && <div className="flex flex-wrap items-end gap-2 border-t border-foreground/10 pt-3"><label className="text-xs">{movement.type==='IN'?'Ingresar':movement.type==='OUT'?'Descontar':'Trasladar a '+(c.location==='WAREHOUSE'?'En Local':'Galpón') + ' a granel'} (L)<input autoFocus className={input} type="number" min="0.001" step="0.001" value={movement.liters} onChange={e=>setMovement({...movement,liters:e.target.value})}/></label><button type="button" className={secondary} onClick={applyMovement}>Aplicar al borrador</button><button type="button" className={secondary} onClick={()=>setMovement(null)}>Cancelar</button></div>}
          </div>)}
          </div>
        </section>)}
        <datalist id="liquid-capacities">{[1,2,5,10,20].map(x => <option key={x} value={x} />)}</datalist>
        <div className="flex justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-100 p-4 text-slate-900"><span className="font-bold">Total general del Galpón</span><strong className="text-xl tabular-nums">{liters(total())}</strong></div>
      </section>
      <label className="block text-sm font-bold">Motivo del movimiento o ajuste<textarea className={`${input} mt-1`} required value={form.notes || ''} onChange={e => change({notes:e.target.value})} placeholder="Ingreso, consumo, traslado físico…" /></label>
    </fieldset>{error && <p role="alert" className="text-red-600">{error}</p>}
    <div className="flex justify-end gap-2"><button type="button" className={secondary} disabled={busy} onClick={onClose}>Cerrar</button><button className={button} disabled={busy || optionsLoading || !!optionsError}>{busy ? 'Guardando…' : 'Guardar distribución'}</button></div>
    </form>
  </WarehouseModal>;
}

function MovementDistribution({value}) {
  const data = JSON.parse(value), rows = Array.isArray(data) ? data : data.containers || [];
  return <div className="text-sm space-y-1">{rows.length ? rows.map((c,i)=><p key={i}>{c.count} × {c.kind} · {liters(c.contentMl/1000)} reales · {c.location==='LOCAL'?'En Local':'Galpón'}</p>) : <p>Sin existencias registradas.</p>}</div>;
}
const operationLabels = {CREATE:'Alta de producto',UPDATE:'Actualización de stock o producto',ARCHIVE:'Producto archivado',ORDER_DISPATCH:'Salida por pedido',ORDER_RETURN:'Devolución de pedido a granel'};
export function WarehouseLiquidStockView({ employee = false }) {
  const [legacy,setLegacy] = useState([]);
  const [products,setProducts] = useState([]), [loading,setLoading] = useState(true), [error,setError] = useState('');
  const [edit,setEdit] = useState(null), [search,setSearch] = useState(''), [filter,setFilter] = useState(''), [selected,setSelected] = useState([]);
  const [history,setHistory] = useState(null), [remove,setRemove] = useState(null), [busy,setBusy] = useState(false);
  const refresh = async () => { setLoading(true); setError(''); try { const {data}=await api.get('/warehouse/liquids'); setProducts(data); } catch(e) { setError(e.response?.data?.message || 'No se pudo cargar el stock.'); } finally { setLoading(false); } };
  useEffect(() => { refresh(); },[]);
  useEffect(() => { api.get('/warehouse/legacy-stock').then(({data})=>setLegacy(data)).catch(()=>setError('No se pudo consultar el inventario anterior del Galpón.')); },[]);
  const rows = products.filter(p => `${p.name} ${p.category} ${p.codbarra || ''}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')) && (!filter || (filter === 'En local' ? p.inLocal > 0 : p.status === filter)));
  const showHistory = async p => { try { const {data}=await api.get(`/warehouse/liquids/${p.liquidProductId}/history`); setHistory({product:p,rows:data}); } catch { setError('No se pudo cargar el historial.'); } };
  return <main className="flex-1 min-w-0 p-4 md:p-8 pb-24"><div className="max-w-[1600px] mx-auto space-y-5">
    <header className="flex flex-wrap justify-between gap-3"><div><p className="text-primary text-xs uppercase font-black">Inventario exclusivo del Galpón</p><h1 className="text-3xl font-black">Stock de líquidos</h1><p className="text-foreground/60 mt-1">Litros reales, envases y ubicación física. En Local sigue perteneciendo al Galpón.</p></div><div className="flex gap-2 items-center"><button className={secondary} disabled={loading} onClick={refresh} aria-label="Actualizar stock"><RefreshCw size={18}/></button>{!employee && <button className={button} onClick={()=>setEdit({isNew:true})}><Plus size={17} className="inline mr-1"/>Nuevo producto</button>}</div></header>
    <div className="grid sm:grid-cols-3 gap-3">{[['En Galpón',products.reduce((n,p)=>n+p.stock,0)],['En Local',products.reduce((n,p)=>n+p.inLocal,0)],['Total general',products.reduce((n,p)=>n+p.total,0)]].map(([label,value])=><div key={label} className="bg-surface rounded-2xl border border-foreground/10 p-4"><p className="text-sm text-foreground/60">{label}</p><p className="text-2xl font-black">{liters(value)}</p></div>)}</div>
    <div className="flex flex-wrap gap-3"><input type="search" aria-label="Buscar producto" placeholder="Buscar por producto, código o categoría" className={`${input} sm:max-w-md`} value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Filtrar estado" className={`${input} sm:max-w-48`} value={filter} onChange={e=>setFilter(e.target.value)}><option value="">Todos los estados</option>{['Disponible','Bajo stock','Sin stock','En local'].map(x=><option key={x}>{x}</option>)}</select>{selected.length>0 && <span className="text-sm self-center">{selected.length} seleccionados · {liters(products.filter(p=>selected.includes(p.id)).reduce((n,p)=>n+p.total,0))}</span>}</div>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    <div className="overflow-x-auto rounded-2xl border border-foreground/10 bg-surface"><table className="w-full text-sm whitespace-nowrap"><thead className="bg-background text-left"><tr><th className="p-3"><input type="checkbox" aria-label="Seleccionar todos" checked={rows.length>0 && rows.every(p=>selected.includes(p.id))} onChange={e=>setSelected(e.target.checked?rows.map(p=>p.id):[])}/></th>{['Producto','Acciones','Código','Categoría',...(!employee?['Costo / L','Precio / L','Rentabilidad']:[]),'Stock Galpón','En Local','Envases','Mínimo','Estado'].map(x=><th key={x} className="p-3">{x}</th>)}</tr></thead><tbody className="divide-y divide-foreground/10">{rows.map(p=><tr key={p.id} className="hover:bg-background/50"><td className="p-3"><input type="checkbox" aria-label={`Seleccionar ${p.name}`} checked={selected.includes(p.id)} onChange={e=>setSelected(e.target.checked?[...selected,p.id]:selected.filter(id=>id!==p.id))}/></td><td className="p-3 font-bold">{p.name}<span className="block text-xs font-normal text-foreground/60">Total: {liters(p.total)}</span></td><td className="p-3"><div className="flex gap-2"><button title="Editar distribución" aria-label={`Editar ${p.name}`} onClick={()=>setEdit(p)}><Pencil size={17}/></button>{!employee && <><button title="Historial" aria-label={`Historial de ${p.name}`} onClick={()=>showHistory(p)}><History size={17}/></button><button title="Archivar producto vacío" aria-label={`Eliminar ${p.name}`} onClick={()=>setRemove(p)}><Trash2 size={17}/></button></>}</div></td><td className="p-3">{p.codbarra || '—'}</td><td className="p-3">{p.category || 'Sin categoría'}</td>{!employee && <><td className="p-3">{money(p.cost)}</td><td className="p-3">{money(p.price)}</td><td className="p-3">{p.cost>0?`${calculateProfitabilityPercent(p.cost,p.price).toFixed(1)} %`:'—'}</td></>}<td className="p-3 font-black">{liters(p.stock)}</td><td className="p-3">{liters(p.inLocal)}{p.inLocal>0 && <span className="block text-xs text-sky-700">En local</span>}</td><td className="p-3"><details><summary className="cursor-pointer">{p.containers.reduce((n,c)=>n+c.count,0)} recipientes / grupos</summary><div className="space-y-1 mt-2">{p.containers.map(c=><p key={c.id}>{c.count} × {c.kind} {c.kind==='Granel'?'':liters(c.capacity)} · {liters(c.content)} reales · {c.location==='LOCAL'?'En Local':'Galpón'}</p>)}</div></details></td><td className="p-3">{liters(p.minStock)}</td><td className="p-3"><span className={`rounded-lg px-2 py-1 text-xs font-bold ${p.stock===0?'bg-red-100 text-red-800':p.stock<=p.minStock?'bg-amber-100 text-amber-900':'bg-emerald-100 text-emerald-800'}`}>{p.status}</span></td></tr>)}</tbody></table>{loading?<p className="p-6">Cargando stock…</p>:rows.length===0 && <p className="p-6 text-foreground/60">No hay productos que mostrar. El inventario comienza vacío y se carga exclusivamente desde Galpón.</p>}</div>
    {legacy.length>0 && <details className="rounded-2xl border border-foreground/10 bg-surface p-4"><summary className="font-bold cursor-pointer">Inventario anterior del Galpón · {legacy.length} productos en unidades</summary><p className="text-sm text-foreground/60 my-3">Registros existentes, conservados sin convertir a litros ni copiar al catálogo nuevo. Sólo aparecen productos con una relación explícita con Galpón.</p><ul className="space-y-2">{legacy.map(p=><li key={p.id} className="flex justify-between gap-3"><span>{p.name}</span><strong>{Number(p.stock).toLocaleString('es-AR')} u.</strong></li>)}</ul></details>}
    {edit && <DistributionEditor product={edit.isNew?null:edit} employee={employee} onClose={()=>setEdit(null)} onSaved={()=>{setEdit(null);refresh();}}/>}
    {remove && <WarehouseModal title="Archivar producto" busy={busy} onClose={()=>setRemove(null)}><p>Se conservará el historial de {remove.name}. Sólo se permite archivar si no contiene litros.</p><div className="flex justify-end mt-4 gap-2"><button className={secondary} disabled={busy} onClick={()=>setRemove(null)}>Volver</button><button className={button} disabled={busy} onClick={async()=>{setBusy(true);try{await api.delete(`/warehouse/liquids/${remove.liquidProductId}`,{data:{expectedVersion:remove.version}});setRemove(null);refresh();}catch(e){setError(e.response?.data?.message || 'No se pudo archivar.');setRemove(null);}finally{setBusy(false);}}}>Archivar</button></div></WarehouseModal>}
    {history && <WarehouseModal title={`Movimientos · ${history.product.name}`} onClose={()=>setHistory(null)}><div className="space-y-3">{[...history.rows].reverse().map(row=><details key={row.id} className="border border-foreground/10 rounded-xl p-3"><summary className="cursor-pointer">{row.createdAt} UTC · {row.userName || ('Usuario #'+row.userId)} · {operationLabels[row.operation] || row.operation}</summary><p className="mt-2">{row.notes}</p><div className="grid sm:grid-cols-2 gap-3 mt-3"><div><h4 className="font-bold mb-2">Antes</h4><MovementDistribution value={row.beforeJson}/></div><div><h4 className="font-bold mb-2">Después</h4><MovementDistribution value={row.afterJson}/></div></div></details>)}</div></WarehouseModal>}
  </div></main>;
}
