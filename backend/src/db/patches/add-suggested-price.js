import "dotenv/config";
import { client } from "../client.js";

async function patch() {
  console.log("🔧 Aplicando parche: precio sugerido...");

  // 1. Columna use_suggested_price en products
  const tableInfo = await client.execute("PRAGMA table_info(products)");
  const hasUsp = tableInfo.rows.some((col) => col.name === "use_suggested_price");
  if (!hasUsp) {
    await client.execute(
      "ALTER TABLE products ADD COLUMN use_suggested_price INTEGER NOT NULL DEFAULT 0"
    );
    console.log("✅ Columna use_suggested_price agregada a products");
  } else {
    console.log("ℹ️  use_suggested_price ya existe");
  }

  // 2. Tabla app_settings
  await client.execute(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  console.log("✅ Tabla app_settings verificada");

  // 3. Valor default del porcentaje sugerido si no existe
  await client.execute(`
    INSERT OR IGNORE INTO app_settings (key, value) VALUES ('suggested_price_percent', '80')
  `);
  console.log("✅ Valor default suggested_price_percent=80 insertado (si no existía)");

  console.log("🎉 Parche completado.");
  process.exit(0);
}

patch().catch((e) => {
  console.error("❌ Error en parche:", e);
  process.exit(1);
});
