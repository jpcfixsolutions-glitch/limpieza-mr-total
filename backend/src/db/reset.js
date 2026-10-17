import "dotenv/config";
import { client } from "./client.js";

async function reset() {
  console.log("🧹 Preparando la base para cargar los datos del cliente...");

  const clearedTables = [
    "warehouse_order_items",
    "warehouse_purchase_items",
    "promotion_items",
    "product_price_tiers",
    "product_extraction_items",
    "transaction_items",
    "transaction_payments",
    "account_movements",
    "inventory_transfers",
    "inventory_movements",
    "warehouse_orders",
    "warehouse_purchases",
    "product_extractions",
    "internal_withdrawals",
    "stock_modifications",
    "daily_expenses",
    "transactions",
    "cash_registers",
    "promotions",
    "business_unit_products",
    "products",
    "fixed_expenses",
    "price_groups",
    "categories",
  ];

  const statements = clearedTables.map((table) => `DELETE FROM "${table}"`);
  statements.push("DELETE FROM customers WHERE is_internal = 0");
  statements.push("DELETE FROM users WHERE role = 'cajero'");
  statements.push(
    `DELETE FROM sqlite_sequence WHERE name IN (${clearedTables.map((table) => `'${table}'`).join(", ")})`,
  );

  await client.batch(statements, "write");

  console.log("✅ Datos operativos y catálogos de prueba eliminados");
  console.log("✅ Se conservaron el administrador, el creador, las unidades de negocio, los métodos de pago y la configuración técnica");
  console.log("🎉 Base lista para cargar los datos del cliente.");
  client.close();
  process.exit(0);
}

reset().catch((e) => {
  console.error("❌ Error en reset:", e);
  client.close();
  process.exit(1);
});
