import "dotenv/config";
import { db } from "./client.js";
import {
  internalWithdrawals,
  stockModifications,
  transactionItems,
  transactionPayments,
  transactions,
  dailyExpenses,
  cashRegisters,
  fixedExpenses,
  products,
  subscriptionConfig,
} from "./schema.js";

async function clean() {
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
  console.log("✅ Extracciones eliminadas");

  await db.delete(cashRegisters);
  console.log("✅ Cajas eliminadas");

  await db.delete(fixedExpenses);
  console.log("✅ Gastos fijos eliminados");

  await db.delete(products);
  console.log("✅ Productos eliminados");

  await db.delete(subscriptionConfig);
  console.log("✅ Configuración de suscripción reseteada");

  console.log("\n🎉 Base de datos lista para el cliente.");
  console.log("   Se conservaron: usuarios, métodos de pago y categorías.");
  process.exit(0);
}

clean().catch((e) => {
  console.error("❌ Error durante la limpieza:", e);
  process.exit(1);
});
