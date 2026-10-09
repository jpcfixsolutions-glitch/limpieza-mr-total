import { eq, asc } from "drizzle-orm";
import { db } from "../db/client.js";
import { priceGroups } from "../db/schema.js";

export const PriceGroupModel = {
  findAll(type) {
    const query = type
      ? db.select().from(priceGroups).where(eq(priceGroups.type, type))
      : db.select().from(priceGroups);
    return query.orderBy(asc(priceGroups.name));
  },

  findById(id) {
    return db.select().from(priceGroups).where(eq(priceGroups.id, id)).then((r) => r[0]);
  },

  create(data) {
    return db.insert(priceGroups).values(data).returning();
  },

  update(id, data) {
    return db.update(priceGroups).set(data).where(eq(priceGroups.id, id)).returning();
  },

  remove(id) {
    return db.delete(priceGroups).where(eq(priceGroups.id, id));
  },
};
