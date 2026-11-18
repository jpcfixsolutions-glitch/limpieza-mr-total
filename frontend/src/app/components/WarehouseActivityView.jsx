import { WarehousePaymentEditor } from "./WarehousePaymentEditor.jsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Eye, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "../../services/api.js";
import { WarehouseModal } from "./WarehouseModal.jsx";

const card = "bg-surface border border-foreground/10 rounded-2xl p-4 sm:p-5 shadow-sm min-w-0";
const input = "w-full bg-background border border-foreground/20 rounded-xl p-2.5 mt-1";
const button = "rounded-xl border border-foreground/20 px-3 py-2 font-bold text-sm hover:bg-primary/10 disabled:opacity-50";
const money = (cents) => (Number(cents || 0) / 100).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
const dateLabel = (date) => date?.split("-").reverse().join("/");
const timeLabel = (timestamp) => `${dateLabel(timestamp?.slice(0, 10))} ${timestamp?.slice(11, 16) || ""}`;
const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
const statusLabel = { draft: "Borrador", confirmed: "Pendiente", preparing: "En preparación", ready: "Listo", dispatched: "Enviado", delivered: "Entregado", cancelled: "Anulado" };
function Metric({ label, value, children, negative }) {
  return <section className={`${card} flex flex-col min-h-32`}><div className="flex justify-between items-start gap-2"><h3 className="text-sm font-bold text-foreground/65">{label}</h3>{children}</div><p className={`mt-auto pt-3 text-2xl font-black tabular-nums break-words ${negative ? "text-red-600" : ""}`}>{value}</p></section>;
}
function ExpenseList({ expenses = [], edit, remove, changeStatus }) {
  const [filter, setFilter] = useState('all');
  const visible = expenses.filter(e => filter === 'all' || e.status === filter);
  return <div><label className="block text-sm font-bold mb-4">Estado del gasto<select className={input} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todos</option><option value="pending">Pendientes</option><option value="paid">Pagados</option></select></label>
    {!visible.length && <p className="text-foreground/60 py-4">No hay gastos para este filtro.</p>}
    <div className="space-y-3">{visible.map(expense => <article key={expense.id} className="border border-foreground/15 rounded-xl p-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-bold break-words">{expense.fixed_due_date ? 'Fijo' : 'Variable'} · {expense.concept} · {money(expense.amount_cents)}</h4>
        <button type="button" onClick={()=>changeStatus(expense)} aria-label={`${expense.status === 'paid' ? 'Revertir pago de' : 'Pagar'} ${expense.concept}`} className={`rounded-full px-3 py-1.5 text-sm font-bold ${expense.status === 'paid' ? 'bg-green-600/15 text-green-700 dark:text-green-400' : 'bg-amber-500/15 text-amber-800 dark:text-amber-400'}`}>{expense.status === 'paid' ? 'Pagado' : 'Pendiente'}</button>
      </div>
      <p className="mt-2 text-sm">Registro: {timeLabel(expense.created_at)} · Fecha del gasto: {timeLabel(expense.occurred_at)}</p>
      <p className="mt-1 text-sm">{expense.status === 'paid' ? `Pago: ${timeLabel(expense.paid_at)} · ${expense.method === 'cash' ? 'Efectivo' : 'Transferencia'}` : 'Sin pago registrado. No afecta el balance.'}</p>
      {expense.fixed_due_date && <p className="text-sm mt-1">Período / vencimiento: {dateLabel(expense.fixed_due_date)}</p>}
      <p className="mt-2 text-sm whitespace-pre-wrap break-words">{expense.description || 'Sin descripción adicional.'}</p>
      <p className="text-xs text-foreground/60 mt-2">Gasto #{expense.id} · Revisión {expense.version} · Cambio de estado: {timeLabel(expense.status_changed_at)}</p>
      {!expense.fixed_due_date && <div className="flex flex-wrap gap-2 mt-3"><button className={button} onClick={()=>edit(expense)}><Pencil size={14} className="inline mr-1"/>Editar</button><button className={button} onClick={()=>remove(expense)}><Trash2 size={14} className="inline mr-1"/>Eliminar</button></div>}
    </article>)}</div>
  </div>;
}

