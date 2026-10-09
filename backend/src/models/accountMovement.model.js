import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { accountMovements, customers } from "../db/schema.js";

const chargesSum = sql`COALESCE(SUM(CASE WHEN ${accountMovements.type} = 'cargo' THEN ${accountMovements.amount} ELSE 0 END), 0)`;
const paymentsSum = sql`COALESCE(SUM(CASE WHEN ${accountMovements.type} = 'pago' THEN ${accountMovements.amount} ELSE 0 END), 0)`;

export const AccountMovementModel = {
  create(data) {
    return db.insert(accountMovements).values(data).returning().then((r) => r[0]);
  },

  findByCustomerId(customerId) {
    return db
      .select()
      .from(accountMovements)
      .where(eq(accountMovements.customerId, customerId))
      .orderBy(desc(accountMovements.createdAt), desc(accountMovements.id));
  },

  // Totales de cargos y pagos agrupados por cliente
  balances() {
    return db
      .select({
        customerId: accountMovements.customerId,
        charges: chargesSum.mapWith(Number),
        payments: paymentsSum.mapWith(Number),
      })
      .from(accountMovements)
      .groupBy(accountMovements.customerId);
  },

  balanceByCustomerId(customerId) {
    return db
      .select({
        charges: chargesSum.mapWith(Number),
        payments: paymentsSum.mapWith(Number),
      })
      .from(accountMovements)
      .where(eq(accountMovements.customerId, customerId))
      .then((r) => r[0] || { charges: 0, payments: 0 });
  },

  findPaymentsByRegisterId(registerId) {
    return db
      .select()
      .from(accountMovements)
      .where(
        and(eq(accountMovements.registerId, registerId), eq(accountMovements.type, "pago"))
      )
      .orderBy(desc(accountMovements.createdAt));
  },

  findAll() {
    return db
      .select()
      .from(accountMovements)
      .orderBy(desc(accountMovements.createdAt))
      .limit(100);
  },

  findRecentWithCustomers() {
    return db.select({
      id: accountMovements.id, customerId: accountMovements.customerId, type: accountMovements.type,
      amount: accountMovements.amount, methodName: accountMovements.methodName, detail: accountMovements.detail,
      transactionId: accountMovements.transactionId, createdAt: accountMovements.createdAt,
      customerName: customers.name, customerLastName: customers.lastName, document: customers.document,
    }).from(accountMovements).innerJoin(customers, eq(accountMovements.customerId, customers.id))
      .orderBy(desc(accountMovements.createdAt), desc(accountMovements.id)).limit(200);
  },
};
