import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { getTableColumns, getTableName } from "drizzle-orm";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let client, CustomerService;
let directory;
const local = { id: 1, code: "LOCAL" };

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "mrtotal-accounts-"));
  process.env.TURSO_DATABASE_URL = `file:${path.join(directory, "accounts.db")}`;
  ({ client } = await import("../db/client.js"));
  const schema = await import("../db/schema.js");
  ({ CustomerService } = await import("./customer.service.js"));
  for (const name of ["customers", "accountMovements", "accountPaymentDetails", "cashRegisters", "paymentMethods"]) {
    const table = schema[name];
    const columns = Object.values(getTableColumns(table)).map((column) =>
      `"${column.name}" ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}`);
    await client.execute(`CREATE TABLE "${getTableName(table)}" (${columns.join(", ")})`);
  }
  await client.execute("CREATE UNIQUE INDEX customers_unit_document_unique ON customers(business_unit_id, document)");
});

beforeEach(async () => {
  await client.batch([
    "DELETE FROM account_payment_details", "DELETE FROM account_movements", "DELETE FROM customers",
    "DELETE FROM cash_registers", "DELETE FROM payment_methods",
    "INSERT INTO cash_registers (id, is_open, initial_cash) VALUES (1, 1, 0)",
    "INSERT INTO payment_methods (id, name, surcharge) VALUES (1, 'Efectivo', 0), (2, 'Transferencia', 0)",
  ], "write");
});

after(async () => {
  client?.close();
  if (directory) await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("deuda activa, pago parcial y combinado, saldo cero y nueva compra conservan el mismo cliente y el historial", async () => {
  const customer = await CustomerService.create({ name: "Ana", document: "12345678", initialDebt: 100 }, local);
  const active = (rows) => rows.filter((row) => row.debt > 0);
  assert.deepEqual(active(await CustomerService.list({}, local)).map((row) => row.id), [customer.id]);

  const partial = await CustomerService.registerPayment(customer.id, {
    payments: [{ paymentMethodId: 1, amount: 25 }], description: "Anticipo",
  }, 1, local);
  assert.equal(partial.debt, 75);
  assert.equal(partial.amount, 25);
  const combined = await CustomerService.registerPayment(customer.id, {
    payments: [{ paymentMethodId: 1, amount: 30 }, { paymentMethodId: 2, amount: 45 }], description: "Saldo",
  }, 1, local);
  assert.equal(combined.debt, 0);
  assert.deepEqual(combined.paymentDetails.map((payment) => [payment.methodName, payment.amount]), [["Efectivo", 30], ["Transferencia", 45]]);

  const all = await CustomerService.list({}, local);
  assert.equal(all.length, 1);
  assert.equal(all[0].id, customer.id);
  assert.equal(all[0].isActive, true);
  assert.deepEqual(active(all), []);
  const paidDetail = await CustomerService.getDetail(customer.id, local);
  assert.equal(paidDetail.totalCharges, 100);
  assert.equal(paidDetail.totalPayments, 100);
  assert.equal(paidDetail.movements.length, 3);
  assert.equal(paidDetail.movements.find((movement) => movement.id === combined.id).description, "Saldo");
  assert.deepEqual(paidDetail.movements.find((movement) => movement.id === combined.id).paymentDetails,
    combined.paymentDetails.map(({ accountMovementId, ...payment }) => payment));

  const existing = await CustomerService.getByDocument("12345678", local);
  await CustomerService.chargeSale({ customerId: existing.id, amount: 50, items: [{ name: "Nueva compra", quantity: 1, total: 50 }], registerId: 1, userId: 1 }, local);
  const renewed = await CustomerService.list({}, local);
  assert.equal(renewed.length, 1);
  assert.deepEqual(active(renewed).map((row) => [row.id, row.debt]), [[customer.id, 50]]);
  assert.equal((await CustomerService.getDetail(customer.id, local)).movements.length, 4);
});

test("backend rechaza cero, negativos, importes inválidos y pagos combinados superiores a la deuda sin guardar movimientos", async () => {
  const customer = await CustomerService.create({ name: "Ana", document: "12345678", initialDebt: 100 }, local);
  for (const payments of [
    [{ paymentMethodId: 1, amount: 0 }],
    [{ paymentMethodId: 1, amount: -1 }],
    [{ paymentMethodId: 1, amount: "inválido" }],
    [{ paymentMethodId: 1, amount: 100.01 }],
    [{ paymentMethodId: 1, amount: 60 }, { paymentMethodId: 2, amount: 40.01 }],
    [{ paymentMethodId: 1, amount: 25 }, { paymentMethodId: 2, amount: 0 }],
    [{ paymentMethodId: 999, amount: 10 }],
  ]) {
    await assert.rejects(() => CustomerService.registerPayment(customer.id, { payments }, 1, local), (error) => error.status === 400);
  }
  const detail = await CustomerService.getDetail(customer.id, local);
  assert.equal(detail.debt, 100);
  assert.equal(detail.movements.length, 1);
  assert.deepEqual(await CustomerService.getPaymentsByRegister(1), []);
});

test("cliente sin deuda sigue disponible por DNI y no puede duplicarse", async () => {
  const customer = await CustomerService.create({ name: "Ana", document: "12345678", initialDebt: 0 }, local);
  await assert.rejects(() => CustomerService.create({ name: "Ana duplicada", document: "12345678", initialDebt: 0 }, local), (error) => error.status === 409);
  assert.equal((await CustomerService.getByDocument("12345678", local)).id, customer.id);
  assert.equal((await CustomerService.list({ search: "Ana" }, local)).length, 1);
  assert.equal((await CustomerService.list({ search: "12345678" }, local))[0].debt, 0);
});
