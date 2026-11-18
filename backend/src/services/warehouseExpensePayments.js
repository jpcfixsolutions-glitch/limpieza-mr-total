import { sql } from 'drizzle-orm';
import { getArgentinaTime } from '../db/timeUtils.js';

const fail = (status, message) => { throw { status, message }; };
export function paymentTimestamp(value) {
  const now = getArgentinaTime().datetime;
  if (!value) return now;
  const text = String(value).replace('T', ' ');
  const normalized = text.length === 16 ? `${text}:00` : text;
  const parsed = new Date(normalized.replace(' ', 'T') + '-03:00');
  if (!/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(normalized)
    || !Number.isFinite(parsed.getTime())
    || new Date(parsed.getTime() - 3 * 3600000).toISOString().slice(0,19).replace('T',' ') !== normalized
    || normalized > now) fail(400, 'Fecha y hora de pago inválidas o futuras (Argentina).');
  return normalized;
}

export async function changeExpensePayment(tx, unitId, id, data, userId) {
  if (!['pending','paid'].includes(data.status)) fail(400, 'Estado de gasto inválido.');
  const [before] = await tx.all(sql`SELECT * FROM warehouse_expenses WHERE id=${Number(id)} AND business_unit_id=${unitId} AND deleted_at IS NULL`);
  if (!before) fail(404, 'Gasto no encontrado.');
  if (data.expectedVersion !== before.version) fail(409, 'El gasto cambió. Actualizá antes de reintentar.');
  if (before.status === data.status) return { ...before, duplicated: true };
  if (data.status === 'paid' && !['cash','transfer'].includes(data.method)) fail(400, 'Seleccioná efectivo o transferencia.');
  const now = getArgentinaTime().datetime;
  const paidAt = data.status === 'paid' ? paymentTimestamp(data.paidAt) : null;
  const [after] = await tx.all(sql`UPDATE warehouse_expenses SET status=${data.status},paid_at=${paidAt},
    method=${data.status === 'paid' ? data.method : before.method},status_changed_at=${now},updated_at=${now},version=version+1
    WHERE id=${before.id} AND version=${before.version} RETURNING *`);
  if (!after) fail(409, 'El gasto cambió. Actualizá antes de reintentar.');
  await tx.run(sql`INSERT INTO warehouse_expense_audit(expense_id,action,snapshot,user_id,created_at)
    VALUES(${id},${data.status === 'paid' ? 'pay' : 'reverse_payment'},${JSON.stringify({before,after})},${userId},${now})`);
  return after;
}
