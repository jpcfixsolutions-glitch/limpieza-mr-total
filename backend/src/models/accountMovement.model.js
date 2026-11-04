import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { accountMovements, accountPaymentDetails, customers } from "../db/schema.js";

const chargesSum = sql`COALESCE(SUM(CASE WHEN ${accountMovements.type} = 'cargo' THEN ${accountMovements.amount} WHEN ${accountMovements.type} = 'reversion_cargo' THEN -${accountMovements.amount} ELSE 0 END), 0)`;
const paymentsSum = sql`COALESCE(SUM(CASE WHEN ${accountMovements.type} = 'pago' THEN ${accountMovements.amount} ELSE 0 END), 0)`;

export const AccountMovementModel = {
  create(data) {
    return db.insert(accountMovements).values(data).returning().then((r) => r[0]);
  },

  async findByCustomerId(customerId) {
    const movements = await db
      .select()
      .from(accountMovements)
      .where(eq(accountMovements.customerId, customerId))
      .orderBy(desc(accountMovements.createdAt), desc(accountMovements.id));
    return this.attachPaymentDetails(movements);
  },

  async findPaymentDetailsByMovementIds(movementIds) {
    if (!movementIds.length) return [];
    return db
      .select()
      .from(accountPaymentDetails)
      .where(inArray(accountPaymentDetails.accountMovementId, movementIds));
  },

  async attachPaymentDetails(movements) {
    const paymentIds = movements.filter((movement) => movement.type === "pago").map((movement) => movement.id);
    const rows = await this.findPaymentDetailsByMovementIds(paymentIds);
    const byMovement = new Map();
    for (const row of rows) {
      const list = byMovement.get(row.accountMovementId) || [];
      list.push({ id: row.id, paymentMethodId: row.paymentMethodId, methodName: row.methodName, amount: Number(row.amount) });
      byMovement.set(row.accountMovementId, list);
    }
    return movements.map((movement) => ({
      ...movement,
      paymentDetails: movement.type !== "pago"
        ? []
        : byMovement.get(movement.id) || (movement.methodName ? [{ methodName: movement.methodName, amount: Number(movement.amount) }] : []),
    }));
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

  async findPaymentsByRegisterId(registerId) {
    const movements = await db
      .select()
      .from(accountMovements)
      .where(
        and(eq(accountMovements.registerId, registerId), eq(accountMovements.type, "pago"))
      )
      .orderBy(desc(accountMovements.createdAt), desc(accountMovements.id));
    const enriched = await this.attachPaymentDetails(movements);
    return enriched.flatMap((movement) => movement.paymentDetails.map((payment) => ({
      ...movement,
      methodName: payment.methodName,
      amount: payment.amount,
    })));
  },

  async findAll(businessUnitId = null) {
    const movements = await db
      .select()
      .from(accountMovements)
      .where(businessUnitId ? eq(accountMovements.businessUnitId, businessUnitId) : undefined)
      .orderBy(desc(accountMovements.createdAt))
      .limit(100);
    return this.attachPaymentDetails(movements);
  },

  async findRecentWithCustomers(businessUnitId = null) {
    const movements = await db.select({
      id: accountMovements.id, customerId: accountMovements.customerId, type: accountMovements.type,
      amount: accountMovements.amount, methodName: accountMovements.methodName, detail: accountMovements.detail,
      transactionId: accountMovements.transactionId, createdAt: accountMovements.createdAt,
      customerName: customers.name, customerLastName: customers.lastName, document: customers.document,
    }).from(accountMovements).innerJoin(customers, eq(accountMovements.customerId, customers.id))
      .where(businessUnitId ? eq(accountMovements.businessUnitId, businessUnitId) : undefined)
      .orderBy(desc(accountMovements.createdAt), desc(accountMovements.id)).limit(200);
    return this.attachPaymentDetails(movements);
  },
};
