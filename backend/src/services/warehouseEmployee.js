// Proyección de campos explícita: ninguna respuesta operativa del empleado
// incluye precios, costos, totales ni condiciones de cuenta.
function fieldsOnly(data,allowed) {
  if (!data || typeof data!=='object' || Array.isArray(data) || Object.keys(data).some(key=>!allowed.includes(key))) {
    throw {status:403,message:'Tu perfil sólo puede enviar los datos operativos habilitados.'};
  }
}

export function employeeOrderInput(data,preview=false) {
  fieldsOnly(data,preview?['items']:['customerId','items','observations','status','idempotencyKey']);
  if(!Array.isArray(data.items)||!data.items.length) throw {status:400,message:'Agregá al menos un producto.'};
  for(const item of data.items) {
    fieldsOnly(item,['productId','quantity']);
    const liquid = typeof item.productId === 'string' && /^liquid:[1-9]\d*$/.test(item.productId);
    const productId = Number(item.productId);
    const quantity = Number(item.quantity);
    if ((!liquid && (!Number.isSafeInteger(productId) || productId < 1 || !Number.isSafeInteger(quantity) || quantity < 1))
      || (liquid && (!Number.isFinite(quantity) || quantity <= 0 || !Number.isSafeInteger(Math.round(quantity * 1000)) || Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 1e-6))) {
      throw {status:400,message:'La cantidad debe ser válida: unidades enteras o litros con hasta tres decimales.'};
    }
  }
  if(preview) return {items:data.items};
  if(data.status!==undefined && data.status!=='confirmed') throw {status:403,message:'Los pedidos nuevos se registran en preparación.'};
  if(data.observations!==undefined && (typeof data.observations!=='string'||data.observations.length>2000)) throw {status:400,message:'Las observaciones deben ser texto de hasta 2000 caracteres.'};
  if(typeof data.idempotencyKey!=='string'||!data.idempotencyKey.trim()||data.idempotencyKey.length>160) throw {status:400,message:'El pedido necesita una clave de operación válida.'};
  return {customerId:data.customerId,items:data.items,observations:data.observations,status:'confirmed',idempotencyKey:data.idempotencyKey,chargeToAccount:false};
}

export function employeeCustomerInput(data) {
  fieldsOnly(data,['name','phone','address']);
  return data;
}

export function employeeStateInput(data,allowLiquidAllocations=false) {
  fieldsOnly(data,allowLiquidAllocations?['status','expectedVersion','liquidAllocations']:['status','expectedVersion']);
  if(!Number.isSafeInteger(data.expectedVersion)||data.expectedVersion<0) throw {status:400,message:'Actualizá el pedido antes de cambiar su estado.'};
  if (data.liquidAllocations !== undefined) {
    const allocations = data.liquidAllocations;
    if (!allowLiquidAllocations || !allocations || typeof allocations !== 'object' || Array.isArray(allocations)) throw {status:400,message:'La asignación de litros no es válida.'};
    for (const [itemId, rows] of Object.entries(allocations)) {
      if (!/^[1-9]\d*$/.test(itemId) || !Array.isArray(rows) || rows.length > 500) throw {status:400,message:'La asignación de litros no es válida.'};
      for (const row of rows) {
        fieldsOnly(row,['containerId','liters']);
        const liters=Number(row.liters);
        if (!Number.isSafeInteger(Number(row.containerId)) || Number(row.containerId)<1 || !Number.isFinite(liters) || liters<=0 || !Number.isSafeInteger(Math.round(liters*1000)) || Math.abs(liters*1000-Math.round(liters*1000))>1e-6) throw {status:400,message:'Cada asignación debe indicar un envase válido y litros con hasta tres decimales.'};
      }
    }
  }
}

function employeeItem(item) {
  return {
    id:item.id,productId:item.productId,productName:item.productName,quantity:item.quantity,unit:item.unit,liquidProductId:item.liquidProductId,
    status:item.status,preparationStatus:item.preparationStatus,
    ...(item.assignedStock==null?{}:{assignedStock:item.assignedStock,availableStock:item.availableStock,toProduce:item.toProduce}),
  };
}

export function employeeProduction(production) {
  return {totalUnits:production.totalUnits,totalLiters:production.totalLiters,items:production.items.map(item=>({
    productId:item.productId,productName:item.productName,unit:item.unit,demand:item.demand,stock:item.stock,toProduce:item.toProduce,oldestOrderAt:item.oldestOrderAt,
    orders:item.orders.map(order=>({id:order.id,createdAt:order.createdAt,toProduce:order.toProduce})),
  }))};
}

export function employeePreview(preview) {
  return {items:preview.items.map(employeeItem),production:employeeProduction(preview.production)};
}

export function employeeCustomer(customer) {
  return {id:customer.id,name:customer.name,lastName:customer.lastName,phone:customer.phone,address:customer.address,
    ...(customer.duplicated===undefined?{}:{duplicated:customer.duplicated})};
}

export function employeeOrder(order) {
  return {
    customerId:order.customerId,customerPhone:order.customerPhone,customerAddress:order.customerAddress,
    observations:order.observations,userId:order.userId,
    id: order.id, customerName: order.customerName, customerLastName: order.customerLastName,
    status: order.status, createdAt: order.createdAt, updatedAt: order.updatedAt,
    readyAt: order.readyAt, deliveredAt: order.deliveredAt, version: order.version,
    items: order.items.map((item) => ({
      id: item.id, productId: item.productId, productName: item.productName, quantity: item.quantity,
      unit: item.unit, liquidProductId: item.liquidProductId,
      status: item.status, preparationStatus: item.preparationStatus,
      ...(item.assignedStock == null ? {} : { assignedStock: item.assignedStock, availableStock: item.availableStock, toProduce: item.toProduce }),
    })),
  };
}

export function employeeOperations(data) {
  return {
    orders: data.orders.map(employeeOrder),
    products: data.products.map(({ id, name, codbarra, stock, isAvailable, unit, containers, packTypeName, unitsPerPack }) => ({ id, name, codbarra, stock, isAvailable, unit, containers, packTypeName, unitsPerPack })),
    customers: data.customers.map(employeeCustomer),
    counts: { pending: data.counts.pending, inDelivery: data.counts.inDelivery, soldToday: data.counts.soldToday },
    production: employeeProduction(data.production),
  };
}
