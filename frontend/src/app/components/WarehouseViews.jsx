import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import api from "../../services/api.js";

function Page({ title, subtitle, actions, children }) {
  return (
    <main className="flex-1 p-5 md:p-10 pb-24 min-w-0">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
          <div><p className="text-primary font-black uppercase tracking-wider text-xs">Galpón mayorista</p><h1 className="text-3xl font-black">{title}</h1><p className="text-foreground/60 mt-1">{subtitle}</p></div>
          {actions}
        </div>
        {children}
      </div>
    </main>
  );
}

const money = (value) => Number(value || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
const card = "bg-surface border border-foreground/10 rounded-2xl p-5 shadow-sm";
const input = "bg-background border border-foreground/15 rounded-xl px-3 py-2 outline-none focus:border-primary";
const button = "bg-primary text-white font-bold rounded-xl px-4 py-2 disabled:opacity-50";

function StatCards({ stats }) {
  const values = [
    ["Stock total", `${stats.stockUnits || 0} u.`], ["Valor inventario", money(stats.inventoryValue)],
    ["Pedidos despachados", stats.dispatchedOrders || 0], ["Ventas mayoristas", money(stats.dispatchedSales)],
    ["Compras recibidas", stats.receivedPurchases || 0], ["Bajo mínimo", stats.lowStockProducts || 0],
  ];
  return <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{values.map(([label, value]) => <div key={label} className={card}><p className="text-sm text-foreground/60 font-bold">{label}</p><p className="text-2xl font-black mt-2">{value}</p></div>)}</div>;
}

export function WarehouseHomeView() {
  const [stats, setStats] = useState({});
  useEffect(() => { api.get("/warehouse/stats").then((r) => setStats(r.data)).catch(() => toast.error("No se pudo cargar el resumen del Galpón.")); }, []);
  return <Page title="Inicio" subtitle="Resumen operativo, sin mezclar la caja ni las ventas del Local."><StatCards stats={stats} /></Page>;
}

function StatusButton({ onClick, children }) {
  return <button onClick={onClick} className="text-xs font-black px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20">{children}</button>;
}

function ItemsSummary({ items }) {
  return <span>{(items || []).map((item) => `${item.quantity}× ${item.productName}`).join(", ")}</span>;
}

function newLine(kind) {
  return { key: crypto.randomUUID(), productId: "", quantity: 1, [kind === "order" ? "unitPrice" : "unitCost"]: "" };
}

function LineItemsEditor({ kind, products, items, onChange }) {
  const valueField = kind === "order" ? "unitPrice" : "unitCost";
  const valueLabel = kind === "order" ? "Precio unitario" : "Costo unitario";
  const update = (key, patch) => onChange(items.map((item) => item.key === key ? { ...item, ...patch } : item));
  const total = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item[valueField] || 0), 0);
  return (
    <div className="md:col-span-full space-y-3">
      <div className="flex items-center justify-between"><p className="font-black">Ítems</p><button type="button" className="text-sm font-black text-primary" onClick={() => onChange([...items, newLine(kind)])}>+ Agregar producto</button></div>
      {items.map((item, index) => (
        <div key={item.key} className="grid md:grid-cols-[minmax(220px,2fr)_110px_150px_auto] gap-2 items-center bg-background/60 rounded-xl p-3 border border-foreground/10">
          <select required className={input} value={item.productId} onChange={(event) => {
            const productId = event.target.value;
            const product = products.find((row) => row.id === Number(productId));
            update(item.key, { productId, [valueField]: kind === "order" ? (product?.price || "") : (product?.cost || "") });
          }}>
            <option value="">Producto {index + 1}</option>
            {products.filter((product) => kind === "purchase" || product.isAvailable).map((product) => <option key={product.id} value={product.id}>{product.name}{kind === "order" ? ` · stock ${product.stock}` : ""}</option>)}
          </select>
          <input required min="1" type="number" className={input} value={item.quantity} onChange={(event) => update(item.key, { quantity: event.target.value })} aria-label={`Cantidad del ítem ${index + 1}`} placeholder="Cantidad" />
          <input required min="0" step="0.01" type="number" className={input} value={item[valueField]} onChange={(event) => update(item.key, { [valueField]: event.target.value })} aria-label={`${valueLabel} del ítem ${index + 1}`} placeholder={valueLabel} />
          <button type="button" disabled={items.length === 1} onClick={() => onChange(items.filter((row) => row.key !== item.key))} className="text-sm font-bold text-red-600 disabled:opacity-30 px-2">Quitar</button>
        </div>
      ))}
      <p className="text-right font-black">Total estimado: {money(total)}</p>
    </div>
  );
}

