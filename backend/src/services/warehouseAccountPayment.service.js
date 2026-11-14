import { sql } from 'drizzle-orm';
import { runWarehouseTransaction } from './warehouse.service.js';
import { assertWarehouse, fail, paymentParts, storeParts } from './warehouseSettings.service.js';
import { getArgentinaTime } from '../db/timeUtils.js';

export async function warehouseAccountPayment(unit, customerId, data, userId) {
  assertWarehouse(unit);
  if (typeof data.idempotencyKey !== 'string' || !data.idempotencyKey.trim() || data.idempotencyKey.length>150) fail(400,'Se requiere una clave de operación válida.');
  return runWarehouseTransaction(async tx=>{
    const [customer] = await tx.all(sql`SELECT id FROM customers WHERE id=${Number(customerId)} AND business_unit_id=${unit.id}`);
    if (!customer) fail(404,'Cliente no encontrado.');
    const [duplicate] = await tx.all(sql`SELECT * FROM account_movements WHERE business_unit_id=${unit.id} AND idempotency_key=${data.idempotencyKey}`);
    if (duplicate) {
      if (duplicate.customer_id!==customer.id) fail(409,'Clave de operación utilizada para otro cliente.');
      return {...duplicate,duplicated:true};
    }
    let entries = data.payments;
    if (!Array.isArray(entries)) {
      const [method] = await tx.all(sql`SELECT id FROM warehouse_payment_methods WHERE business_unit_id=${unit.id} AND lower(name)=lower(${String(data.methodName || '')}) AND active=1`);
      entries = [{paymentMethodId:method?.id,amount:data.amount}];
    }
    const parts = await paymentParts(tx,unit.id,{...data,payments:entries});
    const base = parts.reduce((s,p)=>s+p.base_cents,0);
    const [balance] = await tx.all(sql`SELECT COALESCE(sum(CASE WHEN type='cargo' THEN round(amount*100) WHEN type IN ('pago','reversion_cargo') THEN -round(amount*100) ELSE 0 END),0) debt
      FROM account_movements WHERE customer_id=${customer.id} AND business_unit_id=${unit.id}`);
    if (base>balance.debt) fail(400,'El importe a cancelar supera la deuda actual.');
    const now = getArgentinaTime().datetime;
    const [movement] = await tx.all(sql`INSERT INTO account_movements(customer_id,business_unit_id,type,amount,method_name,detail,user_id,created_at,idempotency_key)
      VALUES(${customer.id},${unit.id},'pago',${base/100},${parts.length===1?parts[0].method_name:'Pago combinado'},${String(data.description||'').slice(0,2000)},${userId},${now},${data.idempotencyKey}) RETURNING *`);
    await storeParts(tx,parts,null,movement.id);
    // El movimiento cancela sólo capital. El detalle registra el ingreso real, con recargo.
    for (const p of parts) await tx.run(sql`INSERT INTO account_payment_details(account_movement_id,method_name,amount) VALUES(${movement.id},${p.method_name},${(p.base_cents+p.surcharge_cents)/100})`);
    return {...movement,payments:parts,debt:(balance.debt-base)/100};
  });
}
