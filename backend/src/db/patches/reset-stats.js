import "dotenv/config";
import { client } from "../client.js";

async function reset() {
  console.log("🧹 Iniciando limpieza de estadísticas y cajas cerradas...\n");

  // IDs de cajas cerradas
  const closedRegisters = await client.execute(
    "SELECT id FROM cash_registers WHERE is_open = 0"
  );
  const closedIds = closedRegisters.rows.map((r) => r.id);
  console.log(`📦 Cajas cerradas encontradas: ${closedIds.length}`);

  if (closedIds.length === 0) {
    console.log("ℹ️  No hay cajas cerradas. Nada que borrar.");
    process.exit(0);
  }

  const idList = closedIds.join(",");

  // 1. transaction_items (cascade manual por si acaso)
  const tiRes = await client.execute(
    `DELETE FROM transaction_items WHERE transaction_id IN (SELECT id FROM transactions WHERE register_id IN (${idList}))`
  );
  console.log(`🗑  transaction_items eliminados: ${tiRes.rowsAffected}`);

  // 2. transaction_payments (cascade manual por si acaso)
  const tpRes = await client.execute(
    `DELETE FROM transaction_payments WHERE transaction_id IN (SELECT id FROM transactions WHERE register_id IN (${idList}))`
  );
  console.log(`🗑  transaction_payments eliminados: ${tpRes.rowsAffected}`);

  // 3. transactions
  const tRes = await client.execute(
    `DELETE FROM transactions WHERE register_id IN (${idList})`
  );
  console.log(`🗑  transactions eliminadas: ${tRes.rowsAffected}`);

  // 4. daily_expenses vinculados a esas cajas
  const deRes = await client.execute(
    `DELETE FROM daily_expenses WHERE register_id IN (${idList})`
  );
  console.log(`🗑  daily_expenses eliminados: ${deRes.rowsAffected}`);

  // 5. cash_registers cerradas
  const crRes = await client.execute(
    `DELETE FROM cash_registers WHERE is_open = 0`
  );
  console.log(`🗑  cash_registers cerradas eliminadas: ${crRes.rowsAffected}`);

  console.log("\n✅ Limpieza completada.");
  console.log("✅ Productos, stock, configuraciones y caja abierta: intactos.");
  process.exit(0);
}

reset().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
