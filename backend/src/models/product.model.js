import { and, eq, count, asc, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  products,
  categories,
  priceGroups,
  packTypes,
  productPriceTiers,
  stockModifications,
  businessUnitProducts,
} from "../db/schema.js";

const SELECT_FIELDS = {
  id: products.id,
  name: products.name,
  codbarra: products.codbarra,
  categoryId: products.categoryId,
  category: categories.name,
  priceGroupId: products.priceGroupId,
  priceGroupName: priceGroups.name,
  priceGroupType: priceGroups.type,
  packTypeId: products.packTypeId,
  packTypeName: packTypes.name,
  cost: products.cost,
  price: products.price,
  unitsPerPack: products.unitsPerPack,
  packPrice: products.packPrice,
  stock: products.stock,
  minStock: products.minStock,
  icon: products.icon,
  isAvailable: products.isAvailable,
  createdAt: products.createdAt,
};

function contextualFields() {
  return {
    ...SELECT_FIELDS,
    stock: sql`COALESCE(${businessUnitProducts.stock}, 0)`.mapWith(Number),
    minStock: sql`COALESCE(${businessUnitProducts.minStock}, 0)`.mapWith(Number),
    cost: sql`COALESCE(${businessUnitProducts.cost}, ${products.cost}, 0)`.mapWith(Number),
    price: sql`COALESCE(${businessUnitProducts.salePrice}, ${products.price}, 0)`.mapWith(Number),
    isAvailable: sql`COALESCE(${businessUnitProducts.isAvailable}, 0)`.mapWith(Boolean),
    fulfillmentMode: sql`COALESCE(${businessUnitProducts.fulfillmentMode}, 'OWN_STOCK')`,
    inventoryConfigured: sql`CASE WHEN ${businessUnitProducts.id} IS NULL THEN 0 ELSE 1 END`.mapWith(Boolean),
    warehouseStock: sql`COALESCE((
      SELECT wbp.stock FROM business_unit_products wbp
      JOIN business_units wbu ON wbu.id = wbp.business_unit_id
      WHERE wbp.product_id = ${products.id} AND wbu.code = 'WAREHOUSE'
    ), 0)`.mapWith(Number),
    warehouseCost: sql`COALESCE((
      SELECT wbp.cost FROM business_unit_products wbp
      JOIN business_units wbu ON wbu.id = wbp.business_unit_id
      WHERE wbp.product_id = ${products.id} AND wbu.code = 'WAREHOUSE'
    ), 0)`.mapWith(Number),
  };
}

function withJoins(query) {
  return query
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(priceGroups, eq(products.priceGroupId, priceGroups.id))
    .leftJoin(packTypes, eq(products.packTypeId, packTypes.id));
}

function findByIdQuery(id) {
  return withJoins(db.select(SELECT_FIELDS).from(products)).where(eq(products.id, id));
}

function tiersByProductIdQuery(productId) {
  return db.select().from(productPriceTiers).where(eq(productPriceTiers.productId, productId));
}

async function runAndFindProduct(queries, productId) {
  const productResultIndex = queries.length;
  queries.push(findByIdQuery(productId));
  const tiersResultIndex = queries.length;
  queries.push(tiersByProductIdQuery(productId));

  // libSQL ejecuta el batch en una sola transacción y un solo viaje de red.
  // Así el frontend no queda esperando varias escrituras remotas consecutivas.
  const results = await db.batch(queries);
  const product = results[productResultIndex]?.[0];
  if (!product) return undefined;

  product.priceTiers = (results[tiersResultIndex] || [])
    .map((tier) => ({ quantity: tier.quantity, price: tier.price }))
    .sort((a, b) => a.quantity - b.quantity);
  return product;
}

export const ProductModel = {
  findAll() {
    return withJoins(db.select(SELECT_FIELDS).from(products)).orderBy(asc(products.name));
  },

  findById(id) {
    return findByIdQuery(id).then((r) => r[0]);
  },

  findByCodbarra(codbarra) {
    return withJoins(db.select(SELECT_FIELDS).from(products))
      .where(eq(products.codbarra, codbarra))
      .then((r) => r[0]);
  },

  findAllForUnit(businessUnitId) {
    return withJoins(db.select(contextualFields()).from(products)
      .leftJoin(businessUnitProducts, and(
        eq(businessUnitProducts.productId, products.id),
        eq(businessUnitProducts.businessUnitId, businessUnitId)
      ))).orderBy(asc(products.name));
  },

  findByIdForUnit(id, businessUnitId) {
    return withJoins(db.select(contextualFields()).from(products)
      .leftJoin(businessUnitProducts, and(
        eq(businessUnitProducts.productId, products.id),
        eq(businessUnitProducts.businessUnitId, businessUnitId)
      )))
      .where(eq(products.id, id)).then((rows) => rows[0]);
  },

  findByCodbarraForUnit(codbarra, businessUnitId) {
    return withJoins(db.select(contextualFields()).from(products)
      .leftJoin(businessUnitProducts, and(
        eq(businessUnitProducts.productId, products.id),
        eq(businessUnitProducts.businessUnitId, businessUnitId)
      )))
      .where(eq(products.codbarra, codbarra)).then((rows) => rows[0]);
  },

  findByPriceGroupId(priceGroupId) {
    return db.select().from(products).where(eq(products.priceGroupId, priceGroupId));
  },

  countByPriceGroup() {
    return db
      .select({
        priceGroupId: products.priceGroupId,
        n: count(),
      })
      .from(products)
      .groupBy(products.priceGroupId);
  },

  create(data) {
    return db.insert(products).values(data).returning();
  },

  createTiersAndFindById(id, tiers) {
    const queries = [];
    if (tiers.length > 0) {
      queries.push(db.insert(productPriceTiers).values(
        tiers.map((tier) => ({
          productId: id,
          quantity: tier.quantity,
          price: tier.price,
        }))
      ));
    }
    return runAndFindProduct(queries, id);
  },

  update(id, data) {
    return db.update(products).set(data).where(eq(products.id, id)).returning();
  },

  updateWithDetails(id, data, { tiers, stockModification } = {}) {
    const queries = [];
    if (Object.keys(data).length > 0) {
      queries.push(db.update(products).set(data).where(eq(products.id, id)));
    }

    if (tiers !== null && tiers !== undefined) {
      queries.push(db.delete(productPriceTiers).where(eq(productPriceTiers.productId, id)));
      if (tiers.length > 0) {
        queries.push(db.insert(productPriceTiers).values(
          tiers.map((tier) => ({
            productId: id,
            quantity: tier.quantity,
            price: tier.price,
          }))
        ));
      }
    }

    if (stockModification) {
      queries.push(db.insert(stockModifications).values(stockModification));
    }

    return runAndFindProduct(queries, id);
  },

  remove(id) {
    return db.delete(products).where(eq(products.id, id));
  },
};
