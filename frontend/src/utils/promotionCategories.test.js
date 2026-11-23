import assert from "node:assert/strict";
import test from "node:test";
import { promotionCategoryNames, promotionMatchesCategory, withPromotionsCategory } from "./promotionCategories.js";

const products = [
  { id: 1, category: "Limpieza" },
  { id: 2, category: "Descartables" },
  { id: 3, category: "Otros" },
];
const promotion = { items: [{ productId: 1 }, { productId: "2" }] };

test("las promociones aparecen en Promociones y conservan las categorías de sus productos", () => {
  assert.deepEqual(promotionCategoryNames(promotion, products), ["Promociones", "Limpieza", "Descartables"]);
  for (const name of ["Promociones", "Limpieza", "Descartables"]) {
    assert.equal(promotionMatchesCategory(promotion, { name }, products), true);
  }
  assert.equal(promotionMatchesCategory(promotion, { name: "Otros" }, products), false);
  assert.equal(promotionMatchesCategory(promotion, null, products), true);
});

test("las promociones sin categoría y las que tienen categoría propia siguen agrupadas", () => {
  assert.deepEqual(promotionCategoryNames({ items: [] }, []), ["Promociones"]);
  assert.deepEqual(promotionCategoryNames({ ...promotion, category: "Especiales" }, products), ["Promociones", "Especiales", "Limpieza", "Descartables"]);
});

test("agrega la categoría de filtro sin duplicarla ni modificar la lista original", () => {
  const categories = [{ id: 1, name: "Limpieza" }];
  assert.equal(withPromotionsCategory(categories).length, 2);
  assert.equal(categories.length, 1);
  assert.equal(withPromotionsCategory([{ id: 2, name: " PROMOCIONES " }]).length, 1);
});
