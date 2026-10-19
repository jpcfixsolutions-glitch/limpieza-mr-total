import test from "node:test";
import assert from "node:assert/strict";
import { filterCategories, normalizeCategorySearch } from "./categorySearch.js";

const categories = [
  { id: 1, name: "Lácteos y quesos" },
  { id: 2, name: "Café 100% arábica" },
  { id: 3, name: "Limpieza" },
];

test("normaliza tildes, mayúsculas y espacios sobrantes", () => {
  assert.equal(normalizeCategorySearch("  LÁCTEOS   y QUESOS "), "lacteos y quesos");
});

test("encuentra coincidencias parciales y numéricas", () => {
  assert.deepEqual(filterCategories(categories, "cteos").map(({ id }) => id), [1]);
  assert.deepEqual(filterCategories(categories, "CAFE 100").map(({ id }) => id), [2]);
});

test("no devuelve categorías cuando no hay coincidencias", () => {
  assert.deepEqual(filterCategories(categories, "inexistente"), []);
});
