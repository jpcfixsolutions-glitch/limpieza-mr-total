import { and, eq, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { transactions, transactionPayments, transactionItems } from "../db/schema.js";

export const TransactionModel = {
  create(data) {
    return db.insert(transactions).values(data).returning().then((r) => r[0]);
  },

  findByRegisterId(registerId) {
    return db
      .select()
      .from(transactions)
      .where(eq(transactions.registerId, registerId))
      .orderBy(desc(transactions.createdAt));
  },

  findById(id, businessUnitId = null) {
    return db
      .select()
      .from(transactions)
      .where(businessUnitId
        ? and(eq(transactions.id, id), eq(transactions.businessUnitId, businessUnitId))
        : eq(transactions.id, id))
      .then((r) => r[0]);
  },

  createPayments(paymentsData) {
    return db.insert(transactionPayments).values(paymentsData).returning();
  },

  createItems(itemsData) {
    return db.insert(transactionItems).values(itemsData).returning();
  },

  findPaymentsByTransactionId(transactionId) {
    return db
      .select()
      .from(transactionPayments)
      .where(eq(transactionPayments.transactionId, transactionId));
  },

  findItemsByTransactionId(transactionId) {
    return db
      .select()
      .from(transactionItems)
      .where(eq(transactionItems.transactionId, transactionId));
  },
};
