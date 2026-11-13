import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import {
  accountMovements, businessUnitProducts, customers, inventoryMovements, products,
  warehouseOrderItems, warehouseOrders, warehousePurchaseItems, warehousePurchases, warehouseCustomerDetails,
} from "../db/schema.js";
import { getArgentinaTime } from "../db/timeUtils.js";
import { adjustInventoryInTransaction, ensureInventoryBalance } from "./inventory.service.js";
import { calculateWarehouseProduction } from "./warehouseProduction.js";

// El driver SQLite local no admite transacciones de escritura superpuestas en
// la misma conexión. Encolar Galpón evita bloqueos del driver; la versión y el
// UPDATE condicional siguen protegiendo cambios entre sesiones/procesos.
let warehouseQueue = Promise.resolve();
export function runWarehouseTransaction(operation) {
  const result = warehouseQueue.then(() => db.transaction(operation));
  warehouseQueue = result.then(() => undefined, () => undefined);
  return result;
}

function positiveInteger(value, label = "La cantidad") {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw { status: 400, message: `${label} debe ser un entero mayor a cero.` };
  return parsed;
}

function assertWarehouse(unit) {
  if (unit?.code !== "WAREHOUSE") throw { status: 403, message: "Esta operación pertenece exclusivamente al Galpón." };
}

function operationalStatus(order) {
  if (order.status === "dispatched") return order.deliveredAt ? "delivered" : "dispatched";
  if (["confirmed", "preparing"].includes(order.status) && order.readyAt) return "ready";
  return order.status;
}

function checkVersion(order, expectedVersion) {
  if (expectedVersion !== undefined && (!Number.isSafeInteger(expectedVersion) || expectedVersion !== order.version)) {
    throw { status: 409, message: "El pedido cambió en otra sesión. Actualizá y revisá su estado antes de reintentar." };
  }
}

function warehouseDatetime() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Cordoba", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

async function hydrateOrders(rows, executor = db) {
  if (!rows.length) return [];
  const items = await executor.select().from(warehouseOrderItems)
    .where(inArray(warehouseOrderItems.orderId, rows.map((row) => row.id)));
  const byOrder = new Map();
  for (const item of items) (byOrder.get(item.orderId) || (byOrder.set(item.orderId, []), byOrder.get(item.orderId))).push(item);
  return rows.map((row) => {
    const status = operationalStatus(row);
    return { ...row, status, items: (byOrder.get(row.id) || []).map((item) => ({
      ...item, status: ["dispatched", "delivered"].includes(status) ? status : item.preparationStatus,
    })) };
  });
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
  if (rawItems.some((item) => !item || typeof item !== "object" || Array.isArray(item))) throw { status: 400, message: "Los productos del pedido no son válidos." };
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
    const unitCost = kind === "purchase" ? item.value : Number(inventory?.cost ?? 0);
    return { productId: item.productId, productName: row.product.name, quantity: item.quantity, unitPrice, unitCost, total: item.quantity * (kind === "order" ? unitPrice : unitCost) };
  });
}

