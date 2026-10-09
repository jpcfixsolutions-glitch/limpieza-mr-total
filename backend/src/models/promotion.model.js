import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { products, promotionItems, promotions } from "../db/schema.js";

export const PromotionModel = {
  findAll() {
    return db.select().from(promotions).orderBy(asc(promotions.name));
  },

  findById(id) {
    return db.select().from(promotions).where(eq(promotions.id, id)).then((rows) => rows[0]);
  },

  findItemsByPromotionIds(ids) {
    if (!ids.length) return Promise.resolve([]);
    return db.select({
      promotionId: promotionItems.promotionId,
      productId: products.id,
      name: products.name,
      codbarra: products.codbarra,
      stock: products.stock,
      isAvailable: products.isAvailable,
      quantity: promotionItems.quantity,
    })
      .from(promotionItems)
      .innerJoin(products, eq(promotionItems.productId, products.id))
      .where(inArray(promotionItems.promotionId, ids));
  },

  async create(data, items) {
    return db.transaction(async (tx) => {
      const [promotion] = await tx.insert(promotions).values(data).returning();
      await tx.insert(promotionItems).values(items.map((item) => ({ ...item, promotionId: promotion.id })));
      return promotion;
    });
  },

  remove(id) {
    return db.delete(promotions).where(eq(promotions.id, id));
  },

  async update(id, data, items) {
    return db.transaction(async (tx) => {
      await tx.update(promotions).set(data).where(eq(promotions.id, id));
      await tx.delete(promotionItems).where(eq(promotionItems.promotionId, id));
      await tx.insert(promotionItems).values(items.map((item) => ({ ...item, promotionId: id })));
    });
  },
};
