import "dotenv/config";
import { verifyDatabaseSchema } from "./databaseLifecycle.js";

try {
  const { tablesChecked } = await verifyDatabaseSchema();
  console.log(`✅ Esquema verificado: ${tablesChecked} tablas compatibles.`);
  process.exit(0);
} catch (error) {
  console.error("❌ Verificación de esquema fallida:", error.message);
  process.exit(1);
}
