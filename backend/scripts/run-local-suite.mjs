// Ejecutar desde backend: node scripts/run-local-suite.mjs
// Fixture temporal para ejecutar también los tests de caja sin usar la base operativa.
import { createClient } from '@libsql/client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const directory = await mkdtemp(path.join(tmpdir(),'galpon-suite-'));
const url = `file:${path.join(directory,'fixture.db').replaceAll('\\','/')}`;
const fixture = createClient({url});
await fixture.execute(`CREATE TABLE cash_registers(id INTEGER PRIMARY KEY,opened_by INTEGER,initial_cash REAL,is_open INTEGER,opened_at TEXT,closed_at TEXT,expected_cash REAL,counted_cash REAL,cash_difference REAL,arqueo_notes TEXT,next_initial_cash REAL)`);
fixture.close();
const result = spawnSync(process.execPath,['--test','--test-concurrency=1'],{stdio:'inherit',env:{...process.env,TURSO_DATABASE_URL:url,TURSO_AUTH_TOKEN:''}});
const resolved=path.resolve(directory);
if (!resolved.startsWith(path.resolve(tmpdir())+path.sep) || !path.basename(resolved).startsWith('galpon-suite-')) throw new Error('Ruta temporal inesperada');
await rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:100});
process.exitCode=result.status ?? 1;
