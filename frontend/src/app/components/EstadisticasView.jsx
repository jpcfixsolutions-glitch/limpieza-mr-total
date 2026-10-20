import { useState, useEffect } from "react";
import { DollarSign, Package, Banknote, CreditCard, TrendingDown, Wallet, RefreshCw, PackageMinus, Unlock, Lock, BookUp, Clock, ChevronDown, ChevronUp, Plus, Eye, Trophy } from "lucide-react";
import { toast } from "sonner";
import api from "../../services/api.js";
import { summarizeCatalogProfitability } from "../../utils/price.js";
import { Loader } from "./Loader.jsx";
import { DailyExpenseModal } from "./DailyExpenseModal.jsx";
import { ProductExtractionHistoryModal } from "./ProductExtractionHistoryModal.jsx";

// Formateador de fecha en hora Argentina
const arFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

function hoyAR() {
  return arFmt.format(new Date());
}

// Lunes de la semana de una fecha "YYYY-MM-DD"
function getMondayOf(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay(); // 0=Dom
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return arFmt.format(d);
}

// Domingo de la semana a partir del lunes "YYYY-MM-DD"
function getSundayOf(mondayStr) {
  const d = new Date(mondayStr + "T12:00:00");
  d.setDate(d.getDate() + 6);
  return arFmt.format(d);
}

// "YYYY-MM-DD" → "DD/MM"
function fmtDDMM(str) {
  return str.slice(8, 10) + "/" + str.slice(5, 7);
}

const MONTH_NAMES_LONG  = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

