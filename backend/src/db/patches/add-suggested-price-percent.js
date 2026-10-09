import "dotenv/config";
import { client } from "../client.js";

async function patch() {
  console.log("🔧 Aplicando parche: suggested_price_percent en products...");

  const tableInfo = await client.execute("PRAGMA table_info(products)");
  const hasSpp = tableInfo.rows.some((col) => col.name === "suggested_price_percent");

  if (!hasSpp) {
    await client.execute(
      "ALTER TABLE products ADD COLUMN suggested_price_percent REAL"
    );
    console.log("✅ Columna suggested_price_percent agregada a products");
  } else {
    console.log("ℹ️  suggested_price_percent ya existe");
  }

  // Migrar productos que tenían use_suggested_price=1:
  // No podemos saber qué porcentaje tenían, así que los dejamos en NULL
  // (el precio ya está calculado y guardado correctamente)

  // Migrar app_settings: si existe 'suggested_price_percent' (singular, valor único),
  // convertirlo a 'suggested_price_percents' (plural, JSON array)
  const oldSetting = await client.execute(
    "SELECT value FROM app_settings WHERE key = 'suggested_price_percent'"
  );
  const newSetting = await client.execute(
    "SELECT value FROM app_settings WHERE key = 'suggested_price_percents'"
  );

  if (oldSetting.rows.length > 0 && newSetting.rows.length === 0) {
    const oldVal = Number(oldSetting.rows[0].value);
    const newVal = JSON.stringify([oldVal]);
    await client.execute({
      sql: "INSERT INTO app_settings (key, value) VALUES ('suggested_price_percents', ?)",
      args: [newVal],
    });
    console.log(`✅ Migrado suggested_price_percent=${oldVal} → array ${newVal}`);
  } else if (newSetting.rows.length === 0) {
    await client.execute({
      sql: "INSERT INTO app_settings (key, value) VALUES ('suggested_price_percents', ?)",
      args: [JSON.stringify([80])],
    });
    console.log("✅ Creado suggested_price_percents=[80] por defecto");
  } else {
    console.log("ℹ️  suggested_price_percents ya existe");
  }

  console.log("🎉 Parche completado.");
  process.exit(0);
}

patch().catch((e) => {
  console.error("❌ Error en parche:", e);
  process.exit(1);
});
