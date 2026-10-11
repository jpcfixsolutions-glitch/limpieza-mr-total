import assert from "node:assert/strict";
import test from "node:test";
import { calculateProfitability } from "./profitability.js";

test("calcula rentabilidad ponderada, no promedio de porcentajes", () => {
  const result = calculateProfitability([
    { productId: 1, productName: "A", unitCost: 100, price: 200, quantity: 1, total: 200, createdAt: "2026-10-01" },
    { productId: 2, productName: "B", unitCost: 1000, price: 1100, quantity: 1, total: 1100, createdAt: "2026-10-01" },
  ]);
  assert.equal(result.summary.totalCost, 1100);
  assert.equal(result.summary.netRevenue, 1300);
  assert.equal(result.summary.totalProfit, 200);
  assert.equal(Number(result.summary.profitability.toFixed(2)), 18.18);
});

test("usa el importe histórico con descuento y no calcula cuando el costo es cero", () => {
  const result = calculateProfitability([
    { productId: 1, productName: "Con descuento", unitCost: 100, price: 150, quantity: 2, total: 240, createdAt: "2026-10-02" },
    { productId: 2, productName: "Sin costo", unitCost: 0, price: 50, quantity: 1, total: 50, createdAt: "2026-10-02" },
  ]);
  assert.equal(result.products.find((p) => p.name === "Con descuento").totalProfit, 40);
  assert.equal(result.products.find((p) => p.name === "Sin costo").profitability, null);
});

test("calcula una promoción por su composición histórica, descuento y varias unidades", () => {
  const result = calculateProfitability([
    { promotionId: 7, productName: "Combo A + B", categoryName: "Promoción", unitCost: 4, price: 5, quantity: 3, total: 15, createdAt: "2026-10-03" },
  ]);
  const promotion = result.products[0];
  assert.equal(promotion.isPromotion, true);
  assert.equal(promotion.totalCost, 12);
  assert.equal(promotion.totalProfit, 3);
  assert.equal(promotion.profitability, 25);
});
