// No hay reservas formales: el stock físico se descuenta al despachar.
// Preparación y Listo mantienen su demanda hasta el descuento al despachar.
// La asignación FIFO es informativa; no modifica ni reserva existencias.
export function calculateWarehouseProduction(orders, inventory) {
  const stock = new Map(inventory.map((product) => [product.id, product]));
  const remaining = new Map(inventory.map((product) => [product.id, Number(product.stock)]));
  const demand = new Map();
  const allocations = {};
  const pending = orders.filter((order) => ["confirmed", "preparing", "ready"].includes(order.status))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id - b.id);
  for (const order of pending) {
    allocations[order.id] = [];
    for (const item of order.items) {
      const available = Math.max(0, remaining.get(item.productId) || 0);
      const assigned = Math.min(available, item.quantity);
      remaining.set(item.productId, available - assigned);
      const key = item.productId ?? `deleted:${item.productName}`;
      const row = demand.get(key) || {
        productId: item.productId, productName: stock.get(item.productId)?.name || item.productName,
        demand: 0, stock: Number(stock.get(item.productId)?.stock || 0),
      };
      row.demand += item.quantity;
      demand.set(key, row);
      allocations[order.id].push({ ...item, availableStock: Number(stock.get(item.productId)?.stock || 0), assignedStock: assigned, toProduce: item.quantity - assigned });
    }
  }
  const items = [...demand.values()].map((row) => ({ ...row, toProduce: Math.max(0, row.demand - row.stock) }))
    .filter((row) => row.toProduce > 0).sort((a, b) => a.productName.localeCompare(b.productName, "es-AR"));
  return { items, totalUnits: items.reduce((sum, item) => sum + item.toProduce, 0), allocations };
}