export function EstadisticasView() {
  const [activePage, setActivePage]       = useState("finances");
  const [period, setPeriod]               = useState("mensual");
  const [cajasCerradas, setCajasCerradas] = useState([]);
  const [gastosFijos, setGastosFijos]     = useState([]);
  const [gastosDiarios, setGastosDiarios] = useState([]);
  const [productos, setProductos]         = useState([]);
  const [loading, setLoading]             = useState(true);
  const [restockCost, setRestockCost]     = useState(0);
  const [activityLog, setActivityLog]     = useState([]);
  const [topProducts, setTopProducts]     = useState([]);
  const [histTab, setHistTab]             = useState("mes"); // "mes" | "semana"
  const [expandedHist, setExpandedHist]   = useState(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [extractionSummary, setExtractionSummary] = useState({
    totalCost: 0,
    operations: 0,
    consumption: {
      totalCost: 0,
      operations: 0,
      local: { totalCost: 0, operations: 0 },
      home: { totalCost: 0, operations: 0 },
    },
  });
  const [showExtractionHistory, setShowExtractionHistory] = useState(false);

  const LOG_ICONS = { Unlock, Lock, Wallet, BookUp, PackageMinus, Package };

  const fetchStats = async () => {
    setLoading(true);
    try {
      const periodFrom = period === "semanal" ? getMondayOf(hoyAR()) : period === "mensual" ? `${hoyAR().slice(0, 8)}01` : undefined;
      const periodTo = hoyAR();
      const [rCajas, rFijos, rDiarios, rProd, rRestock, rLog, rExtractions, rTopProducts] = await Promise.allSettled([
        api.get("/cash-register/closed"),
        api.get("/fixed-expenses"),
        api.get("/daily-expenses"),
        api.get("/products"),
        api.get("/stats/restock", { params: { from: periodFrom, to: periodTo } }),
        api.get("/stats/activity-log"),
        api.get("/product-extractions/summary", { params: { from: periodFrom, to: periodTo } }),
        api.get("/stats/top-products", { params: { from: periodFrom, to: periodTo, limit: 10 } }),
      ]);
      if (rCajas.status   === "fulfilled") setCajasCerradas(rCajas.value.data);
      if (rFijos.status   === "fulfilled") setGastosFijos(rFijos.value.data);
      if (rDiarios.status === "fulfilled") setGastosDiarios(rDiarios.value.data);
      if (rProd.status    === "fulfilled") setProductos(rProd.value.data);
      if (rRestock.status === "fulfilled") setRestockCost(rRestock.value.data.restockCost || 0);
      if (rLog.status     === "fulfilled") setActivityLog(rLog.value.data);
      if (rExtractions.status === "fulfilled") setExtractionSummary(rExtractions.value.data);
      if (rTopProducts.status === "fulfilled") setTopProducts(rTopProducts.value.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, [period]);

  const handleDailyExpense = async (expenseData) => {
    try {
      await api.post("/daily-expenses", expenseData);
      toast.success("Gasto registrado correctamente");
      setShowExpenseModal(false);
      await fetchStats();
    } catch (err) {
      toast.error("Error al registrar el gasto", { description: err.response?.data?.message || err.message });
      throw err;
    }
  };

  // ── Cutoffs de período ────────────────────────────────────────────────────
  const today        = hoyAR();                          // "YYYY-MM-DD"
  const semanaInicio = getMondayOf(today);               // lunes de esta semana
  const mesInicio    = today.slice(0, 8) + "01";         // 1° del mes actual

  const periodCutoff = period === "semanal" ? semanaInicio
                     : period === "mensual" ? mesInicio
                     : null; // "todo" = sin filtro

  const cajasFiltradas = cajasCerradas.filter((c) => {
    if (!c.closedAt) return false;
    return periodCutoff ? c.closedAt.slice(0, 10) >= periodCutoff : true;
  });

  const activityLogFiltrado = activityLog.filter((log) => {
    if (!log.date) return false;
    return periodCutoff ? log.date.slice(0, 10) >= periodCutoff : true;
  });

  // ── Tarjetas principales ──────────────────────────────────────────────────
  const revenue  = cajasFiltradas.reduce((s, c) => s + (c.totalIngresos     || 0), 0);
  const efectivo = cajasFiltradas.reduce((s, c) => s + (c.totalEfectivo     || 0), 0);
  const virtual  = cajasFiltradas.reduce((s, c) => s + (c.totalTransferencia|| 0), 0);

  // ── Gastos filtrados ──────────────────────────────────────────────────────
  const gastosDiariosFiltrados = gastosDiarios.filter((g) => {
    if (!g.createdAt) return false;
    return periodCutoff ? g.createdAt.slice(0, 10) >= periodCutoff : true;
  });

  const totalFijos           = gastosFijos.reduce((s, g) => s + (Number(g.amount) || 0), 0);
  const totalDiarios         = gastosDiariosFiltrados.reduce((s, g) => s + (Number(g.amount) || 0), 0);
  const totalGastosOperativos = totalFijos + totalDiarios;
  const invertidoStock       = productos.reduce((s, p) => s + ((Number(p.cost)||0) * (Number(p.stock)||0)), 0);
  const profitabilitySummary = summarizeCatalogProfitability(productos);
  const topProductMaxUnits = Math.max(1, ...topProducts.map((product) => Number(product.quantitySold) || 0));
  const topProductTotals = topProducts.reduce((totals, product) => ({
    units: totals.units + (Number(product.quantitySold) || 0),
    revenue: totals.revenue + (Number(product.netRevenue) || 0),
    profit: totals.profit + (Number(product.totalProfit) || 0),
  }), { units: 0, revenue: 0, profit: 0 });

  const gastosDiariosEfectivo = gastosDiariosFiltrados.filter((g) => g.method === "efectivo").reduce((s,g)=>s+(Number(g.amount)||0),0);
  const gastosDiariosVirtual  = gastosDiariosFiltrados.filter((g) => g.method === "transferencia").reduce((s,g)=>s+(Number(g.amount)||0),0);
  const disponibleEfectivo    = efectivo - gastosDiariosEfectivo;
  const disponibleVirtual     = virtual  - gastosDiariosVirtual;

  // ── Historial por mes ─────────────────────────────────────────────────────
  const historicoPorMes = (() => {
    const map = {};
    cajasFiltradas.forEach((c) => {
      if (!c.closedAt) return;
      const k = c.closedAt.slice(0, 7);
      if (!map[k]) map[k] = { ingresos:0, efectivo:0, virtual:0, cajas:0 };
      map[k].ingresos += Number(c.totalIngresos)      || 0;
      map[k].efectivo += Number(c.totalEfectivo)      || 0;
      map[k].virtual  += Number(c.totalTransferencia) || 0;
      map[k].cajas    += 1;
    });
    return Object.keys(map).sort().reverse().map((k) => ({
      key: k,
      label: MONTH_NAMES_LONG[parseInt(k.slice(5,7))-1] + " " + k.slice(0,4),
      isCurrent: k === today.slice(0,7),
      ...map[k],
    }));
  })();

  // ── Historial por semana ──────────────────────────────────────────────────
  const historicoPorSemana = (() => {
    const map = {};
    cajasFiltradas.forEach((c) => {
      if (!c.closedAt) return;
      const monday = getMondayOf(c.closedAt.slice(0,10));
      if (!map[monday]) map[monday] = { ingresos:0, efectivo:0, virtual:0, cajas:0 };
      map[monday].ingresos += Number(c.totalIngresos)      || 0;
      map[monday].efectivo += Number(c.totalEfectivo)      || 0;
      map[monday].virtual  += Number(c.totalTransferencia) || 0;
      map[monday].cajas    += 1;
    });
    return Object.keys(map).sort().reverse().map((monday) => ({
      key: monday,
      label: fmtDDMM(monday) + " – " + fmtDDMM(getSundayOf(monday)),
      isCurrent: monday === semanaInicio,
      ...map[monday],
    }));
  })();

  // ── Misc ──────────────────────────────────────────────────────────────────
  const totalEgresosBalance = totalDiarios + totalFijos + restockCost;
  const balanceNeto     = revenue - totalEgresosBalance;
  const margenPorcentaje = revenue > 0 ? (balanceNeto / revenue) * 100 : 0;
  const monto = (value, cls = "") => <span className={cls}>${value}</span>;
  const PERIOD_LABELS   = { todo:"Todo", mensual:"Mensual", semanal:"Semanal" };
  const PAGE_LABELS = {
    finances: { title: "Finanzas", description: "Ingresos, gastos, restock y balance" },
    profitability: { title: "Rentabilidad", description: "Rendimiento del catálogo y productos estrella" },
    history: { title: "Historial", description: "Movimientos y resultados por período" },
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 p-4 pb-20 md:p-8 overflow-y-auto relative">
      {loading && <Loader />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 md:mb-8 gap-3">
        <div>
          <h1 className="text-foreground font-bold text-2xl md:text-4xl mb-1 md:mb-2">{PAGE_LABELS[activePage].title}</h1>
          <p className="text-foreground/80 font-medium text-sm">{PAGE_LABELS[activePage].description}</p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
          <div className="bg-surface p-1 rounded-xl border border-foreground/15 shadow-sm flex gap-1 overflow-x-auto max-w-full">
            {[
              ["finances", "Finanzas"],
              ["profitability", "Rentabilidad"],
              ["history", "Historial"],
            ].map(([id, label]) => (
              <button key={id} onClick={() => setActivePage(id)}
                className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${activePage === id ? "bg-secondary text-foreground shadow-sm" : "text-foreground/70 hover:text-foreground"}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="bg-surface p-1 rounded-xl border border-foreground/15 shadow-sm flex gap-1 overflow-x-auto max-w-full">
            {["semanal","mensual","todo"].map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-4 md:px-6 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all shadow-sm ${period === p ? "bg-secondary text-foreground" : "bg-transparent text-foreground/70 hover:text-foreground"}`}>
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tarjetas de finanzas y rentabilidad */}
      {activePage !== "history" && <div className={`grid grid-cols-1 gap-6 mb-8 ${activePage === "finances" ? "md:grid-cols-2 xl:grid-cols-4" : "lg:grid-cols-3"}`}>
        {activePage === "finances" && <>
        <div className="bg-surface rounded-xl p-6 border border-success/30 shadow-sm md:col-span-2">
          <div className="flex items-center gap-3 mb-4 text-success"><DollarSign size={20}/><h3 className="text-foreground/80 font-bold">Ingresos Totales</h3></div>
          <p className="text-3xl font-black">{monto(revenue.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),"text-foreground")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5 pt-4 border-t border-foreground/15">
            <div className="rounded-xl bg-background p-4 border border-foreground/10">
              <div className="flex items-center gap-2 text-success"><Banknote size={18}/><span className="text-sm font-bold">Efectivo</span></div>
              <p className="text-xl font-black mt-2">{monto(efectivo.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}))}</p>
              <p className="text-foreground/55 text-xs font-medium mt-1">{revenue>0?((efectivo/revenue)*100).toFixed(1):0}% del total</p>
            </div>
            <div className="rounded-xl bg-background p-4 border border-foreground/10">
              <div className="flex items-center gap-2 text-primary"><CreditCard size={18}/><span className="text-sm font-bold">Virtual</span></div>
              <p className="text-xl font-black mt-2">{monto(virtual.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}))}</p>
              <p className="text-foreground/55 text-xs font-medium mt-1">Tarjetas, transferencias y QR</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-xl p-6 border border-foreground/15 shadow-sm">
          <div className="flex items-center gap-3 mb-4 text-foreground"><RefreshCw size={20}/><h3 className="text-foreground/80 font-bold">Gasto de Restock</h3></div>
          <p className="text-3xl font-black">{monto(restockCost.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),"text-foreground")}</p>
          <p className="text-foreground/60 font-medium text-sm mt-2">Costo para reponer lo vendido</p>
        </div>
        <div className="bg-surface rounded-xl p-6 border border-orange-400/30 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4 text-orange-600"><div className="flex items-center gap-3"><PackageMinus size={20}/><h3 className="text-foreground/80 font-bold">Consumo de mercadería</h3></div><button onClick={() => setShowExtractionHistory(true)} title="Ver detalle" className="p-2 rounded-lg hover:bg-surface"><Eye size={18}/></button></div>
          <p className="text-3xl font-black">{monto(Number(extractionSummary.consumption?.totalCost || 0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),"text-foreground")}</p>
          <p className="text-foreground/60 font-medium text-sm mt-2">{extractionSummary.consumption?.operations || 0} operación{extractionSummary.consumption?.operations === 1 ? "" : "es"} de consumo en el período</p>
          <div className="border-t border-foreground/15 mt-4 pt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3"><span className="text-foreground/70 font-medium">Consumo del local</span><span className="font-bold">${Number(extractionSummary.consumption?.local?.totalCost || 0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
            <div className="flex justify-between gap-3"><span className="text-foreground/70 font-medium">Consumo de casa</span><span className="font-bold">${Number(extractionSummary.consumption?.home?.totalCost || 0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
            <div className="flex justify-between gap-3 text-xs"><span className="text-foreground/55 font-medium">Todas las extracciones</span><span className="text-foreground/70 font-bold">${Number(extractionSummary.totalCost || 0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
          </div>
        </div>
        </>}
        {activePage === "profitability" && <>
        <div className="bg-surface rounded-2xl border border-primary/25 shadow-sm overflow-hidden lg:col-span-3">
          <div className="p-5 md:p-6 border-b border-foreground/10 bg-gradient-to-r from-primary/10 via-surface to-surface">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-primary text-white flex items-center justify-center shadow-sm shrink-0"><Trophy size={22}/></div>
                <div><div className="flex items-center gap-2 flex-wrap"><h3 className="text-foreground text-lg font-black">Productos estrella</h3><span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-black uppercase tracking-wide">Top 10</span></div><p className="text-foreground/60 font-medium text-sm mt-1">Ordenados por unidades vendidas en el período seleccionado</p></div>
              </div>
              {topProducts.length > 0 && <div className="grid grid-cols-3 gap-2 md:min-w-[360px]">
                <div className="rounded-xl bg-background/80 border border-foreground/10 px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-foreground/55 font-bold">Unidades</p><p className="text-base font-black mt-0.5">{topProductTotals.units.toLocaleString("es-AR")}</p></div>
                <div className="rounded-xl bg-background/80 border border-foreground/10 px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-foreground/55 font-bold">Ventas</p><p className="text-base font-black mt-0.5">${topProductTotals.revenue.toLocaleString("es-AR",{maximumFractionDigits:0})}</p></div>
                <div className="rounded-xl bg-background/80 border border-foreground/10 px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-foreground/55 font-bold">Ganancia</p><p className={`text-base font-black mt-0.5 ${topProductTotals.profit >= 0 ? "text-success" : "text-red-600"}`}>${topProductTotals.profit.toLocaleString("es-AR",{maximumFractionDigits:0})}</p></div>
              </div>}
            </div>
          </div>
          {topProducts.length === 0 ? <div className="p-8 text-center"><p className="text-foreground/60 font-medium text-sm">No hay ventas en este período.</p><p className="text-foreground/45 text-xs mt-1">El ranking aparecerá cuando se registren ventas.</p></div> : (
            <div>
              <div className="hidden md:grid grid-cols-[52px_minmax(220px,1fr)_110px_140px_140px_120px] gap-4 px-6 py-3 bg-background/70 border-b border-foreground/10 text-[11px] uppercase tracking-wider text-foreground/55 font-black">
                <span className="text-center">Puesto</span><span>Producto</span><span className="text-right">Unidades</span><span className="text-right">Ventas</span><span className="text-right">Ganancia</span><span className="text-right">Rentabilidad</span>
              </div>
              {topProducts.map((product, index) => (
                <div key={product.productId || product.productName} className="border-b last:border-b-0 border-foreground/10 px-4 md:px-6 py-4 hover:bg-background/60 transition-colors">
                  <div className="md:grid md:grid-cols-[52px_minmax(220px,1fr)_110px_140px_140px_120px] md:gap-4 md:items-center flex gap-3 items-start">
                    <span className={`w-10 h-10 md:w-9 md:h-9 shrink-0 rounded-xl flex items-center justify-center font-black ${index === 0 ? "bg-primary text-white shadow-sm" : index === 1 ? "bg-foreground/15 text-foreground" : index === 2 ? "bg-orange-100 text-orange-700" : "bg-background border border-foreground/10 text-foreground/65"}`}>{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-foreground truncate" title={product.productName}>{product.productName}</p>
                      <div className="h-1.5 bg-foreground/10 rounded-full overflow-hidden mt-2"><div className={`h-full rounded-full ${index === 0 ? "bg-primary" : "bg-primary/45"}`} style={{width:`${Math.max(4, (Number(product.quantitySold) / topProductMaxUnits) * 100)}%`}}/></div>
                    </div>
                    <div className="hidden md:block text-right"><p className="font-black text-foreground">{Number(product.quantitySold).toLocaleString("es-AR")}</p><p className="text-[10px] text-foreground/50 font-medium">vendidas</p></div>
                    <p className="hidden md:block text-right font-bold text-foreground">${Number(product.netRevenue).toLocaleString("es-AR",{minimumFractionDigits:2,maximumFractionDigits:2})}</p>
                    <p className={`hidden md:block text-right font-black ${Number(product.totalProfit) >= 0 ? "text-success" : "text-red-600"}`}>${Number(product.totalProfit).toLocaleString("es-AR",{minimumFractionDigits:2,maximumFractionDigits:2})}</p>
                    <div className="hidden md:flex justify-end"><span className={`px-2.5 py-1 rounded-full text-xs font-black ${product.profitability == null ? "bg-foreground/10 text-foreground/55" : product.profitability >= 40 ? "bg-success/10 text-success" : product.profitability >= 0 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-600"}`}>{product.profitability == null ? "Sin costo" : `${Number(product.profitability).toFixed(1)}%`}</span></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 ml-[52px] md:hidden">
                    <div><p className="text-[10px] uppercase tracking-wide text-foreground/50 font-bold">Unidades</p><p className="font-black">{Number(product.quantitySold).toLocaleString("es-AR")}</p></div>
                    <div><p className="text-[10px] uppercase tracking-wide text-foreground/50 font-bold">Ventas</p><p className="font-bold">${Number(product.netRevenue).toLocaleString("es-AR",{maximumFractionDigits:0})}</p></div>
                    <div><p className="text-[10px] uppercase tracking-wide text-foreground/50 font-bold">Ganancia</p><p className={`font-black ${Number(product.totalProfit) >= 0 ? "text-success" : "text-red-600"}`}>${Number(product.totalProfit).toLocaleString("es-AR",{maximumFractionDigits:0})}</p></div>
                    <div><p className="text-[10px] uppercase tracking-wide text-foreground/50 font-bold">Rentabilidad</p><p className="font-black">{product.profitability == null ? "Sin costo" : `${Number(product.profitability).toFixed(1)}%`}</p></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-surface rounded-xl p-6 border border-success/30 shadow-sm lg:col-span-3">
          <div className="flex items-center gap-3 mb-4 text-success"><TrendingDown className="rotate-180" size={20}/><h3 className="text-foreground/80 font-bold">Rentabilidad del catálogo</h3></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="rounded-xl bg-background border border-foreground/10 p-4"><p className="text-xs text-foreground/60 font-bold uppercase tracking-wide">Cantidad de productos</p><p className="text-xl font-black mt-2">{profitabilitySummary.productCount.toLocaleString("es-AR")}</p></div>
            <div className="rounded-xl bg-background border border-foreground/10 p-4"><p className="text-xs text-foreground/60 font-bold uppercase tracking-wide">Capital invertido</p><p className="text-xl font-black mt-2">${profitabilitySummary.capitalInvested.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</p></div>
            <div className="rounded-xl bg-background border border-foreground/10 p-4"><p className="text-xs text-foreground/60 font-bold uppercase tracking-wide">Promedio de rentabilidad</p><p className={`text-xl font-black mt-2 ${profitabilitySummary.averageProfitability == null ? "text-foreground" : profitabilitySummary.averageProfitability >= 40 ? "text-success" : "text-yellow-700"}`}>{profitabilitySummary.averageProfitability == null ? "No calculable" : `${profitabilitySummary.averageProfitability.toFixed(2)}%`}</p></div>
            <div className="rounded-xl bg-background border border-foreground/10 p-4"><p className="text-xs text-foreground/60 font-bold uppercase tracking-wide">Objetivo de rentabilidad</p><p className="text-xl font-black mt-2">40.00%</p></div>
          </div>
        </div>
        </>}
      </div>}

      {/* Balance Financiero */}
      {activePage === "finances" && <>
      <h2 className="text-primary font-bold text-2xl mb-6 mt-4">Balance Financiero</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-12">
        <div className="bg-surface rounded-xl p-6 border border-foreground/15 shadow-sm">
          <div className="flex items-center gap-3 mb-4 text-primary"><Package size={20}/><h3 className="text-foreground/80 font-bold">Invertido en Stock</h3></div>
          <p className="text-3xl font-black">{monto(invertidoStock.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),"text-foreground")}</p>
        </div>
        <div className="bg-surface rounded-xl p-6 border border-foreground/15 shadow-sm flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-4 text-foreground">
            <div className="flex items-center gap-3">
              <TrendingDown size={20}/>
              <h3 className="text-foreground/80 font-bold">Gastos Operativos</h3>
            </div>
            <button
              onClick={() => setShowExpenseModal(true)}
              title="Agregar gasto operativo"
              aria-label="Agregar gasto operativo"
              className="text-foreground hover:text-foreground hover:bg-secondary transition-colors p-2 bg-elevated rounded-lg shadow-sm font-bold"
            >
              <Plus size={20}/>
            </button>
          </div>
          <p className="text-3xl font-black mb-4">{monto(totalGastosOperativos.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),"text-foreground")}</p>
          <div className="border-t border-foreground/15 pt-4 mt-auto">
            <p className="text-xs text-foreground/70 mb-3 uppercase tracking-wider font-bold">Detalle de Gastos</p>
            <div className="space-y-3 max-h-32 overflow-y-auto pr-2">
              {gastosFijos.length===0 && gastosDiariosFiltrados.length===0 && (
                <p className="text-foreground/60 font-medium text-sm">Sin gastos en este período</p>
              )}
              {gastosFijos.map((g) => (
                <div key={`fijo-${g.id}`} className="flex justify-between items-center text-sm p-2.5 bg-background rounded-lg border border-foreground/15 shadow-sm">
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span className="shrink-0 text-[10px] font-black uppercase tracking-wide bg-primary/10 text-foreground px-1.5 py-0.5 rounded">Fijo</span>
                    <div className="flex flex-col truncate">
                      <span className="text-foreground truncate font-bold">{g.name}</span>
                      <span className="text-xs text-foreground/60 font-medium">Recurrente mensual</span>
                    </div>
                  </div>
                  <span className="text-foreground font-black shrink-0">-${Number(g.amount).toFixed(2)}</span>
                </div>
              ))}
              {gastosDiariosFiltrados.map((g) => (
                <div key={`diario-${g.id}`} className="flex justify-between items-center text-sm p-2.5 bg-background rounded-lg border border-foreground/15 shadow-sm">
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span className="shrink-0 text-[10px] font-black uppercase tracking-wide bg-primary/20 text-primary px-1.5 py-0.5 rounded">Extracción</span>
                    <div className="flex flex-col truncate">
                      <span className="text-foreground truncate font-bold">{g.reason}</span>
                      <span className="text-xs text-foreground/60 font-medium">
                        {new Date(g.createdAt.replace(" ","T")).toLocaleDateString("es-AR")} • {new Date(g.createdAt.replace(" ","T")).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit",hour12:false})}
                      </span>
                    </div>
                  </div>
                  <span className="text-foreground font-black shrink-0">-${Number(g.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className={`rounded-xl p-6 border flex flex-col shadow-sm lg:col-span-2 xl:col-span-1 ${balanceNeto>=0?"bg-surface border-success/30":"bg-surface border-red-400/30"}`}>
          <div className={`flex items-center gap-3 mb-2 ${balanceNeto>=0?"text-success":"text-red-600"}`}>
            <Wallet size={20}/><h3 className="font-bold">Balance Neto</h3>
          </div>
          <p className="text-3xl font-black">
            <span className={balanceNeto>=0?"text-success":"text-red-600"}>{balanceNeto>=0?"+":"-"}${Math.abs(balanceNeto).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
          </p>
          <p className={`text-sm mt-1 mb-4 font-bold ${balanceNeto>=0?"text-success/70":"text-red-600/80"}`}>
            Rentabilidad: {margenPorcentaje.toFixed(1)}%
          </p>
          <div className={`border-t pt-4 space-y-2 ${balanceNeto>=0?"border-success/20":"border-primary/20"}`}>
            <p className="text-xs text-foreground/70 uppercase tracking-wider font-bold mb-1">Se calcula teniendo en cuenta</p>
            <ul className="space-y-1 text-sm text-foreground/80 font-medium">
              <li><span className="text-success font-black mr-2">+</span>Ingresos brutos</li>
              <li><span className="text-red-500 font-black mr-2">−</span>Gastos y extracciones operativas</li>
              <li><span className="text-red-500 font-black mr-2">−</span>Gastos fijos</li>
              <li><span className="text-red-500 font-black mr-2">−</span>Gasto de restock</li>
            </ul>
            <p className="text-xs text-foreground/55 font-medium pt-1">Los gastos operativos incluyen las extracciones registradas.</p>
          </div>
          <div className={`border-t pt-4 mt-4 space-y-2 ${balanceNeto>=0?"border-success/20":"border-primary/20"}`}>
            <p className="text-xs text-foreground/70 uppercase tracking-wider font-bold mb-1">Liquidez Disponible</p>
            <div className="flex justify-between items-center text-sm">
              <span className="text-foreground font-medium">En Efectivo</span>
              <span className="text-success font-bold">${disponibleEfectivo.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-foreground font-medium">Virtual</span>
              <span className="text-primary font-bold">${disponibleVirtual.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
            </div>
          </div>
        </div>
      </div>
      </>}

      {showExpenseModal && (
        <DailyExpenseModal
          onClose={() => setShowExpenseModal(false)}
          onSubmit={handleDailyExpense}
        />
      )}
      {showExtractionHistory && <ProductExtractionHistoryModal from={period === "semanal" ? semanaInicio : period === "mensual" ? mesInicio : ""} to={today} onClose={() => setShowExtractionHistory(false)} />}

      {activePage === "history" && <>
      {/* Movimientos */}
      <div className="mb-12">
        <div className="bg-surface rounded-xl border border-foreground/15 p-6 flex flex-col shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <Clock className="text-foreground" size={24}/>
            <h2 className="text-primary text-xl font-bold">Historial de Movimientos</h2>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[300px] pr-2 space-y-3 custom-scrollbar">
            {activityLogFiltrado.length === 0 ? (
              <p className="text-foreground/60 font-medium text-sm">No hay movimientos registrados</p>
            ) : activityLogFiltrado.map((log) => {
              const Icon = LOG_ICONS[log.icon] || Clock;
              return (
                <div key={log.id} className="bg-background rounded-lg p-3 border border-foreground/15 shadow-sm flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${log.bg} ${log.color} shrink-0 mt-0.5`}><Icon size={16}/></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap"><p className="text-foreground text-sm font-bold">{log.type}</p>{log.discountPercent > 0 && <span className="text-[10px] font-black uppercase tracking-wide bg-success/15 text-success px-2 py-0.5 rounded-full">Descuento {Number(log.discountPercent).toFixed(0)}%</span>}</div>
                    <p className="text-foreground/70 font-medium text-xs leading-relaxed">{log.details}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-foreground/80 font-bold text-xs block">{new Date(log.date.replace(" ","T")).toLocaleDateString("es-AR")}</span>
                    <span className="text-foreground/60 font-medium text-[10px]">{new Date(log.date.replace(" ","T")).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit",hour12:false})}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Historial por período ────────────────────────────────────────── */}
      <h2 className="text-primary font-bold text-2xl mb-4">Historial por Período</h2>
      <div className="bg-surface rounded-xl border border-foreground/15 shadow-sm overflow-hidden mb-8">
        {/* Tabs */}
        <div className="flex border-b border-foreground/15">
          {[{id:"mes",label:"Por mes"},{id:"semana",label:"Por semana"}].map(({id,label})=>(
            <button key={id} onClick={()=>{setHistTab(id);setExpandedHist(null);}}
              className={`px-6 py-3 text-sm font-bold transition-all ${histTab===id?"bg-secondary text-foreground":"text-foreground/70 hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/15">
                <th className="text-left p-4 text-foreground/70 font-bold uppercase text-xs tracking-wide">
                  {histTab==="mes" ? "Mes" : "Semana"}
                </th>
                <th className="text-right p-4 text-foreground/70 font-bold uppercase text-xs tracking-wide">Ingresos</th>
                <th className="text-right p-4 text-foreground/70 font-bold uppercase text-xs tracking-wide">Efectivo</th>
                <th className="text-right p-4 text-foreground/70 font-bold uppercase text-xs tracking-wide">Virtual</th>
                <th className="text-right p-4 text-foreground/70 font-bold uppercase text-xs tracking-wide">Cierres</th>
                <th className="p-4 w-10"/>
              </tr>
            </thead>
            <tbody>
              {(histTab==="mes" ? historicoPorMes : historicoPorSemana).map((row) => (
                <>
                  <tr key={row.key}
                    onClick={()=>setExpandedHist(expandedHist===row.key?null:row.key)}
                    className={`border-b border-foreground/15 cursor-pointer transition-colors hover:bg-background/60 ${expandedHist===row.key?"bg-background/60":""}`}>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-bold">{row.label}</span>
                        {row.isCurrent && (
                          <span className="text-[10px] font-black bg-secondary text-foreground px-1.5 py-0.5 rounded uppercase tracking-wide">actual</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-right text-foreground font-black">${row.ingresos.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                    <td className="p-4 text-right text-success font-bold">${row.efectivo.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                    <td className="p-4 text-right text-primary font-bold">${row.virtual.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                    <td className="p-4 text-right text-foreground/70 font-bold">{row.cajas}</td>
                    <td className="p-4 text-center text-foreground/50">
                      {expandedHist===row.key ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                    </td>
                  </tr>
                  {expandedHist===row.key && (
                    <tr key={`${row.key}-detail`} className="bg-background/40">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <div className="bg-surface rounded-xl p-4 border border-foreground/15">
                            <p className="text-foreground/60 text-xs font-bold uppercase mb-1">Total ingresos</p>
                            <p className="text-foreground text-xl font-black">${row.ingresos.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</p>
                          </div>
                          <div className="bg-surface rounded-xl p-4 border border-foreground/15">
                            <p className="text-foreground/60 text-xs font-bold uppercase mb-1">Efectivo</p>
                            <p className="text-success text-xl font-black">${row.efectivo.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</p>
                            <p className="text-foreground/50 text-xs mt-1">{row.ingresos>0?((row.efectivo/row.ingresos)*100).toFixed(1):0}% del total</p>
                          </div>
                          <div className="bg-surface rounded-xl p-4 border border-primary/20">
                            <p className="text-foreground/60 text-xs font-bold uppercase mb-1">Virtual</p>
                            <p className="text-primary text-xl font-black">${row.virtual.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</p>
                            <p className="text-foreground/50 text-xs mt-1">{row.ingresos>0?((row.virtual/row.ingresos)*100).toFixed(1):0}% del total</p>
                          </div>
                          <div className="bg-surface rounded-xl p-4 border border-foreground/15">
                            <p className="text-foreground/60 text-xs font-bold uppercase mb-1">Cierres de caja</p>
                            <p className="text-foreground text-xl font-black">{row.cajas}</p>
                            <p className="text-foreground/50 text-xs mt-1">días trabajados</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {(histTab==="mes" ? historicoPorMes : historicoPorSemana).length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-foreground/60 font-medium">No hay datos registrados aún.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>}
    </div>
  );
}