export function WarehouseOrdersView() {
  const [orders, setOrders] = useState([]); const [products, setProducts] = useState([]); const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({ customerId: "", observations: "", chargeToAccount: false, items: [newLine("order")] });
  const load = useCallback(() => Promise.all([api.get("/warehouse/orders"), api.get("/products"), api.get("/customers")]).then(([o, p, c]) => { setOrders(o.data); setProducts(p.data); setCustomers(c.data); }), []);
  useEffect(() => { load().catch(() => toast.error("No se pudieron cargar los pedidos.")); }, [load]);
  const create = async (event) => { event.preventDefault(); try { await api.post("/warehouse/orders", { customerId: Number(form.customerId) || null, observations: form.observations, chargeToAccount: form.chargeToAccount, idempotencyKey: crypto.randomUUID(), items: form.items.map((item) => ({ productId: Number(item.productId), quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) })) }); toast.success("Pedido guardado como borrador."); setForm({ customerId: "", observations: "", chargeToAccount: false, items: [newLine("order")] }); await load(); } catch (e) { toast.error(e.response?.data?.message || "No se pudo guardar el pedido."); } };
  const status = async (id, next) => { try { await api.patch(`/warehouse/orders/${id}/status`, { status: next }); await load(); } catch (e) { toast.error(e.response?.data?.message || "No se pudo cambiar el estado."); } };
  return <Page title="Pedidos" subtitle="El borrador no reserva stock; el descuento ocurre una sola vez al despachar.">
    <form onSubmit={create} className={`${card} grid md:grid-cols-2 gap-3 mb-6`}>
      <select required className={input} value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}><option value="">Cliente</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name} {c.lastName}{c.isInternal ? " · Interno" : ""}</option>)}</select>
      <input className={input} value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} placeholder="Observaciones" />
      <LineItemsEditor kind="order" products={products} items={form.items} onChange={(items) => setForm({ ...form, items })} />
      <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={form.chargeToAccount} onChange={(e) => setForm({ ...form, chargeToAccount: e.target.checked })} /> Cargar a cuenta al despachar</label>
      <button className={`${button} md:justify-self-end`}>Crear borrador con {form.items.length} ítem{form.items.length === 1 ? "" : "s"}</button>
    </form>
    <div className="space-y-3">{orders.map((order) => <div key={order.id} className={`${card} flex flex-wrap justify-between gap-4`}><div><p className="font-black">Pedido #{order.id} · {order.customerName} {order.customerLastName}</p><p className="text-sm text-foreground/60 mt-1"><ItemsSummary items={order.items} /> · {money(order.total)}</p><span className="inline-block mt-2 text-xs uppercase font-black bg-secondary/20 px-2 py-1 rounded">{order.status}</span></div><div className="flex flex-wrap items-center gap-2">{order.status === "draft" && <StatusButton onClick={() => status(order.id, "confirmed")}>Confirmar</StatusButton>}{order.status === "confirmed" && <StatusButton onClick={() => status(order.id, "preparing")}>Preparar</StatusButton>}{["confirmed", "preparing"].includes(order.status) && <StatusButton onClick={() => status(order.id, "dispatched")}>Despachar</StatusButton>}{order.status !== "cancelled" && <StatusButton onClick={() => status(order.id, "cancelled")}>Cancelar</StatusButton>}</div></div>)}</div>
  </Page>;
}

export function WarehouseStockView() {
  const [products, setProducts] = useState([]);
  const load = useCallback(() => api.get("/products").then((r) => setProducts(r.data)), []);
  useEffect(() => { load().catch(() => toast.error("No se pudo cargar el inventario.")); }, [load]);
  const adjust = async (product) => { const value = window.prompt(`Nuevo stock para ${product.name}`, product.stock); if (value === null) return; try { await api.put(`/products/${product.id}`, { stock: Number(value), recordStockModification: true }); await load(); } catch (e) { toast.error(e.response?.data?.message || "No se pudo ajustar el stock."); } };
  const transfer = async (product) => { const value = window.prompt(`Cantidad de ${product.name} a transferir al Local`, "1"); if (!value) return; try { await api.post("/inventory/transfers", { productId: product.id, quantity: Number(value), idempotencyKey: crypto.randomUUID() }); toast.success("Transferencia completada en ambas unidades."); await load(); } catch (e) { toast.error(e.response?.data?.message || "No se pudo transferir."); } };
  return <Page title="Stock e insumos" subtitle="Existencias, costos y precios exclusivos del Galpón."><div className={`${card} overflow-x-auto`}><table className="w-full text-sm"><thead><tr className="text-left border-b border-foreground/10"><th className="py-3">Producto</th><th>Stock</th><th>Mínimo</th><th>Costo</th><th>Precio</th><th></th></tr></thead><tbody>{products.map((p) => <tr key={p.id} className="border-b border-foreground/5"><td className="py-3 font-bold">{p.name}</td><td>{p.stock}</td><td>{p.minStock}</td><td>{money(p.cost)}</td><td>{money(p.price)}</td><td className="text-right space-x-2"><StatusButton onClick={() => adjust(p)}>Ajustar</StatusButton><StatusButton onClick={() => transfer(p)}>Transferir al Local</StatusButton></td></tr>)}</tbody></table></div></Page>;
}

export function WarehousePurchasesView() {
  const [purchases, setPurchases] = useState([]); const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ supplier: "", observations: "", items: [newLine("purchase")] });
  const load = useCallback(() => Promise.all([api.get("/warehouse/purchases"), api.get("/products")]).then(([a, b]) => { setPurchases(a.data); setProducts(b.data); }), []);
  useEffect(() => { load().catch(() => toast.error("No se pudieron cargar las compras.")); }, [load]);
  const create = async (event) => { event.preventDefault(); try { await api.post("/warehouse/purchases", { supplier: form.supplier, observations: form.observations, idempotencyKey: crypto.randomUUID(), items: form.items.map((item) => ({ productId: Number(item.productId), quantity: Number(item.quantity), unitCost: Number(item.unitCost) })) }); toast.success("Compra guardada como borrador."); setForm({ supplier: "", observations: "", items: [newLine("purchase")] }); await load(); } catch (e) { toast.error(e.response?.data?.message || "No se pudo guardar la compra."); } };
  const status = async (id, next) => { try { await api.patch(`/warehouse/purchases/${id}/status`, { status: next }); await load(); } catch (e) { toast.error(e.response?.data?.message || "No se pudo cambiar el estado."); } };
  return <Page title="Compras" subtitle="El stock aumenta sólo cuando la compra se marca como recibida."><form onSubmit={create} className={`${card} grid md:grid-cols-2 gap-3 mb-6`}><input required className={input} value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Proveedor" /><input className={input} value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} placeholder="Observaciones" /><LineItemsEditor kind="purchase" products={products} items={form.items} onChange={(items) => setForm({ ...form, items })} /><button className={`${button} md:col-start-2 md:justify-self-end`}>Crear borrador con {form.items.length} ítem{form.items.length === 1 ? "" : "s"}</button></form><div className="space-y-3">{purchases.map((purchase) => <div key={purchase.id} className={`${card} flex justify-between gap-4`}><div><p className="font-black">Compra #{purchase.id} · {purchase.supplier}</p><p className="text-sm text-foreground/60"><ItemsSummary items={purchase.items} /> · {money(purchase.total)}</p><span className="text-xs uppercase font-black">{purchase.status}</span></div><div className="space-x-2">{purchase.status === "draft" && <StatusButton onClick={() => status(purchase.id, "received")}>Recibir</StatusButton>}{purchase.status !== "cancelled" && <StatusButton onClick={() => status(purchase.id, "cancelled")}>Cancelar</StatusButton>}</div></div>)}</div></Page>;
}

