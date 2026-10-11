import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  accountMovements, businessUnitProducts, customers, inventoryMovements, products,
  warehouseOrderItems, warehouseOrders, warehousePurchaseItems, warehousePurchases,
} from "../db/schema.js";
import { getArgentinaTime } from "../db/timeUtils.js";
import { adjustInventoryInTransaction, ensureInventoryBalance } from "./inventory.service.js";

function positiveInteger(value, label = "La cantidad") {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw { status: 400, message: `${label} debe ser un entero mayor a cero.` };
  return parsed;
}

function assertWarehouse(unit) {
  if (unit?.code !== "WAREHOUSE") throw { status: 403, message: "Esta operación pertenece exclusivamente al Galpón." };
}

async function hydrateOrders(rows, executor = db) {
  if (!rows.length) return [];
  const items = await executor.select().from(warehouseOrderItems)
    .where(inArray(warehouseOrderItems.orderId, rows.map((row) => row.id)));
  const byOrder = new Map();
  for (const item of items) (byOrder.get(item.orderId) || (byOrder.set(item.orderId, []), byOrder.get(item.orderId))).push(item);
  return rows.map((row) => ({ ...row, items: byOrder.get(row.id) || [] }));
}

async function hydratePurchases(rows, executor = db) {
  if (!rows.length) return [];
  const items = await executor.select().from(warehousePurchaseItems)
    .where(inArray(warehousePurchaseItems.purchaseId, rows.map((row) => row.id)));
  const byPurchase = new Map();
  for (const item of items) (byPurchase.get(item.purchaseId) || (byPurchase.set(item.purchaseId, []), byPurchase.get(item.purchaseId))).push(item);
  return rows.map((row) => ({ ...row, items: byPurchase.get(row.id) || [] }));
}

async function snapshotItems(tx, unitId, rawItems, kind) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw { status: 400, message: "Agregá al menos un producto." };
  const normalized = rawItems.map((item) => ({
    productId: positiveInteger(item.productId, "El producto"),
    quantity: positiveInteger(item.quantity),
    value: Number(kind === "order" ? (item.unitPrice ?? item.price) : item.unitCost),
  }));
  if (normalized.some((item) => !Number.isFinite(item.value) || item.value < 0)) throw { status: 400, message: "Hay un precio o costo inválido." };
  const ids = [...new Set(normalized.map((item) => item.productId))];
  const rows = await tx.select({ product: products, inventory: businessUnitProducts })
    .from(products).leftJoin(businessUnitProducts, and(
      eq(businessUnitProducts.productId, products.id), eq(businessUnitProducts.businessUnitId, unitId)
    )).where(inArray(products.id, ids));
  const byId = new Map(rows.map((row) => [row.product.id, row]));
  return normalized.map((item) => {
    const row = byId.get(item.productId);
    if (!row) throw { status: 400, message: `Producto inexistente (id ${item.productId}).` };
    const inventory = row.inventory;
    if (kind === "order" && (!inventory || !inventory.isAvailable)) throw { status: 400, message: `"${row.product.name}" no está disponible en el Galpón.` };
    const unitPrice = kind === "order" ? item.value : 0;
    const unitCost = kind === "purchase" ? item.value : Number(inventory?.cost || row.product.cost || 0);
    return { productId: item.productId, productName: row.product.name, quantity: item.quantity, unitPrice, unitCost, total: item.quantity * (kind === "order" ? unitPrice : unitCost) };
  });
}

