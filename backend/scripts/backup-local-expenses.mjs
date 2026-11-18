import 'dotenv/config';
import { client } from '../src/db/client.js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
// Copia consistente de las tablas involucradas. Nunca imprime registros ni credenciales.
const tx = await client.transaction('read');
try {
  const tables = ['daily_expenses','fixed_expenses','cash_registers','app_migrations'];
  const backup = { createdAt:new Date().toISOString(), tables:{} };
  for (const table of tables) {
    const result = await tx.execute(`SELECT * FROM "${table}"`);
    backup.tables[table] = result.rows;
  }
  await tx.commit();
  const directory = path.resolve('.backups');
  await mkdir(directory,{recursive:true});
  const file = path.join(directory,`local-expenses-${Date.now()}.json`);
  await writeFile(file,JSON.stringify(backup,null,2),{flag:'wx'});
  console.log(JSON.stringify({file,counts:Object.fromEntries(tables.map(t=>[t,backup.tables[t].length]))}));
} finally { tx.close(); client.close(); }
