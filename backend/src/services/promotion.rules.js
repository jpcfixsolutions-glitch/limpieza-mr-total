export function normalizePromotionItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw { status: 400, message: "Una promoción debe incluir productos." };
  }
  const seen = new Set();
  const normalized = items.map((item) => {
    const productId = Number(item?.productId);
    const quantity = Number(item?.quantity);
    if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
      throw { status: 400, message: "Los productos y cantidades de la promoción no son válidos." };
    }
    if (seen.has(productId)) {
      throw { status: 400, message: "No se puede repetir un producto dentro de la promoción." };
    }
    seen.add(productId);
    return { productId, quantity };
  });
  if (!isValidPromotionComposition(normalized)) {
    throw { status: 400, message: "Una promoción de un solo producto debe incluir al menos 2 unidades." };
  }
  return normalized;
}

export function isValidPromotionComposition(items) {
  return Array.isArray(items) && (items.length > 1
    || (items.length === 1 && Number(items[0]?.quantity) >= 2));
}
