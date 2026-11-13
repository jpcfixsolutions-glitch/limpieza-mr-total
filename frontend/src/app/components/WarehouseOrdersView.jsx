import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Trash2, UserPlus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import api from "../../services/api.js";
import { normalizeProductSearch, searchProducts } from "../../utils/productSearch.js";
import { useWarehouseOperations } from "../hooks/useWarehouseOperations.js";
import { WarehouseModal } from "./WarehouseModal.jsx";
import { WarehouseProductionCard } from "./WarehouseProductionCard.jsx";
import { WarehouseEmployeeWelcome } from "./WarehouseWelcome.jsx";
import { WarehouseEmployeeProduction } from "./WarehouseEmployeeProduction.jsx";

const card = "bg-surface border border-foreground/10 rounded-2xl p-5 shadow-sm";
const input = "w-full min-w-0 bg-background border border-foreground/15 rounded-xl px-3 py-2 outline-none focus:border-primary";
const button = "bg-primary text-white font-bold rounded-xl px-4 py-2 disabled:opacity-50";
const secondary = "border border-foreground/15 font-bold rounded-xl px-4 py-2 disabled:opacity-50";
const labels = { draft: "Borrador", confirmed: "En preparación", preparing: "En preparación", ready: "Listo", dispatched: "En envío", delivered: "Entregado", cancelled: "Cancelado" };
const number = (value) => Number(value).toLocaleString("es-AR");
const dateFormat = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Cordoba", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function date(value) {
  if (!value) return "Sin fecha";
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? value.replace(" ", "T") + "-03:00" : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? "Sin fecha" : dateFormat.format(parsed);
}
function Status({ status }) {
  const colors = status === "delivered" ? "bg-success/10 text-success" : status === "ready" ? "bg-sky-100 text-sky-800" : status === "dispatched" ? "bg-violet-100 text-violet-800" : status === "cancelled" ? "bg-foreground/10 text-foreground/60" : "bg-amber-100 text-amber-900";
  return <span className={`inline-block rounded-lg px-2 py-1 text-xs font-bold ${colors}`}>{labels[status] || status}</span>;
}