export function WarehouseCustomersView() {
  const [customers, setCustomers] = useState([]); const [form, setForm] = useState({ name: "", document: "", phone: "" });
  const load = useCallback(() => api.get("/customers").then((r) => setCustomers(r.data)), []);
  useEffect(() => { load().catch(() => toast.error("No se pudieron cargar los clientes.")); }, [load]);
  const create = async (e) => { e.preventDefault(); try { await api.post("/customers", form); setForm({ name: "", document: "", phone: "" }); await load(); } catch (err) { toast.error(err.response?.data?.message || "No se pudo crear el cliente."); } };
  const pay = async (customer) => { const value = window.prompt(`Cobro para ${customer.name}. Deuda actual: ${money(customer.debt)}`, customer.debt); if (!value) return; try { await api.post(`/customers/${customer.id}/payments`, { amount: Number(value), methodName: "Efectivo", description: "Cobro Galpón" }); await load(); } catch (e) { toast.error(e.response?.data?.message || "No se pudo registrar el cobro."); } };
  return <Page title="Clientes y cuentas corrientes" subtitle="Cartera mayorista separada; el Local figura con vínculo interno estable."><form onSubmit={create} className={`${card} grid md:grid-cols-4 gap-3 mb-6`}><input required className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre" /><input required className={input} value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} placeholder="Documento" /><input className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Teléfono" /><button className={button}>Agregar cliente</button></form><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{customers.map((c) => <div key={c.id} className={card}><p className="font-black">{c.name} {c.lastName} {c.isInternal && <span className="text-xs text-primary">INTERNO</span>}</p><p className="text-sm text-foreground/60">{c.document}</p><p className="text-xl font-black mt-4">Deuda: {money(c.debt)}</p>{c.debt > 0 && <button onClick={() => pay(c)} className={`${button} mt-3`}>Registrar cobro</button>}</div>)}</div></Page>;
}

