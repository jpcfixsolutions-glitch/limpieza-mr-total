import { Factory } from "lucide-react";

const number = (value) => Number(value).toLocaleString("es-AR");
const date = (value) => {
  if (!value) return "Sin fecha registrada";
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? value.replace(" ", "T") + "-03:00" : value;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "Sin fecha registrada";
  return new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Cordoba", dateStyle: "short", timeStyle: "short", hourCycle: "h23" })
    .format(parsed);
};

export function WarehouseEmployeeProduction({ production, error, loading, onDetail }) {
  const items = [...(production?.items || [])].sort((a, b) => String(a.oldestOrderAt).localeCompare(String(b.oldestOrderAt)) || a.productName.localeCompare(b.productName, "es-AR"));
  return <section aria-label="Faltantes de producción" className="bg-surface border border-foreground/10 rounded-2xl p-5 shadow-sm mb-6 min-w-0">
    <h2 className="font-black text-xl flex items-center gap-3"><Factory size={23} className="text-primary shrink-0" aria-hidden="true" />Faltantes de producción</h2>
    <p className="text-sm text-foreground/60 mt-1">Primero, las necesidades de los pedidos más antiguos.</p>
    {error ? <p role="status" className="text-primary text-sm py-4">No se pudieron actualizar los faltantes. Volvé a intentar con Actualizar.</p>
      : !production && loading ? <p role="status" className="py-4 text-foreground/60">Calculando faltantes…</p>
      : !items.length ? <p className="py-4 text-foreground/60">No hay productos pendientes de producción</p>
      : <div className="divide-y divide-foreground/10 max-h-[32rem] overflow-y-auto mt-3 pr-1">{items.map((item) => <article key={item.productId ?? item.productName} className="py-4 space-y-2">
        <div className="flex flex-wrap justify-between items-start gap-2"><h3 className="font-bold min-w-0 break-words">{item.productName}</h3><p className="text-primary font-black tabular-nums">{number(item.toProduce)} u. a producir</p></div>
        <p className="text-sm text-foreground/60">Stock disponible: <strong>{number(item.stock)} u.</strong></p>
        <p className="text-xs text-foreground/60">Pedido más antiguo con faltante: {date(item.oldestOrderAt)}</p>
        <div className="flex flex-wrap gap-2">{item.orders.map((order) => <button key={order.id} type="button" onClick={() => onDetail(order.id)} className="text-primary bg-primary/5 rounded-lg px-3 py-2 text-sm font-bold">Pedido #{order.id} · {number(order.toProduce)} u.</button>)}</div>
      </article>)}</div>}
  </section>;
}
