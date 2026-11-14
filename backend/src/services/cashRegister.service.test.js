import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
let CashRegisterService, client, directory;
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'mrtotal-cash-test-'));
  process.env.TURSO_DATABASE_URL = 'file:' + path.join(directory, 'test.db');
  ({client} = await import('../db/client.js'));
  ({CashRegisterService} = await import('./cashRegister.service.js'));
  await client.execute('CREATE TABLE cash_registers (id INTEGER PRIMARY KEY, opened_by INTEGER, initial_cash REAL, is_open INTEGER, opened_at TEXT, closed_at TEXT, expected_cash REAL, counted_cash REAL, cash_difference REAL, arqueo_notes TEXT, next_initial_cash REAL)');
});
after(async () => { client?.close(); if (directory) await rm(directory, {recursive:true,force:true,maxRetries:10,retryDelay:100}); });

test("CashRegisterService.getStatus - devuelve objeto con estado y sugerencia de saldo inicial", async () => {
  const status = await CashRegisterService.getStatus();
  assert.equal(typeof status.isOpen, "boolean");
  assert.equal(typeof status.suggestedInitialCash, "number");
  assert.ok(status.suggestedInitialCash >= 0);
});

test("CashRegisterService.close - rechaza cierre de caja inexistente", async () => {
  await assert.rejects(
    async () => {
      await CashRegisterService.close(999999, { countedCash: 100 });
    },
    (err) => err.status === 404 && err.message.includes("no encontrada")
  );
});

