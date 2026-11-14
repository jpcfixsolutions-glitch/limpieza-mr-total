import { useCallback, useEffect, useState } from 'react';
import { Package, Tags, Pencil, Trash2, RotateCcw } from 'lucide-react';
import api from '../../services/api.js';
import { WarehouseModal } from './WarehouseModal.jsx';
import { SettingsSectionCard, SettingsEmptyState } from './WarehouseSettingsCards.jsx';

const field = 'mt-2 w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-3 text-slate-900 shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-50';
const button = 'rounded-xl border border-foreground/20 px-4 py-2.5 text-sm font-bold disabled:opacity-50';
export function WarehouseStockSettings() {
  const [data,setData] = useState(null), [error,setError] = useState(''), [modal,setModal] = useState(null);
  const [name,setName] = useState(''), [busy,setBusy] = useState(false), [saveError,setSaveError] = useState('');
  const load = useCallback(async()=>{
    try { setData((await api.get('/warehouse/stock-options?includeInactive=true')).data); setError(''); }
    catch(e) { setError(e.response?.data?.message || 'No se pudieron cargar los catálogos de stock.'); }
  },[]);
  useEffect(()=>{load();},[load]);
  const open = (type,record=null,action='edit') => { setModal({type,record,action}); setName(record?.name || ''); setSaveError(''); };
  const save = async event => {
    event.preventDefault(); if(busy)return; setBusy(true); setSaveError('');
    try {
      const path = `/warehouse/settings/${modal.type}${modal.record?'/'+modal.record.id:''}`;
      const body = {name,expectedVersion:modal.record?.version,active:true};
      if(modal.action==='remove') await api.delete(path,{data:{expectedVersion:modal.record.version}});
      else if(modal.record) await api.put(path,body);
      else await api.post(path,body);
      setModal(null); await load();
    } catch(e) { setSaveError(e.response?.data?.message || 'No se pudo guardar la opción.'); }
    finally { setBusy(false); }
  };
  return <section className="space-y-4" aria-label="Configuración de stock del Galpón">
    <div><h2 className="text-xl font-black">Catálogos de stock</h2><p className="text-sm text-foreground/60 mt-1">Definí las opciones de los desplegables de productos y envases del Galpón.</p></div>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}<button type="button" className={`${button} ml-2`} onClick={load}>Reintentar</button></div>}
    {!data && !error && <p role="status">Cargando categorías y tipos de envase…</p>}
    {data && <div className="grid lg:grid-cols-2 gap-5">{[
      {type:'category',key:'categories',title:'Categorías de productos',singular:'categoría',icon:Tags},
      {type:'container-type',key:'containerTypes',title:'Tipos de envase',singular:'tipo de envase',icon:Package},
    ].map(({type,key,title,singular,icon:Icon})=><SettingsSectionCard key={type} id={`stock-${type}`} icon={Icon} title={title}
      description={type==='category'?'Clasificá los productos del inventario del Galpón.':'Tachos, tarros, bidones y otros recipientes.'}
      addLabel={`Agregar ${singular}`} onAdd={()=>open(type)}
      footer={<>Editar o eliminar una opción modifica el desplegable. Los productos ya registrados conservan sus datos hasta que los edites.{type==='container-type' && <p className="mt-2">Granel está siempre disponible como modalidad sin envase.</p>}</>}>
      {data[key].filter(r=>r.active).length===0 && <SettingsEmptyState icon={Icon} title={`Sin ${title.toLowerCase()}`} description={`Agregá una ${type==='category'?'categoría':'opción'} con el botón +.`}/>}
      {data[key].filter(r=>r.active).map(record=><article key={record.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#cbd8e8] bg-[#eaf0f8] p-4"><h3 className="font-bold break-words min-w-0">{record.name}</h3><div className="flex shrink-0 gap-2"><button type="button" className={`${button} bg-white`} aria-label={`Editar ${record.name}`} onClick={()=>open(type,record)}><Pencil size={17}/></button><button type="button" className={`${button} bg-white text-primary hover:bg-red-50`} aria-label={`Eliminar ${record.name}`} onClick={()=>open(type,record,'remove')}><Trash2 size={17}/></button></div></article>)}
      {data[key].some(r=>!r.active) && <details className="text-sm"><summary className="cursor-pointer font-bold text-foreground/60">Opciones eliminadas</summary><div className="mt-3 space-y-2">{data[key].filter(r=>!r.active).map(record=><div key={record.id} className="flex justify-between items-center gap-3 rounded-xl border border-foreground/10 p-3"><span>{record.name}</span><button type="button" className={button} aria-label={`Reactivar ${record.name}`} onClick={()=>open(type,record,'restore')}><RotateCcw size={16} className="inline mr-2"/>Reactivar</button></div>)}</div></details>}
    </SettingsSectionCard>)}</div>}
    {modal && <WarehouseModal title={`${modal.action==='remove'?'Eliminar':modal.action==='restore'?'Reactivar':modal.record?'Editar':'Agregar'} ${modal.type==='category'?'categoría':'tipo de envase'}`} busy={busy} onClose={()=>setModal(null)}>
      <form className="space-y-5" onSubmit={save}><fieldset disabled={busy}>
        {modal.action==='remove'?<p>Se quitará <strong>{modal.record.name}</strong> de los desplegables nuevos. Los productos, los envases y las cantidades existentes se conservan. Podés reactivarla desde Configuración.</p>:<label className="block text-sm font-bold">Nombre<input autoFocus required maxLength={100} className={field} value={name} onChange={e=>setName(e.target.value)}/></label>}
      </fieldset>{saveError && <p role="alert" className="text-red-700">{saveError}</p>}
      <div className="flex justify-end gap-2"><button type="button" disabled={busy} className={button} onClick={()=>setModal(null)}>Cancelar</button><button disabled={busy} className={`${button} bg-primary text-white`}>{busy?'Guardando…':modal.action==='remove'?'Eliminar opción':'Guardar'}</button></div></form>
    </WarehouseModal>}
  </section>;
}
