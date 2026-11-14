import { materializeFixed, paymentParts, storeParts } from "./warehouseSettings.service.js";
import { sql } from "drizzle-orm";
import { getArgentinaTime } from "../db/timeUtils.js";
import { runWarehouseTransaction } from "./warehouse.service.js";

const fail = (status, message) => { throw { status, message }; };
const assertUnit = (unit) => { if (unit?.code !== "WAREHOUSE") fail(403, "Esta operación pertenece al Galpón."); };
export function activityDate(value) {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "") || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(400, "Fecha inválida.");
  return value;
}
export function activityPeriod(period = "day", date = getArgentinaTime().datetime.slice(0, 10)) {
  if (period === "all") return { period, start: null, end: null };
  activityDate(date);
  const start = new Date(`${date}T12:00:00Z`);
  if (period === "week") start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  else if (period === "month") start.setUTCDate(1);
  else if (period !== "day") fail(400, "Período inválido.");
  const end = new Date(start);
  if (period === "month") end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCDate(end.getUTCDate() + (period === "week" ? 7 : 1));
  return { period, start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
function cents(value, allowZero = false) {
  if (!["number", "string"].includes(typeof value) || String(value).trim() === "") fail(400, "Importe inválido.");
  const n = Number(value), c = Math.round(n * 100);
  if (!Number.isSafeInteger(c) || c < (allowZero ? 0 : 1) || Math.abs(n * 100 - c) > 0.000001) fail(400, "El importe debe ser positivo y tener hasta dos decimales.");
  return c;
}
function timestamp(value) {
  const now = getArgentinaTime().datetime;
  if (!value) return now;
  activityDate(String(value).slice(0, 10));
  if (String(value).length === 10) return `${value} ${now.slice(11)}`;
  if (!/^\d{4}-\d{2}-\d{2}[ T]([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)) fail(400, "Hora inválida (Argentina).");
  return value.replace("T", " ").padEnd(19, ":00");
}
function key(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 150) fail(400, "Se requiere una clave de operación válida.");
  return value.trim();
}
const rows = (executor, query) => executor.all(query);
const dateFilter = (column, start, end) => start === null
  ? sql`1=1`
  : sql`${sql.raw(column)}>=${start} AND ${sql.raw(column)}<${end}`;

// El dinero histórico se toma de pagos reales de cuentas. Nunca del total de un pedido.
// Métodos históricos sin desglose se informan aparte, sin asignarlos arbitrariamente.
function ledger(unitId, start, end) {
  return sql`WITH events AS (
    SELECT substr(created_at,1,10) day, 1 orders, CAST(round(total*100) AS INTEGER) orderCents,
      0 cashCents, 0 transferCents, 0 otherCents, 0 expenseCents
    FROM warehouse_orders WHERE business_unit_id=${unitId} AND ${dateFilter("created_at", start, end)}
    UNION ALL
    SELECT substr(occurred_at,1,10),0,0,
      COALESCE((SELECT sum(base_cents+surcharge_cents) FROM warehouse_payment_parts p WHERE p.receipt_id=r.id AND p.kind='cash'),CASE WHEN NOT EXISTS(SELECT 1 FROM warehouse_payment_parts p WHERE p.receipt_id=r.id) THEN cash_cents ELSE 0 END),
      COALESCE((SELECT sum(base_cents+surcharge_cents) FROM warehouse_payment_parts p WHERE p.receipt_id=r.id AND p.kind='transfer'),CASE WHEN NOT EXISTS(SELECT 1 FROM warehouse_payment_parts p WHERE p.receipt_id=r.id) THEN transfer_cents ELSE 0 END),
      COALESCE((SELECT sum(base_cents+surcharge_cents) FROM warehouse_payment_parts p WHERE p.receipt_id=r.id AND p.kind='other'),0),0
    FROM warehouse_receipts r WHERE business_unit_id=${unitId} AND ${dateFilter("occurred_at", start, end)}
    UNION ALL
    SELECT substr(m.created_at,1,10),0,0,
      CASE WHEN COALESCE(p.kind,CASE lower(COALESCE(d.method_name,m.method_name,'')) WHEN 'efectivo' THEN 'cash' WHEN 'transferencia' THEN 'transfer' ELSE 'other' END)='cash' THEN COALESCE(p.base_cents+p.surcharge_cents,CAST(round(COALESCE(d.amount,m.amount)*100) AS INTEGER)) ELSE 0 END,
      CASE WHEN COALESCE(p.kind,CASE lower(COALESCE(d.method_name,m.method_name,'')) WHEN 'efectivo' THEN 'cash' WHEN 'transferencia' THEN 'transfer' ELSE 'other' END)='transfer' THEN COALESCE(p.base_cents+p.surcharge_cents,CAST(round(COALESCE(d.amount,m.amount)*100) AS INTEGER)) ELSE 0 END,
      CASE WHEN COALESCE(p.kind,CASE lower(COALESCE(d.method_name,m.method_name,'')) WHEN 'efectivo' THEN 'cash' WHEN 'transferencia' THEN 'transfer' ELSE 'other' END)='other' THEN COALESCE(p.base_cents+p.surcharge_cents,CAST(round(COALESCE(d.amount,m.amount)*100) AS INTEGER)) ELSE 0 END,0
    FROM account_movements m LEFT JOIN warehouse_payment_parts p ON p.account_movement_id=m.id LEFT JOIN account_payment_details d ON d.account_movement_id=m.id AND p.id IS NULL
    WHERE m.business_unit_id=${unitId} AND m.type='pago' AND ${dateFilter("m.created_at", start, end)}
    UNION ALL
    SELECT substr(occurred_at,1,10),0,0,0,0,0,amount_cents FROM warehouse_expenses
    WHERE business_unit_id=${unitId} AND deleted_at IS NULL AND ${dateFilter("occurred_at", start, end)}
  ) SELECT day, sum(orders) orders, sum(orderCents) orderCents, sum(cashCents) cashCents,
    sum(transferCents) transferCents, sum(otherCents) otherCents, sum(expenseCents) expenseCents
    FROM events GROUP BY day ORDER BY day DESC`;
}
function summarize(row) {
  const incomeCents = Number(row.cashCents) + Number(row.transferCents) + Number(row.otherCents);
  return { ...row, incomeCents, netCents: incomeCents - Number(row.expenseCents) };
}

export const WarehouseActivityService = {
  async stats(unit, query = {}) {
    assertUnit(unit);
    const range = activityPeriod(query.period, query.date);
    return runWarehouseTransaction(async (tx) => {
      await materializeFixed(tx,unit.id);
      const days = (await rows(tx, ledger(unit.id, range.start, range.end))).map(summarize);
      const total = { orders: 0, orderCents: 0, cashCents: 0, transferCents: 0, otherCents: 0, expenseCents: 0 };
      for (const day of days) for (const field of Object.keys(total)) total[field] += Number(day[field]);
      const statuses = await rows(tx, sql`SELECT CASE WHEN delivered_at IS NOT NULL THEN 'delivered' WHEN ready_at IS NOT NULL AND status IN ('confirmed','preparing') THEN 'ready' ELSE status END status,
        count(*) count FROM warehouse_orders WHERE business_unit_id=${unit.id} AND ${dateFilter("created_at", range.start, range.end)} GROUP BY 1`);
      const expenses = await rows(tx, sql`SELECT e.*, (SELECT due_date FROM warehouse_fixed_occurrences f WHERE f.expense_id=e.id) fixed_due_date FROM warehouse_expenses e WHERE business_unit_id=${unit.id} AND deleted_at IS NULL
        AND ${dateFilter("occurred_at", range.start, range.end)} ORDER BY occurred_at DESC,id DESC`);
      const pendingExpenses = await rows(tx, sql`SELECT * FROM warehouse_fixed_occurrences WHERE business_unit_id=${unit.id} AND expense_id IS NULL ORDER BY due_date,id`);
      const dueDates = await rows(tx,sql`SELECT DISTINCT due_date FROM warehouse_fixed_occurrences WHERE business_unit_id=${unit.id} AND ${dateFilter('due_date',range.start,range.end)}`);
      for (const expense of dueDates) {
        if ((range.start===null || (expense.due_date>=range.start && expense.due_date<range.end)) && !days.some(d=>d.day===expense.due_date)) days.push(summarize({...total,orders:0,orderCents:0,cashCents:0,transferCents:0,otherCents:0,expenseCents:0,day:expense.due_date}));
      }
      days.sort((a,b)=>b.day.localeCompare(a.day));
      return { pendingExpenses, ...range, summary: summarize(total), statuses, days, expenses };
    });
  },
  async day(unit, date) {
    assertUnit(unit);
    const range = activityPeriod("day", date);
    return runWarehouseTransaction(async (tx) => {
      await materializeFixed(tx,unit.id);
      const orders = await rows(tx, sql`SELECT o.*, c.name customerName, c.last_name customerLastName,
        (SELECT COALESCE(sum(cash_cents+transfer_cents),0) FROM warehouse_receipts WHERE order_id=o.id) paidCents
        FROM warehouse_orders o LEFT JOIN customers c ON c.id=o.customer_id AND c.business_unit_id=o.business_unit_id
        WHERE o.business_unit_id=${unit.id} AND o.created_at>=${range.start} AND o.created_at<${range.end} ORDER BY o.created_at DESC, o.id DESC`);
      const items = await rows(tx, sql`SELECT i.* FROM warehouse_order_items i JOIN warehouse_orders o ON o.id=i.order_id
        WHERE o.business_unit_id=${unit.id} AND o.created_at>=${range.start} AND o.created_at<${range.end}`);
      const receipts = await rows(tx, sql`SELECT r.*, CASE WHEN r.reversal_of_id IS NULL THEN 'receipt' ELSE 'refund' END kind,
        EXISTS(SELECT 1 FROM warehouse_receipts x WHERE x.reversal_of_id=r.id) reversed
        FROM warehouse_receipts r WHERE business_unit_id=${unit.id} AND occurred_at>=${range.start} AND occurred_at<${range.end} ORDER BY occurred_at DESC,id DESC`);
      const accountPayments = await rows(tx, sql`SELECT m.*, c.name customerName, c.last_name customerLastName FROM account_movements m
        LEFT JOIN customers c ON c.id=m.customer_id WHERE m.business_unit_id=${unit.id} AND m.type='pago'
        AND m.created_at>=${range.start} AND m.created_at<${range.end} ORDER BY m.created_at DESC,m.id DESC`);
      const parts = await rows(tx, sql`SELECT d.* FROM account_payment_details d JOIN account_movements m ON m.id=d.account_movement_id
        WHERE m.business_unit_id=${unit.id} AND m.type='pago' AND m.created_at>=${range.start} AND m.created_at<${range.end}`);
      const expenses = await rows(tx, sql`SELECT e.*, (SELECT due_date FROM warehouse_fixed_occurrences f WHERE f.expense_id=e.id) fixed_due_date FROM warehouse_expenses e WHERE business_unit_id=${unit.id} AND deleted_at IS NULL
        AND occurred_at>=${range.start} AND occurred_at<${range.end} ORDER BY occurred_at DESC,id DESC`);
      const accountSnapshots = await rows(tx,sql`SELECT p.* FROM warehouse_payment_parts p JOIN account_movements m ON m.id=p.account_movement_id WHERE m.business_unit_id=${unit.id} AND m.created_at>=${range.start} AND m.created_at<${range.end}`);
      const paymentDetails = await rows(tx, sql`SELECT p.* FROM warehouse_payment_parts p JOIN warehouse_receipts r ON r.id=p.receipt_id WHERE r.business_unit_id=${unit.id} AND r.occurred_at>=${range.start} AND r.occurred_at<${range.end}`);
      const fixedOccurrences = await rows(tx,sql`SELECT f.*,e.occurred_at paid_at FROM warehouse_fixed_occurrences f LEFT JOIN warehouse_expenses e ON e.id=f.expense_id WHERE f.business_unit_id=${unit.id} AND f.due_date=${date}`);
      const pendingExpenses = fixedOccurrences.filter(e=>!e.expense_id);
      return { fixedOccurrences, pendingExpenses, date, orders: orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id) })), receipts: receipts.map(r=>({...r,payments:paymentDetails.filter(p=>p.receipt_id===r.id)})),
        accountPayments: accountPayments.map((p) => ({ ...p, payments: parts.filter((d) => d.account_movement_id === p.id), snapshots:accountSnapshots.filter(d=>d.account_movement_id===p.id) })), expenses };
    });
  },
  async expense(unit, data, userId, id = null, remove = false) {
    assertUnit(unit);
    const now = getArgentinaTime().datetime;
    const requestKey = id ? null : key(data.idempotencyKey);
    return runWarehouseTransaction(async (tx) => {
      let previous;
      if (id) {
        [previous] = await rows(tx, sql`SELECT * FROM warehouse_expenses WHERE id=${Number(id)} AND business_unit_id=${unit.id}`);
        if (!previous || previous.deleted_at) fail(404, "Gasto no encontrado.");
        const [fixed] = await rows(tx,sql`SELECT id FROM warehouse_fixed_occurrences WHERE expense_id=${previous.id}`);
        if (fixed) fail(409,'Los gastos fijos pagados conservan su historial y no se pueden editar ni eliminar.');
        if (data.expectedVersion !== previous.version) fail(409, "El gasto cambió. Actualizá antes de reintentar.");
      } else {
        const [duplicate] = await rows(tx, sql`SELECT * FROM warehouse_expenses WHERE business_unit_id=${unit.id} AND idempotency_key=${requestKey}`);
        if (duplicate) return { ...duplicate, duplicated: true };
      }
      let result;
      if (remove) {
        [result] = await rows(tx, sql`UPDATE warehouse_expenses SET deleted_at=${now},updated_at=${now},version=version+1 WHERE id=${previous.id} RETURNING *`);
      } else {
        const concept = String(data.concept || "").trim();
        if (!concept || concept.length > 200) fail(400, "Ingresá un concepto de hasta 200 caracteres.");
        const description = String(data.description || "").trim().slice(0, 2000);
        const amount = cents(data.amount), occurred = timestamp(data.occurredAt);
        if (!["cash", "transfer"].includes(data.method)) fail(400, "Seleccioná efectivo o transferencia.");
        if (previous) [result] = await rows(tx, sql`UPDATE warehouse_expenses SET concept=${concept},description=${description},amount_cents=${amount},method=${data.method},occurred_at=${occurred},updated_at=${now},version=version+1 WHERE id=${previous.id} RETURNING *`);
        else [result] = await rows(tx, sql`INSERT INTO warehouse_expenses (business_unit_id,concept,description,amount_cents,method,occurred_at,user_id,idempotency_key,created_at,updated_at)
          VALUES (${unit.id},${concept},${description},${amount},${data.method},${occurred},${userId},${requestKey},${now},${now}) RETURNING *`);
      }
      await tx.run(sql`INSERT INTO warehouse_expense_audit (expense_id,action,snapshot,user_id,created_at)
        VALUES (${result.id},${remove ? "delete" : previous ? "update" : "create"},${JSON.stringify({ before: previous || null, after: result })},${userId},${now})`);
      return result;
    });
  },
  async receipt(unit, orderId, data, userId) {
    assertUnit(unit);
    const requestKey = key(data.idempotencyKey), now = getArgentinaTime().datetime;
    return runWarehouseTransaction(async (tx) => {
      const [duplicate] = await rows(tx, sql`SELECT * FROM warehouse_receipts WHERE business_unit_id=${unit.id} AND idempotency_key=${requestKey}`);
      if (duplicate) {
        if (duplicate.order_id!==Number(orderId)) fail(409,'Clave de operación utilizada para otro pedido.');
        return { ...duplicate, payments: await rows(tx,sql`SELECT * FROM warehouse_payment_parts WHERE receipt_id=${duplicate.id}`), duplicated: true };
      }
      const [order] = await rows(tx, sql`SELECT * FROM warehouse_orders WHERE id=${Number(orderId)} AND business_unit_id=${unit.id}`);
      if (!order) fail(404, "Pedido no encontrado.");
      if (order.charge_to_account) fail(409, "Registrá este cobro en Clientes y cuentas para mantener el saldo del cliente.");
      let cash, transfer, reversal = null, parts = [];
      if (data.reversalOfId) {
        const [original] = await rows(tx, sql`SELECT * FROM warehouse_receipts WHERE id=${Number(data.reversalOfId)} AND order_id=${order.id} AND business_unit_id=${unit.id} AND reversal_of_id IS NULL`);
        if (!original) fail(404, "Cobro original no encontrado.");
        const [existing] = await rows(tx, sql`SELECT id FROM warehouse_receipts WHERE reversal_of_id=${original.id}`);
        if (existing) fail(409, "El cobro ya fue devuelto.");
        if (!String(data.reason || "").trim()) fail(400, "Indicá el motivo de la devolución.");
        parts = (await rows(tx,sql`SELECT * FROM warehouse_payment_parts WHERE receipt_id=${original.id}`)).map(p=>({...p,base_cents:-p.base_cents,surcharge_cents:-p.surcharge_cents}));
        cash = -original.cash_cents; transfer = -original.transfer_cents; reversal = original.id;
      } else {
        if (["draft", "cancelled"].includes(order.status)) fail(409, "No se pueden cobrar borradores ni pedidos anulados.");
        parts = await paymentParts(tx,unit.id,data);
        // Las columnas antiguas conservan el capital compatible; el desglose de medios
        // y los ingresos reales provienen de warehouse_payment_parts.
        cash = parts.filter(p=>p.kind==='cash').reduce((s,p)=>s+p.base_cents,0);
        transfer = parts.filter(p=>p.kind!=='cash').reduce((s,p)=>s+p.base_cents,0);
        const [paid] = await rows(tx, sql`SELECT COALESCE(sum(cash_cents+transfer_cents),0) amount FROM warehouse_receipts WHERE order_id=${order.id}`);
        if (cash + transfer <= 0 || cash + transfer > Math.round(order.total * 100) - paid.amount) fail(400, "El cobro debe ser positivo y no superar el saldo pendiente.");
      }
      const occurred = timestamp(data.occurredAt);
      const [result] = await rows(tx, sql`INSERT INTO warehouse_receipts (business_unit_id,order_id,cash_cents,transfer_cents,occurred_at,reversal_of_id,reason,user_id,idempotency_key,created_at)
        VALUES (${unit.id},${order.id},${cash},${transfer},${occurred},${reversal},${String(data.reason || "").slice(0,2000)},${userId},${requestKey},${now}) RETURNING *`);
      await storeParts(tx,parts,result.id);
      return { ...result, payments: parts };
    });
  },
};
