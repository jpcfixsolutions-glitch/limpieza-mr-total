import { db } from '../db/client.js';

// Compartida por pedidos y líquidos: evita escrituras superpuestas en la
// conexión SQLite. Los UPDATE con versión protegen además entre procesos.
let warehouseQueue = Promise.resolve();
export function runWarehouseTransaction(operation) {
  const result = warehouseQueue.then(() => db.transaction(operation));
  warehouseQueue = result.then(() => undefined, () => undefined);
  return result;
}
