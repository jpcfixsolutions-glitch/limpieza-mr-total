import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { CashRegisterService } from "./cashRegister.service.js";

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

