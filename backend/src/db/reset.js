import "dotenv/config";
import { db } from "./client.js";
import {
  products,
  fixedExpenses,
  dailyExpenses,
  cashRegisters,
  transactions,
  transactionItems,
  transactionPayments,
  stockModifications,
  internalWithdrawals,
} from "./schema.js";

async function reset() {
  console.log("🧹 Limpiando base de datos...");

  await db.delete(internalWithdrawals);
  console.log("✅ Retiros internos eliminados");

  await db.delete(stockModifications);
  console.log("✅ Modificaciones de stock eliminadas");

  await db.delete(transactionItems);
  console.log("✅ Ítems de transacciones eliminados");

  await db.delete(transactionPayments);
  console.log("✅ Pagos de transacciones eliminados");

  await db.delete(transactions);
  console.log("✅ Transacciones eliminadas");

  await db.delete(dailyExpenses);
  console.log("✅ Gastos diarios eliminados");

  await db.delete(cashRegisters);
  console.log("✅ Cajas eliminadas");

  await db.delete(fixedExpenses);
  console.log("✅ Gastos fijos eliminados");

  await db.delete(products);
  console.log("✅ Productos eliminados");

  console.log("🎉 Base de datos limpia. Usuarios, categorías y métodos de pago intactos.");
  process.exit(0);
}

reset().catch((e) => {
  console.error("❌ Error en reset:", e);
  process.exit(1);
});
