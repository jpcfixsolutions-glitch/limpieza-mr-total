export function packSizeOf(product) {
  const n = Number(product?.unitsPerPack);
  return Number.isFinite(n) && n > 1 ? n : 1;
}

export function packTypeLabel(product) {
  return (product?.packTypeName || "Paquete").trim() || "Paquete";
}

export function hasPackSale(product) {
  return packSizeOf(product) > 1 && product?.packPrice != null && Number(product.packPrice) > 0;
}

export function activeTiers(product) {
  return (product?.priceTiers || []).filter((t) => Number(t.quantity) > 1 && Number(t.price) > 0);
}

export function unitsEachOf(item) {
  const n = Number(item?.unitsEach);
  if (Number.isFinite(n) && n > 0) return n;
  if (item?.saleMode === "paquete" || item?.saleMode === "escala") return packSizeOf(item);
  return 1;
}

export function unitsOfLine(item) {
  return Number(item.quantity) * unitsEachOf(item);
}

export function unitsInCartForProduct(cart, productId, exceptLineId) {
  return cart
    .filter((i) => (i.productId ?? i.id) === productId && i.lineId !== exceptLineId)
    .reduce((sum, i) => sum + unitsOfLine(i), 0);
}

export function maxQuantityForLine(items, item) {
  const remaining = Number(item.stock) - unitsInCartForProduct(items, item.productId ?? item.id, item.lineId);
  const each = unitsEachOf(item);
  if (each > 1) return Math.max(0, Math.floor(remaining / each));
  return Math.max(0, remaining);
}

export function formatStock(stock, unitsPerPack, packName) {
  const units = Number(stock) || 0;
  const size = Number(unitsPerPack);
  if (!Number.isFinite(size) || size <= 1) return `${units} u.`;
  const packs = Math.floor(units / size);
  const rest = units % size;
  const label = (packName || "paq.").toLowerCase();
  if (rest) return `${units} u. · ${packs} ${label} + ${rest} u.`;
  return `${units} u. · ${packs} ${label}`;
}

export function lineIdFor(productId, saleMode, extra) {
  if (saleMode === "escala") return `${productId}-escala-${extra}`;
  return `${productId}-${saleMode}`;
}

export function saleLabel(item) {
  if (item.saleMode === "escala") return `x${unitsEachOf(item)}`;
  if (item.saleMode === "paquete") return `${packTypeLabel(item)} x${packSizeOf(item)}`;
  return "Unidad";
}
