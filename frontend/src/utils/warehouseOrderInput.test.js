import test from 'node:test';
import assert from 'node:assert/strict';
import { warehouseOrderInput,warehouseOrderItems } from './warehouseOrderInput.js';

test('el pedido y la previsualización del empleado sólo envían datos operativos',()=>{
  const form={customerId:'4',items:[{productId:'2',quantity:'5',unitPrice:100,unitCost:50,total:500}],observations:'Entregar por la mañana',chargeToAccount:true,idempotencyKey:'key'};
  const payload=warehouseOrderInput(form,true);
  assert.deepEqual(payload,{customerId:4,status:'confirmed',items:[{productId:2,quantity:5}],observations:form.observations,idempotencyKey:'key'});
  assert.deepEqual(warehouseOrderItems(form.items,true),payload.items);
});

test('el administrador conserva el precio elegido y la opción de cuenta corriente',()=>{
  const form={customerId:4,items:[{productId:2,quantity:'5',unitPrice:125}],observations:'Administración',chargeToAccount:true,idempotencyKey:'admin-key'};
  const payload=warehouseOrderInput(form,false);
  assert.equal(payload.items[0].unitPrice,125);assert.equal(payload.chargeToAccount,true);assert.equal(payload.items[0].quantity,5);
});

test('un pedido operativo conserva litros y no envía importes al backend',()=>{
  const payload=warehouseOrderInput({customerId:4,items:[{productId:'liquid:12',quantity:'1.375',unitPrice:999}],idempotencyKey:'liquid-order'},true);
  assert.deepEqual(payload.items,[{productId:'liquid:12',quantity:1.375}]);
});