function DayDetail({ date, revision, edit, remove, collect, refund, changeStatus }) {
  const [data, setData] = useState(null), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError("");
    api.get(`/warehouse/activity/${date}`, { signal: controller.signal }).then((r) => setData(r.data)).catch((e) => { if (!controller.signal.aborted) setError(e.response?.data?.message || "No se pudo cargar la actividad del día."); });
    return () => controller.abort();
  }, [date, revision]);
  if (error) return <p role="alert" className="p-4 text-red-600">{error} Se reintentará automáticamente.</p>;
  if (!data) return <p role="status" className="p-4">Cargando actividad…</p>;
  return <div className="grid lg:grid-cols-2 gap-6 p-3 sm:p-5 bg-background/60 text-left whitespace-normal">
    <section className="min-w-0"><h3 className="font-black text-lg mb-3">Pedidos del día</h3>
      {!data.orders.length && <p className="text-foreground/60">No se registraron pedidos.</p>}
      <div className="space-y-2">{data.orders.map((o) => {
        const status = o.delivered_at ? "delivered" : o.ready_at && ["confirmed", "preparing"].includes(o.status) ? "ready" : o.status;
        return <details className="rounded-xl border border-foreground/15 p-3" key={o.id}>
          <summary className="cursor-pointer font-bold break-words">#{o.id} · {o.customerName || "Sin cliente"} {o.customerLastName} · {money(Math.round(o.total * 100))}</summary>
          <p className="text-sm mt-2">{timeLabel(o.created_at)} · {statusLabel[status]}</p>
          <p className="text-sm mt-2">{o.charge_to_account ? "Cuenta corriente: los cobros se consultan por cliente; sin imputación a pedido." : `Cobrado: ${money(o.paidCents)} · ${o.paidCents >= Math.round(o.total * 100) ? "Pagado" : o.paidCents > 0 ? "Pago parcial" : "Sin cobros registrados"}`}</p>
          {o.status === "cancelled" && <p className="text-sm mt-2 text-foreground/60">Anular el pedido no implica devolver dinero. Si hubo un cobro por pedido, registrá la devolución desde el día del cobro original.</p>}
          <ul className="mt-3 space-y-1 text-sm">{o.items.map((i) => <li key={i.id}>{i.quantity} × {i.product_name} · {money(Math.round(i.total * 100))}</li>)}</ul>
          {o.observations && <p className="text-sm mt-2 whitespace-pre-wrap">{o.observations}</p>}
          {!o.charge_to_account && !["draft", "cancelled"].includes(o.status) && o.paidCents < Math.round(o.total * 100) && <button className={`${button} mt-3`} onClick={() => collect(o)}>Registrar cobro</button>}
        </details>;
      })}</div>
    </section>
    <section className="min-w-0"><h3 className="font-black text-lg mb-3">Ingresos del día</h3>
      <p className="text-sm text-foreground/60 mb-3">Los cobros de cuentas corrientes corresponden al cliente; el sistema histórico no identifica un pedido.</p>
      {!data.receipts.length && !data.accountPayments.length && <p className="text-foreground/60">No hay cobros registrados.</p>}
      <div className="space-y-2">{data.receipts.map((r) => <details key={`r${r.id}`} className="rounded-xl border border-foreground/15 p-3">
        <summary className="cursor-pointer font-bold">{r.kind === "refund" ? "Devolución" : "Cobro"} · Pedido #{r.order_id} · {money(r.payments?.length ? r.payments.reduce((s,p)=>s+p.base_cents+p.surcharge_cents,0) : r.cash_cents + r.transfer_cents)}</summary>
        <p className="text-sm mt-2">{timeLabel(r.occurred_at)}{!r.payments?.length && <> · Efectivo {money(r.cash_cents)} · Transferencia {money(r.transfer_cents)}</>}</p>
        {r.payments?.map(p=><p key={p.id} className="text-sm mt-2">{p.method_name}: capital {money(p.base_cents)} + recargo {p.surcharge_bps/100}% ({money(p.surcharge_cents)}) = {money(p.base_cents+p.surcharge_cents)}</p>)}
        {r.reason && <p className="text-sm mt-2 break-words">{r.reason}</p>}
        {r.reversed ? <p className="text-sm mt-2">Devuelto mediante un movimiento separado.</p> : r.kind === "receipt" && <button className={`${button} mt-3`} onClick={() => refund(r)}>Devolver / corregir cobro</button>}
      </details>)}
      {data.accountPayments.map((p) => <details key={`a${p.id}`} className="rounded-xl border border-foreground/15 p-3">
        <summary className="cursor-pointer font-bold break-words">Cuenta · {p.customerName} {p.customerLastName} · {money(p.payments.length ? p.payments.reduce((s,d)=>s+Math.round(d.amount*100),0) : Math.round(p.amount * 100))}</summary>
        <p className="text-sm mt-2">{timeLabel(p.created_at)} · Sin pedido imputado</p>
        {(p.payments.length ? p.payments : [{ method_name: p.method_name || "Sin método histórico", amount: p.amount }]).map((part, index) => <p className="text-sm mt-1" key={index}>{part.method_name}: {money(Math.round(part.amount * 100))}</p>)}
        {p.snapshots?.map(part=><p key={part.id} className="text-sm mt-2">{part.method_name}: capital {money(part.base_cents)} + recargo {part.surcharge_bps/100}% ({money(part.surcharge_cents)})</p>)}
        {p.detail && <p className="text-sm mt-2 whitespace-pre-wrap break-words">{p.detail}</p>}
      </details>)}</div>
    </section>
    <section className="lg:col-span-2 min-w-0"><h3 className="font-black text-lg mb-3">Gastos y vencimientos del día</h3><p className="text-sm text-foreground/60 mb-3">Los vencimientos fijos se muestran también en su período. Sólo los pagos efectuados en este día se descuentan de su balance.</p><ExpenseList expenses={data.expenses} edit={edit} remove={remove} changeStatus={changeStatus} /></section>
  </div>;
}

