import "dotenv/config";
import { client } from "../client.js";

async function addColumnIfMissing(table, column, sqlType) {
  const tableInfo = await client.execute(`PRAGMA table_info(${table})`);
  const hasColumn = tableInfo.rows.some((col) => col.name === column);
  if (hasColumn) {
    console.log(`ℹ️  ${table}.${column} ya existe`);
    return;
  }
  await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqlType}`);
  console.log(`✅ ${table}.${column} agregada`);
}

async function patch() {
  console.log("🔧 Aplicando parche: venta por unidad/paquete...");
  await addColumnIfMissing("products", "units_per_pack", "integer NOT NULL DEFAULT 1");
  await addColumnIfMissing("products", "pack_price", "real");
  await addColumnIfMissing("transaction_items", "sale_mode", "text NOT NULL DEFAULT 'unidad'");
  await addColumnIfMissing("transaction_items", "pack_size", "integer NOT NULL DEFAULT 1");
  console.log("🎉 Parche completado.");
  process.exit(0);
}

patch().catch((e) => {
  console.error("❌ Error en parche:", e);
  process.exit(1);
});
