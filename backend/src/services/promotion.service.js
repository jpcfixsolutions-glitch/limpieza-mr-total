import { PromotionModel } from "../models/promotion.model.js";
import { ProductModel } from "../models/product.model.js";
import { roundPriceUpToTen } from "../constants.js";

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length < 2) {
    throw { status: 400, message: "Una promoción debe incluir al menos 2 productos distintos." };
  }
  const seen = new Set();
  return items.map((item) => {
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
}

function attachAvailability(promotions, componentRows) {
  const componentsByPromotion = new Map();
  for (const row of componentRows) {
    const list = componentsByPromotion.get(row.promotionId) || [];
    list.push({ productId: row.productId, name: row.name, codbarra: row.codbarra, quantity: Number(row.quantity), stock: Number(row.stock), isAvailable: row.isAvailable });
    componentsByPromotion.set(row.promotionId, list);
  }
  return promotions.map((promotion) => {
    const items = componentsByPromotion.get(promotion.id) || [];
    const availability = items.length
      ? Math.max(0, Math.min(...items.map((item) => item.isAvailable ? Math.floor(item.stock / item.quantity) : 0)))
      : 0;
    return { ...promotion, items, availableQuantity: availability, isAvailable: promotion.isAvailable && availability > 0 };
  });
}

export const PromotionService = {
  async getAll() {
    const list = await PromotionModel.findAll();
    return attachAvailability(list, await PromotionModel.findItemsByPromotionIds(list.map((p) => p.id)));
  },

  async create({ name, description, price, items }) {
    const cleanName = String(name || "").trim();
    const cleanPrice = Number(price);
    if (!cleanName) throw { status: 400, message: "El nombre de la promoción es obligatorio." };
    if (!Number.isFinite(cleanPrice) || cleanPrice <= 0) throw { status: 400, message: "El precio de venta debe ser mayor a cero." };
    const normalizedItems = normalizeItems(items);
    const products = await Promise.all(normalizedItems.map((item) => ProductModel.findById(item.productId)));
    const missing = products.findIndex((product) => !product);
    if (missing >= 0) throw { status: 400, message: "Uno de los productos seleccionados ya no existe." };
    const created = await PromotionModel.create({ name: cleanName, description: String(description || "").trim() || null, price: roundPriceUpToTen(cleanPrice) }, normalizedItems);
    return (await this.getAll()).find((promotion) => promotion.id === created.id);
  },

  async remove(id) {
    const promotion = await PromotionModel.findById(Number(id));
    if (!promotion) throw { status: 404, message: "Promoción no encontrada." };
    await PromotionModel.remove(Number(id));
    return { message: "Promoción eliminada." };
  },

  async update(id, { name, description, price, items }) {
    const promotion = await PromotionModel.findById(Number(id));
    if (!promotion) throw { status: 404, message: "Promoción no encontrada." };
    const cleanName = String(name || "").trim();
    const cleanPrice = Number(price);
    if (!cleanName) throw { status: 400, message: "El nombre de la promoción es obligatorio." };
    if (!Number.isFinite(cleanPrice) || cleanPrice <= 0) throw { status: 400, message: "El precio de venta debe ser mayor a cero." };
    const normalizedItems = normalizeItems(items);
    const products = await Promise.all(normalizedItems.map((item) => ProductModel.findById(item.productId)));
    if (products.some((product) => !product)) throw { status: 400, message: "Uno de los productos seleccionados ya no existe." };
    await PromotionModel.update(Number(id), { name: cleanName, description: String(description || "").trim() || null, price: roundPriceUpToTen(cleanPrice) }, normalizedItems);
    return (await this.getAll()).find((item) => item.id === Number(id));
  },
};
