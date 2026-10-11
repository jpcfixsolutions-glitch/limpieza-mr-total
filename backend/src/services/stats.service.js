import { db } from "../db/client.js";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  products,
  cashRegisters,
  transactions,
  transactionPayments,
  transactionItems,
  categories,
  dailyExpenses,
  stockModifications,
  internalWithdrawals,
  businessUnitProducts,
  inventoryMovements,
} from "../db/schema.js";
import { calculateProfitability } from "./profitability.js";
import { CashRegisterModel } from "../models/cashRegister.model.js";
import { TransactionModel } from "../models/transaction.model.js";
import { DailyExpenseModel } from "../models/dailyExpense.model.js";
import { StockModificationModel } from "../models/stockModification.model.js";
import { ProductModel } from "../models/product.model.js";
import { AccountMovementModel } from "../models/accountMovement.model.js";
import { CustomerModel } from "../models/customer.model.js";
import { getArgentinaTime } from "../db/timeUtils.js";
import { adjustInventoryInTransaction } from "./inventory.service.js";

export const StatsService = {
  async getProfitability({ from, to, productId, categoryId } = {}, businessUnit = null) {
    const conditions = [];
    if (from) conditions.push(gte(transactions.createdAt, `${from} 00:00:00`));
    if (to) conditions.push(lte(transactions.createdAt, `${to} 23:59:59`));
    if (productId) conditions.push(eq(transactionItems.productId, Number(productId)));
    if (categoryId) conditions.push(eq(products.categoryId, Number(categoryId)));

    // Sólo se contabilizan ventas confirmadas. Aún no hay flujo de devoluciones en
    // este sistema, por lo que no existen movimientos a descontar de este reporte.
    conditions.push(eq(transactions.status, "completed"));
    if (businessUnit?.id) conditions.push(eq(transactions.businessUnitId, businessUnit.id));
    const query = db
      .select({
        productId: transactionItems.productId,
        promotionId: transactionItems.promotionId,
        productName: transactionItems.productName,
        categoryName: transactionItems.categoryName,
        unitCost: transactionItems.unitCost,
        price: transactionItems.price,
        quantity: transactionItems.quantity,
        total: transactionItems.total,
        promotionComposition: transactionItems.promotionComposition,
        createdAt: transactions.createdAt,
      })
      .from(transactionItems)
      .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
      .leftJoin(products, eq(transactionItems.productId, products.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .orderBy(asc(transactions.createdAt));
    const items = conditions.length ? await query.where(and(...conditions)) : await query;
    return calculateProfitability(items);
  },

  async getRestockCost(businessUnit = null) {
    if (businessUnit?.id) {
      const rows = await db.select().from(businessUnitProducts)
        .where(eq(businessUnitProducts.businessUnitId, businessUnit.id));
      return { restockCost: rows.reduce((sum, p) => p.stock < p.minStock ? sum + (p.minStock - p.stock) * p.cost : sum, 0) };
    }
    const allProducts = await ProductModel.findAll();
    const restockCost = allProducts.reduce((sum, p) => {
      if (p.stock < p.minStock) {
        const needed = p.minStock - p.stock;
        return sum + needed * p.cost;
      }
      return sum;
    }, 0);
    return { restockCost };
  },

  async getActivityLog(businessUnit = null) {
    if (businessUnit?.code === "WAREHOUSE") {
      const rows = await db.select({
        id: inventoryMovements.id, productName: products.name, movementType: inventoryMovements.movementType,
        direction: inventoryMovements.direction, quantity: inventoryMovements.quantity,
        stockBefore: inventoryMovements.stockBefore, stockAfter: inventoryMovements.stockAfter,
        createdAt: inventoryMovements.createdAt,
      }).from(inventoryMovements).innerJoin(products, eq(inventoryMovements.productId, products.id))
        .where(eq(inventoryMovements.businessUnitId, businessUnit.id))
        .orderBy(desc(inventoryMovements.createdAt)).limit(100);
      return rows.map((row) => ({
        id: `inventory-${row.id}`, type: row.movementType,
        details: `${row.productName}: ${row.direction === "IN" ? "+" : "-"}${row.quantity} (${row.stockBefore} → ${row.stockAfter})`,
        date: row.createdAt, icon: row.direction === "IN" ? "PackagePlus" : "PackageMinus",
        color: row.direction === "IN" ? "text-green-600" : "text-orange-600", bg: "bg-surface",
      }));
    }
    const logs = [];

    // Aperturas y cierres de caja
    const allRegisters = await CashRegisterModel.findAll();
    for (const reg of allRegisters) {
      // Cierre
      if (!reg.isOpen && reg.closedAt) {
        const fechaHora = reg.closedAt.replace(" ", "T");
        const dt = new Date(fechaHora);
        const fecha = dt.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
        const hora = dt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
        logs.push({
          id: `close-${reg.id}`,
          type: "Cierre de caja",
          details: `Caja cerrada — ${fecha} ${hora} hs`,
          date: reg.closedAt,
          icon: "Lock",
          color: "text-red-500",
          bg: "bg-red-50",
        });
      }
      // Apertura
      if (reg.openedAt) {
        const fechaHora = reg.openedAt.replace(" ", "T");
        const dt = new Date(fechaHora);
        const fecha = dt.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
        const hora = dt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
        logs.push({
          id: `open-${reg.id}`,
          type: "Apertura de caja",
          details: `Caja abierta con fondo $${Number(reg.initialCash).toFixed(2)} — ${fecha} ${hora} hs`,
          date: reg.openedAt,
          icon: "Unlock",
          color: "text-green-600",
          bg: "bg-green-50",
        });
      }
    }

    // Ventas (todas)
    let recentTxQuery = db
      .select()
      .from(transactions)
      .orderBy(desc(transactions.createdAt))
      .limit(100);
    const recentTxs = businessUnit?.id
      ? await db.select().from(transactions).where(eq(transactions.businessUnitId, businessUnit.id)).orderBy(desc(transactions.createdAt)).limit(100)
      : await recentTxQuery;

    for (const tx of recentTxs) {
      const items = await TransactionModel.findItemsByTransactionId(tx.id);
      const itemSummary = items.map((i) => `${i.quantity}x ${i.productName}`).join(", ");
      logs.push({
        id: `tx-${tx.id}`,
        type: "Venta",
        details: itemSummary
          ? `$${Number(tx.total).toFixed(2)} — ${itemSummary}`
          : `$${Number(tx.total).toFixed(2)}`,
        date: tx.createdAt,
        icon: "BookUp",
        color: "text-green-600",
        bg: "bg-green-50",
        discountPercent: Number(tx.discountPercent || 0),
        discountAmount: Number(tx.discountAmount || 0),
      });
    }

    // Retiros internos de producto
    const withdrawals = await db
      .select()
      .from(internalWithdrawals)
      .orderBy(desc(internalWithdrawals.createdAt))
      .limit(100);
    for (const w of withdrawals) {
      logs.push({
        id: `withdrawal-${w.id}`,
        type: "Retiro interno",
        details: `${w.productName}: ${w.quantity} unidad${w.quantity !== 1 ? "es" : ""} retirada${w.quantity !== 1 ? "s" : ""} para uso del local`,
        date: w.createdAt,
        icon: "PackageMinus",
        color: "text-orange-500",
        bg: "bg-orange-50",
      });
    }

    // Modificaciones de stock
    const stockMods = await StockModificationModel.findAll();
    for (const mod of stockMods) {
      const diff = mod.newStock - mod.oldStock;
      const signo = diff > 0 ? "+" : "";
      logs.push({
        id: `stock-${mod.id}`,
        type: "Ajuste de stock",
        details: `${mod.productName}: ${mod.oldStock} → ${mod.newStock} (${signo}${diff})`,
        date: mod.createdAt,
        icon: "Package",
        color: "text-blue-500",
        bg: "bg-blue-50",
      });
    }

    // Extracciones / gastos del día
    const dailyExpList = await DailyExpenseModel.findAll();
    for (const expense of dailyExpList) {
      logs.push({
        id: `expense-${expense.id}`,
        type: "Extracción",
        details: `${expense.reason} — $${Number(expense.amount).toFixed(2)} en ${expense.method}`,
        date: expense.createdAt,
        icon: "Wallet",
        color: "text-yellow-600",
        bg: "bg-yellow-50",
      });
    }

    // Movimientos de cuenta corriente
    const accountMovementList = await AccountMovementModel.findAll(businessUnit?.id);
    if (accountMovementList.length > 0) {
      const customerList = await CustomerModel.findAll(businessUnit?.id);
      const customerById = new Map(customerList.map((c) => [c.id, c]));

      for (const movement of accountMovementList) {
        const customer = customerById.get(movement.customerId);
        const who = customer ? `${customer.name} ${customer.lastName}` : "Cliente";
        const isCharge = movement.type === "cargo";
        const isReversal = movement.type === "reversion_cargo";
        logs.push({
          id: `account-${movement.id}`,
          type: isReversal ? "Reversión de cargo" : isCharge ? "Cargo a cuenta" : "Cobro de cuenta",
          details: isReversal ? `${who} — reversión por $${Number(movement.amount).toFixed(2)}` : isCharge
            ? `${who} — $${Number(movement.amount).toFixed(2)} fiado`
            : `${who} — $${Number(movement.amount).toFixed(2)} en ${movement.methodName}`,
          date: movement.createdAt,
          icon: isCharge ? "BookUp" : "Wallet",
          color: isCharge ? "text-orange-500" : "text-green-600",
          bg: isCharge ? "bg-orange-50" : "bg-green-50",
        });
      }
    }

    // Ordenar por fecha descendente (formato YYYY-MM-DD HH:MM:SS es ordenable como string)
    logs.sort((a, b) => {
      const da = a.date || "";
      const db2 = b.date || "";
      return da < db2 ? 1 : da > db2 ? -1 : 0;
    });

    return logs.slice(0, 100);
  },

  async createStockModification({ productId, productName, oldStock, newStock }) {
    if (!productName || oldStock === undefined || newStock === undefined) {
      throw { status: 400, message: "productName, oldStock y newStock son requeridos." };
    }

    const { datetime } = getArgentinaTime();
    const created = await db
      .insert(stockModifications)
      .values({
        productId: productId || null,
        productName,
        oldStock: Number(oldStock),
        newStock: Number(newStock),
        createdAt: datetime,
      })
      .returning()
      .then((r) => r[0]);

    return created;
  },

  async createInternalWithdrawal({ productId, quantity }, businessUnit = null, userId = null) {
    if (!productId || !quantity || Number(quantity) <= 0) {
      throw { status: 400, message: "productId y quantity son requeridos." };
    }

    const product = businessUnit?.id ? await ProductModel.findByIdForUnit(Number(productId), businessUnit.id) : await ProductModel.findById(productId);
    if (!product) throw { status: 404, message: "Producto no encontrado." };
    if (product.stock < Number(quantity)) {
      throw { status: 400, message: "Stock insuficiente para el retiro." };
    }

    const oldStock = product.stock;
    const newStock = oldStock - Number(quantity);

    const { datetime: wDatetime } = getArgentinaTime();
    await db.transaction(async (tx) => {
      const [withdrawal] = await tx.insert(internalWithdrawals).values({ productId, productName: product.name, quantity: Number(quantity), createdAt: wDatetime }).returning();
      if (businessUnit?.id) {
        await adjustInventoryInTransaction(tx, {
          businessUnitId: businessUnit.id, productId: Number(productId), direction: "OUT", quantity: Number(quantity),
          movementType: "INTERNAL_WITHDRAWAL", unitCost: product.cost, sourceType: "internal_withdrawal",
          sourceId: withdrawal.id, idempotencyKey: `internal-withdrawal:${withdrawal.id}`, userId,
        });
      } else {
        await tx.update(products).set({ stock: newStock }).where(sql`${products.id} = ${productId}`);
      }
    });

    return { success: true };
  },
};
