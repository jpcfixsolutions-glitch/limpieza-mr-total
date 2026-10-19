import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProductSearch, searchProducts } from "./productSearch.js";

const products = [
  { id: 1, name: "COCA COLA 2.25 L", codbarra: "7791234567890" },
  { id: 2, name: "ACE X 800 ML", codbarra: "7798000000000" },
  { id: 3, name: "ABRELATAS MARIPOSA", codbarra: "7793000000000" },
  { id: 4, name: "JABÓN LÍQUIDO", codbarra: "7794000000000" },
  { id: 5, name: "911 X 150 ML", codbarra: "9111500000000" },
  { id: 6, name: "COCA COLA 500 ML", codbarra: "7795000000000" },
];

test("normaliza tildes, puntuación y espacios", () => {
  assert.equal(normalizeProductSearch(" Jabón---LÍQUIDO  "), "jabon liquido");
});

test("encuentra prefijos, fragmentos y términos en distinto orden", () => {
  assert.deepEqual(searchProducts(products, "coca 2").map((product) => product.id), [1]);
  assert.deepEqual(searchProducts(products, "800 ace").map((product) => product.id), [2]);
  assert.deepEqual(searchProducts(products, "abrel marip").map((product) => product.id), [3]);
});

test("encuentra texto con tildes y números", () => {
  assert.deepEqual(searchProducts(products, "jabon liquido").map((product) => product.id), [4]);
  assert.deepEqual(searchProducts(products, "911 150").map((product) => product.id), [5]);
});

test("prioriza el código exacto y conserva el orden para empates", () => {
  assert.equal(searchProducts(products, "7791234567890")[0].id, 1);
  assert.deepEqual(searchProducts(products, "coca").map((product) => product.id), [1, 6]);
});

test("encuentra resultados más allá de cualquier página visible", () => {
  const catalog = Array.from({ length: 80 }, (_, index) => ({ id: index + 1, name: `Producto ${index + 1}` }));
  catalog[70] = { id: 71, name: "Producto objetivo tardío" };
  assert.deepEqual(searchProducts(catalog, "objetivo tardio").map((product) => product.id), [71]);
});
