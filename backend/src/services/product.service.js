import { ProductModel } from "../models/product.model.js";
import { ProductPriceTierModel } from "../models/productPriceTier.model.js";
import { PRODUCT_ICONS, roundPriceUpToTen } from "../constants.js";
import { getArgentinaTime } from "../db/timeUtils.js";

const VALID_ICONS = new Set(PRODUCT_ICONS);

function normalizeCodbarra(value) {
  if (value === undefined || value === null || value === "") return null;
  const str = String(value).trim();
  if (!/^\d+$/.test(str)) {
    throw { status: 400, message: "El código de barras debe contener solo números." };
  }
  return str;
}

function isDuplicateCodbarraError(error) {
  const messages = [error?.message, error?.cause?.message, error?.cause?.cause?.message]
    .filter(Boolean)
    .join(" ");
  return messages.includes("products.cod_barra") || messages.includes("products.codbarra");
}

function throwFriendlyDuplicateCodbarraError(error, codbarra) {
  if (isDuplicateCodbarraError(error)) {
    throw { status: 409, message: `Ya existe un producto con el código de barras ${codbarra}.` };
  }
  throw error;
}

function normalizeMoney(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw { status: 400, message: `${label} debe ser un número mayor o igual a cero.` };
  }
  return parsed;
}

function normalizeCatalogPrice(value, label) {
  return roundPriceUpToTen(normalizeMoney(value, label));
}

function normalizePackFields({ unitsPerPack, packPrice }) {
  let size = parseInt(unitsPerPack, 10);
  if (!Number.isFinite(size) || size < 1) size = 1;

  if (size === 1) {
    return { unitsPerPack: 1, packPrice: null };
  }

  const parsedPrice = packPrice === null || packPrice === undefined || packPrice === ""
    ? null
    : Number(packPrice);

  if (parsedPrice == null || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
    throw { status: 400, message: "Si el producto se vende por bulto, indicá cuántas unidades trae y el precio de ese bulto." };
  }

  return { unitsPerPack: size, packPrice: roundPriceUpToTen(parsedPrice) };
}

function normalizePriceTiers(priceTiers) {
  if (priceTiers == null) return null;
  if (!Array.isArray(priceTiers)) {
    throw { status: 400, message: "Las cantidades personalizadas no son válidas." };
  }
  const seen = new Set();
  const list = [];
  for (const row of priceTiers) {
    const quantity = parseInt(row?.quantity, 10);
    const price = Number(row?.price);
    if (!Number.isFinite(quantity) || quantity < 2) continue;
    if (!Number.isFinite(price) || price < 0) {
      throw { status: 400, message: `El precio de la venta por ${quantity} no es válido.` };
    }
    if (seen.has(quantity)) {
      throw { status: 400, message: `Hay dos precios para la misma cantidad (${quantity}).` };
    }
    seen.add(quantity);
    list.push({ quantity, price: roundPriceUpToTen(price) });
  }
  return list.sort((a, b) => a.quantity - b.quantity);
}

async function attachTiers(products) {
  const list = Array.isArray(products) ? products.filter(Boolean) : (products ? [products] : []);
  if (list.length === 0) return products;
  const tiers = await ProductPriceTierModel.findByProductIds(list.map((p) => p.id));
  const map = {};
  for (const t of tiers) {
    (map[t.productId] ||= []).push({ quantity: t.quantity, price: t.price });
  }
  for (const p of list) {
    p.priceTiers = (map[p.id] || []).sort((a, b) => a.quantity - b.quantity);
  }
  return Array.isArray(products) ? products : list[0];
}

