import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { productPriceTiers } from "../db/schema.js";

export const ProductPriceTierModel = {
  findByProductId(productId) {
    return db.select().from(productPriceTiers).where(eq(productPriceTiers.productId, productId));
  },

  findByProductIds(ids) {
    if (!ids.length) return [];
    return db.select().from(productPriceTiers).where(inArray(productPriceTiers.productId, ids));
  },

  replaceForProduct(productId, tiers) {
    return db.delete(productPriceTiers).where(eq(productPriceTiers.productId, productId)).then(() => {
      if (!tiers.length) return [];
      return db.insert(productPriceTiers).values(
        tiers.map((t) => ({
          productId,
          quantity: t.quantity,
          price: t.price,
        }))
      ).returning();
    });
  },

  update(id, data) {
    return db.update(productPriceTiers).set(data).where(eq(productPriceTiers.id, id)).returning();
  },
};
