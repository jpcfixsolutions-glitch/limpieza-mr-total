import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import api from "../../services/api.js";
import { searchProducts } from "../../utils/productSearch.js";
import { useWarehouseOperations } from "../hooks/useWarehouseOperations.js";
import { WarehouseModal } from "./WarehouseModal.jsx";

export function WarehouseEmployeeStockView() {
  const { data, loading, error, refresh } = useWarehouseOperations();
  const [search, setSearch] = useState("");
  const [filter,setFilter]=useState('all');
  const [operation,setOperation]=useState('total');
  const [editing, setEditing] = useState(null);
  const [quantity, setQuantity] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const lock = useRef(false);
  const key = useRef("");
  const startEdit = (product) => { key.current = crypto.randomUUID(); setOperation('total');setEditing(product); setQuantity(String(product.stock)); setSaveError(""); };
  const save = async (event) => {
    event.preventDefault();
    if (lock.current) return;
    const amount = Number(quantity);
    const stock=operation==='total'?amount:editing.stock+(operation==='in'?amount:-amount);
    if (!quantity.trim() || !Number.isSafeInteger(amount) || amount<(operation==='total'?0:1) || !Number.isSafeInteger(stock) || stock<0) { setSaveError("Ingresá una cantidad entera válida. El stock resultante no puede ser negativo."); return; }
    lock.current = true; setSaving(true); setSaveError("");
    try {
      await api.patch(`/warehouse/stock/${editing.id}`, { stock, expectedStock: editing.stock, idempotencyKey: key.current });
      toast.success("Stock actualizado. Los faltantes se recalcularon."); setEditing(null); await refresh();
    } catch (err) { setSaveError(err.response?.data?.message || "No se pudo actualizar el stock. Conservamos la cantidad ingresada."); await refresh(); }
    finally { lock.current = false; setSaving(false); }
  };
  const products = searchProducts((data?.products || []).filter((product) => Number.isSafeInteger(product.id)), search).filter(p=>filter==='all'||(filter==='with-stock'?p.stock>0:filter==='without-stock'?p.stock===0:filter==='active'?p.isAvailable:!p.isAvailable));
  return <main className="flex-1 min-w-0 p-5 md:p-10 pb-24"><div className="max-w-7xl mx-auto">
    <div className="flex flex-wrap justify-between items-end gap-3 mb-6"><div><p className="text-xs font-black text-primary uppercase tracking-wider">Galpón · Equipo operativo</p><h1 className="text-3xl font-black">Stock</h1><p className="text-sm text-foreground/60 mt-1">Consultá existencias y actualizá las cantidades.</p></div><button type="button" disabled={loading} onClick={refresh} className="rounded-xl border border-foreground/15 bg-surface px-4 py-2 font-bold flex items-center gap-2 disabled:opacity-50"><RefreshCw size={16} />Actualizar</button></div>
    {error && <p role="alert" className="mb-4 text-sm text-primary">{error}</p>}
    <section className="bg-surface border border-foreground/10 rounded-2xl p-5 shadow-sm">
      <label className="block text-sm font-bold">Buscar producto<input type="search" className="mt-2 w-full min-w-0 rounded-xl border border-foreground/15 bg-background px-3 py-2" placeholder="Nombre o código" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label className="block text-sm font-bold mt-3">Filtrar stock<select className="mt-2 w-full rounded-xl border border-foreground/15 bg-background px-3 py-2" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todos</option><option value="with-stock">Con stock</option><option value="without-stock">Sin stock</option><option value="active">Disponibles para pedidos</option><option value="inactive">No disponibles para pedidos</option></select></label>
      {!data && loading ? <p role="status" className="py-6 text-foreground/60">Cargando stock…</p> : !products.length ? <p className="py-6 text-foreground/60">{error ? "No se pudo cargar el stock." : "No hay productos que coincidan con la búsqueda."}</p> : <div className="divide-y divide-foreground/10 mt-4">{products.map((product) => <article key={product.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="min-w-0"><h2 className="font-bold break-words">{product.name}</h2>{product.codbarra && <p className="text-xs text-foreground/60">Código {product.codbarra}</p>}{product.packTypeName&&<p className="text-xs text-foreground/60">Presentación: {product.packTypeName}{product.unitsPerPack>1?` · ${product.unitsPerPack} unidades por bulto`:''}</p>}<p className="text-sm mt-1">Cantidad disponible: <strong className="tabular-nums">{Number(product.stock).toLocaleString("es-AR")}</strong></p></div>
        <button type="button" disabled={Boolean(error) || saving} onClick={() => startEdit(product)} className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-bold disabled:opacity-50">Actualizar stock</button>
      </article>)}</div>}
    </section>
    {editing && <WarehouseModal title={`Actualizar stock · ${editing.name}`} onClose={() => setEditing(null)} busy={saving}>
      <form onSubmit={save} className="space-y-4"><p className="text-sm text-foreground/60">Cantidad actual: {editing.stock}{editing.packTypeName&&` · Presentación: ${editing.packTypeName}`}. Se mantiene la unidad y presentación del producto.</p>
        <label className="block text-sm font-bold">Operación<select disabled={saving} value={operation} onChange={e=>{setOperation(e.target.value);setQuantity(e.target.value==='total'?String(editing.stock):'');setSaveError('');}} className="block w-full rounded-xl border border-foreground/15 bg-background px-3 py-2 mt-2"><option value="total">Establecer cantidad total</option><option value="in">Registrar ingreso</option><option value="out">Registrar salida</option></select></label>
        <label className="block text-sm font-bold">{operation==='total'?'Nueva cantidad total':operation==='in'?'Cantidad a ingresar':'Cantidad a retirar'}<input type="number" min={operation==='total'?0:1} step="1" required value={quantity} disabled={saving} onChange={(event) => setQuantity(event.target.value)} className="block w-full rounded-xl border border-foreground/15 bg-background px-3 py-2 mt-2" /></label>
        {saveError && <p role="alert" className="text-primary text-sm">{saveError}</p>}
        <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={saving} onClick={() => setEditing(null)} className="rounded-xl border border-foreground/15 px-4 py-2 font-bold">Volver</button><button type="submit" disabled={saving} className="rounded-xl bg-primary text-white px-4 py-2 font-bold disabled:opacity-50">{saving ? "Guardando…" : "Guardar cantidad"}</button></div>
      </form>
    </WarehouseModal>}
  </div></main>;
}
