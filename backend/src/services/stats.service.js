import { db } from "../db/client.js";
import { sql, desc } from "drizzle-orm";
import {
  products,
  cashRegisters,
  transactions,
  transactionPayments,
  transactionItems,
  dailyExpenses,
  stockModifications,
  internalWithdrawals,
} from "../db/schema.js";
import { CashRegisterModel } from "../models/cashRegister.model.js";
import { TransactionModel } from "../models/transaction.model.js";
import { DailyExpenseModel } from "../models/dailyExpense.model.js";
import { StockModificationModel } from "../models/stockModification.model.js";
import { ProductModel } from "../models/product.model.js";
import { AccountMovementModel } from "../models/accountMovement.model.js";
import { CustomerModel } from "../models/customer.model.js";
import { getArgentinaTime } from "../db/timeUtils.js";

export const StatsService = {
  async getRestockCost() {
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

  async getActivityLog() {
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
    const recentTxs = await db
      .select()
      .from(transactions)
      .orderBy(desc(transactions.createdAt))
      .limit(100);

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
    const accountMovementList = await AccountMovementModel.findAll();
    if (accountMovementList.length > 0) {
      const customerList = await CustomerModel.findAll();
      const customerById = new Map(customerList.map((c) => [c.id, c]));

      for (const movement of accountMovementList) {
        const customer = customerById.get(movement.customerId);
        const who = customer ? `${customer.name} ${customer.lastName}` : "Cliente";
        const isCharge = movement.type === "cargo";
        logs.push({
          id: `account-${movement.id}`,
          type: isCharge ? "Cargo a cuenta" : "Cobro de cuenta",
          details: isCharge
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

  async createInternalWithdrawal({ productId, quantity }) {
    if (!productId || !quantity || Number(quantity) <= 0) {
      throw { status: 400, message: "productId y quantity son requeridos." };
    }

    const product = await ProductModel.findById(productId);
    if (!product) throw { status: 404, message: "Producto no encontrado." };
    if (product.stock < Number(quantity)) {
      throw { status: 400, message: "Stock insuficiente para el retiro." };
    }

    const oldStock = product.stock;
    const newStock = oldStock - Number(quantity);

    await db
      .update(products)
      .set({ stock: newStock })
      .where(sql`${products.id} = ${productId}`);

    const { datetime: wDatetime } = getArgentinaTime();
    await db.insert(internalWithdrawals).values({
      productId,
      productName: product.name,
      quantity: Number(quantity),
      createdAt: wDatetime,
    });

    return { success: true };
  },
};
