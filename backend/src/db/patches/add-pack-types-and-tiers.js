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

async function tableExists(name) {
  const res = await client.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`
  );
  return res.rows.length > 0;
}

async function patch() {
  console.log("🔧 Aplicando parche: tipos de bulto, escalas y proveedor...");

  if (!(await tableExists("pack_types"))) {
    await client.execute(`
      CREATE TABLE pack_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      )
    `);
    console.log("✅ Tabla pack_types creada");
  } else {
    console.log("ℹ️  Tabla pack_types ya existe");
  }

  const seeds = ["Paquete", "Caja", "Bulto", "Rollo", "Kg", "Unidad"];
  for (const name of seeds) {
    await client.execute({
      sql: "INSERT OR IGNORE INTO pack_types (name) VALUES (?)",
      args: [name],
    });
  }
  console.log("✅ Tipos de bulto semilla verificados");

  await addColumnIfMissing("products", "pack_type_id", "integer");

  if (!(await tableExists("product_price_tiers"))) {
    await client.execute(`
      CREATE TABLE product_price_tiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL,
        price REAL NOT NULL
      )
    `);
    await client.execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS product_price_tiers_product_qty_unique ON product_price_tiers (product_id, quantity)"
    );
    console.log("✅ Tabla product_price_tiers creada");
  } else {
    console.log("ℹ️  Tabla product_price_tiers ya existe");
  }

  const renamed = await client.execute(
    "UPDATE price_groups SET type = 'proveedor' WHERE type = 'marca'"
  );
  console.log(`✅ Grupos marca → proveedor (${renamed.rowsAffected ?? "ok"})`);

  console.log("🎉 Parche completado.");
  process.exit(0);
}

patch().catch((e) => {
  console.error("❌ Error en parche:", e);
  process.exit(1);
});
