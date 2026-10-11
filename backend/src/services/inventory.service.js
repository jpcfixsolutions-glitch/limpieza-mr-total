import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  businessUnitProducts,
  businessUnits,
  inventoryMovements,
  inventoryTransfers,
  products,
} from "../db/schema.js";
import { getArgentinaTime } from "../db/timeUtils.js";

function positiveInteger(value, label = "La cantidad") {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw { status: 400, message: `${label} debe ser un entero mayor a cero.` };
  }
  return parsed;
}

export async function findBusinessUnitByCode(code, executor = db) {
  return executor.select().from(businessUnits)
    .where(eq(businessUnits.code, String(code).toUpperCase())).then((rows) => rows[0]);
}

export async function ensureInventoryBalance(tx, businessUnitId, productId) {
  const existing = await tx.select().from(businessUnitProducts).where(and(
    eq(businessUnitProducts.businessUnitId, businessUnitId),
    eq(businessUnitProducts.productId, productId)
  )).then((rows) => rows[0]);
  if (existing) return existing;

  const product = await tx.select().from(products).where(eq(products.id, productId)).then((rows) => rows[0]);
  if (!product) throw { status: 404, message: "Producto no encontrado." };
  await tx.insert(businessUnitProducts).values({
    businessUnitId,
    productId,
    stock: 0,
    minStock: 0,
    cost: Number(product.cost || 0),
    salePrice: Number(product.price || 0),
    isAvailable: true,
    fulfillmentMode: "OWN_STOCK",
    updatedAt: getArgentinaTime().datetime,
  }).onConflictDoNothing();
  return tx.select().from(businessUnitProducts).where(and(
    eq(businessUnitProducts.businessUnitId, businessUnitId),
    eq(businessUnitProducts.productId, productId)
  )).then((rows) => rows[0]);
}

export async function adjustInventoryInTransaction(tx, {
  businessUnitId,
  productId,
  direction,
  quantity,
  movementType,
  unitCost = 0,
  counterpartBusinessUnitId = null,
  sourceType = null,
  sourceId = null,
  sourceItemId = null,
  idempotencyKey,
  reversalOfMovementId = null,
  userId = null,
  notes = null,
}) {
  const amount = positiveInteger(quantity);
  if (!idempotencyKey) throw new Error("Todo movimiento de inventario requiere una clave de idempotencia.");
  const duplicate = await tx.select().from(inventoryMovements)
    .where(eq(inventoryMovements.idempotencyKey, idempotencyKey)).then((rows) => rows[0]);
  if (duplicate) return { movement: duplicate, duplicated: true };

  const balance = await ensureInventoryBalance(tx, businessUnitId, productId);
  const before = Number(balance.stock);
  const after = direction === "IN" ? before + amount : before - amount;
  if (direction !== "IN" && direction !== "OUT") throw { status: 400, message: "Dirección de inventario inválida." };
  if (after < 0) {
    const product = await tx.select({ name: products.name }).from(products)
      .where(eq(products.id, productId)).then((rows) => rows[0]);
    throw { status: 409, message: `Stock insuficiente para "${product?.name || `id ${productId}`}". Disponible: ${before}, solicitado: ${amount}.` };
  }

  const condition = direction === "OUT"
    ? and(eq(businessUnitProducts.id, balance.id), gte(businessUnitProducts.stock, amount))
    : eq(businessUnitProducts.id, balance.id);
  const updated = await tx.update(businessUnitProducts).set({
    stock: direction === "IN"
      ? sql`${businessUnitProducts.stock} + ${amount}`
      : sql`${businessUnitProducts.stock} - ${amount}`,
    updatedAt: getArgentinaTime().datetime,
  }).where(condition).returning({ stock: businessUnitProducts.stock });
  if (!updated.length) {
    throw { status: 409, message: "El stock cambió durante la operación. Volvé a intentarlo." };
  }

  const unit = await tx.select({ code: businessUnits.code }).from(businessUnits)
    .where(eq(businessUnits.id, businessUnitId)).then((rows) => rows[0]);
  if (unit?.code === "LOCAL") {
    await tx.update(products).set({ stock: Number(updated[0].stock) }).where(eq(products.id, productId));
  }

  const [movement] = await tx.insert(inventoryMovements).values({
    businessUnitId,
    productId,
    movementType,
    direction,
    quantity: amount,
    unitCost: Number(unitCost || 0),
    stockBefore: before,
    stockAfter: Number(updated[0].stock),
    counterpartBusinessUnitId,
    sourceType,
    sourceId: sourceId == null ? null : String(sourceId),
    sourceItemId: sourceItemId == null ? null : String(sourceItemId),
    idempotencyKey,
    reversalOfMovementId,
    userId,
    notes,
    createdAt: getArgentinaTime().datetime,
  }).returning();
  return { movement, duplicated: false };
}

