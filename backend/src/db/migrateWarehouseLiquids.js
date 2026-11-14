import { warehouseStockOptionsMigration } from './warehouseStockOptionsMigration.js';
// Aplica únicamente líquidos y sus catálogos; nunca ejecuta migraciones históricas.
import 'dotenv/config';
import { client } from './client.js';
import { warehouseLiquidsMigration, verifyWarehouseLiquidsCompatibility } from './warehouseLiquidsMigration.js';

try {
  const ledger = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='app_migrations'");
  if (!ledger.rows.length) throw new Error('Falta el registro de migraciones. Revisar la base antes de continuar.');
  for (const migration of [warehouseLiquidsMigration, warehouseStockOptionsMigration]) {
    const applied = await client.execute({sql:'SELECT id FROM app_migrations WHERE id = ?',args:[migration.id]});
    if (applied.rows.length) console.log(`Ya aplicada: ${migration.id}`);
    else {
      if (migration.id === warehouseLiquidsMigration.id) await verifyWarehouseLiquidsCompatibility(client);
      await client.batch([...migration.statements, {sql:'INSERT INTO app_migrations(id) VALUES (?)',args:[migration.id]}], 'write');
      console.log(`Migración aditiva aplicada: ${migration.id}. No se copiaron ni modificaron productos existentes.`);
    }
  }
} finally { client.close(); }
