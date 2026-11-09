import { eq, desc, and, getTableColumns } from "drizzle-orm";
import { db } from "../db/client.js";
import { cashRegisters, transactions, transactionPayments, transactionItems, dailyExpenses, accountMovements } from "../db/schema.js";
import { AccountMovementModel } from "./accountMovement.model.js";

export const CashRegisterModel = {
  findOpen() {
    return db
      .select()
      .from(cashRegisters)
      .where(eq(cashRegisters.isOpen, true))
      .then((r) => r[0]);
  },

  findById(id) {
    return db
      .select()
      .from(cashRegisters)
      .where(eq(cashRegisters.id, id))
      .then((r) => r[0]);
  },

  findClosed() {
    return db
      .select()
      .from(cashRegisters)
      .where(eq(cashRegisters.isOpen, false))
      .orderBy(desc(cashRegisters.closedAt));
  },

  // Leer el historial por lotes evita dos viajes a Turso por cada venta.
  async findClosedHistoryData() {
    const closed = eq(cashRegisters.isOpen, false);
    const [txs, payments, items, expenses, movements] = await Promise.all([
      db.select(getTableColumns(transactions)).from(transactions)
        .innerJoin(cashRegisters, eq(transactions.registerId, cashRegisters.id))
        .where(closed).orderBy(desc(transactions.createdAt)),
      db.select(getTableColumns(transactionPayments)).from(transactionPayments)
        .innerJoin(transactions, eq(transactionPayments.transactionId, transactions.id))
        .innerJoin(cashRegisters, eq(transactions.registerId, cashRegisters.id)).where(closed),
      db.select(getTableColumns(transactionItems)).from(transactionItems)
        .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
        .innerJoin(cashRegisters, eq(transactions.registerId, cashRegisters.id)).where(closed),
      db.select(getTableColumns(dailyExpenses)).from(dailyExpenses)
        .innerJoin(cashRegisters, eq(dailyExpenses.registerId, cashRegisters.id))
        .where(closed).orderBy(desc(dailyExpenses.createdAt)),
      db.select(getTableColumns(accountMovements)).from(accountMovements)
        .innerJoin(cashRegisters, eq(accountMovements.registerId, cashRegisters.id))
        .where(and(closed, eq(accountMovements.type, "pago")))
        .orderBy(desc(accountMovements.createdAt), desc(accountMovements.id)),
    ]);
    const enriched = await AccountMovementModel.attachPaymentDetails(movements);
    const accountPayments = enriched.flatMap((movement) => movement.paymentDetails.map((payment) => ({
      ...movement,
      methodName: payment.methodName,
      amount: payment.amount,
    })));
    return { txs, payments, items, expenses, accountPayments };
  },

  findLastClosed() {
    return db
      .select()
      .from(cashRegisters)
      .where(eq(cashRegisters.isOpen, false))
      .orderBy(desc(cashRegisters.closedAt), desc(cashRegisters.id))
      .limit(1)
      .then((r) => r[0] || null);
  },

  findAll() {
    return db.select().from(cashRegisters).orderBy(desc(cashRegisters.openedAt));
  },

  create(data) {
    return db.insert(cashRegisters).values(data).returning().then((r) => r[0]);
  },

  update(id, data) {
    return db
      .update(cashRegisters)
      .set(data)
      .where(eq(cashRegisters.id, id))
      .returning()
      .then((r) => r[0]);
  },

  closeAtomically(id, data) {
    return db
      .update(cashRegisters)
      .set(data)
      .where(and(eq(cashRegisters.id, id), eq(cashRegisters.isOpen, true)))
      .returning()
      .then((r) => r[0] || null);
  },
};
