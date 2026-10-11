import { useEffect, useState } from "react";
import { BarChart3, CalendarDays, Target, TrendingUp } from "lucide-react";
import api from "../../services/api.js";
import { Loader } from "./Loader.jsx";

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
const monday = (date) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() - ((value.getDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
};
const monthStart = (date) => `${date.slice(0, 8)}01`;
const percentage = (value) => value == null ? "No calculable" : `${Number(value).toFixed(2)}%`;

function StatusCard({ title, value, detail, tone = "text-foreground" }) {
  return <div className="bg-surface rounded-xl p-5 border border-foreground/15 shadow-sm">
    <p className="text-foreground/65 text-sm font-bold">{title}</p>
    <p className={`text-2xl font-black mt-2 ${tone}`}>{value}</p>
    {detail && <p className="text-foreground/60 text-xs font-medium mt-2">{detail}</p>}
  </div>;
}

export function RentabilidadView({ onSelectOverview }) {
  const [range, setRange] = useState("month");
  const [customFrom, setCustomFrom] = useState(monthStart(today()));
  const [customTo, setCustomTo] = useState(today());
  const [productId, setProductId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [data, setData] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const dates = () => {
    const end = today();
    if (range === "day") return { from: end, to: end };
    if (range === "week") return { from: monday(end), to: end };
    if (range === "month") return { from: monthStart(end), to: end };
    return { from: customFrom, to: customTo };
  };

  useEffect(() => {
    let active = true;
    const { from, to } = dates();
    setLoading(true);
    Promise.all([
      api.get("/stats/profitability", { params: { from, to, productId: productId || undefined, categoryId: categoryId || undefined } }),
      api.get("/products"),
      api.get("/categories"),
    ]).then(([profitability, productsResult, categoriesResult]) => {
      if (!active) return;
      setData(profitability.data);
      setProducts(productsResult.data);
      setCategories(categoriesResult.data);
    }).catch(() => {
      if (active) setData(null);
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [range, customFrom, customTo, productId, categoryId]);

  const summary = data?.summary;
  const profitability = summary?.profitability;
  const status = profitability == null ? "bg-foreground/10 text-foreground" : profitability >= 40 ? "bg-success/15 text-success" : profitability >= 30 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700";
  const maxEvolution = Math.max(40, ...(data?.evolution || []).map((row) => Math.max(0, Number(row.profitability) || 0)));

  return <div className="flex-1 p-4 pb-20 md:p-8 overflow-y-auto relative">
    {loading && <Loader />}
    <div className="flex flex-col gap-4 mb-6 md:mb-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div><h1 className="text-foreground font-bold text-2xl md:text-4xl mb-1">Estadísticas</h1><p className="text-foreground/80 font-medium text-sm">Rendimiento y métricas de tu local</p></div>
        <div className="bg-surface p-1 rounded-xl border border-foreground/15 shadow-sm flex gap-1 self-start">
          <button onClick={onSelectOverview} className="px-4 py-2 rounded-lg text-sm font-bold text-foreground/70 hover:text-foreground">Resumen</button>
          <button className="px-4 py-2 rounded-lg text-sm font-bold bg-secondary text-foreground">Rentabilidad</button>
        </div>
      </div>
      <div className="bg-surface rounded-xl border border-foreground/15 p-4 flex flex-col xl:flex-row xl:items-end gap-3">
        <div className="flex flex-wrap gap-1 bg-background rounded-lg p-1 border border-foreground/10">
          {[['day','Día'],['week','Semana'],['month','Mes'],['custom','Personalizado']].map(([id, label]) => <button key={id} onClick={() => setRange(id)} className={`px-3 py-2 text-sm font-bold rounded-md ${range === id ? 'bg-secondary text-foreground' : 'text-foreground/65'}`}>{label}</button>)}
        </div>
        {range === "custom" && <><label className="text-xs font-bold text-foreground/65">Desde<input type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)} className="block mt-1 rounded-lg border border-foreground/20 bg-background p-2 text-sm" /></label><label className="text-xs font-bold text-foreground/65">Hasta<input type="date" value={customTo} min={customFrom} max={today()} onChange={(event) => setCustomTo(event.target.value)} className="block mt-1 rounded-lg border border-foreground/20 bg-background p-2 text-sm" /></label></>}
        <select value={productId} onChange={(event) => setProductId(event.target.value)} className="rounded-lg border border-foreground/20 bg-background p-2 text-sm font-medium"><option value="">Todos los productos</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="rounded-lg border border-foreground/20 bg-background p-2 text-sm font-medium"><option value="">Todas las categorías</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
      </div>
    </div>

    <div className="flex items-center gap-3 mb-5"><TrendingUp className="text-primary" /><h2 className="text-primary font-bold text-2xl">Rentabilidad de productos</h2></div>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
      <StatusCard title="Costo total vendido" value={money.format(summary?.totalCost || 0)} />
      <StatusCard title="Ingresos netos" value={money.format(summary?.netRevenue || 0)} tone="text-success" />
      <StatusCard title="Ganancia total" value={money.format(summary?.totalProfit || 0)} tone={(summary?.totalProfit || 0) < 0 ? "text-red-600" : "text-success"} />
      <StatusCard title="Objetivo" value="40.00%" detail="Rentabilidad sobre el costo" />
      <StatusCard title="Rentabilidad general" value={percentage(profitability)} detail={summary?.targetDifference == null ? "Se necesita costo histórico mayor a cero" : `${summary.targetDifference >= 0 ? '+' : ''}${summary.targetDifference.toFixed(2)} pp vs. objetivo`} tone={profitability == null ? "text-foreground" : profitability >= 40 ? "text-success" : profitability >= 30 ? "text-yellow-700" : "text-red-600"} />
    </div>

    <div className={`rounded-xl p-4 mb-6 flex items-center gap-3 font-bold ${status}`}><Target size={22}/>{profitability == null ? "No calculable: el costo total vendido es cero." : profitability >= 40 ? "Objetivo de rentabilidad alcanzado." : profitability >= 30 ? "Cerca del objetivo de 40%." : "Rentabilidad por debajo del 30%."}</div>

    <div className="bg-surface rounded-xl border border-foreground/15 shadow-sm p-5 mb-6">
      <div className="flex items-center gap-2 mb-4"><BarChart3 className="text-primary" size={20}/><h3 className="font-bold text-foreground">Evolución diaria y objetivo</h3></div>
      {data?.evolution?.length ? <div className="space-y-3">{data.evolution.map((row) => <div key={row.date} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 text-sm"><span className="font-medium text-foreground/70">{row.date.split('-').reverse().join('/')}</span><div className="h-3 rounded-full bg-background overflow-hidden relative"><div className="absolute left-0 top-0 h-full w-px bg-foreground/50" style={{ marginLeft: `${(40 / maxEvolution) * 100}%` }} title="Objetivo 40%"/><div className={`h-full rounded-full ${row.profitability >= 40 ? 'bg-success' : row.profitability >= 30 ? 'bg-yellow-400' : 'bg-red-500'}`} style={{ width: `${Math.min(100, Math.max(0, (Number(row.profitability) || 0) / maxEvolution * 100))}%` }}/></div><span className="font-black">{percentage(row.profitability)}</span></div>)}</div> : <p className="text-sm text-foreground/60">No hay ventas para los filtros elegidos.</p>}
    </div>

    <div className="bg-surface rounded-xl border border-foreground/15 shadow-sm overflow-hidden"><div className="p-5 flex items-center gap-2"><CalendarDays className="text-primary" size={20}/><h3 className="font-bold text-foreground">Detalle por producto</h3></div><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead><tr className="border-y border-foreground/15 text-left text-foreground/65"><th className="p-3">Producto</th><th className="p-3 text-right">Costo unit.</th><th className="p-3 text-right">Venta unit.</th><th className="p-3 text-right">Ganancia unit.</th><th className="p-3 text-right">Rentabilidad</th><th className="p-3 text-right">Vendidos</th><th className="p-3 text-right">Costo total</th><th className="p-3 text-right">Ganancia total</th></tr></thead><tbody>{data?.products?.length ? data.products.map((row, index) => <tr key={`${row.productId || row.promotionId || row.name}-${index}`} className="border-b border-foreground/10"><td className="p-3 font-bold">{row.name}{row.isPromotion && <span className="ml-2 inline-flex text-[10px] font-black uppercase tracking-wide bg-primary/15 text-primary px-2 py-0.5 rounded-full">Promoción</span>}{row.category && <span className="block text-xs font-medium text-foreground/55">{row.category}</span>}</td><td className="p-3 text-right">{row.unitCost == null ? 'Sin costo' : money.format(row.unitCost)}</td><td className="p-3 text-right">{money.format(row.unitPrice)}</td><td className={`p-3 text-right font-bold ${row.unitProfit < 0 ? 'text-red-600' : 'text-success'}`}>{row.unitProfit == null ? 'No calculable' : money.format(row.unitProfit)}</td><td className="p-3 text-right font-bold">{percentage(row.profitability)}</td><td className="p-3 text-right">{row.quantitySold}</td><td className="p-3 text-right">{money.format(row.totalCost)}</td><td className={`p-3 text-right font-black ${row.totalProfit < 0 ? 'text-red-600' : 'text-success'}`}>{money.format(row.totalProfit)}</td></tr>) : <tr><td colSpan="8" className="p-8 text-center text-foreground/60">No hay ventas para los filtros elegidos.</td></tr>}</tbody></table></div></div>
  </div>;
}