export const WarehouseService = {
  async listOrders(unit) {
    assertWarehouse(unit);
    const rows = await db.select({
      id: warehouseOrders.id, businessUnitId: warehouseOrders.businessUnitId, customerId: warehouseOrders.customerId,
      customerName: customers.name, customerLastName: customers.lastName, status: warehouseOrders.status,
      total: warehouseOrders.total, observations: warehouseOrders.observations, chargeToAccount: warehouseOrders.chargeToAccount,
      userId: warehouseOrders.userId, confirmedAt: warehouseOrders.confirmedAt, dispatchedAt: warehouseOrders.dispatchedAt,
      cancelledAt: warehouseOrders.cancelledAt, createdAt: warehouseOrders.createdAt, updatedAt: warehouseOrders.updatedAt,
    }).from(warehouseOrders).leftJoin(customers, eq(warehouseOrders.customerId, customers.id))
      .where(eq(warehouseOrders.businessUnitId, unit.id)).orderBy(desc(warehouseOrders.createdAt), desc(warehouseOrders.id));
    return hydrateOrders(rows);
  },

  async createOrder({ customerId, items, observations, chargeToAccount, idempotencyKey }, userId, unit) {
    assertWarehouse(unit);
    const key = String(idempotencyKey || "").trim() || null;
    return db.transaction(async (tx) => {
      if (key) {
        const duplicate = await tx.select().from(warehouseOrders).where(and(eq(warehouseOrders.businessUnitId, unit.id), eq(warehouseOrders.idempotencyKey, key))).then((rows) => rows[0]);
        if (duplicate) return { ...(await hydrateOrders([duplicate], tx))[0], duplicated: true };
      }
      if (customerId) {
        const customer = await tx.select().from(customers).where(and(eq(customers.id, Number(customerId)), eq(customers.businessUnitId, unit.id), eq(customers.isActive, true))).then((rows) => rows[0]);
        if (!customer) throw { status: 400, message: "El cliente no pertenece al Galpón o está inactivo." };
      }
      const snapshots = await snapshotItems(tx, unit.id, items, "order");
      const total = snapshots.reduce((sum, item) => sum + item.total, 0);
      const { datetime } = getArgentinaTime();
      const [order] = await tx.insert(warehouseOrders).values({
        businessUnitId: unit.id, customerId: customerId ? Number(customerId) : null, status: "draft", total,
        observations: String(observations || "").trim() || null, chargeToAccount: Boolean(chargeToAccount), userId,
        idempotencyKey: key, createdAt: datetime, updatedAt: datetime,
      }).returning();
      const createdItems = await tx.insert(warehouseOrderItems).values(snapshots.map((item) => ({ ...item, orderId: order.id }))).returning();
      return { ...order, items: createdItems, duplicated: false };
    });
  },

  async updateDraftOrder(id, { customerId, items, observations, chargeToAccount }, unit) {
    assertWarehouse(unit);
    return db.transaction(async (tx) => {
      const order = await tx.select().from(warehouseOrders).where(and(eq(warehouseOrders.id, Number(id)), eq(warehouseOrders.businessUnitId, unit.id))).then((rows) => rows[0]);
      if (!order) throw { status: 404, message: "Pedido no encontrado." };
      if (order.status !== "draft") throw { status: 409, message: "Sólo se puede editar un pedido en borrador." };
      const nextCustomerId = customerId === undefined ? order.customerId : (customerId ? Number(customerId) : null);
      if (nextCustomerId) {
        const customer = await tx.select().from(customers).where(and(eq(customers.id, nextCustomerId), eq(customers.businessUnitId, unit.id), eq(customers.isActive, true))).then((rows) => rows[0]);
        if (!customer) throw { status: 400, message: "El cliente no pertenece al Galpón o está inactivo." };
      }
      let total = order.total;
      if (items !== undefined) {
        const snapshots = await snapshotItems(tx, unit.id, items, "order");
        total = snapshots.reduce((sum, item) => sum + item.total, 0);
        await tx.delete(warehouseOrderItems).where(eq(warehouseOrderItems.orderId, order.id));
        await tx.insert(warehouseOrderItems).values(snapshots.map((item) => ({ ...item, orderId: order.id })));
      }
      const [updated] = await tx.update(warehouseOrders).set({
        customerId: nextCustomerId, total,
        observations: observations === undefined ? order.observations : (String(observations || "").trim() || null),
        chargeToAccount: chargeToAccount === undefined ? order.chargeToAccount : Boolean(chargeToAccount),
        updatedAt: getArgentinaTime().datetime,
      }).where(and(eq(warehouseOrders.id, order.id), eq(warehouseOrders.status, "draft"))).returning();
      if (!updated) throw { status: 409, message: "El pedido cambió en otra sesión." };
      return (await hydrateOrders([updated], tx))[0];
    });
  },

  async changeOrderStatus(id, nextStatus, userId, unit) {
    assertWarehouse(unit);
    const requested = String(nextStatus || "").toLowerCase();
    const allowed = new Set(["confirmed", "preparing", "dispatched", "cancelled"]);
    if (!allowed.has(requested)) throw { status: 400, message: "Estado de pedido inválido." };
    return db.transaction(async (tx) => {
      const order = await tx.select().from(warehouseOrders).where(and(eq(warehouseOrders.id, Number(id)), eq(warehouseOrders.businessUnitId, unit.id))).then((rows) => rows[0]);
      if (!order) throw { status: 404, message: "Pedido no encontrado." };
      if (order.status === requested) return { ...(await hydrateOrders([order], tx))[0], duplicated: true };
      const transitions = { draft: ["confirmed", "cancelled"], confirmed: ["preparing", "dispatched", "cancelled"], preparing: ["dispatched", "cancelled"], dispatched: ["cancelled"], cancelled: [] };
      if (!transitions[order.status]?.includes(requested)) throw { status: 409, message: `No se puede pasar un pedido de ${order.status} a ${requested}.` };
      if ((requested === "confirmed" || requested === "dispatched") && !order.customerId) throw { status: 400, message: "Seleccioná un cliente antes de confirmar el pedido." };
      const items = await tx.select().from(warehouseOrderItems).where(eq(warehouseOrderItems.orderId, order.id));
      const { datetime } = getArgentinaTime();

      if (requested === "dispatched") {
        for (const item of items) {
          const balance = await ensureInventoryBalance(tx, unit.id, item.productId);
          await adjustInventoryInTransaction(tx, {
            businessUnitId: unit.id, productId: item.productId, direction: "OUT", quantity: item.quantity,
            movementType: "ORDER_DISPATCH", unitCost: item.unitCost, sourceType: "warehouse_order",
            sourceId: order.id, sourceItemId: item.id, idempotencyKey: `order-dispatch:${order.id}:${item.id}`, userId,
          });
          if (Number(balance.stock) < Number(item.quantity)) throw { status: 409, message: `Stock insuficiente para "${item.productName}".` };
        }
        if (order.chargeToAccount) {
          await tx.insert(accountMovements).values({
            customerId: order.customerId, type: "cargo", amount: order.total, transactionId: null,
            methodName: null, detail: JSON.stringify(items.map((item) => ({ name: item.productName, quantity: item.quantity, total: item.total }))),
            registerId: null, userId, businessUnitId: unit.id, createdAt: datetime,
            sourceType: "warehouse_order", sourceId: String(order.id),
          });
        }
      }
      if (requested === "cancelled" && order.status === "dispatched") {
        for (const item of items) {
          const original = await tx.select().from(inventoryMovements).where(eq(inventoryMovements.idempotencyKey, `order-dispatch:${order.id}:${item.id}`)).then((rows) => rows[0]);
          await adjustInventoryInTransaction(tx, {
            businessUnitId: unit.id, productId: item.productId, direction: "IN", quantity: item.quantity,
            movementType: "ORDER_DISPATCH_REVERSAL", unitCost: item.unitCost, sourceType: "warehouse_order_cancel",
            sourceId: order.id, sourceItemId: item.id, idempotencyKey: `order-cancel:${order.id}:${item.id}`,
            reversalOfMovementId: original?.id || null, userId,
          });
        }
        if (order.chargeToAccount) {
          const originalCharge = await tx.select().from(accountMovements).where(and(
            eq(accountMovements.businessUnitId, unit.id), eq(accountMovements.sourceType, "warehouse_order"),
            eq(accountMovements.sourceId, String(order.id)), eq(accountMovements.type, "cargo")
          )).then((rows) => rows[0]);
          if (originalCharge) await tx.insert(accountMovements).values({
            customerId: order.customerId, type: "reversion_cargo", amount: order.total, transactionId: null,
            methodName: null, detail: `Cancelación del pedido #${order.id}`,
            registerId: null, userId, businessUnitId: unit.id, createdAt: datetime,
            sourceType: "warehouse_order", sourceId: String(order.id), reversalOfMovementId: originalCharge.id,
          });
        }
      }
      const values = { status: requested, updatedAt: datetime };
      if (requested === "confirmed") values.confirmedAt = datetime;
      if (requested === "dispatched") values.dispatchedAt = datetime;
      if (requested === "cancelled") values.cancelledAt = datetime;
      const [updated] = await tx.update(warehouseOrders).set(values)
        .where(and(eq(warehouseOrders.id, order.id), eq(warehouseOrders.status, order.status))).returning();
      if (!updated) throw { status: 409, message: "El pedido cambió en otra sesión. Actualizá la pantalla." };
      return { ...(await hydrateOrders([updated], tx))[0], duplicated: false };
    });
  },

  async listPurchases(unit) {
    assertWarehouse(unit);
    const rows = await db.select().from(warehousePurchases).where(eq(warehousePurchases.businessUnitId, unit.id))
      .orderBy(desc(warehousePurchases.createdAt), desc(warehousePurchases.id));
    return hydratePurchases(rows);
  },

  async createPurchase({ supplier, items, observations, idempotencyKey }, userId, unit) {
    assertWarehouse(unit);
    const cleanSupplier = String(supplier || "").trim();
    if (!cleanSupplier) throw { status: 400, message: "El proveedor es obligatorio." };
    const key = String(idempotencyKey || "").trim() || null;
    return db.transaction(async (tx) => {
      if (key) {
        const duplicate = await tx.select().from(warehousePurchases).where(and(eq(warehousePurchases.businessUnitId, unit.id), eq(warehousePurchases.idempotencyKey, key))).then((rows) => rows[0]);
        if (duplicate) return { ...(await hydratePurchases([duplicate], tx))[0], duplicated: true };
      }
      const snapshots = await snapshotItems(tx, unit.id, items, "purchase");
      const total = snapshots.reduce((sum, item) => sum + item.total, 0);
      const { datetime } = getArgentinaTime();
      const [purchase] = await tx.insert(warehousePurchases).values({
        businessUnitId: unit.id, supplier: cleanSupplier, status: "draft", total,
        observations: String(observations || "").trim() || null, userId, idempotencyKey: key,
        createdAt: datetime, updatedAt: datetime,
      }).returning();
      const createdItems = await tx.insert(warehousePurchaseItems).values(snapshots.map(({ unitPrice, ...item }) => ({ ...item, purchaseId: purchase.id }))).returning();
      return { ...purchase, items: createdItems, duplicated: false };
    });
  },

  async changePurchaseStatus(id, nextStatus, userId, unit) {
    assertWarehouse(unit);
    const requested = String(nextStatus || "").toLowerCase();
    if (!new Set(["received", "cancelled"]).has(requested)) throw { status: 400, message: "Estado de compra inválido." };
    return db.transaction(async (tx) => {
      const purchase = await tx.select().from(warehousePurchases).where(and(eq(warehousePurchases.id, Number(id)), eq(warehousePurchases.businessUnitId, unit.id))).then((rows) => rows[0]);
      if (!purchase) throw { status: 404, message: "Compra no encontrada." };
      if (purchase.status === requested) return { ...(await hydratePurchases([purchase], tx))[0], duplicated: true };
      if (purchase.status === "cancelled" || (purchase.status === "draft" && requested !== "received" && requested !== "cancelled")) throw { status: 409, message: "La compra no admite ese cambio de estado." };
      const items = await tx.select().from(warehousePurchaseItems).where(eq(warehousePurchaseItems.purchaseId, purchase.id));
      const { datetime } = getArgentinaTime();
      if (requested === "received") {
        if (purchase.status !== "draft") throw { status: 409, message: "La compra ya fue recibida o cancelada." };
        for (const item of items) {
          await adjustInventoryInTransaction(tx, {
            businessUnitId: unit.id, productId: item.productId, direction: "IN", quantity: item.quantity,
            movementType: "PURCHASE_RECEIPT", unitCost: item.unitCost, sourceType: "warehouse_purchase",
            sourceId: purchase.id, sourceItemId: item.id, idempotencyKey: `purchase-receive:${purchase.id}:${item.id}`, userId,
          });
          await tx.update(businessUnitProducts).set({ cost: item.unitCost, updatedAt: datetime })
            .where(and(eq(businessUnitProducts.businessUnitId, unit.id), eq(businessUnitProducts.productId, item.productId)));
        }
      }
      if (requested === "cancelled" && purchase.status === "received") {
        for (const item of items) {
          const original = await tx.select().from(inventoryMovements).where(eq(inventoryMovements.idempotencyKey, `purchase-receive:${purchase.id}:${item.id}`)).then((rows) => rows[0]);
          await adjustInventoryInTransaction(tx, {
            businessUnitId: unit.id, productId: item.productId, direction: "OUT", quantity: item.quantity,
            movementType: "PURCHASE_RECEIPT_REVERSAL", unitCost: item.unitCost, sourceType: "warehouse_purchase_cancel",
            sourceId: purchase.id, sourceItemId: item.id, idempotencyKey: `purchase-cancel:${purchase.id}:${item.id}`,
            reversalOfMovementId: original?.id || null, userId,
          });
        }
      }
      const values = { status: requested, updatedAt: datetime };
      if (requested === "received") values.receivedAt = datetime;
      if (requested === "cancelled") values.cancelledAt = datetime;
      const [updated] = await tx.update(warehousePurchases).set(values)
        .where(and(eq(warehousePurchases.id, purchase.id), eq(warehousePurchases.status, purchase.status))).returning();
      if (!updated) throw { status: 409, message: "La compra cambió en otra sesión. Actualizá la pantalla." };
      return { ...(await hydratePurchases([updated], tx))[0], duplicated: false };
    });
  },

  async stats(unit) {
    assertWarehouse(unit);
    const [inventory] = await db.select({
      value: sql`COALESCE(SUM(${businessUnitProducts.stock} * ${businessUnitProducts.cost}), 0)`,
      units: sql`COALESCE(SUM(${businessUnitProducts.stock}), 0)`,
      lowStock: sql`COALESCE(SUM(CASE WHEN ${businessUnitProducts.stock} < ${businessUnitProducts.minStock} THEN 1 ELSE 0 END), 0)`,
    }).from(businessUnitProducts).where(eq(businessUnitProducts.businessUnitId, unit.id));
    const [orders] = await db.select({ count: sql`count(*)`, total: sql`COALESCE(SUM(${warehouseOrders.total}), 0)` })
      .from(warehouseOrders).where(and(eq(warehouseOrders.businessUnitId, unit.id), eq(warehouseOrders.status, "dispatched")));
    const [purchases] = await db.select({ count: sql`count(*)`, total: sql`COALESCE(SUM(${warehousePurchases.total}), 0)` })
      .from(warehousePurchases).where(and(eq(warehousePurchases.businessUnitId, unit.id), eq(warehousePurchases.status, "received")));
    return {
      inventoryValue: Number(inventory?.value || 0), stockUnits: Number(inventory?.units || 0), lowStockProducts: Number(inventory?.lowStock || 0),
      dispatchedOrders: Number(orders?.count || 0), dispatchedSales: Number(orders?.total || 0),
      receivedPurchases: Number(purchases?.count || 0), purchaseTotal: Number(purchases?.total || 0),
    };
  },
};
