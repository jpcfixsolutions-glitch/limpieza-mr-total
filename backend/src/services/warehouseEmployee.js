// Proyección de campos explícita: ninguna respuesta operativa del empleado
// incluye precios, costos, totales, condiciones de cuenta ni cartera de clientes.
export function employeeOrder(order) {
  return {
    id: order.id, customerName: order.customerName, customerLastName: order.customerLastName,
    status: order.status, createdAt: order.createdAt, updatedAt: order.updatedAt,
    readyAt: order.readyAt, deliveredAt: order.deliveredAt, version: order.version,
    items: order.items.map((item) => ({
      id: item.id, productId: item.productId, productName: item.productName, quantity: item.quantity,
      status: item.status, preparationStatus: item.preparationStatus,
      ...(item.assignedStock == null ? {} : { assignedStock: item.assignedStock, availableStock: item.availableStock, toProduce: item.toProduce }),
    })),
  };
}

export function employeeOperations(data) {
  return {
    orders: data.orders.map(employeeOrder),
    products: data.products.map(({ id, name, codbarra, stock, isAvailable }) => ({ id, name, codbarra, stock, isAvailable })),
    customers: [], counts: data.counts, production: data.production,
  };
}
