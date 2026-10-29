import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { CashRegisterModel } from "../models/cashRegister.model.js";
import { TransactionModel } from "../models/transaction.model.js";
import { getArgentinaTime } from "../db/timeUtils.js";
import { isAccountMethod, round2 } from "../constants.js";
import {
  accountMovements, businessUnitProducts, categories, customers, products,
  promotionItems, promotions, transactionItems, transactionPayments, transactions,
} from "../db/schema.js";
import { adjustInventoryInTransaction, findBusinessUnitByCode } from "./inventory.service.js";

function positiveInteger(value, message) {
  const result = Number(value);
  if (!Number.isInteger(result) || result <= 0) throw { status: 400, message };
  return result;
}

async function hydrateTransaction(transaction) {
  const [accountCustomer, payments, items] = await Promise.all([
    db
      .select({ name: customers.name, lastName: customers.lastName })
      .from(accountMovements)
      .innerJoin(customers, eq(accountMovements.customerId, customers.id))
      .where(eq(accountMovements.transactionId, transaction.id))
      .then((rows) => rows[0]),
    TransactionModel.findPaymentsByTransactionId(transaction.id),
    TransactionModel.findItemsByTransactionId(transaction.id),
  ]);

  return {
    ...transaction,
    customerName: accountCustomer
      ? `${accountCustomer.name} ${accountCustomer.lastName || ""}`.trim()
      : null,
    payments,
    items,
  };
}

