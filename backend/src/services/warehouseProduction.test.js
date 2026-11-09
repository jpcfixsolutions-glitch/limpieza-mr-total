import assert from "node:assert/strict";
import test from "node:test";
import { calculateWarehouseProduction } from "./warehouseProduction.js";

const order = (id, quantity, status = "confirmed", productId = 1) => ({
  id, status, createdAt: `2026-11-${String(id).padStart(2, "0")} 10:00:00`,
  items: [{ id, productId, productName: `Producto ${productId}`, quantity }],
});

test("agrupa dos pedidos y resta el stock una sola vez; asignación FIFO sin doble uso", () => {
  const result = calculateWarehouseProduction([order(2, 20), order(1, 25)], [{ id: 1, name: "Bolsas", stock: 15 }]);
  assert.equal(result.totalUnits, 30);
  assert.deepEqual(result.items, [{ productId: 1, productName: "Bolsas", demand: 45, stock: 15, toProduce: 30 }]);
  assert.equal(result.allocations[1][0].assignedStock, 15);
  assert.equal(result.allocations[2][0].assignedStock, 0);
  assert.equal(result.allocations[1][0].toProduce + result.allocations[2][0].toProduce, 30);
});

test("stock suficiente, cero stock, aumento de stock y cambios de demanda", () => {
  const orders = [order(1, 25), order(2, 20)];
  const calculate = (stock) => calculateWarehouseProduction(orders, [{ id: 1, name: "Bolsas", stock }]);
  assert.equal(calculate(0).totalUnits, 45);
  assert.equal(calculate(15).totalUnits, 30);
  assert.equal(calculate(35).totalUnits, 10);
  assert.deepEqual(calculate(45).items, []);
  assert.equal(calculateWarehouseProduction([order(1, 5)], [{ id: 1, stock: 15 }]).totalUnits, 0);
});

test("excluye borradores, cancelados, despachados y entregados sin doble descuento", () => {
  const result = calculateWarehouseProduction([
    order(1, 10, "draft"), order(2, 20, "cancelled"), order(3, 30, "dispatched"), order(4, 40, "delivered"), order(5, 5, "preparing"),
  ], [{ id: 1, stock: 2 }]);
  assert.equal(result.totalUnits, 3);
});

test("Listo conserva la demanda y el mismo stock asignable sin generar movimientos", () => {
  const pending = [order(1, 25), order(2, 20)];
  const inventory = [{ id: 1, stock: 15 }];
  const before = calculateWarehouseProduction(pending, inventory);
  pending[0].status = "ready";
  const after = calculateWarehouseProduction(pending, inventory);
  assert.deepEqual(after, before);
  assert.equal(inventory[0].stock, 15);
});

test("varios productos, líneas repetidas y pedidos sin inventario mantienen sus cantidades", () => {
  const repeated = order(1, 5);
  repeated.items.push({ id: 9, productId: 1, productName: "Producto 1", quantity: 7 });
  const result = calculateWarehouseProduction([repeated, order(2, 8, "confirmed", 2)], [{ id: 1, stock: 10 }]);
  assert.equal(result.totalUnits, 10);
  assert.equal(result.items.find((item) => item.productId === 1).toProduce, 2);
  assert.equal(result.items.find((item) => item.productId === 2).toProduce, 8);
  assert.equal(result.allocations[1].reduce((sum, item) => sum + item.assignedStock, 0), 10);
});
