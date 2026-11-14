import { useState } from "react";
import { Factory } from "lucide-react";
import { WarehouseModal } from "./WarehouseModal.jsx";

const units = (value) => Number(value).toLocaleString("es-AR");

export function WarehouseProductionList({ production, expanded = false }) {
  const rows = expanded ? production.items : production.items.slice(0, 5);
  return <>
    <div className="divide-y divide-foreground/10">
      <div className="flex justify-between gap-4 py-3 text-xs sm:text-sm font-bold text-foreground/60"><span>Producto</span><span className="text-right">Cantidad a producir</span></div>
      {rows.map((row) => <div key={row.productId ?? row.productName} className="flex items-center justify-between gap-4 py-3">
        <span className="min-w-0 break-words [overflow-wrap:anywhere] font-medium">{row.productName}</span>
        <span className="shrink-0 font-black text-primary text-right tabular-nums">{units(row.toProduce)} <span className="text-xs font-medium">{row.unit || "u."}</span></span>
      </div>)}
    </div>
    <p className="pt-4 mt-2 border-t border-foreground/10 font-bold">Total: <span className="text-primary tabular-nums">{units(production.totalUnits)}</span> unidades y {units(production.totalLiters || 0)} L pendientes de producción.</p>
  </>;
}

export function WarehouseProductionCard({ production, loading, error }) {
  const [showAll, setShowAll] = useState(false);
  return <section className="bg-surface border border-foreground/10 rounded-2xl p-5 shadow-sm mt-6 min-w-0" aria-label="Producción pendiente">
    <div className="flex items-center justify-between gap-3 mb-2">
      <h2 className="font-black text-lg sm:text-xl flex items-center gap-3"><Factory size={23} aria-hidden="true" className="text-primary shrink-0" />Producción pendiente</h2>
      {production?.items.length > 5 && <button type="button" onClick={() => setShowAll(true)} className="text-primary font-bold text-sm shrink-0 rounded-lg px-2 py-1">Ver todos ({production.items.length})</button>}
    </div>
    {error ? <p role="status" className="text-sm text-primary py-4">No se pudo actualizar la producción. Volvé a intentar con Actualizar.</p>
      : !production && loading ? <p role="status" className="text-sm text-foreground/60 py-4">Calculando producción pendiente…</p>
      : production?.items.length ? <WarehouseProductionList production={production} />
      : production ? <p className="text-foreground/60 py-4">No hay productos pendientes de producción</p> : null}
    {showAll && <WarehouseModal title="Producción pendiente · Todos los productos" onClose={() => setShowAll(false)}>
      {error ? <p role="alert">No se pudo actualizar la producción.</p> : <WarehouseProductionList production={production} expanded />}
    </WarehouseModal>}
  </section>;
}
