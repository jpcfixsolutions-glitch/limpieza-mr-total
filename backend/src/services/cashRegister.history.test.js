import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { getTableColumns, getTableName } from "drizzle-orm";

let client, db, schema, CashRegisterService;

before(async () => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  ({ client, db } = await import("../db/client.js"));
  schema = await import("../db/schema.js");
  ({ CashRegisterService } = await import("./cashRegister.service.js"));
  // Base aislada: mismas columnas que producción, sin tocar datos reales.
  for (const name of ["cashRegisters", "transactions", "transactionPayments", "transactionItems", "dailyExpenses", "accountMovements", "accountPaymentDetails"]) {
    const table = schema[name];
    const columns = Object.values(getTableColumns(table))
      .map((column) => `"${column.name}" ${column.getSQLType()}`);
    await client.execute(`CREATE TABLE "${getTableName(table)}" (${columns.join(", ")})`);
  }
});

after(() => client?.close());

test("historial vacío devuelve una lista vacía", async () => {
  assert.deepEqual(await CashRegisterService.getClosed(), []);
});

test("historial por lotes conserva detalles, gastos y cobros separados por caja", async () => {
  await db.insert(schema.cashRegisters).values([
    { id: 1, initialCash: 100, isOpen: false, closedAt: "2026-11-07 20:00:00" },
    { id: 2, initialCash: 200, isOpen: false, closedAt: "2026-11-08 20:00:00" },
    { id: 3, initialCash: 300, isOpen: true },
  ]);
  await db.insert(schema.transactions).values([
    { id: 10, registerId: 1, total: 80, date: "07/11/2026", time: "10:00" },
    { id: 20, registerId: 2, total: 40, date: "08/11/2026", time: "10:00" },
    { id: 30, registerId: 3, total: 999, date: "08/11/2026", time: "10:00" },
  ]);
  await db.insert(schema.transactionPayments).values([
    { transactionId: 10, methodName: "Efectivo", baseAmount: 50, amount: 50 },
    { transactionId: 10, methodName: "Cuenta Corriente", baseAmount: 30, amount: 30 },
    { transactionId: 20, methodName: "Transferencia", baseAmount: 40, amount: 40 },
    { transactionId: 30, methodName: "Efectivo", baseAmount: 999, amount: 999 },
  ]);
  await db.insert(schema.transactionItems).values([
    { transactionId: 10, productName: "Producto A", price: 40, quantity: 2, total: 80 },
    { transactionId: 20, productName: "Producto B", price: 40, quantity: 1, total: 40 },
  ]);
  await db.insert(schema.dailyExpenses).values({ id: 1, registerId: 1, reason: "Gasto", method: "efectivo", amount: 10 });
  await db.insert(schema.accountMovements).values([
    { id: 1, customerId: 1, registerId: 1, type: "pago", amount: 20, methodName: "Efectivo" },
    { id: 2, customerId: 1, registerId: 2, type: "pago", amount: 50, methodName: "Mixto" },
    { id: 3, customerId: 1, registerId: 3, type: "pago", amount: 999, methodName: "Efectivo" },
  ]);
  await db.insert(schema.accountPaymentDetails).values([
    { accountMovementId: 2, methodName: "Efectivo", amount: 15 },
    { accountMovementId: 2, methodName: "Transferencia", amount: 35 },
  ]);

  const history = await CashRegisterService.getClosed();
  assert.deepEqual(history.map((register) => register.id), [2, 1]);
  const [second, first] = history;
  assert.equal(first.totalIngresos, 80);
  assert.equal(first.totalCuentaCorriente, 30);
  assert.equal(first.totalEfectivo, 70);
  assert.equal(first.totalGastosEfectivo, 10);
  assert.equal(first.expectedCash, 160);
  assert.equal(first.transactionsCount, 1);
  assert.equal(first.transactions[0].items[0].productName, "Producto A");
  assert.equal(first.soldItems[0].quantity, 2);
  assert.equal(second.totalIngresos, 40);
  assert.equal(second.totalEfectivo, 15);
  assert.equal(second.totalTransferencia, 75);
  assert.equal(second.totalCobrosCuenta, 50);
  assert.equal(second.expectedCash, 215);
  assert.deepEqual(second.dailyExpenses, []);
});
