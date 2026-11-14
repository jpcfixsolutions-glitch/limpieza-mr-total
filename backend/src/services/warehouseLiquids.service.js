import { and, eq, inArray, getTableColumns, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { warehouseLiquidProducts as catalog, warehouseLiquidContainers as containers, warehouseLiquidMovements as movements, businessUnitProducts, products, users } from '../db/schema.js';
import { runWarehouseTransaction } from './warehouseTransaction.js';

const fail = (message, status = 400) => { throw { status, message }; };
export function milliliters(value) {
  const n = Number(value);
  if (!['number','string'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * 1000)) || Math.abs(n * 1000 - Math.round(n * 1000)) > 1e-6) fail('Indicá litros positivos o cero, con hasta tres decimales.');
  return Math.round(n * 1000);
}
function normalize(rows) {
  if (!Array.isArray(rows) || rows.length > 500) fail('Distribución de stock inválida.');
  const normalized = rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail('Envase inválido.');
    const kind = String(row.kind || '').trim();
    const capacityMl = milliliters(row.capacity ?? 0), contentMl = milliliters(row.content);
    const count = Number(row.count);
    if (!kind || kind.length > 60 || !Number.isSafeInteger(count) || count < 1 || count > 100000 || !['WAREHOUSE', 'LOCAL'].includes(row.location)) fail('Revisá tipo, cantidad y ubicación de los envases.');
    if (!Number.isSafeInteger(capacityMl * count)) fail('La capacidad total excede el límite permitido.');
    if (kind === 'Granel' ? capacityMl !== 0 || count !== 1 : capacityMl <= 0 || contentMl > capacityMl * count) fail('El contenido supera la capacidad del envase. Granel debe tener una sola fila sin capacidad nominal.');
    if (count > 1 && contentMl !== 0 && contentMl !== capacityMl * count) fail('Separá el envase parcial del grupo de envases iguales.');
    return { kind, capacityMl, count, contentMl, location: row.location };
  });
  if (!Number.isSafeInteger(normalized.reduce((sum,row)=>sum+row.contentMl,0))) fail('El stock total excede el límite permitido.');
  return normalized;
}
const expose = (row) => ({ ...row, capacity: row.capacityMl / 1000, content: row.contentMl / 1000 });
export async function liquidInventory(executor = db, includeArchived = false) {
  const products = await executor.select().from(catalog).where(eq(catalog.archived, includeArchived));
  const rows = products.length ? await executor.select().from(containers).where(inArray(containers.productId, products.map(p => p.id))) : [];
  return products.map(p => {
    const distribution = rows.filter(c => c.productId === p.id);
    const sum = location => distribution.filter(c => c.location === location).reduce((n, c) => n + c.contentMl, 0) / 1000;
    const stock = sum('WAREHOUSE'), inLocal = sum('LOCAL');
    return { ...p, id: `liquid:${p.id}`, liquidProductId: p.id, codbarra: p.barcode, minStock: p.minStockMl / 1000,
      stock, inLocal, total: (Math.round(stock * 1000) + Math.round(inLocal * 1000)) / 1000,
      isAvailable: !p.archived, unit: 'L', containers: distribution.map(expose),
      status: stock === 0 ? 'Sin stock' : stock <= p.minStockMl / 1000 ? 'Bajo stock' : 'Disponible' };
  });
}
async function audit(tx, productId, userId, operation, before, after, payload, key) {
  await tx.insert(movements).values({ productId, userId, operation, beforeJson: JSON.stringify(before), afterJson: JSON.stringify(after),
    notes: String(payload.notes || operation).slice(0, 1000), idempotencyKey: key, requestJson: JSON.stringify(payload) });
}
export const WarehouseLiquidsService = {
  async list(unit) { this.assert(unit); return liquidInventory(); },
  async legacy(unit) {
    this.assert(unit);
    return db.select({id: products.id, name: products.name, stock: businessUnitProducts.stock})
      .from(businessUnitProducts).innerJoin(products,eq(products.id,businessUnitProducts.productId))
      .where(and(eq(businessUnitProducts.businessUnitId,unit.id),eq(businessUnitProducts.isAvailable,true)));
  },
  assert(unit) { if (unit?.code !== 'WAREHOUSE') fail('Esta operación pertenece al Galpón.', 403); },
  async save(id, payload, userId, unit, employee = false) {
    this.assert(unit);
    if (!payload || typeof payload.idempotencyKey !== 'string' || !payload.idempotencyKey.trim() || payload.idempotencyKey.length > 160) fail('Falta una clave de operación válida.');
    const key = `liquid:${userId}:${payload.idempotencyKey}`;
    return runWarehouseTransaction(async tx => {
      const [duplicate] = await tx.select().from(movements).where(eq(movements.idempotencyKey, key));
      if (duplicate) {
        if (duplicate.requestJson !== JSON.stringify(payload) || (id && duplicate.productId !== Number(id))) fail('La clave ya se usó para otra operación.', 409);
        return { duplicated: true };
      }
      const [before] = id ? await tx.select().from(catalog).where(eq(catalog.id, Number(id))) : [];
      if (id && (!before || before.archived)) fail('Producto del Galpón no encontrado.', 404);
      if (before && payload.expectedVersion !== before.version) fail('El producto cambió en otra sesión. Actualizá antes de guardar.', 409);
      if (employee && (!before || Object.keys(payload).some(k => !['containers','expectedVersion','notes','idempotencyKey'].includes(k)))) fail('Sólo podés modificar la distribución del stock.', 403);
      const previous = before ? await tx.select().from(containers).where(eq(containers.productId, before.id)) : [];
      const rows = normalize(payload.containers ?? previous.map(expose));
      const money = value => { const n = Number(value); if (!Number.isFinite(n) || n < 0) fail('Costo o precio inválido.'); return n; };
      const data = employee ? {} : {
        name: String(payload.name ?? before?.name ?? '').trim(), barcode: String(payload.barcode ?? before?.barcode ?? '').trim() || null,
        category: String(payload.category ?? before?.category ?? '').trim(), cost: money(payload.cost ?? before?.cost ?? 0),
        price: money(payload.price ?? before?.price ?? 0), minStockMl: milliliters(payload.minStock ?? (before?.minStockMl ?? 0) / 1000),
      };
      if (!employee && (!data.name || data.name.length > 160 || data.category.length > 100 || (data.barcode && !/^\d{1,60}$/.test(data.barcode)))) fail('Revisá nombre, categoría y código de barras.');
      const options = await tx.all(sql`SELECT type,name FROM warehouse_stock_options WHERE business_unit_id=${unit.id} AND active=1`);
      if (!employee && data.category && data.category !== before?.category && !options.some(o=>o.type==='category' && o.name===data.category)) fail('Seleccioná una categoría activa de Configuración del Galpón.');
      for (const row of rows) {
        if (row.kind !== 'Granel' && !previous.some(c=>c.kind===row.kind) && !options.some(o=>o.type==='container-type' && o.name===row.kind)) fail('Seleccioná un tipo de envase activo de Configuración del Galpón.');
      }
      let product;
      if (before) {
        [product] = await tx.update(catalog).set({ ...data, version: before.version + 1 }).where(and(eq(catalog.id, before.id), eq(catalog.version, before.version))).returning();
        if (!product) fail('El producto cambió en otra sesión.', 409);
        await tx.delete(containers).where(eq(containers.productId, before.id));
      } else [product] = await tx.insert(catalog).values(data).returning();
      if (rows.length) await tx.insert(containers).values(rows.map(row => ({ ...row, productId: product.id })));
      await audit(tx, product.id, userId, before ? 'UPDATE' : 'CREATE', { product: before, containers: previous }, { product, containers: rows }, payload, key);
      return { liquidProductId: product.id };
    });
  },
  async archive(id, payload, userId, unit) {
    this.assert(unit);
    return runWarehouseTransaction(async tx => {
      const [p] = await tx.select().from(catalog).where(eq(catalog.id, Number(id)));
      if (!p) fail('Producto no encontrado.', 404);
      if (p.archived) return { archived: true };
      if (payload.expectedVersion !== p.version) fail('El producto cambió en otra sesión.', 409);
      const rows = await tx.select().from(containers).where(eq(containers.productId, p.id));
      if (rows.some(c => c.contentMl > 0)) fail('Sólo se puede archivar un producto sin litros. Registrá primero las salidas.', 409);
      const [updated] = await tx.update(catalog).set({ archived: true, version: p.version + 1 }).where(and(eq(catalog.id, p.id), eq(catalog.version, p.version))).returning();
      if (!updated) fail('El producto cambió en otra sesión.', 409);
      await audit(tx, p.id, userId, 'ARCHIVE', p, updated, payload, `archive:${p.id}:${p.version}`);
      return { archived: true };
    });
  },
  async history(id, unit) {
    this.assert(unit);
    return db.select({...getTableColumns(movements),userName:users.name}).from(movements)
      .leftJoin(users,eq(users.id,movements.userId)).where(eq(movements.productId, Number(id))).orderBy(movements.id);
  },
};

