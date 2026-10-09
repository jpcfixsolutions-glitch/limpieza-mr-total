import "dotenv/config";
import { initializeDatabase } from "./databaseLifecycle.js";

await initializeDatabase();
console.log("✅ Migraciones aplicadas correctamente.");
process.exit(0);
