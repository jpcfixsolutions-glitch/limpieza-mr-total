import { sql } from "drizzle-orm";
import { getArgentinaTime } from "../db/timeUtils.js";
import { runWarehouseTransaction } from "./warehouse.service.js";

export const fail = (status, message) => { throw { status, message }; };
export function assertWarehouse(unit) { if (unit?.code !== 'WAREHOUSE') fail(403, 'Esta operación pertenece al Galpón.'); }
export function moneyCents(value, zero = false) {
  if (!["number", "string"].includes(typeof value) || String(value).trim() === '') fail(400, 'Importe inválido.');
  const n = Number(value), c = Math.round(n * 100);
  if (!Number.isSafeInteger(c) || c < (zero ? 0 : 1) || Math.abs(n * 100 - c) > 0.000001) fail(400, 'Ingresá un importe válido con hasta dos decimales.');
  return c;
}
export function validDate(value) {
  const d = new Date(`${value}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || !Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== value) fail(400,'Fecha inválida.');
  return value;
}
export function nextDue(start, frequency, day, after = false) {
  const d = new Date(`${validDate(start)}T12:00:00Z`);
  if (frequency === 'week') {
    let delta = (day - (d.getUTCDay() || 7) + 7) % 7;
    if (after && delta === 0) delta = 7;
    d.setUTCDate(d.getUTCDate() + delta);
  } else {
    const candidate = (offset) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+offset, Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+offset+1,0)).getUTCDate()),12));
    let result = candidate(0);
    if (result < d || (after && result.getTime() === d.getTime())) result = candidate(1);
    return result.toISOString().slice(0,10);
  }
  return d.toISOString().slice(0,10);
}
export async function materializeFixed(tx, unitId, through = getArgentinaTime().datetime.slice(0,10)) {
  const configs = await tx.all(sql`SELECT * FROM warehouse_fixed_expenses WHERE business_unit_id=${unitId} AND active=1 AND next_due<=${through}`);
  for (const config of configs) {
    let due = config.next_due;
    while (due <= through) {
      await tx.run(sql`INSERT OR IGNORE INTO warehouse_fixed_occurrences(business_unit_id,fixed_expense_id,due_date,concept,description,amount_cents)
        VALUES(${unitId},${config.id},${due},${config.name},${config.description},${config.amount_cents})`);
      due = nextDue(due, config.frequency, config.due_day, true);
    }
    await tx.run(sql`UPDATE warehouse_fixed_expenses SET next_due=${due} WHERE id=${config.id}`);
  }
}
export async function paymentParts(tx, unitId, data) {
  let entries = data.payments;
  if (!Array.isArray(entries)) {
    entries = [];
    for (const [kind, value] of [['cash', data.cash ?? 0], ['transfer', data.transfer ?? 0]]) {
      const amount = moneyCents(value, true);
      if (amount) {
        const [method] = await tx.all(sql`SELECT id FROM warehouse_payment_methods WHERE business_unit_id=${unitId} AND active=1 AND kind=${kind} ORDER BY id LIMIT 1`);
        entries.push({ paymentMethodId: method?.id, amount: amount / 100 });
      }
    }
  }
  if (!entries.length || entries.length > 20) fail(400,'Indicá entre uno y veinte medios de pago.');
  const parts = [];
  for (const entry of entries) {
    if (!entry || typeof entry!=='object' || !Number.isSafeInteger(Number(entry.paymentMethodId)) || Number(entry.paymentMethodId)<=0) fail(400,'Método de pago inválido.');
    const [method] = await tx.all(sql`SELECT * FROM warehouse_payment_methods WHERE id=${Number(entry.paymentMethodId)} AND business_unit_id=${unitId} AND active=1`);
    if (!method) fail(400,'Método de pago inválido o inactivo.');
    if (entry.expectedSurchargeBps !== undefined && entry.expectedSurchargeBps !== method.surcharge_bps) fail(409,'El recargo cambió. Actualizá los métodos y revisá el total.');
    const base = moneyCents(entry.amount);
    const product = base * method.surcharge_bps;
    if (!Number.isSafeInteger(product + 5000)) fail(400,'Importe fuera de rango.');
    parts.push({ method_id: method.id, method_name: method.name, kind: method.kind, base_cents: base, surcharge_bps: method.surcharge_bps, surcharge_cents: Math.floor((product + 5000) / 10000) });
  }
  if (!Number.isSafeInteger(parts.reduce((s,p)=>s+p.base_cents+p.surcharge_cents,0))) fail(400,'Importe fuera de rango.');
  return parts;
}
export async function storeParts(tx, parts, receiptId = null, movementId = null) {
  for (const p of parts) await tx.run(sql`INSERT INTO warehouse_payment_parts(receipt_id,account_movement_id,method_id,method_name,kind,base_cents,surcharge_bps,surcharge_cents)
    VALUES(${receiptId},${movementId},${p.method_id},${p.method_name},${p.kind},${p.base_cents},${p.surcharge_bps},${p.surcharge_cents})`);
}
async function audit(tx, unit, entity, id, before, after, userId) {
  await tx.run(sql`INSERT INTO warehouse_settings_audit(business_unit_id,entity,entity_id,snapshot,user_id,created_at)
    VALUES(${unit.id},${entity},${id},${JSON.stringify({before,after})},${userId},${getArgentinaTime().datetime})`);
}
export const WarehouseSettingsService = {
  async get(unit) {
    assertWarehouse(unit);
    return runWarehouseTransaction(async tx => {
      await materializeFixed(tx,unit.id);
      const expenses = await tx.all(sql`SELECT * FROM warehouse_fixed_expenses WHERE business_unit_id=${unit.id} ORDER BY name`);
      const methods = await tx.all(sql`SELECT * FROM warehouse_payment_methods WHERE business_unit_id=${unit.id} ORDER BY id`);
      return { expenses, methods, monthlyEstimateCents: Math.round(expenses.filter(e=>e.active).reduce((s,e)=>s+e.amount_cents*(e.frequency==='week'?52/12:1),0)) };
    });
  },
  async save(unit, entity, data, userId, id) {
    assertWarehouse(unit);
    if (!['expense','method'].includes(entity)) fail(400,'Tipo de configuración inválido.');
    const table = entity === 'expense' ? 'warehouse_fixed_expenses' : 'warehouse_payment_methods';
    return runWarehouseTransaction(async tx => {
      await materializeFixed(tx,unit.id);
      const [before] = id ? await tx.all(sql`SELECT * FROM ${sql.raw(table)} WHERE id=${Number(id)} AND business_unit_id=${unit.id}`) : [];
      if (id && !before) fail(404,'Configuración no encontrada.');
      if (before && data.expectedVersion !== before.version) fail(409,'La configuración cambió. Actualizá e intentá nuevamente.');
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name || name.length > 200) fail(400,'Ingresá un nombre de hasta 200 caracteres.');
      const nameKey = name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
      const [duplicate] = await tx.all(sql`SELECT id FROM ${sql.raw(table)} WHERE business_unit_id=${unit.id} AND name_key=${nameKey} AND id!=${before?.id || 0}`);
      if (duplicate) fail(409,'Ya existe una configuración con ese nombre.');
      if (data.active !== undefined && typeof data.active !== 'boolean' && ![0,1].includes(data.active)) fail(400,'Estado inválido.');
      const active = data.active === undefined ? 1 : Number(data.active);
      let result;
      if (entity === 'expense') {
        const amount = moneyCents(data.amount), frequency = data.frequency, day = Number(data.dueDay), start = validDate(data.startDate);
        if (!['week','month'].includes(frequency) || !Number.isInteger(day) || day<1 || day>(frequency==='week'?7:31) || start<'2000-01-01') fail(400,'Frecuencia, vencimiento o fecha de inicio inválidos (desde 2000).');
        const description = String(data.description || '').trim().slice(0,2000);
        // Ya materializamos los vencimientos anteriores con sus importes originales.
        const today = getArgentinaTime().datetime.slice(0,10);
        const effective = before ? (start > today ? start : today) : start;
        const due = before && before.frequency===frequency && before.due_day===day && before.start_date===start && before.active===active
          ? before.next_due : nextDue(effective,frequency,day,!!before && effective===today);
        if (before) [result] = await tx.all(sql`UPDATE warehouse_fixed_expenses SET name=${name},name_key=${nameKey},description=${description},amount_cents=${amount},frequency=${frequency},due_day=${day},start_date=${start},next_due=${due},active=${active},version=version+1 WHERE id=${before.id} RETURNING *`);
        else [result] = await tx.all(sql`INSERT INTO warehouse_fixed_expenses(business_unit_id,name,name_key,description,amount_cents,frequency,due_day,start_date,next_due,active)
          VALUES(${unit.id},${name},${nameKey},${description},${amount},${frequency},${day},${start},${due},${active}) RETURNING *`);
      } else {
        const bps = moneyCents(data.surcharge, true);
        if (bps>10000 || !['cash','transfer','other'].includes(data.kind)) fail(400,'Recargo entre 0 y 100%, con hasta dos decimales, y tipo de medio válido.');
        if (before) [result] = await tx.all(sql`UPDATE warehouse_payment_methods SET name=${name},name_key=${nameKey},surcharge_bps=${bps},kind=${data.kind},active=${active},version=version+1 WHERE id=${before.id} RETURNING *`);
        else [result] = await tx.all(sql`INSERT INTO warehouse_payment_methods(business_unit_id,name,name_key,surcharge_bps,kind,active) VALUES(${unit.id},${name},${nameKey},${bps},${data.kind},${active}) RETURNING *`);
      }
      await audit(tx,unit,entity,result.id,before || null,result,userId);
      await materializeFixed(tx,unit.id);
      return result;
    });
  },
  async settle(unit, id, data, userId) {
    assertWarehouse(unit);
    if (!['cash','transfer'].includes(data.method)) fail(400,'Seleccioná efectivo o transferencia.');
    const date = validDate(data.date);
    if (date>getArgentinaTime().datetime.slice(0,10)) fail(400,'El pago no puede tener fecha futura.');
    return runWarehouseTransaction(async tx=>{
      const [occurrence] = await tx.all(sql`SELECT * FROM warehouse_fixed_occurrences WHERE id=${Number(id)} AND business_unit_id=${unit.id}`);
      if (!occurrence) fail(404,'Vencimiento no encontrado.');
      if (occurrence.expense_id) return { id: occurrence.expense_id, duplicated: true };
      if (date<occurrence.due_date) fail(400,'La fecha de pago no puede ser anterior al vencimiento.');
      const now = getArgentinaTime().datetime;
      const [expense] = await tx.all(sql`INSERT INTO warehouse_expenses(business_unit_id,concept,description,amount_cents,method,occurred_at,user_id,idempotency_key,created_at,updated_at)
        VALUES(${unit.id},${occurrence.concept},${occurrence.description},${occurrence.amount_cents},${data.method},${date+' 12:00:00'},${userId},${'fixed:'+occurrence.id},${now},${now}) RETURNING *`);
      await tx.run(sql`UPDATE warehouse_fixed_occurrences SET expense_id=${expense.id} WHERE id=${occurrence.id}`);
      await tx.run(sql`INSERT INTO warehouse_expense_audit(expense_id,action,snapshot,user_id,created_at) VALUES(${expense.id},'create',${JSON.stringify({before:null,after:expense})},${userId},${now})`);
      return expense;
    });
  },
};
