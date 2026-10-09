import { useState, useEffect } from "react";
import { DollarSign, Package, Banknote, CreditCard, TrendingDown, Wallet, RefreshCw, PackageMinus, Unlock, Lock, BookUp, Clock, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { toast } from "sonner";
import api from "../../services/api.js";
import { Loader } from "./Loader.jsx";
import { DailyExpenseModal } from "./DailyExpenseModal.jsx";

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
  const [period, setPeriod]               = useState("mensual");
  const [cajasCerradas, setCajasCerradas] = useState([]);
  const [gastosFijos, setGastosFijos]     = useState([]);
  const [gastosDiarios, setGastosDiarios] = useState([]);
  const [productos, setProductos]         = useState([]);
  const [loading, setLoading]             = useState(true);
  const [restockCost, setRestockCost]     = useState(0);
  const [activityLog, setActivityLog]     = useState([]);
  const [cajaStatus, setCajaStatus]       = useState({ isOpen: false, register: null });
  const [transaccionesCaja, setTransaccionesCaja] = useState([]);
  const [histTab, setHistTab]             = useState("mes"); // "mes" | "semana"
  const [expandedHist, setExpandedHist]   = useState(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  const LOG_ICONS = { Unlock, Lock, Wallet, BookUp, PackageMinus, Package };

  const fetchStats = async () => {
    setLoading(true);
    try {
      const [rCajas, rFijos, rDiarios, rProd, rRestock, rLog, rStatus] = await Promise.allSettled([
        api.get("/cash-register/closed"),
        api.get("/fixed-expenses"),
        api.get("/daily-expenses"),
        api.get("/products"),
        api.get("/stats/restock"),
        api.get("/stats/activity-log"),
        api.get("/cash-register/status"),
      ]);
      if (rCajas.status   === "fulfilled") setCajasCerradas(rCajas.value.data);
      if (rFijos.status   === "fulfilled") setGastosFijos(rFijos.value.data);
      if (rDiarios.status === "fulfilled") setGastosDiarios(rDiarios.value.data);
      if (rProd.status    === "fulfilled") setProductos(rProd.value.data);
      if (rRestock.status === "fulfilled") setRestockCost(rRestock.value.data.restockCost || 0);
      if (rLog.status     === "fulfilled") setActivityLog(rLog.value.data);
      if (rStatus.status  === "fulfilled") {
        const status = rStatus.value.data;
        setCajaStatus(status);
        if (status.isOpen && status.register) {
          try {
            const txRes = await api.get(`/transactions/register/${status.register.id}`);
            setTransaccionesCaja(txRes.data);
          } catch { setTransaccionesCaja([]); }
        } else {
          setTransaccionesCaja([]);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

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

  const gastosDiariosEfectivo = gastosDiariosFiltrados.filter((g) => g.method === "efectivo").reduce((s,g)=>s+(Number(g.amount)||0),0);
  const gastosDiariosVirtual  = gastosDiariosFiltrados.filter((g) => g.method === "transferencia").reduce((s,g)=>s+(Number(g.amount)||0),0);
  const disponibleEfectivo    = efectivo - gastosDiariosEfectivo;
  const disponibleVirtual     = virtual  - gastosDiariosVirtual;

  // ── Caja final del día ────────────────────────────────────────────────────
  const { cajaFinalDelDia, fondoInicialCaja, efectivoVentasCaja, extraccionesEfectivoCaja, hayCajaHoy } = (() => {
    if (!cajaStatus.isOpen || !cajaStatus.register)
      return { cajaFinalDelDia:0, fondoInicialCaja:0, efectivoVentasCaja:0, extraccionesEfectivoCaja:0, hayCajaHoy:false };
    const fondoInicial    = Number(cajaStatus.register.initialCash) || 0;
    const efectivoVentas  = transaccionesCaja.reduce((s, t) =>
      s + (t.payments||[]).filter((p)=>(p.methodName||"").toLowerCase().includes("efectivo")).reduce((a,p)=>a+(Number(p.amount)||0),0), 0);
    const extracciones    = gastosDiarios
      .filter((g) => g.registerId === cajaStatus.register.id && g.method === "efectivo")
      .reduce((s,g)=>s+(Number(g.amount)||0),0);
    return { cajaFinalDelDia: fondoInicial + efectivoVentas - extracciones, fondoInicialCaja: fondoInicial, efectivoVentasCaja: efectivoVentas, extraccionesEfectivoCaja: extracciones, hayCajaHoy: true };
  })();

  // ── Historial por mes ─────────────────────────────────────────────────────
  const historicoPorMes = (() => {
    const map = {};
    cajasCerradas.forEach((c) => {
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
    cajasCerradas.forEach((c) => {
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
  const balanceNeto     = revenue - totalGastosOperativos;
  const margenPorcentaje = revenue > 0 ? (balanceNeto / revenue) * 100 : 0;
  const monto = (value, cls = "") => <span className={cls}>${value}</span>;
  const PERIOD_LABELS   = { todo:"Todo", mensual:"Mensual", semanal:"Semanal" };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 p-4 pb-20 md:p-8 overflow-y-auto relative">
      {loading && <Loader />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 md:mb-8 gap-3">
        <div>
          <h1 className="text-foreground font-bold text-2xl md:text-4xl mb-1 md:mb-2">Estadísticas</h1>
          <p className="text-foreground/80 font-medium text-sm">Rendimiento y métricas de tu local</p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
          <div className="bg-surface p-1 rounded-xl border border-foreground/15 shadow-sm flex gap-1">
            {["todo","mensual","semanal"].map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-4 md:px-6 py-2 rounded-lg text-sm font-bold transition-all shadow-sm ${period === p ? "bg-secondary text-foreground" : "bg-transparent text-foreground/70 hover:text-foreground"}`}>
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tarjetas stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-8">
        <div className="bg-surface rounded-xl p-6 border border-foreground/15 shadow-sm">
          <div className="flex items-center gap-3 mb-4 text-success"><DollarSign size={20}/><h3 className="text-foreground/80 font-bold">Ingresos Totales</h3></div>
          <p className="text-3xl font-black">{monto(revenue.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),"text-foreground")}</p>
        </div>
        <div className="bg-surface rounded-xl p-6 border border-foreground/15 shadow-sm">
          <div className="flex items-center gap-3 mb-4 text-success"><Banknote size={20}/><h3 className="text-foreground/80 font-bold">En Efectivo</h3></div>
          <p className="text-3xl font-black">{monto(efectivo.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),"text-foreground")}</p>
          <p className="text-foreground/60 font-medium text-sm mt-2">{revenue>0?((efectivo/revenue)*100).toFixed(1):0}% del total</p>
        </div>
        <div className="bg-surface rounded-xl p-6 border border-primary/30 shadow-sm">
          <div className="flex items-center gap-3 mb-4 text-primary"><CreditCard size={20}/><h3 className="text-foreground/80 font-bold">Virtual</h3></div>
          <p className="text-3xl font-black">{monto(virtual.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),"text-primary")}</p>
          <p className="text-primary/60 font-medium text-sm mt-2">Tarjetas, transferencias y QR</p>
        </div>
        <div className="bg-surface rounded-xl p-6 border border-foreground/15 shadow-sm">
          <div className="flex items-center gap-3 mb-4 text-foreground"><RefreshCw size={20}/><h3 className="text-foreground/80 font-bold">Gasto de Restock</h3></div>
          <p className="text-3xl font-black">{monto(restockCost.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),"text-foreground")}</p>
          <p className="text-foreground/60 font-medium text-sm mt-2">Costo para reponer lo vendido</p>
        </div>
        <div className="bg-surface rounded-xl p-6 border border-success/30 shadow-sm">
          <div className="flex items-center gap-3 mb-4 text-success"><Wallet size={20}/><h3 className="text-foreground/80 font-bold">Caja final del día</h3></div>
          <p className="text-3xl font-black">{monto(cajaFinalDelDia.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),"text-success")}</p>
          <p className="text-foreground/60 font-medium text-sm mt-2">
            {hayCajaHoy
              ? `Fondo $${fondoInicialCaja.toFixed(2)} + ventas $${efectivoVentasCaja.toFixed(2)}${extraccionesEfectivoCaja>0?` − $${extraccionesEfectivoCaja.toFixed(2)}`:""}` 
              : "Abrí la caja para ver el total"}
          </p>
        </div>
      </div>

      {/* Balance Financiero */}
      <h2 className="text-primary font-bold text-2xl mb-6 mt-4">Balance Financiero</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
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
        <div className={`rounded-xl p-6 border flex flex-col shadow-sm ${balanceNeto>=0?"bg-surface border-success/30":"bg-surface border-red-400/30"}`}>
          <div className={`flex items-center gap-3 mb-2 ${balanceNeto>=0?"text-success":"text-foreground"}`}>
            <Wallet size={20}/><h3 className="font-bold">Balance Neto</h3>
          </div>
          <p className="text-3xl font-black">
            <span className={balanceNeto>=0?"text-success":"text-foreground"}>{balanceNeto>=0?"+":"-"}${Math.abs(balanceNeto).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
          </p>
          <p className={`text-sm mt-1 mb-4 font-bold ${balanceNeto>=0?"text-success/70":"text-foreground/70"}`}>
            Rentabilidad: {margenPorcentaje.toFixed(1)}%
          </p>
          <div className={`border-t pt-4 mt-auto space-y-2 ${balanceNeto>=0?"border-success/20":"border-primary/20"}`}>
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

      {showExpenseModal && (
        <DailyExpenseModal
          onClose={() => setShowExpenseModal(false)}
          onSubmit={handleDailyExpense}
        />
      )}

      {/* Movimientos */}
      <div className="mb-12">
        <div className="bg-surface rounded-xl border border-foreground/15 p-6 flex flex-col shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <Clock className="text-foreground" size={24}/>
            <h2 className="text-primary text-xl font-bold">Historial de Movimientos</h2>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[300px] pr-2 space-y-3 custom-scrollbar">
            {activityLog.length === 0 ? (
              <p className="text-foreground/60 font-medium text-sm">No hay movimientos registrados</p>
            ) : activityLog.map((log) => {
              const Icon = LOG_ICONS[log.icon] || Clock;
              return (
                <div key={log.id} className="bg-background rounded-lg p-3 border border-foreground/15 shadow-sm flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${log.bg} ${log.color} shrink-0 mt-0.5`}><Icon size={16}/></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground text-sm font-bold">{log.type}</p>
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
    </div>
  );
}
