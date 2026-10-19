import { ProductModel } from "../models/product.model.js";
import { ProductPriceTierModel } from "../models/productPriceTier.model.js";
import { roundPriceUpToTen } from "../constants.js";
import { getArgentinaTime } from "../db/timeUtils.js";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { businessUnitProducts, productPriceTiers, products, stockModifications } from "../db/schema.js";
import { adjustInventoryInTransaction, ensureInventoryBalance } from "./inventory.service.js";

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

function normalizeStock(value, label = "El stock") {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw { status: 400, message: `${label} debe ser un entero mayor o igual a cero.` };
  return parsed;
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
  async getAll(businessUnit = null) {
    return attachTiers(businessUnit?.id
      ? await ProductModel.findAllForUnit(businessUnit.id)
      : await ProductModel.findAll());
  },

  async getByCodbarra(codbarra, businessUnit = null) {
    const normalized = normalizeCodbarra(codbarra);
    if (!normalized) throw { status: 400, message: "Código de barras inválido." };

    const product = businessUnit?.id
      ? await ProductModel.findByCodbarraForUnit(normalized, businessUnit.id)
      : await ProductModel.findByCodbarra(normalized);
    if (!product) throw { status: 404, message: "Producto no encontrado con ese código de barras." };
    return attachTiers(product);
  },

  async create({ name, codbarra, categoryId, priceGroupId, packTypeId, cost, price, wholesalePrice, stock, minStock, isAvailable, unitsPerPack, packPrice, priceTiers, fulfillmentMode }, businessUnit = null) {
    if (!name || price === undefined) {
      throw { status: 400, message: "Nombre y precio son requeridos." };
    }
    const normalizedCodbarra = normalizeCodbarra(codbarra);
    const pack = normalizePackFields({ unitsPerPack, packPrice });
    const tiers = normalizePriceTiers(priceTiers) || [];

    if (businessUnit?.id) {
      const inventoryStock = normalizeStock(stock ?? 0);
      const inventoryMin = normalizeStock(minStock ?? 5, "El stock mínimo");
      const normalizedCost = normalizeMoney(cost ?? 0, "El costo");
      const normalizedPrice = normalizeCatalogPrice(price, "El precio unitario");
      const normalizedWholesalePrice = normalizeCatalogPrice(wholesalePrice ?? 0, "El precio mayorista");
      const mode = businessUnit.code === "LOCAL" && fulfillmentMode === "WAREHOUSE_DIRECT"
        ? "WAREHOUSE_DIRECT" : "OWN_STOCK";
      try {
        const productId = await db.transaction(async (tx) => {
          const [created] = await tx.insert(products).values({
            name,
            codbarra: normalizedCodbarra,
            categoryId: categoryId || null,
            priceGroupId: priceGroupId || null,
            packTypeId: packTypeId || null,
            cost: normalizedCost,
            price: normalizedPrice,
            stock: businessUnit.code === "LOCAL" ? inventoryStock : 0,
            minStock: businessUnit.code === "LOCAL" ? inventoryMin : 0,
            icon: "Package",
            isAvailable: businessUnit.code === "LOCAL" ? isAvailable !== false : true,
            unitsPerPack: pack.unitsPerPack,
            packPrice: pack.packPrice,
          }).returning();
          await tx.insert(businessUnitProducts).values({
            businessUnitId: businessUnit.id,
            productId: created.id,
            stock: inventoryStock,
            minStock: inventoryMin,
            cost: normalizedCost,
            salePrice: normalizedPrice,
            wholesalePrice: normalizedWholesalePrice,
            isAvailable: isAvailable !== false,
            fulfillmentMode: mode,
            updatedAt: getArgentinaTime().datetime,
          });
          if (tiers.length) await tx.insert(productPriceTiers).values(tiers.map((tier) => ({ ...tier, productId: created.id })));
          return created.id;
        });
        return attachTiers(await ProductModel.findByIdForUnit(productId, businessUnit.id));
      } catch (error) {
        throwFriendlyDuplicateCodbarraError(error, normalizedCodbarra);
      }
    }

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
        icon: "Package",
        isAvailable: isAvailable !== false,
        unitsPerPack: pack.unitsPerPack,
        packPrice: pack.packPrice,
      });
      return await ProductModel.createTiersAndFindById(created.id, tiers);
    } catch (error) {
      throwFriendlyDuplicateCodbarraError(error, normalizedCodbarra);
    }
  },

  async update(id, updates, businessUnit = null, userId = null) {
    const product = businessUnit?.id
      ? await ProductModel.findByIdForUnit(Number(id), businessUnit.id)
      : await ProductModel.findById(id);
    if (!product) throw { status: 404, message: "Producto no encontrado." };

    const recordStockModification = updates.recordStockModification === true;
    delete updates.recordStockModification;

    delete updates.icon;

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

    if ("wholesalePrice" in updates) {
      updates.wholesalePrice = normalizeCatalogPrice(updates.wholesalePrice, "El precio mayorista");
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

    if (businessUnit?.id) {
      const inventoryFields = {};
      if ("stock" in updates) inventoryFields.stock = normalizeStock(updates.stock);
      if ("minStock" in updates) inventoryFields.minStock = normalizeStock(updates.minStock, "El stock mínimo");
      if ("cost" in updates) inventoryFields.cost = updates.cost;
      if ("price" in updates) inventoryFields.salePrice = updates.price;
      if ("wholesalePrice" in updates) inventoryFields.wholesalePrice = updates.wholesalePrice;
      if ("isAvailable" in updates) inventoryFields.isAvailable = updates.isAvailable !== false;
      if ("fulfillmentMode" in updates) {
        inventoryFields.fulfillmentMode = businessUnit.code === "LOCAL" && updates.fulfillmentMode === "WAREHOUSE_DIRECT"
          ? "WAREHOUSE_DIRECT" : "OWN_STOCK";
      }
      const catalogFields = {};
      for (const key of ["name", "codbarra", "categoryId", "priceGroupId", "packTypeId", "unitsPerPack", "packPrice"]) {
        if (key in updates) catalogFields[key] = updates[key];
      }
      if (businessUnit.code === "LOCAL") {
        if ("cost" in updates) catalogFields.cost = updates.cost;
        if ("price" in updates) catalogFields.price = updates.price;
        if ("minStock" in updates) catalogFields.minStock = inventoryFields.minStock;
        if ("isAvailable" in updates) catalogFields.isAvailable = inventoryFields.isAvailable;
      }
      try {
        await db.transaction(async (tx) => {
          const balance = await ensureInventoryBalance(tx, businessUnit.id, Number(id));
          if ("stock" in inventoryFields && Number(inventoryFields.stock) !== Number(balance.stock)) {
            const direction = inventoryFields.stock > Number(balance.stock) ? "IN" : "OUT";
            await adjustInventoryInTransaction(tx, {
              businessUnitId: businessUnit.id,
              productId: Number(id),
              direction,
              quantity: Math.abs(inventoryFields.stock - Number(balance.stock)),
              movementType: "MANUAL_ADJUSTMENT",
              unitCost: inventoryFields.cost ?? balance.cost,
              sourceType: "product_adjustment",
              sourceId: id,
              idempotencyKey: `adjust:${businessUnit.id}:${id}:${Date.now()}:${Math.random()}`,
              userId,
              notes: "Ajuste manual desde inventario",
            });
            delete inventoryFields.stock;
          }
          if (Object.keys(inventoryFields).length) {
            await tx.update(businessUnitProducts).set({ ...inventoryFields, updatedAt: getArgentinaTime().datetime })
              .where(and(eq(businessUnitProducts.businessUnitId, businessUnit.id), eq(businessUnitProducts.productId, Number(id))));
          }
          if (businessUnit.code === "LOCAL" && "stock" in updates) catalogFields.stock = normalizeStock(updates.stock);
          if (Object.keys(catalogFields).length) await tx.update(products).set(catalogFields).where(eq(products.id, Number(id)));
          if (nextTiers !== null) {
            await tx.delete(productPriceTiers).where(eq(productPriceTiers.productId, Number(id)));
            if (nextTiers.length) await tx.insert(productPriceTiers).values(nextTiers.map((tier) => ({ ...tier, productId: Number(id) })));
          }
          if (stockModification && businessUnit.code === "LOCAL") await tx.insert(stockModifications).values(stockModification);
        });
        return attachTiers(await ProductModel.findByIdForUnit(Number(id), businessUnit.id));
      } catch (error) {
        throwFriendlyDuplicateCodbarraError(error, updates.codbarra);
      }
    }

    delete updates.wholesalePrice;
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

  async remove(id, businessUnit = null) {
    if (!businessUnit?.id) {
      throw { status: 400, message: "Se requiere una unidad de negocio para dar de baja un producto." };
    }
    const product = await ProductModel.findByIdForUnitIncludingInactive(Number(id), businessUnit.id);
    if (!product) throw { status: 404, message: "Producto no encontrado." };
    await db.insert(businessUnitProducts).values({
      businessUnitId: businessUnit.id,
      productId: Number(id),
      stock: Number(product.stock) || 0,
      minStock: Number(product.minStock) || 0,
      cost: Number(product.cost) || 0,
      salePrice: Number(product.price) || 0,
      wholesalePrice: Number(product.wholesalePrice) || 0,
      isAvailable: false,
      fulfillmentMode: product.fulfillmentMode === "WAREHOUSE_DIRECT" ? "WAREHOUSE_DIRECT" : "OWN_STOCK",
      updatedAt: getArgentinaTime().datetime,
    }).onConflictDoUpdate({
      target: [businessUnitProducts.businessUnitId, businessUnitProducts.productId],
      set: { isAvailable: false, updatedAt: getArgentinaTime().datetime },
    });
    return { message: "Producto dado de baja lógicamente para esta unidad." };
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
