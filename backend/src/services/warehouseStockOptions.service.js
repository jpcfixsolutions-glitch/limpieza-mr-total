import { sql } from 'drizzle-orm';
import { runWarehouseTransaction } from './warehouseTransaction.js';

const fail = (status,message) => { throw {status,message}; };
const nameKey = name => name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
function assertUnit(unit) { if (unit?.code !== 'WAREHOUSE') fail(403,'Esta configuración pertenece al Galpón.'); }
export const WarehouseStockOptionsService = {
  async list(unit, includeInactive = false) {
    assertUnit(unit);
    return runWarehouseTransaction(async tx => {
      const rows = await tx.all(sql`SELECT id,type,name,active,version FROM warehouse_stock_options WHERE business_unit_id=${unit.id} ${includeInactive ? sql`` : sql`AND active=1`} ORDER BY name`);
      return {categories:rows.filter(r=>r.type==='category'),containerTypes:rows.filter(r=>r.type==='container-type')};
    });
  },
  async save(unit,type,data,userId,id,remove = false) {
    assertUnit(unit);
    if (!['category','container-type'].includes(type)) fail(400,'Tipo de configuración inválido.');
    if (!data || typeof data !== 'object') fail(400,'Configuración inválida.');
    if (id !== undefined && (!Number.isSafeInteger(Number(id)) || Number(id)<=0)) fail(400,'Identificador inválido.');
    return runWarehouseTransaction(async tx => {
      const [before] = id ? await tx.all(sql`SELECT * FROM warehouse_stock_options WHERE id=${Number(id)} AND business_unit_id=${unit.id} AND type=${type}`) : [];
      if (id && !before) fail(404,'Opción no encontrada.');
      if (before && data.expectedVersion !== before.version) fail(409,'La opción cambió en otra sesión. Actualizá antes de guardar.');
      const name = remove ? before.name : typeof data.name==='string' ? data.name.trim() : '';
      if (!name || name.length>100) fail(400,'Ingresá un nombre de hasta 100 caracteres.');
      const key = nameKey(name);
      if (type==='container-type' && key==='granel') fail(400,'Granel es una modalidad de almacenamiento disponible siempre; no necesita un tipo de envase.');
      if (data.active !== undefined && typeof data.active !== 'boolean') fail(400,'Estado inválido.');
      const active = remove ? 0 : data.active === undefined ? before?.active ?? 1 : Number(data.active);
      const [duplicate] = await tx.all(sql`SELECT id FROM warehouse_stock_options WHERE business_unit_id=${unit.id} AND type=${type} AND name_key=${key} AND id!=${before?.id || 0}`);
      if (duplicate) fail(409,'Ya existe una opción con ese nombre. Podés reactivar la opción eliminada.');
      let after;
      if (before) [after] = await tx.all(sql`UPDATE warehouse_stock_options SET name=${name},name_key=${key},active=${active},version=version+1 WHERE id=${before.id} AND version=${before.version} RETURNING *`);
      else [after] = await tx.all(sql`INSERT INTO warehouse_stock_options(business_unit_id,type,name,name_key,active) VALUES(${unit.id},${type},${name},${key},${active}) RETURNING *`);
      if (!after) fail(409,'La opción cambió en otra sesión.');
      await tx.run(sql`INSERT INTO warehouse_stock_options_audit(option_id,user_id,before_json,after_json) VALUES(${after.id},${userId},${JSON.stringify(before || null)},${JSON.stringify(after)})`);
      return after;
    });
  },
};
