import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { CashRegisterModel } from "../models/cashRegister.model.js";
import { TransactionModel } from "../models/transaction.model.js";
import { CustomerService } from "./customer.service.js";
import { getArgentinaTime } from "../db/timeUtils.js";
import { isAccountMethod, round2 } from "../constants.js";
import { products, promotionItems, promotions, transactionItems, transactionPayments, transactions } from "../db/schema.js";

function positiveInteger(value, message) {
  const result = Number(value);
  if (!Number.isInteger(result) || result <= 0) throw { status: 400, message };
  return result;
}
function stockError(product, requested) {
  return { status: 400, message: `Stock insuficiente para "${product.name}". Disponible: ${product.stock}, solicitado: ${requested}.` };
}

export const TransactionService = {
  async create({ total, payments, items, customerId }, userId) {
    if (!payments?.length || !items?.length) throw { status: 400, message: "Se requieren pagos e ítems para la transacción." };
    if (!Number.isFinite(Number(total)) || Number(total) <= 0) throw { status: 400, message: "El total debe ser mayor a cero." };
    const openRegister = await CashRegisterModel.findOpen();
    if (!openRegister) throw { status: 400, message: "No hay una caja abierta. Abra la caja antes de registrar ventas." };
    const paymentsData = payments.map((p) => ({ paymentMethodId: p.methodId || null, methodName: p.type || p.methodName || "Efectivo", baseAmount: Number(p.baseAmount || p.amount), surchargePercent: Number(p.surchargePercent || 0), amount: Number(p.amount) }));
    const accountAmount = round2(paymentsData.filter((p) => isAccountMethod(p.methodName)).reduce((sum, p) => sum + p.amount, 0));
    if (accountAmount > 0 && !customerId) throw { status: 400, message: "Se requiere un cliente para cargar la venta a cuenta corriente." };
    const { date, time, datetime } = getArgentinaTime();

    const result = await db.transaction(async (tx) => {
      const productIds = [...new Set(items.filter((item) => item.productId).map((item) => Number(item.productId)))];
      const promotionIds = [...new Set(items.filter((item) => item.promotionId).map((item) => Number(item.promotionId)))];
      const productRows = productIds.length ? await tx.select().from(products).where(inArray(products.id, productIds)) : [];
      const productById = new Map(productRows.map((product) => [product.id, product]));
      const promotionRows = promotionIds.length ? await tx.select().from(promotions).where(inArray(promotions.id, promotionIds)) : [];
      const promotionById = new Map(promotionRows.map((promotion) => [promotion.id, promotion]));
      const componentRows = promotionIds.length ? await tx.select({ promotionId: promotionItems.promotionId, productId: products.id, name: products.name, quantity: promotionItems.quantity }).from(promotionItems).innerJoin(products, eq(promotionItems.productId, products.id)).where(inArray(promotionItems.promotionId, promotionIds)) : [];
      const componentsByPromotion = new Map();
      for (const component of componentRows) {
        const components = componentsByPromotion.get(component.promotionId) || [];
        components.push(component);
        componentsByPromotion.set(component.promotionId, components);
      }
      const requiredStock = new Map();
      const itemsData = [];
      for (const item of items) {
        const quantity = positiveInteger(item.quantity, "La cantidad de cada ítem debe ser un entero positivo.");
        if (item.promotionId) {
          const promotionId = Number(item.promotionId);
          const promotion = promotionById.get(promotionId);
          const components = componentsByPromotion.get(promotionId) || [];
          if (!promotion || !promotion.isAvailable || components.length < 2) throw { status: 400, message: "La promoción seleccionada no está disponible." };
          for (const component of components) requiredStock.set(component.productId, (requiredStock.get(component.productId) || 0) + quantity * Number(component.quantity));
          itemsData.push({ productId: null, promotionId, productName: promotion.name, price: Number(promotion.price), quantity, total: Number(promotion.price) * quantity, saleMode: "promocion", packSize: 1, promotionComposition: JSON.stringify(components.map((c) => ({ productId: c.productId, name: c.name, quantity: Number(c.quantity) }))) });
          continue;
        }
        const product = productById.get(Number(item.productId));
        if (!product) throw { status: 400, message: `Producto no encontrado (id ${item.productId}).` };
        const saleMode = item.saleMode === "paquete" || item.saleMode === "escala" ? item.saleMode : "unidad";
        const packSize = saleMode === "unidad" ? 1 : positiveInteger(item.unitsPerPack || item.packSize, "La cantidad de la venta por bulto no es válida.");
        requiredStock.set(product.id, (requiredStock.get(product.id) || 0) + quantity * packSize);
        itemsData.push({ productId: product.id, promotionId: null, productName: item.name || product.name, price: Number(item.price || 0), quantity, total: Number(item.total ?? Number(item.price || 0) * quantity), saleMode, packSize, promotionComposition: null });
      }
      for (const [productId, requested] of requiredStock) {
        const product = productById.get(productId) || (await tx.select().from(products).where(eq(products.id, productId)).then((rows) => rows[0]));
        if (!product || !product.isAvailable || Number(product.stock) < requested) throw stockError(product || { name: `id ${productId}`, stock: 0 }, requested);
      }
      const [createdTx] = await tx.insert(transactions).values({ registerId: openRegister.id, total: Number(total), date, time, createdAt: datetime }).returning();
      const createdPayments = await tx.insert(transactionPayments).values(paymentsData.map((payment) => ({ ...payment, transactionId: createdTx.id }))).returning();
      const createdItems = await tx.insert(transactionItems).values(itemsData.map((item) => ({ ...item, transactionId: createdTx.id }))).returning();
      for (const [productId, requested] of requiredStock) {
        const updated = await tx.update(products).set({ stock: sql`${products.stock} - ${requested}` }).where(and(eq(products.id, productId), gte(products.stock, requested))).returning({ id: products.id });
        if (!updated.length) throw { status: 409, message: "El stock cambió durante la venta. Revisá el carrito e intentá de nuevo." };
      }
      return { tx: createdTx, createdPayments, createdItems, itemsData };
    });
    if (accountAmount > 0) await CustomerService.chargeSale({ customerId, amount: accountAmount, transactionId: result.tx.id, items: result.itemsData, registerId: openRegister.id, userId });
    return { ...result.tx, customerId: customerId || null, accountAmount, payments: result.createdPayments, items: result.createdItems };
  },
  async getByRegisterId(registerId) {
    const txs = await TransactionModel.findByRegisterId(registerId);
    return Promise.all(txs.map(async (tx) => ({ ...tx, payments: await TransactionModel.findPaymentsByTransactionId(tx.id), items: await TransactionModel.findItemsByTransactionId(tx.id) })));
  },
};
