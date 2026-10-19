import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateOptionalProfitabilityPercent,
  calculatePriceForProfitability,
  calculateProductProfitabilities,
  calculateProfitabilityPercent,
} from "./price.js";

test("la rentabilidad mayorista se calcula, redondea y no afecta la minorista", () => {
  const retailBefore = calculateProfitabilityPercent(100, 160);
  const wholesale = calculatePriceForProfitability(100, 35);

  assert.equal(wholesale, 140, "el precio mayorista se redondea hacia arriba a la decena");
  assert.equal(calculateOptionalProfitabilityPercent(100, wholesale), 40);
  assert.equal(calculateProfitabilityPercent(100, 160), retailBefore);
});

test("un precio mayorista vacío o cero no genera -100%", () => {
  assert.equal(calculateOptionalProfitabilityPercent(100, ""), null);
  assert.equal(calculateOptionalProfitabilityPercent(100, 0), null);
  assert.equal(calculateOptionalProfitabilityPercent(100, 150), 50);
});

test("un producto existente inicializa ambas rentabilidades de forma independiente", () => {
  const fields = calculateProductProfitabilities(80, 120, 100);

  assert.deepEqual(fields, { retail: 50, wholesale: 25 });
});