const operationalStates = ["preparing", "ready", "dispatched", "delivered"];
function OrderStatusControl({ order, disabled, onChange }) {
  const current = order.status === "confirmed" ? "preparing" : order.status;
  const allowed = { draft: ["preparing"], preparing: ["ready"], ready: ["preparing", "dispatched"], dispatched: ["delivered"] }[current] || [];
  const allReady = order.items.length > 0 && order.items.every((item) => item.status === "ready");
  return <div className="space-y-2 min-w-0">
    <Status status={order.status} />
    <select aria-label={`Estado del pedido #${order.id}`} value={current} disabled={disabled || !allowed.length}
      onChange={(event) => onChange(order, event.target.value === "preparing" && order.status === "draft" ? "confirmed" : event.target.value)}
      className="block w-full max-w-44 min-w-0 rounded-lg border border-foreground/15 bg-background text-xs py-1.5 px-2 disabled:opacity-60">
      {![...operationalStates].includes(current) && <option value={current}>{labels[current]}</option>}
      {operationalStates.map((state) => <option key={state} value={state} disabled={state !== current && (!allowed.includes(state) || (state === "ready" && !allReady))}>{labels[state]}</option>)}
    </select>
    {current === "preparing" && !allReady && <p className="text-xs text-foreground/60">Prepará los productos en Ver detalle.</p>}
  </div>;
}
function NewOrderModal({ data, onClose, onSaved, onCustomerCreated }) {
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [items, setItems] = useState([]);
  const [observations, setObservations] = useState("");
  const [chargeToAccount, setChargeToAccount] = useState(false);
  const [customerForm, setCustomerForm] = useState(null);
  const [extraCustomers, setExtraCustomers] = useState([]);
  const [error, setError] = useState("");
  const [customerError, setCustomerError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const savingRef = useRef(false);
  const customerSavingRef = useRef(false);
  // Se conserva incluso después de un error de red: el servidor puede haber
  // guardado el pedido aunque la respuesta no haya llegado al navegador.
  const requestKey = useRef(crypto.randomUUID());
  const edited = () => setError("");
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const customers = [...new Map([...data.customers, ...extraCustomers].map((row) => [row.id, row])).values()];
  const selectedCustomer = customers.find((row) => row.id === Number(customerId));
  const customerMatches = customers.filter((row) => normalizeProductSearch(`${row.name} ${row.lastName} ${row.phone || ""}`).includes(normalizeProductSearch(customerSearch)));
  const productMatches = searchProducts(data.products.filter((row) => row.isAvailable), productSearch);
  const products = new Map(data.products.map((row) => [row.id, row]));
  // La previsualización usa exactamente el cálculo de Inicio y Pedidos.
  // No reserva stock ni persiste un pedido provisional.
  useEffect(() => {
    setPreview(null); setPreviewError("");
    if (!items.length || items.some((item) => !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) < 1)) { setPreviewLoading(false); return; }
    const controller = new AbortController();
    setPreviewLoading(true);
    const timeout = window.setTimeout(() => {
      api.post("/warehouse/production-preview", { items: items.map((item) => ({ ...item, quantity: Number(item.quantity) })) }, { signal: controller.signal })
        .then(({ data: result }) => { if (!controller.signal.aborted) setPreview(result); })
        .catch(() => { if (!controller.signal.aborted) setPreviewError("No se pudo estimar la producción. Podés registrar el pedido y actualizar el resumen."); })
        .finally(() => { if (!controller.signal.aborted) setPreviewLoading(false); });
    }, 300);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [items, data]);
  const warnings = (preview?.items || []).filter((item) => item.toProduce > 0);
  const addProduct = (product) => {
    edited();
    setItems((previous) => previous.some((item) => item.productId === product.id)
      ? previous.map((item) => item.productId === product.id ? { ...item, quantity: Number(item.quantity || 0) + 1 } : item)
      : [...previous, { productId: product.id, quantity: 1, unitPrice: product.price }]);
  };

  const createCustomer = async () => {
    if (customerSavingRef.current) return;
    const form = { name: customerForm.name.trim(), phone: customerForm.phone.trim(), address: customerForm.address.trim() };
    const digits = form.phone.replace(/\D/g, "");
    if (!form.name || !form.address || !/^[+\d\s().-]+$/.test(form.phone) || digits.length < 6 || digits.length > 20) {
      setCustomerError("Completá nombre, dirección y un teléfono válido (entre 6 y 20 dígitos)."); return;
    }
    customerSavingRef.current = true; setSavingCustomer(true); setCustomerError("");
    try {
      const { data: customer } = await api.post("/warehouse/customers", form);
      setExtraCustomers((previous) => [...previous.filter((row) => row.id !== customer.id), customer]);
      edited(); setCustomerId(String(customer.id)); setCustomerSearch(""); setCustomerForm(null);
      toast.success(customer.duplicated ? "Seleccionamos el cliente que ya estaba registrado." : "Cliente registrado y seleccionado.");
      onCustomerCreated();
    } catch (err) { setCustomerError(err.response?.data?.message || "No se pudo guardar el cliente. Conservamos sus datos."); }
    finally { customerSavingRef.current = false; setSavingCustomer(false); }
  };

  const save = async (event) => {
    event.preventDefault();
    if (savingRef.current || customerSavingRef.current) return;
    if (!customerId || !items.length) { setError("Seleccioná un cliente y agregá al menos un producto."); return; }
    if (items.some((item) => !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) < 1)) { setError("Las cantidades deben ser unidades enteras mayores a cero."); return; }
    savingRef.current = true; setSaving(true); setError("");
    try {
      await api.post("/warehouse/orders", { customerId: Number(customerId), status: "confirmed", items: items.map((item) => ({ ...item, quantity: Number(item.quantity) })), observations, chargeToAccount, idempotencyKey: requestKey.current });
      toast.success("Pedido registrado en preparación.");
      onSaved();
    } catch (err) { setError(err.response?.data?.message || "No se pudo guardar el pedido. Conservamos los datos para reintentar."); }
    finally { savingRef.current = false; setSaving(false); }
  };

  return <WarehouseModal title="Nuevo pedido" onClose={onClose} busy={saving || savingCustomer}>
    <form onSubmit={save} className="space-y-6">
      <fieldset disabled={saving || savingCustomer} className="space-y-6 min-w-0">
        <section className="space-y-3">
          <div className="flex flex-wrap justify-between gap-2 items-center"><h3 className="font-black">1. Cliente</h3>
            {!customerForm && <button type="button" className="text-primary font-bold flex items-center gap-2 text-sm" onClick={() => setCustomerForm({ name: "", phone: "", address: "" })}><UserPlus size={17} />Nuevo cliente</button>}
          </div>
          {customerForm ? <div className="rounded-xl border border-foreground/10 bg-background/50 p-4 space-y-3">
            <label className="block text-sm font-bold">Nombre del cliente<input className={`${input} mt-1`} maxLength={160} value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} /></label>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-sm font-bold">Número de contacto<input type="tel" className={`${input} mt-1`} maxLength={40} value={customerForm.phone} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })} placeholder="+54 351 123-4567" /></label>
              <label className="block text-sm font-bold">Dirección<input className={`${input} mt-1`} maxLength={300} value={customerForm.address} onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })} /></label>
            </div>
            {customerError && <p role="alert" className="text-primary text-sm">{customerError}</p>}
            <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={createCustomer}>Guardar cliente</button><button type="button" className={secondary} onClick={() => { setCustomerForm(null); setCustomerError(""); }}>Volver al selector</button></div>
          </div> : <>
            <label className="block text-sm font-bold">Buscar cliente<input type="search" className={`${input} mt-1`} placeholder="Nombre o teléfono" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} /></label>
            <label className="block text-sm font-bold">Cliente registrado<select aria-label="Cliente registrado" required className={`${input} mt-1`} value={customerId} onChange={(e) => { edited(); setCustomerId(e.target.value); }}>
              <option value="">Seleccioná un cliente</option>
              {(selectedCustomer && !customerMatches.some((row) => row.id === selectedCustomer.id) ? [selectedCustomer, ...customerMatches] : customerMatches).map((row) => <option key={row.id} value={row.id}>{row.name} {row.lastName}{row.phone ? ` · ${row.phone}` : ""}</option>)}
            </select></label>
            {customerMatches.length === 0 && <p className="text-sm text-foreground/60">No hay clientes que coincidan. Podés registrar uno nuevo.</p>}
            {selectedCustomer && <p className="text-sm text-foreground/60 break-words">{selectedCustomer.phone || "Sin teléfono registrado"} · {selectedCustomer.address || "Sin dirección registrada"}</p>}
          </>}
        </section>
        {selectedCustomer && !customerForm && <section className="space-y-3">
          <h3 className="font-black">2. Productos del Galpón</h3>
          <label className="block text-sm font-bold">Buscar producto<input type="search" className={`${input} mt-1`} placeholder="Nombre o código" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} /></label>
          <div className="max-h-48 overflow-y-auto border border-foreground/10 rounded-xl divide-y divide-foreground/10">
            {productMatches.slice(0, 30).map((product) => <button key={product.id} type="button" onClick={() => addProduct(product)} className="w-full text-left px-3 py-2 flex items-center justify-between gap-3 hover:bg-background">
              <span className="min-w-0 break-words text-sm"><span className="font-bold">{product.name}</span><span className="block text-foreground/60">{product.codbarra ? `Código ${product.codbarra} · ` : ""}Stock: {number(product.stock)} u.</span></span>
              <Plus size={18} className="shrink-0 text-primary" aria-label="Agregar" />
            </button>)}
            {!productMatches.length && <p className="p-3 text-sm text-foreground/60">No se encontraron productos disponibles.</p>}
          </div>
          {productMatches.length > 30 && <p className="text-xs text-foreground/60">Mostrando 30 resultados. Escribí para afinar la búsqueda.</p>}
          <div className="space-y-2">{items.map((item) => <div key={item.productId} className="grid grid-cols-[minmax(0,1fr)_6rem_auto] gap-2 items-center bg-background rounded-xl p-3">
            <div className="min-w-0"><p className="font-bold text-sm break-words">{products.get(item.productId)?.name}</p><p className="text-xs text-foreground/60">Stock: {number(products.get(item.productId)?.stock || 0)} u.</p></div>
            <label className="text-xs font-bold">Cantidad<input className={`${input} mt-1`} aria-label={`Cantidad de ${products.get(item.productId)?.name}`} required type="number" step="1" min="1" value={item.quantity} onChange={(e) => { edited(); setItems(items.map((row) => row.productId === item.productId ? { ...row, quantity: e.target.value } : row)); }} /></label>
            <button type="button" className="p-2 text-primary" aria-label={`Quitar ${products.get(item.productId)?.name}`} onClick={() => { edited(); setItems(items.filter((row) => row.productId !== item.productId)); }}><Trash2 size={18} /></button>
          </div>)}</div>
          {previewLoading && <p role="status" className="text-sm text-foreground/60">Calculando disponibilidad y producción…</p>}
          {previewError && <p role="status" className="text-sm text-primary">{previewError}</p>}
          {warnings.length > 0 && <div role="status" className="bg-primary/5 border border-primary/15 rounded-xl p-3 text-sm">
            <p className="font-bold">Este pedido requiere producción y se puede registrar.</p>
            {warnings.map((row) => <p key={row.productId} className="mt-1 break-words">{row.productName}: {number(row.toProduce)} u. adicionales · pendiente global previsto: {number(preview.production.items.find((item) => item.productId === row.productId)?.toProduce || 0)} u.</p>)}
            <p className="mt-2 text-xs text-foreground/60">Estimación con el stock asignable actual; se recalcula al actualizar los pedidos.</p>
          </div>}
          <label className="block text-sm font-bold">Observaciones<textarea className={`${input} mt-1`} value={observations} onChange={(e) => { edited(); setObservations(e.target.value); }} rows={2} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={chargeToAccount} onChange={(e) => { edited(); setChargeToAccount(e.target.checked); }} />Cargar a cuenta al despachar</label>
        </section>}
      </fieldset>
      {error && <p role="alert" className="text-sm text-primary">{error}</p>}
      <div className="flex flex-wrap justify-end gap-3 border-t border-foreground/10 pt-4">
        <button type="button" className={secondary} disabled={saving || savingCustomer} onClick={onClose}>Cerrar sin guardar</button>
        <button type="submit" disabled={saving || savingCustomer || Boolean(customerForm) || !customerId || !items.length} className={button}>{saving ? "Guardando…" : "Registrar pedido"}</button>
      </div>
    </form>
  </WarehouseModal>;
}

