import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { execFileSync } from 'node:child_process';
import { warehouseLiquidsMigration, verifyWarehouseLiquidsCompatibility } from './warehouseLiquidsMigration.js';

test('migración exclusiva aditiva: conserva filas y esquema del Local; comienza vacía y es idempotente',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'mrtotal-liquid-migration-'));
  const url=`file:${path.join(directory,'test.db')}`;
  const client=createClient({url});
  try {
    await client.batch([
      'CREATE TABLE users(id INTEGER PRIMARY KEY)',
      'CREATE TABLE business_units(id INTEGER PRIMARY KEY)',
      'CREATE TABLE app_migrations(id TEXT PRIMARY KEY)',
      'CREATE TABLE products(id INTEGER PRIMARY KEY, name TEXT, stock INTEGER, price REAL, cost REAL, category_id INTEGER)',
      'CREATE TABLE business_unit_products(id INTEGER PRIMARY KEY, business_unit_id INTEGER, product_id INTEGER, stock INTEGER)',
      'CREATE TABLE warehouse_order_items(id INTEGER PRIMARY KEY, product_id INTEGER, quantity INTEGER)',
      "INSERT INTO products VALUES(17,'Producto del Local',23,250,125.5,4)",
      'INSERT INTO business_unit_products VALUES(1,1,17,23)',
      'INSERT INTO warehouse_order_items VALUES(19,17,2)',
    ],'write');
    const snapshot=async()=>JSON.stringify((await client.batch(['SELECT * FROM products','SELECT * FROM business_unit_products','PRAGMA table_info(products)','SELECT id,product_id,quantity FROM warehouse_order_items'],'read')).map(r=>r.rows));
    const before=await snapshot();
    await verifyWarehouseLiquidsCompatibility(client);
    assert.ok(warehouseLiquidsMigration.statements.every(sql=>/^\s*(CREATE|ALTER TABLE warehouse_order_items ADD COLUMN)/.test(sql)));
    const script=path.resolve('src/db/migrateWarehouseLiquids.js');
    for(let i=0;i<2;i++) execFileSync(process.execPath,[script],{env:{...process.env,TURSO_DATABASE_URL:url,TURSO_AUTH_TOKEN:''},stdio:'pipe'});
    assert.equal(await snapshot(),before);
    assert.equal((await client.execute('SELECT count(*) AS n FROM warehouse_liquid_products')).rows[0].n,0);
    assert.equal((await client.execute('SELECT count(*) AS n FROM warehouse_liquid_containers')).rows[0].n,0);
    assert.equal((await client.execute('SELECT count(*) AS n FROM app_migrations')).rows[0].n,2);
    await assert.rejects(()=>verifyWarehouseLiquidsCompatibility(client),/sin registro de migración/);
  } finally {
    client.close();
    // directory procede exclusivamente de mkdtemp, dentro de tmpdir.
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));
    await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:200});
  }
});

test('preflight detiene un esquema incompatible antes de crear estructuras',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'mrtotal-liquid-preflight-'));
  const client=createClient({url:`file:${path.join(directory,'test.db')}`});
  try {
    await client.execute('CREATE TABLE warehouse_order_items(id INTEGER PRIMARY KEY,product_id INTEGER NOT NULL)');
    await assert.rejects(()=>verifyWarehouseLiquidsCompatibility(client),/debe admitir NULL/);
    assert.equal((await client.execute("SELECT count(*) AS n FROM sqlite_master WHERE name='warehouse_liquid_products'")).rows[0].n,0);
  } finally {
    client.close();
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));
    await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:200});
  }
});