export function WarehouseMovementsView() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get("/inventory/movements").then((r) => setRows(r.data)).catch(() => toast.error("No se pudieron cargar los movimientos.")); }, []);
  return <Page title="Movimientos" subtitle="Libro de inventario auditable; las correcciones aparecen como reversiones."><div className={`${card} overflow-x-auto`}><table className="w-full text-sm"><thead><tr className="text-left"><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Stock</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id} className="border-t border-foreground/10"><td className="py-3">{r.createdAt}</td><td className="font-bold">{r.productName}</td><td>{r.movementType}</td><td className={r.direction === "IN" ? "text-green-600" : "text-orange-600"}>{r.direction === "IN" ? "+" : "-"}{r.quantity}</td><td>{r.stockBefore} → {r.stockAfter}</td></tr>)}</tbody></table></div></Page>;
}

export function WarehouseStatsView() {
  const [stats, setStats] = useState({});
  useEffect(() => { api.get("/warehouse/stats").then((r) => setStats(r.data)).catch(() => toast.error("No se pudieron cargar las estadísticas.")); }, []);
  return <Page title="Estadísticas" subtitle="Indicadores calculados sólo con documentos e inventario del Galpón."><StatCards stats={stats} /><div className={`${card} mt-5`}><p className="font-black">Compras recibidas</p><p className="text-2xl mt-2">{money(stats.purchaseTotal)}</p></div></Page>;
}
