import { useState, useEffect, Fragment } from "react";
import { Lock, Calendar, Clock, Unlock, Eye, EyeOff, Banknote, Calculator, FileText, CheckCircle2, TrendingUp, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import api from "../../services/api.js";
import { Loader } from "./Loader.jsx";
import { ACCOUNT_METHOD_NAME } from "../constants.js";
import { ClosureModal } from "./ClosureModal.jsx";
import { OpenCajaModal } from "./OpenCajaModal.jsx";

export function CajaView({ role = "admin", isCajaOpen, register, onOpenCaja, onCloseCaja, transactions, onRefresh, suggestedInitialCash = 0 }) {
  const [showClosureModal, setShowClosureModal] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cajasCerradas, setCajasCerradas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [gastosEfectivo, setGastosEfectivo] = useState(0);
  const [cobrosCuenta, setCobrosCuenta] = useState([]);
  const [showIngresos, setShowIngresos] = useState(false);

  useEffect(() => {
    if (role === "admin") {
      setLoading(true);
      api.get("/cash-register/closed")
        .then((r) => setCajasCerradas(r.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [role, isCajaOpen]);

  useEffect(() => {
    if (isCajaOpen && register?.id) {
      api.get("/daily-expenses")
        .then((r) => {
          const total = r.data
            .filter((g) => g.registerId === register.id && g.method === "efectivo")
            .reduce((sum, g) => sum + Number(g.amount), 0);
          setGastosEfectivo(total);
        })
        .catch(() => setGastosEfectivo(0));

      api.get(`/customers/payments/register/${register.id}`)
        .then((r) => setCobrosCuenta(r.data))
        .catch(() => setCobrosCuenta([]));
    } else {
      setGastosEfectivo(0);
      setCobrosCuenta([]);
    }
  }, [isCajaOpen, register?.id, transactions]);

  const isAccount = (method) => String(method || "").trim().toLowerCase() === ACCOUNT_METHOD_NAME.toLowerCase();
  const isCash = (method) => String(method || "").toLowerCase().includes("efectivo");

  const totalIngresos = transactions.reduce((sum, t) => sum + t.total, 0);

  // El fiado no ingresa plata; los cobros de deudas previas sí
  const cobrosCuentaEfectivo = cobrosCuenta
    .filter((c) => isCash(c.methodName))
    .reduce((sum, c) => sum + Number(c.amount), 0);
  const cobrosCuentaVirtual = cobrosCuenta
    .filter((c) => !isCash(c.methodName))
    .reduce((sum, c) => sum + Number(c.amount), 0);

  const totalFiado = transactions.reduce((sum, t) =>
    sum + t.payments.filter((p) => isAccount(p.type)).reduce((s, p) => s + p.amount, 0), 0
  );
  const totalEfectivo = transactions.reduce((sum, t) =>
    sum + t.payments.filter((p) => !isAccount(p.type) && isCash(p.type)).reduce((s, p) => s + p.amount, 0), 0
  ) + cobrosCuentaEfectivo;
  const totalTransferencia = transactions.reduce((sum, t) =>
    sum + t.payments.filter((p) => !isAccount(p.type) && !isCash(p.type)).reduce((s, p) => s + p.amount, 0), 0
  ) + cobrosCuentaVirtual;

  const handleCloseCaja = async (closureData) => {
    try {
      await onCloseCaja(closureData);
      setShowClosureModal(false);
      toast.success("Caja cerrada exitosamente con arqueo");
      const r = await api.get("/cash-register/closed");
      setCajasCerradas(r.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Error al cerrar caja");
      throw err;
    }
  };

  const handleConfirmOpen = async (amount) => {
    try {
      await onOpenCaja(amount);
      setShowOpenModal(false);
      toast.success("Caja abierta exitosamente");
    } catch (err) {
      toast.error(err.response?.data?.message || "Error al abrir caja");
      throw err;
    }
  };

  const filteredCajas = cajasCerradas.filter((c) => {
    if (!c.closedAt) return false;
    const dateStr = c.closedAt.slice(0, 10);
    if (dateFrom && dateStr < dateFrom) return false;
    if (dateTo && dateStr > dateTo) return false;
    return true;
  });

  const initialCash = register?.initialCash || 0;
  const efectivoFinalDia = initialCash + totalEfectivo - gastosEfectivo;

  return (
    <div className="flex-1 p-4 pb-20 md:p-8 overflow-y-auto relative">
      {loading && <Loader />}
      {role === "cajero" && !isCajaOpen && (
        <div className="absolute inset-0 z-50 backdrop-blur-md bg-background/60 flex items-center justify-center">
          <div className="bg-surface p-8 rounded-2xl border border-foreground/15 text-center max-w-md shadow-2xl">
            <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4"><Lock size={32} /></div>
            <h2 className="text-primary text-2xl font-bold mb-2">Caja Cerrada</h2>
            <p className="text-foreground/80 font-medium">Pedile al administrador que abra la caja.</p>
          </div>
        </div>
      )}

      <div className="mb-6 md:mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-foreground font-bold text-2xl md:text-4xl mb-2 flex flex-wrap items-center gap-3 md:gap-4">
            Control de Caja
            {isCajaOpen ? (
              <span className="text-sm bg-success/20 text-success px-3 py-1 rounded-full flex items-center gap-2 font-bold shadow-sm">
                <div className="w-2 h-2 rounded-full bg-success/100"></div> Abierta
              </span>
            ) : (
              <span className="text-sm bg-red-500/20 text-red-700 px-3 py-1 rounded-full flex items-center gap-2 font-bold shadow-sm">
                <div className="w-2 h-2 rounded-full bg-red-500"></div> Cerrada
              </span>
            )}
          </h1>
          <p className="text-foreground/80 font-medium">{isCajaOpen ? "Resumen en vivo de la caja actual" : "Resumen financiero del día"}</p>
        </div>
      </div>

      {isCajaOpen && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-surface p-4 rounded-xl border border-foreground/15 shadow-sm">
              <p className="text-foreground/80 font-medium text-sm mb-1">Fondo Inicial</p>
              <p className="text-foreground font-black text-lg md:text-xl">${initialCash.toFixed(2)}</p>
            </div>
            <div className="bg-surface p-4 rounded-xl border border-foreground/15 shadow-sm">
              <p className="text-foreground/80 font-medium text-sm mb-1">Efectivo Cobrado</p>
              <p className="text-success font-black text-lg md:text-xl">${totalEfectivo.toFixed(2)}</p>
            </div>
            <div className="bg-surface p-4 rounded-xl border border-primary/30 shadow-sm">
              <p className="text-primary/80 font-medium text-sm mb-1">Virtual / Otros</p>
              <p className="text-primary font-black text-lg md:text-xl">${totalTransferencia.toFixed(2)}</p>
            </div>
            <div className="bg-surface p-4 rounded-xl border border-foreground/15 shadow-sm">
              <p className="text-foreground/80 font-medium text-sm mb-1">Ventas Totales</p>
              <p className="text-foreground font-black text-lg md:text-xl">${totalIngresos.toFixed(2)}</p>
            </div>
            {totalFiado > 0 && (
              <div className="bg-surface p-4 rounded-xl border border-secondary/30 shadow-sm">
                <p className="text-foreground/80 font-medium text-sm mb-1">Fiado (no entra a caja)</p>
                <p className="text-secondary font-black text-lg md:text-xl">${totalFiado.toFixed(2)}</p>
              </div>
            )}
            {cobrosCuenta.length > 0 && (
              <div className="bg-surface p-4 rounded-xl border border-success/30 shadow-sm">
                <p className="text-foreground/80 font-medium text-sm mb-1">Cobros de cuentas</p>
                <p className="text-success font-black text-lg md:text-xl">
                  ${(cobrosCuentaEfectivo + cobrosCuentaVirtual).toFixed(2)}
                </p>
              </div>
            )}
          </div>

          {/* Tarjeta: Efectivo total para cierre */}
          <div className="mb-8 bg-gradient-to-r from-primary/10 to-success/10 border-2 border-primary/30 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                <Banknote size={24} className="text-foreground" />
              </div>
              <div>
                <p className="text-foreground font-bold text-base">Efectivo esperado en caja al cierre del día</p>
                <p className="text-foreground/60 text-xs font-medium mt-0.5">
                  Fondo inicial ${initialCash.toFixed(2)} + cobrado ${totalEfectivo.toFixed(2)}
                  {gastosEfectivo > 0 && ` − gastos $${gastosEfectivo.toFixed(2)}`}
                </p>
              </div>
            </div>
            <div className="text-right sm:text-right">
              <p className="text-foreground font-black text-3xl md:text-4xl">${efectivoFinalDia.toFixed(2)}</p>
              <p className="text-foreground/50 text-xs font-medium mt-0.5">deberías tener en caja</p>
            </div>
          </div>
        </>
      )}

      {role === "admin" ? (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
            <div className="flex flex-col gap-2 w-full sm:w-auto">
              <h2 className="text-primary font-bold text-lg md:text-2xl">Historial de Cajas Cerradas</h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-foreground/70 font-bold text-sm whitespace-nowrap">Desde</span>
                  <input
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="bg-surface text-foreground font-medium rounded-lg px-3 py-2 border border-foreground/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm cursor-pointer transition-all shadow-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-foreground/70 font-bold text-sm whitespace-nowrap">Hasta</span>
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="bg-surface text-foreground font-medium rounded-lg px-3 py-2 border border-foreground/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm cursor-pointer transition-all shadow-sm"
                  />
                </div>
                {(dateFrom || dateTo) && (
                  <button
                    onClick={() => { setDateFrom(""); setDateTo(""); }}
                    className="text-foreground/60 hover:text-foreground text-xs font-bold underline transition-colors"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>
            {isCajaOpen ? (
              <button onClick={() => setShowClosureModal(true)} className="bg-secondary hover:brightness-125 text-foreground font-bold px-4 md:px-6 py-2.5 md:py-3 rounded-xl flex items-center gap-2 transition-all text-sm md:text-base self-start sm:self-auto shadow-md">
                <Lock size={18} /> Cerrar Caja
              </button>
            ) : (
              <button onClick={() => setShowOpenModal(true)} className="bg-success hover:brightness-125 text-foreground font-bold px-4 md:px-6 py-2.5 md:py-3 rounded-xl flex items-center gap-2 transition-all text-sm md:text-base self-start sm:self-auto shadow-md">
                <Unlock size={18} /> Abrir Caja
              </button>
            )}
          </div>

          <div className="bg-surface rounded-xl overflow-hidden border border-foreground/15 shadow-sm">
            <table className="w-full">
              <thead>
                <tr className="border-b border-foreground/15">
                  <th className="text-left text-foreground/80 font-bold p-4">Fecha</th>
                  <th className="text-left text-foreground/80 font-bold p-4">Hora Cierre</th>
                  <th className="text-left text-foreground/80 font-bold p-4">
                    <div className="flex items-center gap-2">
                      Total Ingresos
                      <button onClick={() => setShowIngresos((v) => !v)} title={showIngresos ? "Ocultar" : "Mostrar"} className="text-foreground/40 hover:text-foreground transition-colors">
                        {showIngresos ? <Eye size={15} /> : <EyeOff size={15} />}
                      </button>
                    </div>
                  </th>
                  <th className="text-right text-foreground/80 font-bold p-4">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredCajas.length > 0 ? (
                  filteredCajas.map((caja) => (
                    <Fragment key={caja.id}>
                      <tr className={`border-b border-foreground/15 hover:bg-background/50 transition-colors ${expandedId === caja.id ? "bg-background/50" : ""}`}>
                        <td className="p-4"><div className="flex items-center gap-2 text-foreground font-bold"><Calendar size={16} className="text-foreground/60" />{caja.closedAt?.split(" ")[0] || "-"}</div></td>
                        <td className="p-4"><div className="flex items-center gap-2 text-foreground font-bold"><Clock size={16} className="text-foreground/60" />{caja.closedAt ? new Date(caja.closedAt.replace(" ", "T")).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "-"}</div></td>
                        <td className="p-4">
                          {showIngresos
                            ? <span className="text-foreground font-black">${Number(caja.totalIngresos || 0).toFixed(2)}</span>
                            : <span className="text-foreground/30 font-black tracking-widest select-none">••••</span>}
                        </td>
                        <td className="p-4 text-right">
                          <button onClick={() => setExpandedId(expandedId === caja.id ? null : caja.id)} className="text-primary hover:text-secondary transition-colors p-2"><Eye size={20} /></button>
                        </td>
                      </tr>
                      {expandedId === caja.id && (
                        <tr className="border-b border-foreground/15 bg-background">
                          <td colSpan={4} className="p-6">
                            <h4 className="text-primary font-bold mb-4">Detalle de Caja Cerrada</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                              {[
                                { label: "Fondo Inicial", value: `$${Number(caja.initialCash || 0).toFixed(2)}`, color: "text-foreground" },
                                { label: "Efectivo de Ventas", value: `$${Number(caja.totalEfectivo || 0).toFixed(2)}`, color: "text-success" },
                                { label: "Transferencias / Otros", value: `$${Number(caja.totalTransferencia || 0).toFixed(2)}`, color: "text-primary" },
                                { label: "Total Operaciones", value: caja.transactionsCount, color: "text-foreground" },
                                ...(caja.totalCuentaCorriente > 0
                                  ? [{ label: "Fiado (no entra a caja)", value: `$${Number(caja.totalCuentaCorriente).toFixed(2)}`, color: "text-secondary" }]
                                  : []),
                                ...(caja.totalCobrosCuenta > 0
                                  ? [{ label: "Cobros de cuentas", value: `$${Number(caja.totalCobrosCuenta).toFixed(2)}`, color: "text-success" }]
                                  : []),
                              ].map(({ label, value, color }) => (
                                <div key={label} className="bg-surface p-4 rounded-lg border border-foreground/15 shadow-sm">
                                  <p className="text-foreground/80 font-medium text-sm mb-1">{label}</p>
                                  <p className={`${color} font-black text-lg`}>{value}</p>
                                </div>
                              ))}
                            </div>

                            {/* Arqueo al cierre */}
                            {caja.expectedCash !== null && caja.expectedCash !== undefined && (
                              <div className="mt-6 bg-surface p-5 rounded-xl border border-foreground/15 shadow-sm space-y-4">
                                <h5 className="text-primary font-bold text-base flex items-center gap-2">
                                  <Calculator size={20} /> Resultante del Arqueo de Caja
                                </h5>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  <div className="bg-background p-4 rounded-lg border border-foreground/15">
                                    <p className="text-foreground/70 text-xs font-medium mb-1">Efectivo Esperado</p>
                                    <p className="text-primary font-black text-lg">${Number(caja.expectedCash).toFixed(2)}</p>
                                  </div>
                                  <div className="bg-background p-4 rounded-lg border border-foreground/15">
                                    <p className="text-foreground/70 text-xs font-medium mb-1">Efectivo Contado</p>
                                    <p className="text-foreground font-black text-lg">${Number(caja.countedCash ?? 0).toFixed(2)}</p>
                                  </div>
                                  <div className="bg-background p-4 rounded-lg border border-foreground/15">
                                    <p className="text-foreground/70 text-xs font-medium mb-1">Diferencia</p>
                                    {Math.abs(Number(caja.cashDifference || 0)) < 0.001 ? (
                                      <span className="text-success font-black text-lg flex items-center gap-1">
                                        <CheckCircle2 size={16} /> Caja correcta
                                      </span>
                                    ) : Number(caja.cashDifference) > 0 ? (
                                      <span className="text-blue-400 font-black text-lg flex items-center gap-1">
                                        <TrendingUp size={16} /> Sobrante (+${Number(caja.cashDifference).toFixed(2)})
                                      </span>
                                    ) : (
                                      <span className="text-red-500 font-black text-lg flex items-center gap-1">
                                        <AlertTriangle size={16} /> Faltante (-${Math.abs(Number(caja.cashDifference)).toFixed(2)})
                                      </span>
                                    )}
                                  </div>
                                  <div className="bg-background p-4 rounded-lg border border-foreground/15">
                                    <p className="text-foreground/70 text-xs font-medium mb-1">Fondo Próxima Apertura</p>
                                    <p className="text-foreground font-black text-lg">${Number(caja.nextInitialCash ?? caja.countedCash ?? 0).toFixed(2)}</p>
                                  </div>
                                </div>
                                {caja.arqueoNotes && (
                                  <div className="bg-background p-3.5 rounded-lg border border-foreground/15 text-sm">
                                    <span className="font-bold text-foreground flex items-center gap-1.5 mb-1">
                                      <FileText size={16} className="text-primary" /> Observaciones del arqueo:
                                    </span>
                                    <p className="text-foreground/80 font-medium italic">{caja.arqueoNotes}</p>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Desglose de recargos */}
                             {caja.surchargeBreakdown && caja.surchargeBreakdown.length > 0 && (
                               <div className="mt-4 bg-primary/20 border border-primary/40 rounded-lg p-4 shadow-sm">
                                <p className="text-foreground font-bold mb-2">Recargos aplicados</p>
                                <div className="space-y-1">
                                  {caja.surchargeBreakdown.map((s, idx) => (
                                    <div key={idx} className="flex justify-between text-sm">
                                      <span className="text-foreground font-medium">{s.method}</span>
                                      <span className="text-foreground font-bold">+${Number(s.amount).toFixed(2)}</span>
                                    </div>
                                  ))}
                                  <div className="flex justify-between text-sm pt-2 border-t border-primary/40 mt-2">
                                    <span className="text-foreground font-bold">Total recargos cobrados</span>
                                    <span className="text-foreground font-black">+${Number(caja.totalSurcharges || 0).toFixed(2)}</span>
                                  </div>
                                </div>
                               </div>
                             )}

                            {caja.transactions && caja.transactions.length > 0 && (
                              <div className="mt-6">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                  <h5 className="text-primary font-bold">Ventas realizadas</h5>
                                  <span className="bg-primary/15 text-primary px-2.5 py-1 rounded-full text-xs font-bold">
                                    {caja.transactions.length} {caja.transactions.length === 1 ? "venta" : "ventas"}
                                  </span>
                                </div>
                                <div className="space-y-3">
                                  {caja.transactions.map((transaction, transactionIndex) => (
                                    <article key={transaction.id} className="bg-surface rounded-xl border border-foreground/15 overflow-hidden shadow-sm">
                                      <div className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-foreground/15 bg-background/40">
                                        <div>
                                          <p className="text-foreground font-bold">
                                            Venta #{transaction.id || transactionIndex + 1}
                                          </p>
                                          <p className="text-foreground/60 text-xs font-medium">
                                            {[transaction.date, transaction.time].filter(Boolean).join(" · ") || "Fecha no disponible"}
                                          </p>
                                        </div>
                                        <p className="text-foreground font-black text-lg">
                                          ${Number(transaction.total || 0).toFixed(2)}
                                        </p>
                                      </div>

                                      <div className="p-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.45fr)]">
                                        <div>
                                          <p className="text-foreground/70 font-bold text-xs uppercase tracking-wide mb-2">Productos vendidos</p>
                                          <div className="rounded-lg border border-foreground/15 overflow-hidden">
                                            {transaction.items?.map((item, itemIndex) => (
                                              <div key={`${transaction.id}-${itemIndex}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 p-3 border-b border-foreground/15 last:border-b-0">
                                                <div className="min-w-0">
                                                  <p className="text-foreground font-bold text-sm whitespace-normal break-words">{item.productName}</p>
                                                  <p className="text-foreground/60 text-xs font-medium mt-0.5">
                                                    {item.quantity} u. × ${Number(item.price || 0).toFixed(2)}
                                                  </p>
                                                </div>
                                                <span className="text-foreground font-bold text-sm whitespace-nowrap self-center">${Number(item.total || 0).toFixed(2)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>

                                        <div>
                                          <p className="text-foreground/70 font-bold text-xs uppercase tracking-wide mb-2">Medios de pago</p>
                                          <div className="space-y-2">
                                            {transaction.payments?.map((payment, paymentIndex) => (
                                              <div key={`${transaction.id}-payment-${paymentIndex}`} className="flex items-center justify-between gap-3 bg-background rounded-lg border border-foreground/15 px-3 py-2.5">
                                                <span className="text-foreground/80 font-medium text-sm break-words">{payment.methodName}</span>
                                                <span className="text-foreground font-bold text-sm whitespace-nowrap">${Number(payment.amount || 0).toFixed(2)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    </article>
                                  ))}
                                </div>
                              </div>
                            )}

                            {caja.soldItems && caja.soldItems.length > 0 && (
                              <div className="mt-6">
                                <div className="flex items-center justify-between mb-3">
                                  <h5 className="text-primary font-bold">Productos Vendidos</h5>
                                  {caja.totalSurcharges > 0 && (
                                    <span className="text-xs text-foreground/60 italic font-medium">Los totales son precio base sin recargo</span>
                                  )}
                                </div>
                                <div className="bg-surface rounded-lg border border-foreground/15 overflow-hidden shadow-sm">
                                  <table className="w-full text-sm">
                                    <thead className="bg-surface/30">
                                      <tr>
                                        <th className="text-left text-foreground/80 font-bold p-3">Producto</th>
                                        <th className="text-center text-foreground/80 font-bold p-3">Cantidad</th>
                                        <th className="text-right text-foreground/80 font-bold p-3">Subtotal (base)</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {caja.soldItems.map((item, idx) => (
                                        <tr key={idx} className="border-t border-foreground/15/50">
                                          <td className="p-3 text-foreground font-bold">{item.name}</td>
                                          <td className="p-3 text-center text-foreground/80 font-medium">{item.quantity}</td>
                                          <td className="p-3 text-right text-foreground font-bold">${Number(item.total).toFixed(2)}</td>
                                        </tr>
                                      ))}
                                      {/* Fila de subtotal base */}
                                      <tr className="border-t border-primary/20 bg-background">
                                        <td className="p-3 text-foreground/80 font-bold" colSpan={2}>Subtotal productos</td>
                                        <td className="p-3 text-right text-foreground font-black">
                                          ${caja.soldItems.reduce((s, i) => s + Number(i.total), 0).toFixed(2)}
                                        </td>
                                      </tr>
                                      {caja.totalSurcharges > 0 && (
                                        <tr className="bg-background">
                                          <td className="p-3 text-primary font-bold" colSpan={2}>Recargos cobrados</td>
                                          <td className="p-3 text-right text-primary font-black">+${Number(caja.totalSurcharges).toFixed(2)}</td>
                                        </tr>
                                      )}
                                      <tr className="bg-background">
                                        <td className="p-3 text-foreground font-black text-base" colSpan={2}>Total Ingresos del Día</td>
                                        <td className="p-3 text-right text-foreground font-black text-base">${Number(caja.totalIngresos || 0).toFixed(2)}</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                ) : (
                  <tr><td colSpan={4} className="p-8 text-center text-foreground/60 font-medium">No se encontraron cajas cerradas.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-primary font-bold text-2xl">Movimientos de Caja Actual</h2>
          </div>
          <div className="bg-surface rounded-xl overflow-hidden border border-foreground/15 shadow-sm">
            <table className="w-full">
              <thead>
                <tr className="border-b border-foreground/15">
                  <th className="text-left text-foreground/80 font-bold p-4">Hora</th>
                  <th className="text-left text-foreground/80 font-bold p-4">Método de Pago</th>
                  <th className="text-right text-foreground/80 font-bold p-4">Total</th>
                  <th className="text-right text-foreground/80 font-bold p-4">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {isCajaOpen && transactions.length > 0 ? (
                  transactions.map((t) => (
                    <Fragment key={t.id}>
                      <tr className={`border-b border-foreground/15 hover:bg-background/50 transition-colors ${expandedId === t.id ? "bg-background/50" : ""}`}>
                        <td className="p-4"><div className="flex items-center gap-2 text-foreground font-bold"><Clock size={16} className="text-foreground/60" />{t.time}</div></td>
                        <td className="p-4">
                          <div className="flex gap-2 flex-wrap">
                            {t.payments.map((payment, idx) => {
                              const isEfectivo = payment.type.toLowerCase().includes("efectivo");
                              const hasSurcharge = payment.surchargePercent > 0;
                              return (
                                <span key={idx} className={`px-3 py-1 rounded-full text-sm font-bold shadow-sm flex items-center gap-1 ${isEfectivo ? "bg-success/20 text-success" : "bg-primary/20 text-primary"}`}>
                                  {payment.type}: ${Number(payment.amount).toFixed(2)}
                                  {hasSurcharge && (
                                    <span className="text-foreground text-xs opacity-80">(+{payment.surchargePercent}%)</span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="p-4 text-right text-foreground font-black">${Number(t.total).toFixed(2)}</td>
                        <td className="p-4 text-right">
                          <button onClick={() => setExpandedId(expandedId === t.id ? null : t.id)} className="text-primary hover:text-secondary transition-colors p-2"><Eye size={20} /></button>
                        </td>
                      </tr>
                      {expandedId === t.id && t.items && (
                        <tr className="border-b border-foreground/15 bg-background">
                          <td colSpan={4} className="p-6">
                            <div className="bg-surface rounded-lg border border-foreground/15 overflow-hidden shadow-sm">
                              <table className="w-full text-sm">
                                <thead className="bg-surface/30"><tr><th className="text-left text-foreground/80 font-bold p-3">Producto</th><th className="text-center text-foreground/80 font-bold p-3">Cant.</th><th className="text-right text-foreground/80 font-bold p-3">Total</th></tr></thead>
                                <tbody>
                                  {t.items.map((item, idx) => (
                                    <tr key={idx} className="border-t border-foreground/15/50">
                                      <td className="p-3 text-foreground font-bold">{item.name}</td>
                                      <td className="p-3 text-center text-foreground/80 font-medium">{item.quantity}</td>
                                      <td className="p-3 text-right text-foreground font-bold">${Number(item.total).toFixed(2)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                ) : (
                  <tr><td colSpan={3} className="p-8 text-center text-foreground/60 font-medium">{isCajaOpen ? "Aún no hay movimientos." : "La caja está cerrada."}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ClosureModal
        isOpen={showClosureModal}
        onClose={() => setShowClosureModal(false)}
        onConfirm={handleCloseCaja}
        initialCash={initialCash}
        cashSales={totalEfectivo}
        cashExpenses={gastosEfectivo}
        otherPayments={totalTransferencia}
        totalSales={totalIngresos}
      />

      <OpenCajaModal
        isOpen={showOpenModal}
        onClose={() => setShowOpenModal(false)}
        onConfirm={handleConfirmOpen}
        suggestedAmount={suggestedInitialCash}
      />
    </div>
  );
}

