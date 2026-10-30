import { PromotionModel } from "../models/promotion.model.js";
import { ProductModel } from "../models/product.model.js";
import { roundPriceUpToTen } from "../constants.js";
import { normalizePromotionItems } from "./promotion.rules.js";

function attachAvailability(promotions, componentRows) {
  const componentsByPromotion = new Map();
  for (const row of componentRows) {
    const list = componentsByPromotion.get(row.promotionId) || [];
    list.push({ productId: row.productId, name: row.name, codbarra: row.codbarra, quantity: Number(row.quantity), stock: Number(row.stock), cost: Number(row.cost || 0), isAvailable: row.isAvailable });
    componentsByPromotion.set(row.promotionId, list);
  }
  return promotions.map((promotion) => {
    const items = componentsByPromotion.get(promotion.id) || [];
    const availability = items.length
      ? Math.max(0, Math.min(...items.map((item) => item.isAvailable ? Math.floor(item.stock / item.quantity) : 0)))
      : 0;
    const cost = items.reduce((sum, item) => sum + item.cost * item.quantity, 0);
    return { ...promotion, items, cost, availableQuantity: availability, isAvailable: promotion.isAvailable && availability > 0 };
  });
}

export const PromotionService = {
  async getAll(businessUnit = null) {
    const list = await PromotionModel.findAll();
    const definitions = await PromotionModel.findItemsByPromotionIds(list.map((p) => p.id));
    if (!businessUnit?.id) return attachAvailability(list, definitions);
    const contextual = new Map();
    await Promise.all([...new Set(definitions.map((row) => row.productId))].map(async (id) => {
      contextual.set(id, await ProductModel.findByIdForUnit(id, businessUnit.id));
    }));
    return attachAvailability(list, definitions.map((row) => {
      const product = contextual.get(row.productId);
      const direct = product?.fulfillmentMode === "WAREHOUSE_DIRECT";
      return { ...row, stock: direct ? Number(product?.warehouseStock || 0) : Number(product?.stock || 0), cost: direct ? Number(product?.warehouseCost || 0) : Number(product?.cost || 0), isAvailable: Boolean(product?.isAvailable), fulfillmentMode: product?.fulfillmentMode || "OWN_STOCK" };
    }));
  },

  async create({ name, description, price, items }, businessUnit = null) {
    const cleanName = String(name || "").trim();
    const cleanPrice = Number(price);
    if (!cleanName) throw { status: 400, message: "El nombre de la promoción es obligatorio." };
    if (!Number.isFinite(cleanPrice) || cleanPrice <= 0) throw { status: 400, message: "El precio de venta debe ser mayor a cero." };
    const normalizedItems = normalizePromotionItems(items);
    const products = await Promise.all(normalizedItems.map((item) => ProductModel.findById(item.productId)));
    const missing = products.findIndex((product) => !product);
    if (missing >= 0) throw { status: 400, message: "Uno de los productos seleccionados ya no existe." };
    const created = await PromotionModel.create({ name: cleanName, description: String(description || "").trim() || null, price: roundPriceUpToTen(cleanPrice) }, normalizedItems);
    return (await this.getAll(businessUnit)).find((promotion) => promotion.id === created.id);
  },

  async remove(id) {
    const promotion = await PromotionModel.findById(Number(id));
    if (!promotion) throw { status: 404, message: "Promoción no encontrada." };
    await PromotionModel.remove(Number(id));
    return { message: "Promoción eliminada." };
  },

  async update(id, { name, description, price, items }, businessUnit = null) {
    const promotion = await PromotionModel.findById(Number(id));
    if (!promotion) throw { status: 404, message: "Promoción no encontrada." };
    const cleanName = String(name || "").trim();
    const cleanPrice = Number(price);
    if (!cleanName) throw { status: 400, message: "El nombre de la promoción es obligatorio." };
    if (!Number.isFinite(cleanPrice) || cleanPrice <= 0) throw { status: 400, message: "El precio de venta debe ser mayor a cero." };
    const normalizedItems = normalizePromotionItems(items);
    const products = await Promise.all(normalizedItems.map((item) => ProductModel.findById(item.productId)));
    if (products.some((product) => !product)) throw { status: 400, message: "Uno de los productos seleccionados ya no existe." };
    await PromotionModel.update(Number(id), { name: cleanName, description: String(description || "").trim() || null, price: roundPriceUpToTen(cleanPrice) }, normalizedItems);
    return (await this.getAll(businessUnit)).find((item) => item.id === Number(id));
  },
};