export const InventoryService = {
  async listMovements(businessUnitId, { limit = 200 } = {}) {
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 200));
    return db.select({
      id: inventoryMovements.id,
      productId: inventoryMovements.productId,
      productName: products.name,
      movementType: inventoryMovements.movementType,
      direction: inventoryMovements.direction,
      quantity: inventoryMovements.quantity,
      unitCost: inventoryMovements.unitCost,
      stockBefore: inventoryMovements.stockBefore,
      stockAfter: inventoryMovements.stockAfter,
      sourceType: inventoryMovements.sourceType,
      sourceId: inventoryMovements.sourceId,
      notes: inventoryMovements.notes,
      createdAt: inventoryMovements.createdAt,
    }).from(inventoryMovements)
      .innerJoin(products, eq(inventoryMovements.productId, products.id))
      .where(eq(inventoryMovements.businessUnitId, businessUnitId))
      .orderBy(desc(inventoryMovements.createdAt), desc(inventoryMovements.id))
      .limit(safeLimit);
  },

  async transfer({ productId, quantity, idempotencyKey, notes }, userId) {
    if (!idempotencyKey) throw { status: 400, message: "La transferencia requiere una clave de idempotencia." };
    const amount = positiveInteger(quantity);
    const product = Number(productId);
    return db.transaction(async (tx) => {
      const duplicate = await tx.select().from(inventoryTransfers)
        .where(eq(inventoryTransfers.idempotencyKey, idempotencyKey)).then((rows) => rows[0]);
      if (duplicate) return { ...duplicate, duplicated: true };
      const warehouse = await findBusinessUnitByCode("WAREHOUSE", tx);
      const local = await findBusinessUnitByCode("LOCAL", tx);
      if (!warehouse || !local) throw new Error("No están configuradas las unidades requeridas.");
      const source = await ensureInventoryBalance(tx, warehouse.id, product);
      const [transfer] = await tx.insert(inventoryTransfers).values({
        fromBusinessUnitId: warehouse.id,
        toBusinessUnitId: local.id,
        productId: product,
        quantity: amount,
        unitCost: Number(source.cost || 0),
        idempotencyKey,
        userId,
        notes: String(notes || "").trim() || null,
        createdAt: getArgentinaTime().datetime,
      }).returning();
      await adjustInventoryInTransaction(tx, {
        businessUnitId: warehouse.id, productId: product, direction: "OUT", quantity: amount,
        movementType: "TRANSFER_OUT", unitCost: source.cost, counterpartBusinessUnitId: local.id,
        sourceType: "inventory_transfer", sourceId: transfer.id, idempotencyKey: `transfer:${idempotencyKey}:out`, userId, notes,
      });
      await adjustInventoryInTransaction(tx, {
        businessUnitId: local.id, productId: product, direction: "IN", quantity: amount,
        movementType: "TRANSFER_IN", unitCost: source.cost, counterpartBusinessUnitId: warehouse.id,
        sourceType: "inventory_transfer", sourceId: transfer.id, idempotencyKey: `transfer:${idempotencyKey}:in`, userId, notes,
      });
      await tx.update(businessUnitProducts).set({ cost: Number(source.cost || 0), updatedAt: getArgentinaTime().datetime })
        .where(and(eq(businessUnitProducts.businessUnitId, local.id), eq(businessUnitProducts.productId, product)));
      await tx.update(products).set({ cost: Number(source.cost || 0) }).where(eq(products.id, product));
      return { ...transfer, duplicated: false };
    });
  },
};
