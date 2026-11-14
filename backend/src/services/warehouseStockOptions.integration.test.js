import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import express from 'express';
import jwt from 'jsonwebtoken';

let client, options, liquids, directory;
const unit={id:2,code:'WAREHOUSE'}, local={id:1,code:'LOCAL'};
before(async()=>{
  directory=await mkdtemp(path.join(tmpdir(),'mrtotal-stock-options-'));
  process.env.TURSO_DATABASE_URL='file:'+path.join(directory,'test.db');
  process.env.JWT_SECRET='stock-options-test';
  ({client}=await import('../db/client.js'));
  ({WarehouseStockOptionsService:options}=await import('./warehouseStockOptions.service.js'));
  ({WarehouseLiquidsService:liquids}=await import('./warehouseLiquids.service.js'));
  await client.batch([
    'PRAGMA foreign_keys=ON',
    'CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT,role TEXT)',
    'CREATE TABLE business_units(id INTEGER PRIMARY KEY,code TEXT,name TEXT,type TEXT,is_active INTEGER,created_at TEXT,updated_at TEXT)',
    "INSERT INTO business_units(id,code,name,type,is_active) VALUES(1,'LOCAL','Local','retail',1),(2,'WAREHOUSE','Galpón','warehouse',1)",
    "INSERT INTO users VALUES(1,'Administrador','admin'),(2,'Operario','EMPLEADO_GALPON'),(3,'Cajero','cajero')",
    'CREATE TABLE warehouse_order_items(id INTEGER PRIMARY KEY,product_id INTEGER)',
    'CREATE TABLE products(id INTEGER PRIMARY KEY,name TEXT,stock INTEGER,cost REAL,price REAL,category_id INTEGER)',
    "INSERT INTO products VALUES(9,'Stock protegido',31,100,200,8)",
    'CREATE TABLE categories(id INTEGER PRIMARY KEY,name TEXT)',
    "INSERT INTO categories VALUES(8,'Categoría del Local')",
  ],'write');
  const {warehouseLiquidsMigration}=await import('../db/warehouseLiquidsMigration.js');
  const {warehouseStockOptionsMigration}=await import('../db/warehouseStockOptionsMigration.js');
  await client.batch([...warehouseLiquidsMigration.statements,...warehouseStockOptionsMigration.statements],'write');
});
after(async()=>{
  client?.close();
  if(directory){assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
});

test('categorías y tipos: alta, edición, eliminación, reactivación y versiones sin modificar el Local',async()=>{
  const snapshot=async()=>JSON.stringify((await client.batch(['SELECT * FROM products','SELECT * FROM categories'],'read')).map(r=>r.rows));
  const initial=await snapshot();
  const category=await options.save(unit,'category',{name:'Limpieza'},1);
  let type=await options.save(unit,'container-type',{name:'Bidón'},1);
  const product=await liquids.save(null,{name:'Líquido',category:category.name,containers:[{kind:type.name,capacity:5,count:1,content:3,location:'WAREHOUSE'}],idempotencyKey:'option-product'},1,unit);
  await assert.rejects(()=>options.save(unit,'container-type',{name:'bidon'},1),e=>e.status===409);
  await assert.rejects(()=>options.save(unit,'container-type',{name:'Granel'},1),e=>e.status===400);
  await assert.rejects(()=>options.list(local),e=>e.status===403);
  type=await options.save(unit,'container-type',{name:'Bidón reforzado',expectedVersion:type.version},1,type.id);
  await assert.rejects(()=>options.save(unit,'container-type',{name:'Cambio perdido',expectedVersion:0},1,type.id),e=>e.status===409);
  assert.equal((await options.list(unit)).containerTypes[0].name,'Bidón reforzado');
  await options.save(unit,'category',{expectedVersion:category.version},1,category.id,true);
  assert.equal((await options.list(unit)).categories.length,0);
  const old=(await options.list(unit,true)).categories[0];
  await options.save(unit,'category',{name:old.name,active:true,expectedVersion:old.version},1,old.id);
  const saved=(await liquids.list(unit)).find(p=>p.liquidProductId===product.liquidProductId);
  assert.equal(saved.category,'Limpieza');assert.equal(saved.containers[0].kind,'Bidón');assert.equal(saved.stock,3);
  // Una opción renombrada o eliminada no obliga a cambiar existencias anteriores.
  await liquids.save(saved.liquidProductId,{name:saved.name,category:saved.category,expectedVersion:saved.version,containers:saved.containers,idempotencyKey:'preserve-old-option'},1,unit);
  await assert.rejects(()=>liquids.save(null,{name:'Inválido',category:'No configurada',containers:[],idempotencyKey:'invalid-category'},1,unit),e=>e.status===400);
  await assert.rejects(()=>liquids.save(null,{name:'Inválido',containers:[{kind:'No configurado',count:1,capacity:5,content:0,location:'WAREHOUSE'}],idempotencyKey:'invalid-type'},1,unit),e=>e.status===400);
  assert.ok((await client.execute('SELECT count(*) AS n FROM warehouse_stock_options_audit')).rows[0].n>=5);
  assert.equal(await snapshot(),initial);
});

test('rutas: el administrador configura; el empleado sólo consulta opciones activas de Galpón',async()=>{
  const {default:router}=await import('../routes/warehouse.routes.js');
  const app=express();app.use(express.json());app.use('/api/warehouse',router);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const url=`http://127.0.0.1:${server.address().port}/api/warehouse`;
  const headers=(id,role,code='WAREHOUSE')=>({Authorization:'Bearer '+jwt.sign({id,role},process.env.JWT_SECRET),'Content-Type':'application/json','X-Business-Unit':code});
  const admin=headers(1,'admin'), employee=headers(2,'EMPLEADO_GALPON');
  const request=(path,method='GET',body,auth=admin)=>fetch(url+path,{method,headers:auth,...(body===undefined?{}:{body:JSON.stringify(body)})});
  try {
    let response=await request('/settings/category','POST',{name:'Desinfección'});assert.equal(response.status,200);
    let category=await response.json();
    response=await request('/settings/category/'+category.id,'PUT',{name:'Desinfectantes',expectedVersion:category.version});assert.equal(response.status,200);category=await response.json();
    assert.equal((await request('/stock-options','GET',undefined,employee)).status,200);
    assert.equal((await request('/stock-options','GET',undefined,headers(3,'cajero'))).status,403);
    assert.equal((await request('/stock-options','GET',undefined,headers(1,'admin','LOCAL'))).status,403);
    for(const method of ['POST','PUT','DELETE']) assert.equal((await request('/settings/category'+(method==='POST'?'':'/'+category.id),method,{name:'No permitido',expectedVersion:category.version},employee)).status,403);
    assert.equal((await request('/settings/category/'+category.id,'DELETE',{expectedVersion:category.version})).status,200);
    const active=await (await request('/stock-options?includeInactive=true','GET',undefined,employee)).json();
    assert.ok(!active.categories.some(c=>c.id===category.id));
    const all=await (await request('/stock-options?includeInactive=true')).json();assert.ok(all.categories.some(c=>c.id===category.id && !c.active));
  }finally{await new Promise(resolve=>server.close(resolve));}
});
