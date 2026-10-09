import "dotenv/config";
import { client } from "../client.js";

async function patch() {
  console.log("🔧 Aplicando parche: columna cod_barra en products...");

  const tableInfo = await client.execute("PRAGMA table_info(products)");
  const hasColumn = tableInfo.rows.some((col) => col.name === "cod_barra");

  if (!hasColumn) {
    await client.execute("ALTER TABLE products ADD COLUMN cod_barra text");
    console.log("✅ Columna cod_barra agregada");
  } else {
    console.log("ℹ️  La columna cod_barra ya existe");
  }

  await client.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS products_cod_barra_unique ON products (cod_barra)"
  );
  console.log("✅ Índice único products_cod_barra_unique verificado");

  console.log("🎉 Parche completado.");
  process.exit(0);
}

patch().catch((e) => {
  console.error("❌ Error en parche:", e);
  process.exit(1);
});