export const ProductService = {
  async getAll() {
    return attachTiers(await ProductModel.findAll());
  },

  async getByCodbarra(codbarra) {
    const normalized = normalizeCodbarra(codbarra);
    if (!normalized) throw { status: 400, message: "Código de barras inválido." };

    const product = await ProductModel.findByCodbarra(normalized);
    if (!product) throw { status: 404, message: "Producto no encontrado con ese código de barras." };
    return attachTiers(product);
  },

  async create({ name, codbarra, categoryId, priceGroupId, packTypeId, cost, price, stock, minStock, icon, isAvailable, unitsPerPack, packPrice, priceTiers }) {
    if (!name || price === undefined) {
      throw { status: 400, message: "Nombre y precio son requeridos." };
    }
    if (icon && !VALID_ICONS.has(icon)) {
      throw { status: 400, message: `Ícono inválido. Válidos: ${PRODUCT_ICONS.join(", ")}` };
    }

    const normalizedCodbarra = normalizeCodbarra(codbarra);
    const pack = normalizePackFields({ unitsPerPack, packPrice });
    const tiers = normalizePriceTiers(priceTiers) || [];

    try {
      const [created] = await ProductModel.create({
        name,
        codbarra: normalizedCodbarra,
        categoryId: categoryId || null,
        priceGroupId: priceGroupId || null,
        packTypeId: packTypeId || null,
        cost: normalizeMoney(cost ?? 0, "El costo"),
        price: normalizeCatalogPrice(price, "El precio unitario"),
        stock: stock ?? 0,
        minStock: minStock ?? 5,
        icon: icon || "Package",
        isAvailable: isAvailable !== false,
        unitsPerPack: pack.unitsPerPack,
        packPrice: pack.packPrice,
      });
      return await ProductModel.createTiersAndFindById(created.id, tiers);
    } catch (error) {
      throwFriendlyDuplicateCodbarraError(error, normalizedCodbarra);
    }
  },

  async update(id, updates) {
    const product = await ProductModel.findById(id);
    if (!product) throw { status: 404, message: "Producto no encontrado." };

    const recordStockModification = updates.recordStockModification === true;
    delete updates.recordStockModification;

    if (updates.icon && !VALID_ICONS.has(updates.icon)) {
      throw { status: 400, message: `Ícono inválido. Válidos: ${PRODUCT_ICONS.join(", ")}` };
    }

    if ("codbarra" in updates) {
      updates.codbarra = normalizeCodbarra(updates.codbarra);
    }

    delete updates.suggestedPricePercent;
    delete updates.useSuggestedPrice;

    if ("priceGroupId" in updates) {
      updates.priceGroupId = updates.priceGroupId || null;
    }

    if ("packTypeId" in updates) {
      updates.packTypeId = updates.packTypeId || null;
    }

    if ("cost" in updates) {
      updates.cost = normalizeMoney(updates.cost, "El costo");
    }

    if ("price" in updates) {
      updates.price = normalizeCatalogPrice(updates.price, "El precio unitario");
    }

    const nextTiers = "priceTiers" in updates ? normalizePriceTiers(updates.priceTiers) : null;
    delete updates.priceTiers;
    delete updates.packTypeName;
    delete updates.priceGroupName;
    delete updates.priceGroupType;
    delete updates.category;

    if ("unitsPerPack" in updates || "packPrice" in updates) {
      const pack = normalizePackFields({
        unitsPerPack: "unitsPerPack" in updates ? updates.unitsPerPack : product.unitsPerPack,
        packPrice: "packPrice" in updates ? updates.packPrice : product.packPrice,
      });
      updates.unitsPerPack = pack.unitsPerPack;
      updates.packPrice = pack.packPrice;
    }

    const nextStock = "stock" in updates ? Number(updates.stock) : Number(product.stock);
    const stockChanged = Number(product.stock) !== nextStock;
    const stockModification = recordStockModification && stockChanged
      ? {
          productId: Number(id),
          productName: updates.name || product.name,
          oldStock: Number(product.stock),
          newStock: nextStock,
          createdAt: getArgentinaTime().datetime,
        }
      : null;

    try {
      return await ProductModel.updateWithDetails(Number(id), updates, {
        tiers: nextTiers,
        stockModification,
      });
    } catch (error) {
      throwFriendlyDuplicateCodbarraError(error, updates.codbarra);
    }
  },

  async bulkAssign({ productIds, priceGroupId }) {
    if (!Array.isArray(productIds) || productIds.length === 0) {
      throw { status: 400, message: "Seleccioná al menos un producto." };
    }
    const groupId = priceGroupId || null;
    for (const id of productIds) {
      await ProductModel.update(id, { priceGroupId: groupId });
    }
    return { updated: productIds.length };
  },

  async remove(id) {
    const product = await ProductModel.findById(id);
    if (!product) throw { status: 404, message: "Producto no encontrado." };
    await ProductModel.remove(id);
    return { message: "Producto eliminado." };
  },

  async decrementStock(productId, quantity) {
    const product = await ProductModel.findById(productId);
    if (!product) return;
    if (product.stock < quantity) {
      throw { status: 400, message: `Stock insuficiente para "${product.name}". Disponible: ${product.stock}, solicitado: ${quantity}.` };
    }
    await ProductModel.update(productId, { stock: product.stock - quantity });
  },
};
