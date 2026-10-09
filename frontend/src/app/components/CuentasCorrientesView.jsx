import { useState, useEffect, useCallback } from "react";
import {
  Search,
  NotebookPen,
  ArrowLeft,
  Phone,
  IdCard,
  HandCoins,
  X,
  ShoppingBag,
  Banknote,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import api from "../../services/api.js";
import { Loader } from "./Loader.jsx";

function formatDateTime(value) {
  if (!value) return "-";
  const dt = new Date(String(value).replace(" ", "T"));
  if (isNaN(dt.getTime())) return value;
  return dt.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function CuentasCorrientesView() {
  const [customers, setCustomers] = useState([]);
  const [activeTab, setActiveTab] = useState("clients");
  const [movements, setMovements] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [paymentRequestId, setPaymentRequestId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentModal, setPaymentModal] = useState(null); // { amount, methodName }
  const [submitting, setSubmitting] = useState(false);
  const [newCustomerModal, setNewCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", document: "", initialDebt: "" });

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/customers");
      setCustomers(data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Error al cargar los clientes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
    api.get("/payment-methods")
      .then((r) => setPaymentMethods(r.data))
      .catch(() => setPaymentMethods([]));
  }, [fetchCustomers]);

  useEffect(() => {
    if (activeTab !== "movements") return;
    api.get("/customers/movements").then((response) => setMovements(response.data)).catch(() => toast.error("Error al cargar movimientos"));
  }, [activeTab]);

  const fetchDetail = useCallback(async (id) => {
    setLoadingDetail(true);
    try {
      const { data } = await api.get(`/customers/${id}`);
      setDetail(data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Error al cargar la cuenta");
      setSelectedId(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId);
    else setDetail(null);
  }, [selectedId, fetchDetail]);

  const term = search.trim().toLowerCase();
  const filtered = customers.filter((c) =>
    !term ||
    `${c.name} ${c.lastName}`.toLowerCase().includes(term) ||
    String(c.document).includes(term)
  );

  const totalDeuda = customers.reduce((sum, c) => sum + Number(c.debt || 0), 0);
  const deudores = customers.filter((c) => Number(c.debt || 0) > 0).length;

  const openPaymentModal = () => {
    setPaymentModal({
      amount: String(detail.debt.toFixed(2)),
      methodName: paymentMethods[0]?.name || "",
      description: "",
    });
  };

  useEffect(() => {
    if (detail && paymentRequestId === detail.id && detail.debt > 0) {
      openPaymentModal();
      setPaymentRequestId(null);
    }
  }, [detail, paymentRequestId]);

  const handleRegisterPayment = async () => {
    if (submitting || !paymentModal) return;
    const amount = Number(paymentModal.amount);
    if (!amount || amount <= 0) {
      toast.error("El monto debe ser mayor a cero");
      return;
    }
    if (amount > detail.debt + 0.009) {
      toast.error("El pago no puede superar la deuda actual");
      return;
    }
    if (!paymentModal.methodName) {
      toast.error("Elegí un método de pago");
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/customers/${detail.id}/payments`, {
        amount,
        methodName: paymentModal.methodName,
        description: paymentModal.description,
      });
      toast.success("Pago registrado correctamente");
      setPaymentModal(null);
      await Promise.all([fetchDetail(detail.id), fetchCustomers()]);
    } catch (err) {
      toast.error(err.response?.data?.message || "No se pudo registrar el pago");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateCustomer = async () => {
    const initialDebt = Number(newCustomer.initialDebt);
    if (submitting || !newCustomer.name.trim() || !newCustomer.document.trim() || newCustomer.initialDebt === "") return toast.error("Completá nombre, DNI y deuda inicial");
    if (!Number.isFinite(initialDebt) || initialDebt < 0) return toast.error("La deuda inicial no puede ser negativa");
    setSubmitting(true);
    try {
      await api.post("/customers", { name: newCustomer.name, document: newCustomer.document, initialDebt });
      toast.success("Cliente registrado correctamente"); setNewCustomerModal(false); setNewCustomer({ name: "", document: "", initialDebt: "" }); await fetchCustomers();
    } catch (err) { toast.error(err.response?.data?.message || "No se pudo registrar el cliente"); }
    finally { setSubmitting(false); }
  };

  // ─── Detalle de un cliente ──────────────────────────────────────────────────
  if (selectedId) {
    return (
      <div className="flex-1 p-4 pb-20 md:p-8 overflow-y-auto relative">
        {loadingDetail && <Loader />}

        <button
          onClick={() => setSelectedId(null)}
          className="text-foreground/70 hover:text-foreground font-bold text-sm flex items-center gap-2 mb-4 transition-colors"
        >
          <ArrowLeft size={18} /> Volver al listado
        </button>

        {detail && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
              <div>
                <h1 className="text-foreground font-bold text-2xl md:text-4xl mb-2">
                  {detail.name} {detail.lastName}
                </h1>
                <div className="flex flex-wrap gap-4 text-foreground/70 font-medium text-sm">
                  <span className="flex items-center gap-1.5"><IdCard size={16} /> DNI {detail.document}</span>
                  {detail.phone && <span className="flex items-center gap-1.5"><Phone size={16} /> {detail.phone}</span>}
                </div>
              </div>
              <button
                onClick={openPaymentModal}
                disabled={detail.debt <= 0}
                className="bg-success hover:brightness-125 disabled:bg-surface disabled:text-foreground/40 text-foreground font-bold px-5 py-3 rounded-xl flex items-center gap-2 transition-all shadow-md self-start"
              >
                <HandCoins size={18} /> Registrar pago
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className="bg-surface p-4 rounded-xl border border-foreground/15 shadow-sm">
                <p className="text-foreground/80 font-medium text-sm mb-1">Deuda actual</p>
                <p className={`font-black text-2xl ${detail.debt > 0 ? "text-secondary" : "text-success"}`}>
                  ${detail.debt.toFixed(2)}
                </p>
              </div>
              <div className="bg-surface p-4 rounded-xl border border-foreground/15 shadow-sm">
                <p className="text-foreground/80 font-medium text-sm mb-1">Total fiado</p>
                <p className="text-foreground font-black text-2xl">${detail.totalCharges.toFixed(2)}</p>
              </div>
              <div className="bg-surface p-4 rounded-xl border border-foreground/15 shadow-sm">
                <p className="text-foreground/80 font-medium text-sm mb-1">Total pagado</p>
                <p className="text-success font-black text-2xl">${detail.totalPayments.toFixed(2)}</p>
              </div>
            </div>

            <h2 className="text-primary font-bold text-xl mb-4">Historial de movimientos</h2>

            {detail.movements.length === 0 ? (
              <p className="text-foreground/60 font-medium py-8 text-center">
                Este cliente todavía no tiene movimientos.
              </p>
            ) : (
              <div className="space-y-3">
                {detail.movements.map((movement) => {
                  const isCharge = movement.type === "cargo";
                  return (
                    <div
                      key={movement.id}
                      className={`rounded-xl p-4 border shadow-sm ${
                        isCharge
                          ? "bg-surface border-foreground/15"
                          : "bg-success/10 border-success/30"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isCharge ? "bg-background text-secondary" : "bg-background text-success"}`}>
                            {isCharge ? <ShoppingBag size={18} /> : <Banknote size={18} />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-foreground font-bold">
                              {isCharge ? "Compra fiada" : `Pago en ${movement.methodName}`}
                              {isCharge && movement.transactionId && (
                                <span className="text-foreground/60 font-medium"> · Ticket #{movement.transactionId}</span>
                              )}
                            </p>
                            <p className="text-foreground/70 font-medium text-sm">{formatDateTime(movement.createdAt)}</p>
                          </div>
                        </div>
                        <span className={`font-black text-lg shrink-0 ${isCharge ? "text-secondary" : "text-success"}`}>
                          {isCharge ? "+" : "-"}${Number(movement.amount).toFixed(2)}
                        </span>
                      </div>

                      {isCharge && movement.items.length > 0 && (
                        <ul className="space-y-1 mt-2 border-t border-foreground/10 pt-2">
                          {movement.items.map((item, idx) => (
                            <li key={idx} className="flex items-center justify-between text-sm">
                              <span className="text-foreground/80 font-medium">
                                {item.quantity}x {item.name}
                              </span>
                              <span className="text-foreground/70 font-bold">
                                ${Number(item.total).toFixed(2)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {paymentModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-background rounded-2xl w-full max-w-md border border-surface shadow-2xl">
              <div className="p-6 border-b border-surface flex items-center justify-between">
                <h2 className="text-primary font-bold text-xl flex items-center gap-2">
                  <HandCoins size={22} /> Registrar pago
                </h2>
                <button onClick={() => setPaymentModal(null)} className="text-foreground/60 hover:text-foreground transition-colors">
                  <X size={22} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="bg-surface rounded-xl px-4 py-3 flex items-center justify-between border border-foreground/15 shadow-sm">
                  <span className="text-foreground/80 font-medium">Deuda actual:</span>
                  <span className="text-secondary font-black text-xl">${detail.debt.toFixed(2)}</span>
                </div>

                <div>
                  <label className="text-foreground/80 font-bold text-sm block mb-2">Monto a pagar</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/60 font-bold">$</span>
                      <input
                        type="number"
                        value={paymentModal.amount}
                        onChange={(e) => setPaymentModal((prev) => ({ ...prev, amount: e.target.value }))}
                        onFocus={(e) => e.target.select()}
                        className="w-full bg-surface text-foreground font-bold rounded-xl pl-8 pr-4 py-3 border border-foreground/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-sm"
                        step="0.01"
                        min="0"
                      />
                    </div>
                    <button
                      onClick={() => setPaymentModal((prev) => ({ ...prev, amount: String(detail.debt.toFixed(2)) }))}
                      className="bg-secondary hover:brightness-125 text-foreground font-bold px-4 rounded-xl transition-all shadow-sm shrink-0"
                    >
                      Saldar todo
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-foreground/80 font-bold text-sm block mb-2">Método de pago</label>
                  <select
                    value={paymentModal.methodName}
                    onChange={(e) => setPaymentModal((prev) => ({ ...prev, methodName: e.target.value }))}
                    className="w-full bg-surface text-foreground font-bold rounded-xl px-4 py-3 border border-foreground/15 focus:border-primary outline-none shadow-sm"
                  >
                    {paymentMethods.map((m) => (
                      <option key={m.id} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                  <p className="text-foreground/60 font-medium text-xs mt-2">
                    El cobro se suma al arqueo de la caja abierta según el método elegido.
                  </p>
                </div>
                <div><label className="text-foreground/80 font-bold text-sm block mb-2">Descripción (opcional)</label><input value={paymentModal.description || ""} onChange={(e) => setPaymentModal((prev) => ({ ...prev, description: e.target.value }))} className="w-full bg-surface text-foreground font-bold rounded-xl px-4 py-3 border border-foreground/15" placeholder="Ej. Pago parcial" /></div>
              </div>

              <div className="p-6 border-t border-surface flex gap-4">
                <button onClick={() => setPaymentModal(null)} className="flex-1 bg-surface hover:bg-primary/10 text-foreground font-bold py-3 rounded-xl transition-all shadow-sm">
                  Cancelar
                </button>
                <button
                  onClick={handleRegisterPayment}
                  disabled={submitting}
                  className="flex-1 bg-success hover:brightness-125 disabled:bg-surface disabled:text-foreground/50 text-foreground font-bold py-3 rounded-xl transition-all shadow-md"
                >
                  {submitting ? "Registrando..." : "Confirmar pago"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Listado ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 p-4 pb-20 md:p-8 overflow-y-auto relative">
      {loading && <Loader />}

      <div className="mb-6 md:mb-8 flex items-start justify-between gap-4">
        <div><h1 className="text-foreground font-bold text-2xl md:text-4xl mb-1 md:mb-2 flex items-center gap-3">
          <NotebookPen className="text-secondary" size={30} />
          Cuentas Corrientes
        </h1>
        <p className="text-foreground/80 font-medium text-sm">Deudas de clientes, historial y cobros</p>
        </div><button onClick={() => setNewCustomerModal(true)} className="bg-secondary hover:brightness-125 text-foreground font-bold px-4 py-3 rounded-xl flex items-center gap-2 transition-all shadow-md shrink-0"><Plus size={18}/> Nuevo Cliente</button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-surface p-4 rounded-xl border border-foreground/15 shadow-sm">
          <p className="text-foreground/80 font-medium text-sm mb-1">Deuda total</p>
          <p className="text-secondary font-black text-xl md:text-2xl">${totalDeuda.toFixed(2)}</p>
        </div>
        <div className="bg-surface p-4 rounded-xl border border-foreground/15 shadow-sm">
          <p className="text-foreground/80 font-medium text-sm mb-1">Clientes con deuda</p>
          <p className="text-foreground font-black text-xl md:text-2xl">{deudores}</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-foreground/15 mb-6"><button onClick={() => setActiveTab("clients")} className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors ${activeTab === "clients" ? "border-secondary text-foreground" : "border-transparent text-foreground/60 hover:text-foreground"}`}>Clientes registrados</button><button onClick={() => setActiveTab("movements")} className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors ${activeTab === "movements" ? "border-secondary text-foreground" : "border-transparent text-foreground/60 hover:text-foreground"}`}>Historial de movimientos</button></div>

      {activeTab === "movements" ? (
        movements.length === 0 ? <p className="text-foreground/60 font-medium text-center py-12">Todavía no hay movimientos registrados.</p> : <div className="bg-surface rounded-xl overflow-hidden border border-foreground/15 shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[700px]"><thead><tr className="border-b border-foreground/15"><th className="text-left p-4">Fecha</th><th className="text-left p-4">Cliente</th><th className="text-left p-4">Movimiento</th><th className="text-left p-4">Detalle</th><th className="text-right p-4">Monto</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id} className="border-b border-foreground/15 hover:bg-background/50"><td className="p-4 text-sm text-foreground/70">{formatDateTime(movement.createdAt)}</td><td className="p-4 font-bold">{movement.customerName} {movement.customerLastName}<span className="block text-xs text-foreground/60">DNI {movement.document}</span></td><td className="p-4"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${movement.type === "cargo" ? "bg-primary/20 text-primary" : "bg-success/10 text-success"}`}>{movement.type === "cargo" ? "Cargo" : "Cobro"}</span></td><td className="p-4 text-sm text-foreground/70">{movement.type === "pago" ? (movement.detail || movement.methodName || "Cobro") : (movement.transactionId ? `Venta #${movement.transactionId}` : "Deuda inicial")}</td><td className={`p-4 text-right font-black ${movement.type === "cargo" ? "text-secondary" : "text-success"}`}>{movement.type === "cargo" ? "+" : "-"}${Number(movement.amount).toFixed(2)}</td></tr>)}</tbody></table></div></div>
      ) : <>

      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/60" size={20} />
        <input
          type="text"
          placeholder="Buscar por nombre o DNI..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-surface text-foreground placeholder-foreground/60 rounded-xl pl-12 pr-4 py-3 md:py-4 border border-foreground/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all font-medium"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-foreground/60 font-medium text-center py-12">
          {customers.length === 0
            ? "Todavía no hay clientes con cuenta corriente."
            : "No se encontraron clientes con esa búsqueda."}
        </p>
      ) : (
        <div className="bg-surface rounded-xl overflow-hidden border border-foreground/15 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-foreground/15">
                  <th className="text-left text-foreground/80 font-bold p-4">Cliente</th>
                  <th className="text-left text-foreground/80 font-bold p-4">DNI</th><th className="text-right text-foreground/80 font-bold p-4">Deuda actual</th><th className="text-center text-foreground/80 font-bold p-4">Estado</th><th className="text-center text-foreground/80 font-bold p-4">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((customer) => (
                  <tr
                    key={customer.id}
                    onClick={() => setSelectedId(customer.id)}
                    className="border-b border-foreground/15 hover:bg-background/50 transition-colors cursor-pointer"
                  >
                    <td className="p-4 text-foreground font-bold">{customer.name} {customer.lastName}</td>
                    <td className="p-4 text-foreground/80 font-medium">{customer.document}</td>
                    <td className="p-4 text-right">
                      <span className={`font-black ${customer.debt > 0 ? "text-secondary" : "text-success"}`}>
                        ${Number(customer.debt || 0).toFixed(2)}
                      </span>
                    </td>
                    <td className="p-4 text-center"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${customer.debt > 0 ? "bg-primary/20 text-primary" : "bg-success/10 text-success"}`}>{customer.debt > 0 ? "Pendiente" : "Sin deuda"}</span></td>
                    <td className="p-4 text-center"><button onClick={(event) => { event.stopPropagation(); setPaymentRequestId(customer.id); setSelectedId(customer.id); }} disabled={Number(customer.debt) <= 0} className="bg-success hover:brightness-125 disabled:bg-background disabled:text-foreground/40 text-foreground text-xs font-bold px-3 py-2 rounded-lg">Saldar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>}
      {newCustomerModal && <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"><div className="bg-background rounded-2xl w-full max-w-md border border-surface shadow-2xl"><div className="p-6 border-b border-surface flex justify-between"><h2 className="text-primary font-bold text-xl">Nuevo Cliente</h2><button onClick={() => setNewCustomerModal(false)}><X size={22}/></button></div><div className="p-6 space-y-4"><label className="block text-sm font-bold">Nombre del cliente<input value={newCustomer.name} onChange={(e) => setNewCustomer((p) => ({ ...p, name: e.target.value }))} className="mt-2 w-full bg-surface rounded-xl px-4 py-3 border border-foreground/15" /></label><label className="block text-sm font-bold">DNI<input value={newCustomer.document} onChange={(e) => setNewCustomer((p) => ({ ...p, document: e.target.value.replace(/\D/g, "") }))} className="mt-2 w-full bg-surface rounded-xl px-4 py-3 border border-foreground/15" /></label><label className="block text-sm font-bold">Monto que adeuda<input value={newCustomer.initialDebt} inputMode="decimal" onChange={(e) => setNewCustomer((p) => ({ ...p, initialDebt: e.target.value.replace(/[^0-9.]/g, "") }))} className="mt-2 w-full bg-surface rounded-xl px-4 py-3 border border-foreground/15" /></label></div><div className="p-6 border-t border-surface flex gap-3"><button onClick={() => setNewCustomerModal(false)} className="flex-1 bg-surface font-bold py-3 rounded-xl">Cancelar</button><button disabled={submitting} onClick={handleCreateCustomer} className="flex-1 bg-secondary font-bold py-3 rounded-xl">{submitting ? "Guardando..." : "Registrar cliente"}</button></div></div></div>}
    </div>
  );
}