export const WarehouseService = {
  async updateStock(productId, payload, userId, unit) {
    assertWarehouse(unit);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw { status: 400, message: "Indicá la cantidad de stock y la operación a realizar." };
    if (Object.keys(payload).some((key) => !["stock", "expectedStock", "idempotencyKey"].includes(key))) throw { status: 400, message: "Sólo se permite modificar la cantidad de stock." };
    const { stock, expectedStock, idempotencyKey } = payload;
    if (!Number.isSafeInteger(stock) || stock < 0 || !Number.isSafeInteger(expectedStock) || expectedStock < 0) throw { status: 400, message: "El stock debe ser una cantidad entera igual o mayor a cero." };
    if (typeof idempotencyKey !== "string" || !idempotencyKey.trim() || idempotencyKey.length > 160) throw { status: 400, message: "La modificación necesita una clave de operación válida." };
    const id = positiveInteger(productId, "El producto");
    const key = `warehouse-stock:${userId}:${idempotencyKey}`;
    return runWarehouseTransaction(async (tx) => {
      const balance = await tx.select().from(businessUnitProducts).where(and(eq(businessUnitProducts.businessUnitId, unit.id), eq(businessUnitProducts.productId, id))).then((rows) => rows[0]);
      if (!balance) throw { status: 404, message: "El producto no existe en el stock del Galpón." };
      const duplicate = await tx.select().from(inventoryMovements).where(eq(inventoryMovements.idempotencyKey, key)).then((rows) => rows[0]);
      if (duplicate) {
        if (duplicate.productId !== id || duplicate.stockBefore !== expectedStock || duplicate.stockAfter !== stock) throw { status: 409, message: "La clave de operación ya se utilizó para otro ajuste." };
        return { productId: id, stock: balance.stock, duplicated: true };
      }
      if (balance.stock !== expectedStock) throw { status: 409, message: "El stock cambió en otra sesión. Actualizá y revisá la cantidad antes de guardar." };
      const difference = stock - balance.stock;
      if (!difference) return { productId: id, stock, unchanged: true };
      const result = await adjustInventoryInTransaction(tx, {
        businessUnitId: unit.id, productId: id, direction: difference > 0 ? "IN" : "OUT", quantity: Math.abs(difference),
        movementType: "WAREHOUSE_STOCK_ADJUSTMENT", unitCost: balance.cost, sourceType: "warehouse_stock_adjustment", sourceId: id,
        idempotencyKey: key, userId, notes: "Ajuste de cantidad de stock del Galpón",
      });
      return { productId: id, stock: result.movement.stockAfter, duplicated: false };
    });
  },
  async operations(unit, previewItems = null) {
    assertWarehouse(unit);
    return runWarehouseTransaction(async (tx) => {
      const orders = await this.listOrders(unit, tx);
      const inventory = await tx.select({
        id: products.id, name: products.name, codbarra: products.codbarra,
        stock: businessUnitProducts.stock, price: businessUnitProducts.salePrice, isAvailable: businessUnitProducts.isAvailable,
      }).from(businessUnitProducts).innerJoin(products, eq(products.id, businessUnitProducts.productId))
        .where(eq(businessUnitProducts.businessUnitId, unit.id));
      const customerList = await tx.select({
        id: customers.id, name: customers.name, lastName: customers.lastName, phone: customers.phone,
        address: warehouseCustomerDetails.address,
      }).from(customers).leftJoin(warehouseCustomerDetails, and(
        eq(warehouseCustomerDetails.customerId, customers.id), eq(warehouseCustomerDetails.businessUnitId, unit.id),
      )).where(and(eq(customers.businessUnitId, unit.id), eq(customers.isActive, true)));
      const { allocations, ...production } = calculateWarehouseProduction(orders, inventory);
      let preview;
      if (previewItems) {
        const items = await snapshotItems(tx, unit.id, previewItems, "order");
        const projected = calculateWarehouseProduction([...orders, {
          id: Number.MAX_SAFE_INTEGER, status: "confirmed", createdAt: getArgentinaTime().datetime, items,
        }], inventory);
        preview = { items: projected.allocations[Number.MAX_SAFE_INTEGER], production: { items: projected.items, totalUnits: projected.totalUnits } };
      }
      const today = warehouseDatetime().slice(0, 10);
      return {
        orders: orders.map((order) => ({ ...order, items: allocations[order.id] || order.items })),
        products: inventory, customers: customerList, production, ...(preview ? { preview } : {}),
        counts: {
          pending: orders.filter((order) => ["confirmed", "preparing"].includes(order.status)).length,
          inDelivery: orders.filter((order) => ["ready", "dispatched"].includes(order.status)).length,
          soldToday: orders.filter((order) => order.status === "delivered" && order.deliveredAt?.slice(0, 10) === today).length,
        },
      };
    });
  },

  async createCustomer({ name, phone, address }, unit) {
    assertWarehouse(unit);
    const cleanName = String(name || "").trim();
    const cleanPhone = String(phone || "").trim();
    const cleanAddress = String(address || "").trim();
    const digits = cleanPhone.replace(/\D/g, "");
    if (!cleanName || cleanName.length > 160) throw { status: 400, message: "Ingresá un nombre de hasta 160 caracteres." };
    if (!/^[+\d\s().-]+$/.test(cleanPhone) || digits.length < 6 || digits.length > 20) throw { status: 400, message: "Ingresá un teléfono válido, con prefijo si corresponde." };
    if (!cleanAddress || cleanAddress.length > 300) throw { status: 400, message: "Ingresá una dirección de hasta 300 caracteres." };
    const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    const contactKey = `${normalize(cleanName)}|${digits}`;
    return runWarehouseTransaction(async (tx) => {
      const previous = await tx.select().from(warehouseCustomerDetails).where(and(
        eq(warehouseCustomerDetails.businessUnitId, unit.id), eq(warehouseCustomerDetails.contactKey, contactKey),
      )).then((rows) => rows[0]);
      let customer = previous && await tx.select().from(customers).where(and(eq(customers.id, previous.customerId), eq(customers.businessUnitId, unit.id))).then((rows) => rows[0]);
      if (customer) {
        if (!customer.isActive) throw { status: 409, message: "Este cliente está inactivo. Revisalo en Clientes y cuentas." };
        return { id: customer.id, name: customer.name, lastName: customer.lastName, phone: customer.phone, address: previous.address, duplicated: true };
      }
      // Reutilizar también contactos históricos creados desde Clientes.
      const existing = await tx.select().from(customers).where(and(eq(customers.businessUnitId, unit.id), eq(customers.isActive, true)));
      customer = existing.find((row) => normalize(`${row.name} ${row.lastName}`) === normalize(cleanName) && String(row.phone || "").replace(/\D/g, "") === digits);
      const reused = Boolean(customer);
      if (!customer) [customer] = await tx.insert(customers).values({
        name: cleanName, lastName: "", phone: cleanPhone,
        // Referencia interna, no documento personal: el modelo histórico exige
        // un document único, aunque este formulario sólo requiere contacto.
        document: `WH-CONTACT-${randomUUID()}`, businessUnitId: unit.id, isActive: true, createdAt: getArgentinaTime().datetime,
      }).returning();
      const detail = await tx.select().from(warehouseCustomerDetails).where(eq(warehouseCustomerDetails.customerId, customer.id)).then((rows) => rows[0]);
      if (!detail) await tx.insert(warehouseCustomerDetails).values({ customerId: customer.id, businessUnitId: unit.id, contactKey, address: cleanAddress }).returning();
      return { id: customer.id, name: customer.name, lastName: customer.lastName, phone: customer.phone, address: detail?.address || cleanAddress, duplicated: reused };
    });
  },

  async listOrders(unit, executor = db) {
    assertWarehouse(unit);
    const rows = await executor.select({
      id: warehouseOrders.id, businessUnitId: warehouseOrders.businessUnitId, customerId: warehouseOrders.customerId,
      customerName: customers.name, customerLastName: customers.lastName, status: warehouseOrders.status,
      customerPhone: customers.phone, customerAddress: warehouseCustomerDetails.address, deliveredAt: warehouseOrders.deliveredAt,
      readyAt: warehouseOrders.readyAt, version: warehouseOrders.version,
      total: warehouseOrders.total, observations: warehouseOrders.observations, chargeToAccount: warehouseOrders.chargeToAccount,
      userId: warehouseOrders.userId, confirmedAt: warehouseOrders.confirmedAt, dispatchedAt: warehouseOrders.dispatchedAt,
      cancelledAt: warehouseOrders.cancelledAt, createdAt: warehouseOrders.createdAt, updatedAt: warehouseOrders.updatedAt,
    }).from(warehouseOrders).leftJoin(customers, and(eq(warehouseOrders.customerId, customers.id), eq(customers.businessUnitId, unit.id)))
      .leftJoin(warehouseCustomerDetails, and(eq(warehouseCustomerDetails.customerId, customers.id), eq(warehouseCustomerDetails.businessUnitId, unit.id)))
      .where(eq(warehouseOrders.businessUnitId, unit.id)).orderBy(desc(warehouseOrders.createdAt), desc(warehouseOrders.id));
    return hydrateOrders(rows, executor);
  },

  async createOrder({ customerId, items, observations, chargeToAccount, idempotencyKey, status = "draft" }, userId, unit) {
    assertWarehouse(unit);
    if (!["draft", "confirmed"].includes(status)) throw { status: 400, message: "Estado inicial inválido." };
    if (status === "confirmed" && !customerId) throw { status: 400, message: "Seleccioná un cliente para registrar el pedido." };
    if (customerId) positiveInteger(customerId, "El cliente");
    const key = String(idempotencyKey || "").trim() || null;
    return runWarehouseTransaction(async (tx) => {
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
        businessUnitId: unit.id, customerId: customerId ? Number(customerId) : null, status, total,
        observations: String(observations || "").trim() || null, chargeToAccount: Boolean(chargeToAccount), userId,
        idempotencyKey: key, confirmedAt: status === "confirmed" ? datetime : null, createdAt: datetime, updatedAt: datetime,
      }).returning();
      await tx.insert(warehouseOrderItems).values(snapshots.map((item) => ({ ...item, orderId: order.id }))).returning();
      return { ...(await hydrateOrders([order], tx))[0], duplicated: false };
    });
  },

  async updateDraftOrder(id, { customerId, items, observations, chargeToAccount, expectedVersion }, unit) {
    assertWarehouse(unit);
    return runWarehouseTransaction(async (tx) => {
      const order = await tx.select().from(warehouseOrders).where(and(eq(warehouseOrders.id, Number(id)), eq(warehouseOrders.businessUnitId, unit.id))).then((rows) => rows[0]);
      if (!order) throw { status: 404, message: "Pedido no encontrado." };
      if (order.status !== "draft") throw { status: 409, message: "Sólo se puede editar un pedido en borrador." };
      checkVersion(order, expectedVersion);
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
        version: order.version + 1,
        updatedAt: getArgentinaTime().datetime,
      }).where(and(eq(warehouseOrders.id, order.id), eq(warehouseOrders.status, "draft"), eq(warehouseOrders.version, order.version))).returning();
      if (!updated) throw { status: 409, message: "El pedido cambió en otra sesión." };
      return (await hydrateOrders([updated], tx))[0];
    });
  },

  async changeItemStatus(id, itemId, nextStatus, unit, expectedVersion) {
    assertWarehouse(unit);
    if (!["preparing", "ready"].includes(nextStatus)) throw { status: 400, message: "El envío y la entrega se confirman para el pedido completo." };
    return runWarehouseTransaction(async (tx) => {
      const order = await tx.select().from(warehouseOrders).where(and(eq(warehouseOrders.id, positiveInteger(id, "El pedido")), eq(warehouseOrders.businessUnitId, unit.id))).then((rows) => rows[0]);
      if (!order) throw { status: 404, message: "Pedido no encontrado." };
      checkVersion(order, expectedVersion);
      if (!["confirmed", "preparing"].includes(order.status)) throw { status: 409, message: "La preparación sólo se puede modificar antes de enviar el pedido." };
      const item = await tx.select().from(warehouseOrderItems).where(and(eq(warehouseOrderItems.orderId, order.id), eq(warehouseOrderItems.id, positiveInteger(itemId, "El producto del pedido")))).then((rows) => rows[0]);
      if (!item) throw { status: 404, message: "Producto del pedido no encontrado." };
      if (item.preparationStatus === nextStatus) return { ...(await hydrateOrders([order], tx))[0], duplicated: true };
      await tx.update(warehouseOrderItems).set({ preparationStatus: nextStatus }).where(eq(warehouseOrderItems.id, item.id)).returning();
      const [updated] = await tx.update(warehouseOrders).set({
        readyAt: nextStatus === "preparing" ? null : order.readyAt,
        version: order.version + 1, updatedAt: warehouseDatetime(),
      }).where(and(eq(warehouseOrders.id, order.id), eq(warehouseOrders.version, order.version))).returning();
      if (!updated) throw { status: 409, message: "El pedido cambió en otra sesión. Actualizá antes de reintentar." };
      return (await hydrateOrders([updated], tx))[0];
    });
  },

  async changeOrderStatus(id, nextStatus, userId, unit, expectedVersion) {
    assertWarehouse(unit);
    const requested = String(nextStatus || "").toLowerCase();
    const allowed = new Set(["confirmed", "preparing", "ready", "dispatched", "delivered", "cancelled"]);
    if (!allowed.has(requested)) throw { status: 400, message: "Estado de pedido inválido." };
    return runWarehouseTransaction(async (tx) => {
      const order = await tx.select().from(warehouseOrders).where(and(eq(warehouseOrders.id, Number(id)), eq(warehouseOrders.businessUnitId, unit.id))).then((rows) => rows[0]);
      if (!order) throw { status: 404, message: "Pedido no encontrado." };
      checkVersion(order, expectedVersion);
      if (order.deliveredAt) {
        if (requested === "delivered") return { ...(await hydrateOrders([order], tx))[0], duplicated: true };
        throw { status: 409, message: "Un pedido entregado no admite cambios de estado." };
      }
      const current = operationalStatus(order);
      if (current === requested) return { ...(await hydrateOrders([order], tx))[0], duplicated: true };
      const transitions = { draft: ["confirmed", "cancelled"], confirmed: ["preparing", "ready", "cancelled"], preparing: ["ready", "cancelled"], ready: ["preparing", "dispatched", "cancelled"], dispatched: ["delivered", "cancelled"], cancelled: [] };
      if (!transitions[current]?.includes(requested)) throw { status: 409, message: "Respetá el flujo En preparación → Listo → En envío → Entregado." };
      if ((requested === "confirmed" || requested === "dispatched") && !order.customerId) throw { status: 400, message: "Seleccioná un cliente antes de confirmar el pedido." };
      const items = await tx.select().from(warehouseOrderItems).where(eq(warehouseOrderItems.orderId, order.id));
      const datetime = warehouseDatetime();
      if (["ready", "dispatched", "delivered"].includes(requested) && (!items.length || items.some((item) => item.preparationStatus !== "ready"))) {
        throw { status: 409, message: "Todos los productos deben estar listos antes de completar esta etapa. Revisá Ver detalle." };
      }

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
      const values = { status: requested === "delivered" ? "dispatched" : requested === "ready" ? order.status : requested, updatedAt: datetime, version: order.version + 1 };
      if (requested === "ready") values.readyAt = datetime;
      if (requested === "preparing") values.readyAt = null;
      if (requested === "delivered") values.deliveredAt = datetime;
      if (requested === "confirmed") values.confirmedAt = datetime;
      if (requested === "dispatched") values.dispatchedAt = datetime;
      if (requested === "cancelled") values.cancelledAt = datetime;
      const [updated] = await tx.update(warehouseOrders).set(values)
        .where(and(eq(warehouseOrders.id, order.id), eq(warehouseOrders.version, order.version), sql`${warehouseOrders.deliveredAt} IS NULL`)).returning();
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
    return runWarehouseTransaction(async (tx) => {
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
    return runWarehouseTransaction(async (tx) => {
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