// La asignación explícita se elige al despachar. No se toma stock En Local.
export async function dispatchLiquid(tx, item, allocations, userId, reversal = false) {
  const [p] = await tx.select().from(catalog).where(eq(catalog.id, item.liquidProductId));
  if (!p || (!reversal && p.archived)) fail('Producto del Galpón no disponible.', 409);
  const key = `${reversal ? 'return' : 'dispatch'}:liquid:${item.orderId}:${item.id}`;
  const [duplicate] = await tx.select().from(movements).where(eq(movements.idempotencyKey, key));
  if (duplicate) return;
  const before = await tx.select().from(containers).where(eq(containers.productId, p.id));
  if (reversal) {
    // Se devuelve a granel: los envases originales pueden haber sido modificados.
    await tx.insert(containers).values({ productId: p.id, kind: 'Granel', capacityMl: 0, count: 1, contentMl: milliliters(item.quantity), location: 'WAREHOUSE' });
  } else {
    if (!Array.isArray(allocations) || !allocations.length) fail(`Elegí los envases para despachar ${item.productName}.`);
    const seen = new Set(); let total = 0;
    for (const allocation of allocations) {
      const row = before.find(c => c.id === Number(allocation.containerId));
      const ml = milliliters(allocation.liters);
      if (!row || seen.has(row.id) || row.location !== 'WAREHOUSE' || ml <= 0 || ml > row.contentMl) fail('La asignación de envases no es válida o no tiene litros suficientes.', 409);
      seen.add(row.id); total += ml;
      const remaining = row.contentMl - ml;
      if (row.count > 1 && remaining > 0) {
        const full = Math.floor(remaining / row.capacityMl), partial = remaining % row.capacityMl;
        const empty = row.count - full - (partial ? 1 : 0);
        const groups = [
          ...(full ? [{ count: full, contentMl: full * row.capacityMl }] : []),
          ...(partial ? [{ count: 1, contentMl: partial }] : []),
          ...(empty ? [{ count: empty, contentMl: 0 }] : []),
        ];
        await tx.update(containers).set(groups[0]).where(eq(containers.id, row.id));
        for (const group of groups.slice(1)) await tx.insert(containers).values({ productId: p.id, kind: row.kind, capacityMl: row.capacityMl, location: row.location, ...group });
      } else await tx.update(containers).set({ contentMl: remaining }).where(eq(containers.id, row.id));
    }
    if (total !== milliliters(item.quantity)) fail('La suma de envases debe coincidir exactamente con los litros del pedido.');
  }
  const [updated] = await tx.update(catalog).set({ version: p.version + 1 }).where(and(eq(catalog.id, p.id), eq(catalog.version, p.version))).returning();
  if (!updated) fail('El stock cambió en otra sesión.', 409);
  const after = await tx.select().from(containers).where(eq(containers.productId, p.id));
  await audit(tx, p.id, userId, reversal ? 'ORDER_RETURN' : 'ORDER_DISPATCH', before, after, { orderId: item.orderId, itemId: item.id, allocations }, key);
}