export function WarehouseOrdersView({ user, employeeHome = false }) {
  const isEmployee = user?.role === "EMPLEADO_GALPON";
  const { data, loading, error, refresh, replaceOrder } = useWarehouseOperations();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const updatingRef = useRef(false);
  const orders = useMemo(() => (data?.orders || []).filter((order) => {
    if (employeeHome && !["confirmed", "preparing"].includes(order.status)) return false;
    const matches = employeeHome || !filter || (filter === "preparing" ? ["confirmed", "preparing"].includes(order.status) : order.status === filter);
    return matches && normalizeProductSearch(`${order.id} ${order.customerName || ""} ${order.customerLastName || ""}`).includes(normalizeProductSearch(search));
  }).sort((a, b) => employeeHome ? String(a.createdAt).localeCompare(String(b.createdAt)) || a.id - b.id : String(b.createdAt).localeCompare(String(a.createdAt)) || b.id - a.id), [data, search, filter, employeeHome]);
  const detail = data?.orders.find((order) => order.id === detailId);
  const beginStatus = (order, status, item = null) => {
    if (isEmployee && (!operationalStates.includes(status) || order.status === "draft")) return;
    setDetailId(null); setUpdateError(""); setConfirmation({ order, status, item });
  };
  const changeStatus = async () => {
    if (updatingRef.current) return;
    updatingRef.current = true; setUpdating(true); setUpdateError("");
    try {
      const path = confirmation.item ? `/warehouse/orders/${confirmation.order.id}/items/${confirmation.item.id}/status` : `/warehouse/orders/${confirmation.order.id}/status`;
      const { data: updated } = await api.patch(path, { status: confirmation.status, expectedVersion: confirmation.order.version });
      replaceOrder(updated);
      const returnToDetail = confirmation.item ? confirmation.order.id : null;
      setConfirmation(null); setDetailId(returnToDetail);
      toast.success(confirmation.item ? "Estado del producto actualizado." : "Estado del pedido actualizado."); await refresh();
    } catch (err) { setUpdateError(err.response?.data?.message || "No se pudo actualizar el estado. Se conserva el anterior."); await refresh(); }
    finally { updatingRef.current = false; setUpdating(false); }
  };

  return <main className="flex-1 min-w-0 p-5 md:p-10 pb-24"><div className="max-w-7xl mx-auto">
    <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
      {employeeHome ? <WarehouseEmployeeWelcome user={user} /> : <div><p className="text-primary font-black uppercase tracking-wider text-xs">Galpón mayorista</p><h1 className="text-3xl font-black">Pedidos</h1><p className="text-foreground/60 mt-1">Preparación, producción y entrega de pedidos.</p></div>}
      <div className="flex flex-wrap gap-2"><button type="button" className={`${secondary} flex items-center gap-2`} onClick={refresh} disabled={loading}><RefreshCw size={16} aria-hidden="true" />Actualizar</button>{!isEmployee && <button type="button" className={`${button} flex items-center gap-2`} onClick={() => setCreating(true)} disabled={!data || Boolean(error)}><Plus size={18} />Nuevo pedido</button>}</div>
    </div>
    {error && <p role="alert" className="text-primary mb-4">{error} Volvé a intentar con Actualizar.</p>}
    <section className={card} aria-label="Listado de pedidos">
      {employeeHome && <div className="mb-4"><h2 className="text-xl font-black">Pedidos pendientes de preparación</h2><p className="text-sm text-foreground/60 mt-1">Los más antiguos aparecen primero.</p></div>}
      <div className={employeeHome ? "mb-5" : "grid sm:grid-cols-[minmax(0,1fr)_14rem] gap-3 mb-5"}>
        <label className="text-sm font-bold"><span className="flex items-center gap-2 mb-1"><Search size={16} />Buscar pedido</span><input className={input} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cliente o número de pedido" /></label>
        {!employeeHome && <label className="text-sm font-bold">Estado<select aria-label="Estado" className={`${input} mt-1`} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">Todos los estados</option><option value="preparing">En preparación</option><option value="ready">Listo</option><option value="dispatched">En envío</option><option value="delivered">Entregado</option>{!isEmployee && <option value="draft">Borrador</option>}<option value="cancelled">Cancelado</option></select></label>}
      </div>
      {!data && loading ? <p role="status" className="py-6 text-foreground/60">Cargando pedidos…</p> : !orders.length ? <p className="py-6 text-foreground/60">{employeeHome ? "No hay pedidos pendientes de preparación." : data?.orders.length ? "No hay pedidos que coincidan con los filtros." : error ? "No se pudo obtener el listado." : "Todavía no hay pedidos registrados."}</p> : <>
        <div className="hidden lg:block"><table className="w-full text-sm table-fixed"><thead className="text-left text-foreground/60"><tr><th className="w-[9%] pb-3">N.º</th><th className="w-[17%] pb-3">Fecha</th><th className="w-[20%] pb-3">Cliente</th><th className="w-[22%] pb-3">Productos</th><th className="w-[16%] pb-3">Estado</th><th className="w-[16%] pb-3 text-right">Acciones</th></tr></thead><tbody>{orders.map((order, index) => <tr key={order.id} className="border-t border-foreground/10 align-top">
          <td className="py-4 font-bold">#{order.id}{employeeHome && index === 0 && <span className="block text-xs text-primary mt-1">Más antiguo</span>}</td><td className="py-4 pr-2">{date(order.createdAt)}</td><td className="py-4 pr-3 break-words">{order.customerName || "Sin cliente"} {order.customerLastName}</td><td className="py-4 pr-3 break-words">{order.items.length} producto{order.items.length !== 1 ? "s" : ""}<span className="block text-xs text-foreground/60 mt-1">{(employeeHome ? order.items : order.items.slice(0, 2)).map((item) => `${item.quantity}× ${item.productName}`).join(", ")}{!employeeHome && order.items.length > 2 ? "…" : ""}</span></td><td className="py-4 pr-2"><OrderStatusControl order={order} disabled={updating || Boolean(error) || (isEmployee && order.status === "draft")} onChange={beginStatus} /></td><td className="py-4 text-right"><button type="button" onClick={() => setDetailId(order.id)} className="text-primary text-sm font-bold rounded-lg px-2 py-1">Ver detalle</button></td>
        </tr>)}</tbody></table></div>
        <div className="lg:hidden divide-y divide-foreground/10">{orders.map((order, index) => <article key={order.id} className="py-4 space-y-2"><div className="flex justify-between gap-2"><h3 className="font-black">Pedido #{order.id}{employeeHome && index === 0 && <span className="block text-xs text-primary mt-1">Más antiguo</span>}</h3><div className="w-40 shrink-0"><OrderStatusControl order={order} disabled={updating || Boolean(error) || (isEmployee && order.status === "draft")} onChange={beginStatus} /></div></div><p className="text-xs text-foreground/60">{date(order.createdAt)}</p><p className="font-bold break-words">{order.customerName || "Sin cliente"} {order.customerLastName}</p><p className="text-sm text-foreground/60">{order.items.length} producto{order.items.length !== 1 ? "s" : ""}</p>{employeeHome && <ul className="text-sm space-y-1">{order.items.map((item) => <li key={item.id} className="break-words">{item.quantity}× {item.productName}</li>)}</ul>}<button type="button" onClick={() => setDetailId(order.id)} className="text-primary text-sm font-bold rounded-lg py-1">Ver detalle</button></article>)}</div>
      </>}
    </section>
    {employeeHome ? <div className="mt-6"><WarehouseEmployeeProduction production={data?.production} loading={loading} error={error} onDetail={setDetailId} /></div> : <WarehouseProductionCard production={data?.production} loading={loading} error={error} />}
    {!isEmployee && creating && data && <NewOrderModal data={data} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); refresh(); }} onCustomerCreated={refresh} />}
    {detail && <WarehouseModal title={`Pedido #${detail.id}`} onClose={() => setDetailId(null)}>
      <div className="flex flex-wrap justify-between gap-3 mb-4"><div><p className="font-black break-words">{detail.customerName || "Sin cliente"} {detail.customerLastName}</p>{!isEmployee && <><p className="text-sm mt-1 break-words">{detail.customerPhone || "Sin teléfono registrado"}</p><p className="text-sm break-words">{detail.customerAddress || "Sin dirección registrada"}</p></>}</div><div><Status status={detail.status} /><p className="text-xs text-foreground/60 mt-2">Creado: {date(detail.createdAt)}</p>{detail.deliveredAt && <p className="text-xs text-foreground/60">Entregado: {date(detail.deliveredAt)}</p>}</div></div>
      <p className="text-sm text-foreground/60 mb-3">{["confirmed", "preparing", "ready"].includes(detail.status) ? "Disponibilidad informativa asignada por orden de registro, sin reservar stock físico." : detail.status === "dispatched" || detail.status === "delivered" ? "El stock de este pedido ya se descontó al despachar." : "Este pedido no genera demanda de producción."}</p>
      <div className="space-y-3">{detail.items.map((item) => <div key={item.id} className="bg-background rounded-xl p-3 text-sm"><p className="font-bold break-words">{item.productName}</p><div className="flex flex-wrap items-center gap-3 mt-2"><Status status={item.status} /><select aria-label={`Estado de ${item.productName}`} className="rounded-lg border border-foreground/15 bg-surface px-2 py-1.5 text-sm max-w-full" value={item.status} disabled={updating || Boolean(error) || !["confirmed", "preparing", "ready"].includes(detail.status)} onChange={(event) => beginStatus(detail, event.target.value, item)}>{operationalStates.map((state) => <option key={state} value={state} disabled={["dispatched", "delivered"].includes(state)}>{labels[state]}</option>)}</select></div><p className="mt-1">Solicitado: <strong>{number(item.quantity)} u.</strong></p>{item.assignedStock != null ? <div className="mt-1"><p>Stock físico: {number(item.availableStock)} u. · Asignable a este pedido: {number(item.assignedStock)} u.</p><p className={item.toProduce ? "text-primary font-bold" : "text-success"}>Producción necesaria: {number(item.toProduce)} u.</p></div> : <p className="text-foreground/60 mt-1">Stock actual: {number(data.products.find((row) => row.id === item.productId)?.stock || 0)} u.</p>}</div>)}</div>
      {detail.observations && <p className="mt-4 text-sm break-words">Observaciones: {detail.observations}</p>}
      <div className="flex flex-wrap gap-2 mt-5">
        {!isEmployee && detail.status === "draft" && <button type="button" className={button} onClick={() => beginStatus(detail, "confirmed")}>Confirmar pedido</button>}
        {["confirmed", "preparing", "ready"].includes(detail.status) && <p className="text-sm text-foreground/60 w-full">Marcar Listo no ingresa unidades al stock. El envío y la entrega se confirman para todos los productos juntos.</p>}<OrderStatusControl order={detail} disabled={updating || Boolean(error) || (isEmployee && detail.status === "draft")} onChange={beginStatus} />
        
        {!isEmployee && !["delivered", "cancelled"].includes(detail.status) && <button type="button" className={secondary} onClick={() => beginStatus(detail, "cancelled")}>Cancelar pedido</button>}
      </div>
    </WarehouseModal>}
    {confirmation && <WarehouseModal title={confirmation.item ? `Actualizar producto: ${labels[confirmation.status]}` : confirmation.status === "ready" ? "Marcar pedido como Listo" : confirmation.status === "preparing" ? "Volver a preparación" : confirmation.status === "cancelled" ? "Cancelar pedido" : confirmation.status === "delivered" ? "Confirmar entrega" : confirmation.status === "confirmed" ? "Confirmar pedido" : "Pasar a En envío"} onClose={() => setConfirmation(null)} busy={updating}>
      <p>Pedido #{confirmation.order.id} · {confirmation.order.customerName} {confirmation.order.customerLastName}</p><p className="mt-3 text-sm text-foreground/60">{confirmation.item ? `${confirmation.item.productName}: ${labels[confirmation.status]}. Este cambio no modifica el stock.${confirmation.status === "preparing" && confirmation.order.status === "ready" ? " El pedido volverá a En preparación." : ""}` : confirmation.status === "ready" ? "Todos los productos deben estar listos. Este cambio no mueve stock; el pedido quedará disponible para su envío." : confirmation.status === "preparing" ? "El pedido volverá a En preparación. No se modifica el stock ni la preparación individual de los productos." : confirmation.status === "cancelled" ? "El pedido dejará de generar demanda. Si ya fue despachado, su stock volverá al Galpón." : confirmation.status === "delivered" ? "La entrega quedará registrada con la fecha y hora actual de Argentina." : confirmation.status === "dispatched" ? "Se descontará el stock del Galpón. Es necesario disponer de todas las unidades del pedido." : "El pedido comenzará a formar parte de la demanda pendiente."}</p>
      {updateError && <p role="alert" className="text-primary mt-3">{updateError}</p>}
      <div className="flex justify-end flex-wrap gap-2 mt-5"><button type="button" className={secondary} disabled={updating} onClick={() => setConfirmation(null)}>Volver</button><button type="button" className={button} disabled={updating} onClick={changeStatus}>{updating ? "Actualizando…" : "Confirmar"}</button></div>
    </WarehouseModal>}
  </div></main>;
}
