import test from 'node:test';
import assert from 'node:assert/strict';
import {canRemoveContainer,removeDraftContainer,newDraftContainer,splitDraftContainer} from './warehouseStockDraft.js';

test('cinco envases nuevos se quitan individualmente sin cerrar la modal ni tocar el estado original',()=>{
  const original=Array.from({length:5},()=>({...newDraftContainer('Bidón'),content:5}));
  let rows=original;
  for(let i=0;i<5;i++) rows=removeDraftContainer(rows,0);
  assert.deepEqual(rows,[]); assert.equal(original.length,5);
});
test('un envase guardado con contenido requiere registrar su salida; un vacío se puede retirar',()=>{
  const full={id:17,count:1,content:5};
  assert.equal(canRemoveContainer(full),false);
  assert.deepEqual(removeDraftContainer([full],0),[full]);
  assert.deepEqual(removeDraftContainer([{...full,content:0}],0),[]);
});
test('separar un envase guardado conserva sus litros y protege la fila derivada contra eliminación accidental',()=>{
  const rows=splitDraftContainer([{id:4,kind:'Bidón',count:2,capacity:5,content:10}],0);
  assert.equal(rows[0].id,4); assert.equal(rows[1].id,undefined);
  assert.equal(rows.reduce((n,r)=>n+r.content,0),10);
  assert.equal(canRemoveContainer(rows[1]),false);
  const draft=splitDraftContainer([{...newDraftContainer('Bidón'),count:2,content:10}],0);
  assert.equal(canRemoveContainer(draft[1]),true);
});
