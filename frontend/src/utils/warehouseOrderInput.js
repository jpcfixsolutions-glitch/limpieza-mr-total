export function warehouseOrderItems(items,isEmployee) {
  return items.map(item=>({productId:String(item.productId).startsWith('liquid:')?item.productId:Number(item.productId),quantity:Number(item.quantity),
    ...(isEmployee?{}:{unitPrice:item.unitPrice})}));
}

export function warehouseOrderInput({customerId,items,observations,chargeToAccount,idempotencyKey},isEmployee) {
  return {customerId:Number(customerId),status:'confirmed',items:warehouseOrderItems(items,isEmployee),observations,idempotencyKey,
    ...(isEmployee?{}:{chargeToAccount})};
}