export const TransactionService = {
  async getById(id, businessUnit) {
    if (!businessUnit || businessUnit.code !== "LOCAL") {
      throw { status: 400, message: "Las ventas de caja sólo están disponibles en el Local." };
    }
    const transaction = await TransactionModel.findById(Number(id), businessUnit.id);
    if (!transaction) throw { status: 404, message: "Venta no encontrada." };
    return hydrateTransaction(transaction);
  },

  async create({ total, payments, items, customerId, discountPercent, discountAmount, idempotencyKey }, userId, businessUnit) {
    if (!businessUnit || businessUnit.code !== "LOCAL") {
      throw { status: 400, message: "Las ventas de caja sólo pueden registrarse en el Local. Usá Pedidos para el Galpón." };
    }
    if (!payments?.length || !items?.length) throw { status: 400, message: "Se requieren pagos e ítems para la transacción." };
    if (!Number.isFinite(Number(total)) || Number(total) <= 0) throw { status: 400, message: "El total debe ser mayor a cero." };
    const normalizedDiscountPercent = Number(discountPercent || 0);
    const normalizedDiscountAmount = Number(discountAmount || 0);
    if (!Number.isFinite(normalizedDiscountPercent) || normalizedDiscountPercent < 0 || normalizedDiscountPercent > 100 || !Number.isFinite(normalizedDiscountAmount) || normalizedDiscountAmount < 0) {
      throw { status: 400, message: "El descuento informado no es válido." };
    }
    const requestKey = String(idempotencyKey || "").trim() || null;
    if (requestKey) {
      const duplicate = await db.select().from(transactions).where(and(
        eq(transactions.businessUnitId, businessUnit.id), eq(transactions.idempotencyKey, requestKey)
      )).then((rows) => rows[0]);
      if (duplicate) return { ...(await hydrateTransaction(duplicate)), duplicated: true };
    }

    const openRegister = await CashRegisterModel.findOpen();
    if (!openRegister) throw { status: 400, message: "No hay una caja abierta. Abra la caja antes de registrar ventas." };
    const paymentsData = payments.map((p) => ({
      paymentMethodId: p.methodId || null,
      methodName: p.type || p.methodName || "Efectivo",
      baseAmount: Number(p.baseAmount || p.amount),
      surchargePercent: Number(p.surchargePercent || 0),
      amount: Number(p.amount),
    }));
    const accountAmount = round2(paymentsData.filter((p) => isAccountMethod(p.methodName)).reduce((sum, p) => sum + p.amount, 0));
    if (accountAmount > 0 && !customerId) throw { status: 400, message: "Se requiere un cliente para cargar la venta a cuenta corriente." };
    const { date, time, datetime } = getArgentinaTime();

    const result = await db.transaction(async (tx) => {
      if (requestKey) {
        const duplicate = await tx.select().from(transactions).where(and(
          eq(transactions.businessUnitId, businessUnit.id), eq(transactions.idempotencyKey, requestKey)
        )).then((rows) => rows[0]);
        if (duplicate) return { duplicate };
      }
      const directProductIds = items.filter((item) => item.productId).map((item) => Number(item.productId));
      const promotionIds = [...new Set(items.filter((item) => item.promotionId).map((item) => Number(item.promotionId)))];
      const componentDefinitions = promotionIds.length
        ? await tx.select({ promotionId: promotionItems.promotionId, productId: promotionItems.productId, quantity: promotionItems.quantity })
          .from(promotionItems).where(inArray(promotionItems.promotionId, promotionIds))
        : [];
      const uniqueProductIds = [...new Set([...directProductIds, ...componentDefinitions.map((row) => Number(row.productId))])];
      const productRows = uniqueProductIds.length
        ? await tx.select({ product: products, categoryName: categories.name })
          .from(products).leftJoin(categories, eq(products.categoryId, categories.id))
          .where(inArray(products.id, uniqueProductIds))
        : [];
      const productById = new Map(productRows.map(({ product, categoryName }) => [product.id, { ...product, categoryName }]));
      const promotionRows = promotionIds.length ? await tx.select().from(promotions).where(inArray(promotions.id, promotionIds)) : [];
      const promotionById = new Map(promotionRows.map((promotion) => [promotion.id, promotion]));
      const localBalances = uniqueProductIds.length
        ? await tx.select().from(businessUnitProducts).where(and(
          eq(businessUnitProducts.businessUnitId, businessUnit.id), inArray(businessUnitProducts.productId, uniqueProductIds)
        )) : [];
      const localByProduct = new Map(localBalances.map((row) => [row.productId, row]));
      const warehouse = await findBusinessUnitByCode("WAREHOUSE", tx);
      const warehouseBalances = warehouse && uniqueProductIds.length
        ? await tx.select().from(businessUnitProducts).where(and(
          eq(businessUnitProducts.businessUnitId, warehouse.id), inArray(businessUnitProducts.productId, uniqueProductIds)
        )) : [];
      const warehouseByProduct = new Map(warehouseBalances.map((row) => [row.productId, row]));

      const requiredStock = new Map();
      const sourceForProduct = new Map();
      const requireProduct = (productId, quantity) => {
        const product = productById.get(productId);
        const localBalance = localByProduct.get(productId);
        if (!product || !localBalance || !localBalance.isAvailable) {
          throw { status: 400, message: `Producto no disponible en el Local (id ${productId}).` };
        }
        const direct = localBalance.fulfillmentMode === "WAREHOUSE_DIRECT";
        const sourceUnit = direct ? warehouse : businessUnit;
        const sourceBalance = direct ? warehouseByProduct.get(productId) : localBalance;
        if (!sourceUnit || !sourceBalance || !sourceBalance.isAvailable) {
          throw { status: 400, message: `"${product.name}" no está disponible en la unidad abastecedora ${direct ? "Galpón" : "Local"}.` };
        }
        const key = `${sourceUnit.id}:${productId}`;
        requiredStock.set(key, {
          businessUnitId: sourceUnit.id,
          productId,
          quantity: (requiredStock.get(key)?.quantity || 0) + quantity,
          balance: sourceBalance,
          product,
          direct,
        });
        sourceForProduct.set(productId, { sourceUnit, sourceBalance, direct });
      };

      const definitionsByPromotion = new Map();
      for (const definition of componentDefinitions) {
        const list = definitionsByPromotion.get(definition.promotionId) || [];
        list.push(definition);
        definitionsByPromotion.set(definition.promotionId, list);
      }
      const itemsData = [];
      for (const item of items) {
        const quantity = positiveInteger(item.quantity, "La cantidad de cada ítem debe ser un entero positivo.");
        if (item.promotionId) {
          const promotionId = Number(item.promotionId);
          const promotion = promotionById.get(promotionId);
          const definitions = definitionsByPromotion.get(promotionId) || [];
          if (!promotion || !promotion.isAvailable || definitions.length < 2) throw { status: 400, message: "La promoción seleccionada no está disponible." };
          for (const component of definitions) requireProduct(Number(component.productId), quantity * Number(component.quantity));
          const composition = definitions.map((component) => {
            const product = productById.get(Number(component.productId));
            const source = sourceForProduct.get(Number(component.productId));
            return {
              productId: product.id, name: product.name, quantity: Number(component.quantity),
              unitCost: Number(source.sourceBalance.cost || 0),
              fulfillmentMode: source.direct ? "WAREHOUSE_DIRECT" : "OWN_STOCK",
            };
          });
          const unitCost = composition.reduce((sum, component) => sum + component.unitCost * component.quantity, 0);
          const lineTotal = Number(item.total ?? Number(promotion.price) * quantity);
          itemsData.push({ productId: null, promotionId, productName: promotion.name, categoryName: "Promoción", unitCost, price: lineTotal / quantity, quantity, total: lineTotal, saleMode: "promocion", packSize: 1, promotionComposition: JSON.stringify(composition) });
          continue;
        }
        const product = productById.get(Number(item.productId));
        if (!product) throw { status: 400, message: `Producto no encontrado (id ${item.productId}).` };
        const saleMode = ["mayorista", "paquete", "escala"].includes(item.saleMode) ? item.saleMode : "unidad";
        const packSize = saleMode === "unidad" || saleMode === "mayorista"
          ? 1
          : positiveInteger(item.unitsPerPack || item.packSize, "La cantidad de la venta por bulto no es válida.");
        requireProduct(product.id, quantity * packSize);
        const source = sourceForProduct.get(product.id);
        const lineTotal = Number(item.total ?? Number(item.price || 0) * quantity);
        itemsData.push({ productId: product.id, promotionId: null, productName: item.name || product.name, categoryName: product.categoryName || null, unitCost: Number(source.sourceBalance.cost || 0) * packSize, price: lineTotal / quantity, quantity, total: lineTotal, saleMode, packSize, promotionComposition: null });
      }

      for (const required of requiredStock.values()) {
        if (Number(required.balance.stock) < required.quantity) {
          throw { status: 409, message: `Stock insuficiente para "${required.product.name}" en ${required.direct ? "Galpón" : "Local"}. Disponible: ${required.balance.stock}, solicitado: ${required.quantity}.` };
        }
      }
      if (accountAmount > 0) {
        const customer = await tx.select().from(customers).where(and(
          eq(customers.id, Number(customerId)), eq(customers.businessUnitId, businessUnit.id), eq(customers.isActive, true)
        )).then((rows) => rows[0]);
        if (!customer) throw { status: 400, message: "El cliente no pertenece al Local o está inactivo." };
      }

      const [createdTx] = await tx.insert(transactions).values({
        registerId: openRegister.id, total: Number(total), discountPercent: normalizedDiscountPercent,
        discountAmount: normalizedDiscountAmount, date, time, createdAt: datetime,
        businessUnitId: businessUnit.id, idempotencyKey: requestKey,
      }).returning();
      const createdPayments = await tx.insert(transactionPayments).values(paymentsData.map((payment) => ({ ...payment, transactionId: createdTx.id }))).returning();
      const createdItems = await tx.insert(transactionItems).values(itemsData.map((item) => ({ ...item, transactionId: createdTx.id }))).returning();
      for (const required of requiredStock.values()) {
        await adjustInventoryInTransaction(tx, {
          businessUnitId: required.businessUnitId, productId: required.productId, direction: "OUT", quantity: required.quantity,
          movementType: required.direct ? "LOCAL_SALE_WAREHOUSE_FULFILLMENT" : "LOCAL_SALE",
          unitCost: required.balance.cost, counterpartBusinessUnitId: required.direct ? businessUnit.id : null,
          sourceType: "local_transaction", sourceId: createdTx.id, sourceItemId: required.productId,
          idempotencyKey: `local-sale:${createdTx.id}:${required.businessUnitId}:${required.productId}`,
          userId, notes: required.direct ? "Salida del Galpón por abastecimiento directo al Local" : null,
        });
      }
      if (accountAmount > 0) {
        await tx.insert(accountMovements).values({
          customerId: Number(customerId), type: "cargo", amount: accountAmount, transactionId: createdTx.id,
          methodName: null, detail: JSON.stringify(itemsData.map((item) => ({ name: item.productName, quantity: item.quantity, total: item.total }))),
          registerId: openRegister.id, userId, businessUnitId: businessUnit.id, createdAt: datetime,
          sourceType: "local_transaction", sourceId: String(createdTx.id),
        });
      }
      return { tx: createdTx, createdPayments, createdItems };
    });

    if (result.duplicate) return { ...(await hydrateTransaction(result.duplicate)), duplicated: true };
    return { ...result.tx, customerId: customerId || null, accountAmount, payments: result.createdPayments, items: result.createdItems, duplicated: false };
  },

  async getByRegisterId(registerId, businessUnit) {
    if (businessUnit?.code !== "LOCAL") return [];
    const txs = await db.select().from(transactions).where(and(
      eq(transactions.registerId, registerId), eq(transactions.businessUnitId, businessUnit.id)
    ));
    return Promise.all(txs.map(hydrateTransaction));
  },
};
