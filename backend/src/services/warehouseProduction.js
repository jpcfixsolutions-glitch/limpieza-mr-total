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
      const unit = stock.get(item.productId)?.unit || item.unit || 'u.';
      const measure = value => unit === 'L' ? Math.round(value * 1000) / 1000 : value;
      const available = Math.max(0, remaining.get(item.productId) || 0);
      const assigned = Math.min(available, item.quantity);
      const missing = measure(item.quantity - assigned);
      remaining.set(item.productId, measure(available - assigned));
      const key = item.productId ?? `deleted:${item.productName}`;
      const row = demand.get(key) || {
        productId: item.productId, productName: stock.get(item.productId)?.name || item.productName,
        unit, demand: 0, stock: Number(stock.get(item.productId)?.stock || 0),
        orders: [], oldestOrderAt: null,
      };
      row.demand = measure(row.demand + item.quantity);
      if (missing > 0) {
        const source = row.orders.find((source) => source.id === order.id);
        if (source) source.toProduce = measure(source.toProduce + missing);
        else row.orders.push({ id: order.id, createdAt: order.createdAt, toProduce: missing });
        if (!row.oldestOrderAt) row.oldestOrderAt = order.createdAt;
      }
      demand.set(key, row);
      allocations[order.id].push({ ...item, unit, availableStock: Number(stock.get(item.productId)?.stock || 0), assignedStock: assigned, toProduce: missing });
    }
  }
  const items = [...demand.values()].map((row) => ({ ...row, toProduce: Math.max(0, row.unit === 'L' ? Math.round((row.demand - row.stock) * 1000) / 1000 : row.demand - row.stock) }))
    .filter((row) => row.toProduce > 0).sort((a, b) => a.productName.localeCompare(b.productName, "es-AR"));
  return { items, totalUnits: items.filter(item => item.unit !== "L").reduce((sum, item) => sum + item.toProduce, 0), totalLiters: Math.round(items.filter(item => item.unit === "L").reduce((sum, item) => sum + item.toProduce, 0) * 1000) / 1000, allocations };
}