export function WarehouseStatsView() {
  const [period, setPeriod] = useState("day");
  const [paymentReady,setPaymentReady]=useState(false);
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null), [revision, setRevision] = useState(0);
  const [modal, setModal] = useState(null), [form, setForm] = useState({}), [busy, setBusy] = useState(false), [saveError, setSaveError] = useState("");
  const active = useRef(null);
  const refresh = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller; setLoading(true);
    try {
      const response = await api.get("/warehouse/stats", { params: { period, ...(period === "all" ? {} : { date: today() }) }, signal: controller.signal });
      if (!controller.signal.aborted) { setData(response.data); setError(""); setRevision((n) => n + 1); }
    } catch (e) { if (!controller.signal.aborted) { setData(null); setError(e.response?.data?.message || "No se pudieron cargar las estadísticas."); } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [period]);
  useEffect(() => {
    setData(null); setExpanded(null); refresh();
    const update = () => { if (!document.hidden) refresh(); };
    const timer = setInterval(update, 30000); window.addEventListener("focus", update);
    return () => { active.current?.abort(); clearInterval(timer); window.removeEventListener("focus", update); };
  }, [refresh]);
  function open(type, record = null) {
    if (type === 'settle') {
      type = 'status';
      record = { ...record, id: record.expense_id, fixed_due_date: record.due_date };
    }
    setSaveError(""); setPaymentReady(false);
    setForm(type === "expense" ? { concept: record?.concept || "", description: record?.description || "", amount: record ? record.amount_cents / 100 : "", occurredAt: record?.occurred_at?.replace(" ", "T").slice(0, 16) || `${today()}T${new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date())}`, method: record?.method || "cash", status: record?.status || "pending", paidAt: record?.paid_at?.replace(" ", "T").slice(0,16) || "" } : type === "status" ? {method:record.method || "cash", paidAt:""} : { payments:[{paymentMethodId:"",amount:""}], reason: "" });
    setModal({ type, record, key: crypto.randomUUID() });
  }
  async function save(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setSaveError("");
    try {
      if (modal.type === "status") await api.patch(`/warehouse/expenses/${modal.record.id}/status`,{...form,status:modal.record.status === 'paid' ? 'pending' : 'paid',expectedVersion:modal.record.version});
      else if (modal.type === "expense") {
        const body = { ...form, idempotencyKey: modal.key, expectedVersion: modal.record?.version };
        if (modal.record) await api.put(`/warehouse/expenses/${modal.record.id}`, body);
        else await api.post("/warehouse/expenses", body);
      } else if (modal.type === "delete") await api.delete(`/warehouse/expenses/${modal.record.id}`, { data: { expectedVersion: modal.record.version } });
      else await api.post(`/warehouse/orders/${modal.type === "refund" ? modal.record.order_id : modal.record.id}/receipts`, { ...form, cash: form.cash || 0, transfer: form.transfer || 0, idempotencyKey: modal.key, reversalOfId: modal.type === "refund" ? modal.record.id : undefined });
      setModal(null); toast.success("Operación registrada."); await refresh();
    } catch (e) { setSaveError(e.response?.data?.message || "No se pudo guardar. Podés reintentar sin duplicar la operación."); }
    finally { setBusy(false); }
  }
  const summary = data?.summary;
  const field = (name, label, props = {}) => <label className="block text-sm font-bold">{label}<input className={input} value={form[name] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [name]: e.target.value }))} {...props} /></label>;
  return <main className="flex-1 min-w-0 p-4 sm:p-6 md:p-10 pb-24"><div className="max-w-7xl mx-auto space-y-6">
    <header className="flex flex-wrap justify-between items-end gap-4"><div><p className="text-primary text-xs font-black uppercase tracking-wider">Galpón mayorista</p><h1 className="text-3xl font-black">Estadísticas</h1><p className="text-foreground/60 mt-1">Actividad comercial y cobros reales · Hora de Argentina</p></div>
      <div role="group" aria-label="Período" className="ml-auto grid grid-cols-4 gap-1.5 sm:gap-2 w-full sm:w-auto">
        {[["day", "Hoy"], ["week", "Esta Semana"], ["month", "Este Mes"], ["all", "Todo"]].map(([value, label]) => <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)} className={`min-h-10 rounded-xl border px-2 sm:px-4 py-2 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${period === value ? "bg-primary border-primary text-white shadow-sm" : "bg-surface border-foreground/15 text-foreground hover:bg-background"}`}>{label}</button>)}
      </div>
    </header>
    {loading && <p role="status" className="text-sm text-foreground/60">Actualizando indicadores…</p>}
    {error && <div role="alert" className={`${card} text-red-600`}>{error} Se reintentará automáticamente; también podés cambiar el período.</div>}
    {!!data?.pendingExpenses?.length && <section className={card}><h2 className="text-lg font-black">Gastos fijos pendientes</h2><p className="text-sm text-foreground/60 mt-1">Vencimientos impagos de todas las fechas. No se descuentan del balance hasta registrar el pago.</p><div className="space-y-2 mt-4">{data.pendingExpenses.map(e=><div key={e.id} className="flex flex-wrap justify-between gap-3 items-center border-t border-foreground/10 pt-3"><div><p className="font-bold">{e.concept} · {money(e.amount_cents)}</p><p className="text-sm text-foreground/60">Vencimiento: {dateLabel(e.due_date)} · Pendiente</p></div><button className={button} onClick={()=>open("settle",e)}>Registrar pago</button></div>)}</div></section>}
    {summary && <div aria-busy={loading} className="space-y-6">
      <section><h2 className="text-lg font-black mb-3">Resumen comercial</h2><p className="text-sm text-foreground/60 mb-3">Pedidos por fecha de creación. Incluye borradores y anulados; sus estados se muestran por separado. El valor comercial no representa dinero cobrado.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"><Metric label="Pedidos registrados" value={summary.orders} /><Metric label="Valor total de pedidos" value={money(summary.orderCents)} /><section className={`${card} min-h-32`}><h3 className="font-bold text-sm text-foreground/65 mb-2">Pedidos por estado actual</h3><div className="flex flex-wrap gap-2">{data.statuses.length ? data.statuses.map((s) => <span className="rounded-lg bg-primary/10 px-2 py-1 text-xs font-bold" key={s.status}>{statusLabel[s.status] || s.status}: {s.count}</span>) : <p className="text-sm text-foreground/60">Sin pedidos registrados.</p>}</div></section></div>
      </section>
      <section><h2 className="text-lg font-black mb-3">Balance financiero</h2><div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <Metric label="Ingresos efectivamente cobrados" value={money(summary.incomeCents)} /><Metric label="Ingresos en efectivo" value={money(summary.cashCents)} /><Metric label="Ingresos por transferencia" value={money(summary.transferCents)} />
        <Metric label="Gastos efectivamente pagados" value={money(summary.expenseCents)}><div className="flex gap-1"><button className="p-1.5 rounded-lg hover:bg-primary/10" aria-label="Agregar gasto" onClick={() => open("expense")}><Plus size={18} /></button><button className="p-1.5 rounded-lg hover:bg-primary/10" aria-label="Ver todos los gastos" onClick={() => open("expenses")}><Eye size={18} /></button></div></Metric>
        <Metric label="Gastos pendientes (todas las fechas)" value={money(data.pendingCents)} /><Metric label="Balance neto" value={money(summary.netCents)} negative={summary.netCents < 0} />
        <section className={`${card} flex items-center text-sm text-foreground/60`}>El balance incluye cobros y devoluciones por su fecha real, menos gastos. Sólo se descuentan gastos pagados, según la fecha efectiva de pago. No requiere apertura ni cierre de caja.</section>
      </div>{summary.otherCents !== 0 && <p className="mt-3 text-sm text-amber-700">Otros métodos o cobros históricos sin desglose: {money(summary.otherCents)}. Incluidos en el total de ingresos, sin asignarlos a efectivo o transferencia.</p>}</section>
      <section className={`${card} !p-0 overflow-hidden`}><div className="p-4 sm:p-5"><h2 className="text-lg font-black">Historial de actividad</h2><p className="text-sm text-foreground/60 mt-1">Días del período seleccionado. Elegí una fecha para consultar pedidos, cobros y gastos.</p></div>
        {!data.days.length ? <p className="p-5 text-foreground/60">No hay actividad registrada en este período. Podés consultar otra fecha o registrar un gasto.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-background text-foreground/70"><tr>{["Fecha", "Pedidos", "Valor pedidos", "Ingresos", "Gastos", "Balance"].map((h) => <th className="text-left px-4 py-3 whitespace-nowrap" key={h}>{h}</th>)}</tr></thead><tbody>{data.days.map((day) =>
          <tr key={day.day} className="border-t border-foreground/10 hover:bg-primary/5 cursor-pointer" onClick={() => setExpanded(expanded === day.day ? null : day.day)}><td className="px-4 py-3 whitespace-nowrap"><button className="font-bold underline decoration-primary/30 underline-offset-4" aria-expanded={expanded === day.day} aria-controls={`day-${day.day}`} onClick={(e) => { e.stopPropagation(); setExpanded(expanded === day.day ? null : day.day); }}>{dateLabel(day.day)} {expanded === day.day ? "−" : "+"}</button></td>{[day.orders, money(day.orderCents), money(day.incomeCents), money(day.expenseCents), money(day.netCents)].map((v, i) => <td key={i} className={`px-4 py-3 whitespace-nowrap tabular-nums ${i === 4 && day.netCents < 0 ? "text-red-600 font-bold" : ""}`}>{v}</td>)}</tr>
        )}</tbody></table></div>}
        {data.days.filter((day) => day.day === expanded).map((day) => <section key={day.day} id={`day-${day.day}`} aria-label={`Actividad del ${dateLabel(day.day)}`}><div className="p-4 border-t border-foreground/10"><h3 className="font-black">Actividad del {dateLabel(day.day)}</h3><dl className="grid sm:grid-cols-3 gap-3 text-sm mt-3">{[["Efectivo", day.cashCents], ["Transferencia", day.transferCents], ["Total ingresos", day.incomeCents], ["Gastos", day.expenseCents], ["Resultado neto", day.netCents], ...(day.otherCents ? [["Otros métodos", day.otherCents]] : [])].map(([label, value]) => <div key={label}><dt className="text-foreground/60">{label}</dt><dd className={`font-bold tabular-nums ${value < 0 ? "text-red-600" : ""}`}>{money(value)}</dd></div>)}</dl></div><DayDetail date={day.day} revision={revision} edit={(r) => open("expense", r)} remove={(r) => open("delete", r)} collect={(o) => open("receipt", o)} refund={(r) => open("refund", r)} changeStatus={(r)=>open("status",r)} /></section>)}
      </section>
    </div>}
    {modal && <WarehouseModal title={{ status: modal.record?.status === "paid" ? "Confirmar reversión del pago" : "Confirmar pago del gasto", expense: modal.record ? "Editar gasto operativo" : "Nuevo gasto operativo", expenses: "Todos los gastos del Galpón", delete: "Eliminar gasto", receipt: `Cobro del pedido #${modal.record?.id}`, refund: "Devolver cobro" }[modal.type]} busy={busy} onClose={() => { if (!busy) setModal(null); }}>
      {modal.type === "expenses" ? <ExpenseList expenses={data?.allExpenses} edit={(r) => open("expense", r)} remove={(r) => open("delete", r)} changeStatus={(r)=>open("status",r)} /> : <form onSubmit={save} className="space-y-4">
        {modal.type === "expense" && <>{field("concept", "Concepto", { required: true, maxLength: 200 })}<label className="block text-sm font-bold">Descripción opcional<textarea className={input} value={form.description} maxLength={2000} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></label><div className="grid sm:grid-cols-2 gap-4">{field("amount", "Importe ($)", { type: "number", min: "0.01", step: "0.01", required: true })}{field("occurredAt", "Fecha y hora del gasto (Argentina)", { type: "datetime-local", required: true })}</div><label className="block text-sm font-bold">Método de pago<select className={input} value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}><option value="cash">Efectivo</option><option value="transfer">Transferencia</option></select></label>{!modal.record && <><label className="block text-sm font-bold">Estado del gasto<select className={input} required value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option value="pending">Pendiente de pago</option><option value="paid">Ya pagado</option></select></label>{form.status === 'paid' && field("paidAt","Fecha y hora efectiva de pago (Argentina)",{type:"datetime-local",required:true})}</>}{modal.record && <p className="text-sm text-foreground/60">Al guardar se actualizará el balance y se conservará la revisión anterior en el registro de auditoría.</p>}</>}
        {modal.type === "receipt" && <><p>Saldo de capital pendiente: <strong>{money(Math.round(modal.record.total * 100) - modal.record.paidCents)}</strong></p><WarehousePaymentEditor payments={form.payments} onChange={payments=>setForm(f=>({...f,payments}))} onReady={setPaymentReady}/></>}
        {modal.type === "status" && <><p>{modal.record.status === 'paid' ? 'Confirmá la reversión del pago marcado por error. El gasto volverá a Pendiente y se corregirá el balance de la fecha del pago; el historial queda en auditoría.' : 'Confirmá el pago efectivo. El importe se descontará una sola vez, en la fecha y hora indicadas.'}</p><p className="font-bold">{modal.record.concept} · {money(modal.record.amount_cents)}{modal.record.fixed_due_date && ' · Vencimiento: '+dateLabel(modal.record.fixed_due_date)}</p>{modal.record.status !== 'paid' && <>{field("paidAt","Fecha y hora efectiva de pago (Argentina)",{type:"datetime-local",required:true})}<label className="block text-sm font-bold">Método<select className={input} value={form.method} onChange={e=>setForm(f=>({...f,method:e.target.value}))}><option value="cash">Efectivo</option><option value="transfer">Transferencia</option></select></label></>}</>}
        {modal.type === "refund" && <><p>Se registrará una devolución de {money(modal.record.payments?.length ? modal.record.payments.reduce((s,p)=>s+p.base_cents+p.surcharge_cents,0) : modal.record.cash_cents + modal.record.transfer_cents)} con los mismos métodos de pago, en el día actual. El cobro original se conserva.</p><p className="text-sm text-foreground/60">Para corregir un importe, devolvé el cobro y registrá el correcto.</p>{field("reason", "Motivo", { required: true, maxLength: 2000 })}</>}
        {modal.type === "delete" && <p>¿Eliminar el gasto «{modal.record.concept}» por {money(modal.record.amount_cents)}? Se descontará de los gastos del día original. El registro se conservará en auditoría.</p>}
        {saveError && <p role="alert" className="text-red-600">{saveError}</p>}
        <div className="flex justify-end gap-2 pt-2"><button type="button" className={button} disabled={busy} onClick={() => setModal(null)}>Cancelar</button><button className={`${button} bg-primary text-white`} disabled={busy || (modal.type === "receipt" && !paymentReady)}>{busy ? "Guardando…" : ["delete", "refund", "status"].includes(modal.type) ? "Confirmar" : "Guardar"}</button></div>
      </form>}
    </WarehouseModal>}
  </div></main>;
}
