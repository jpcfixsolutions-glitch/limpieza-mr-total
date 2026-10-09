import { eq, asc } from "drizzle-orm";
import { db } from "../db/client.js";
import { categories } from "../db/schema.js";

export const CategoryModel = {
  findAll() {
    return db.select().from(categories).orderBy(asc(categories.name));
  },

  findById(id) {
    return db.select().from(categories).where(eq(categories.id, id)).then((r) => r[0]);
  },

  create(data) {
    return db.insert(categories).values(data).returning();
  },

  update(id, data) {
    return db.update(categories).set(data).where(eq(categories.id, id)).returning();
  },

  remove(id) {
    return db.delete(categories).where(eq(categories.id, id));
  },
};
