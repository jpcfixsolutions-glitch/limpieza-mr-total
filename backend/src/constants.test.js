import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCT_ICONS, roundPriceUpToTen } from "./constants.js";

test("redondea precios hacia arriba a la próxima decena", () => {
  assert.equal(roundPriceUpToTen(1323.14), 1330);
  assert.equal(roundPriceUpToTen(1320.01), 1330);
  assert.equal(roundPriceUpToTen(0.01), 10);
});

test("conserva ceros y decenas exactas", () => {
  assert.equal(roundPriceUpToTen(0), 0);
  assert.equal(roundPriceUpToTen(1320), 1320);
  assert.equal(roundPriceUpToTen(1100.0000000000002), 1100);
});

test("rechaza valores que no son números", () => {
  assert.equal(Number.isNaN(roundPriceUpToTen("precio")), true);
});

test("ofrece íconos propios de un negocio de descartables", () => {
  assert.deepEqual(PRODUCT_ICONS, [
    "Package",
    "CupSoda",
    "GlassWater",
    "Utensils",
    "Soup",
    "Layers3",
    "ShoppingBag",
    "Box",
    "ScrollText",
    "PartyPopper",
    "SprayCan",
  ]);
  assert.equal(PRODUCT_ICONS.includes("BookOpen"), false);
  assert.equal(PRODUCT_ICONS.includes("Notebook"), false);
  assert.equal(new Set(PRODUCT_ICONS).size, PRODUCT_ICONS.length);
});
