import assert from "node:assert/strict";
import test from "node:test";
import { isValidPromotionComposition, normalizePromotionItems } from "./promotion.rules.js";

test("acepta una promoción con varias unidades del mismo producto", () => {
  assert.deepEqual(normalizePromotionItems([{ productId: "7", quantity: "3" }]), [
    { productId: 7, quantity: 3 },
  ]);
  assert.equal(isValidPromotionComposition([{ productId: 7, quantity: 3 }]), true);
});

test("rechaza una promoción de una sola unidad", () => {
  assert.throws(
    () => normalizePromotionItems([{ productId: 7, quantity: 1 }]),
    (error) => error.status === 400 && /al menos 2 unidades/i.test(error.message)
  );
});

test("sigue aceptando promociones de productos distintos", () => {
  assert.deepEqual(normalizePromotionItems([
    { productId: 7, quantity: 1 },
    { productId: 8, quantity: 1 },
  ]), [
    { productId: 7, quantity: 1 },
    { productId: 8, quantity: 1 },
  ]);
});
