import { PriceGroupModel } from "../models/priceGroup.model.js";
import { ProductModel } from "../models/product.model.js";
import { ProductPriceTierModel } from "../models/productPriceTier.model.js";
import { roundPriceUpToTen } from "../constants.js";

const VALID_TYPES = ["proveedor", "coleccion"];

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function normalizeType(type) {
  if (type === "marca") return "proveedor";
  return type;
}

function labelFor(type) {
  return type === "proveedor" ? "Proveedor" : "Colección";
}

export const PriceGroupService = {
  async getAll(type) {
    const normalized = type ? normalizeType(type) : type;
    if (normalized && !VALID_TYPES.includes(normalized)) {
      throw { status: 400, message: "Tipo inválido. Usá 'proveedor' o 'coleccion'." };
    }
    const groups = await PriceGroupModel.findAll(normalized);
    const counts = await ProductModel.countByPriceGroup();
    const countMap = Object.fromEntries(counts.map((row) => [row.priceGroupId, Number(row.n)]));
    return groups
      .map((g) => ({ ...g, productCount: countMap[g.id] || 0 }))
      .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  },

  async create({ name, type }) {
    const normalized = normalizeType(type);
    if (!VALID_TYPES.includes(normalized)) {
      throw { status: 400, message: "Tipo inválido. Usá 'proveedor' o 'coleccion'." };
    }
    if (!name?.trim()) throw { status: 400, message: `El nombre del ${labelFor(normalized).toLowerCase()} es requerido.` };
    try {
      const [created] = await PriceGroupModel.create({
        name: name.trim(),
        type: normalized,
        lastIncreasePercent: 0,
      });
      return { ...created, productCount: 0 };
    } catch (err) {
      if (String(err?.message || "").toLowerCase().includes("unique")) {
        throw { status: 409, message: `Ya existe ${normalized === "proveedor" ? "un proveedor" : "una colección"} con ese nombre.` };
      }
      throw err;
    }
  },

  async update(id, { name }) {
    const existing = await PriceGroupModel.findById(id);
    if (!existing) throw { status: 404, message: "Grupo no encontrado." };
    if (!name?.trim()) throw { status: 400, message: "El nombre es requerido." };
    const [updated] = await PriceGroupModel.update(id, { name: name.trim() });
    return updated;
  },

  async remove(id) {
    const existing = await PriceGroupModel.findById(id);
    if (!existing) throw { status: 404, message: "Grupo no encontrado." };
    await PriceGroupModel.remove(id);
    return { message: `${labelFor(existing.type)} eliminada.` };
  },

  async applyIncrease(id, { percent, updateCost = false }) {
    const existing = await PriceGroupModel.findById(id);
    if (!existing) throw { status: 404, message: "Grupo no encontrado." };

    const value = Number(percent);
    if (!Number.isFinite(value) || value === 0) {
      throw { status: 400, message: "Ingresá un porcentaje distinto de 0." };
    }
    if (value <= -100) {
      throw { status: 400, message: "El porcentaje no puede ser -100% o menor." };
    }
    if (Math.abs(value) > 500) {
      throw { status: 400, message: "El porcentaje no puede superar 500%." };
    }

    const factor = 1 + value / 100;
    const products = await ProductModel.findByPriceGroupId(id);
    if (products.length === 0) {
      throw { status: 400, message: `No hay productos en esta ${labelFor(existing.type).toLowerCase()}.` };
    }

    for (const product of products) {
      const patch = { price: roundPriceUpToTen(product.price * factor) };
      if (product.packPrice != null) {
        patch.packPrice = roundPriceUpToTen(product.packPrice * factor);
      }
      if (updateCost) patch.cost = roundMoney((product.cost || 0) * factor);
      await ProductModel.update(product.id, patch);
      const tiers = await ProductPriceTierModel.findByProductId(product.id);
      for (const tier of tiers) {
        await ProductPriceTierModel.update(tier.id, { price: roundPriceUpToTen(tier.price * factor) });
      }
    }

    const [updated] = await PriceGroupModel.update(id, { lastIncreasePercent: value });
    return {
      ...updated,
      productCount: products.length,
      updatedCount: products.length,
    };
  },
};
