import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { packTypes } from "../db/schema.js";

export const PackTypeModel = {
  findAll() {
    return db.select().from(packTypes);
  },

  findById(id) {
    return db.select().from(packTypes).where(eq(packTypes.id, id)).then((r) => r[0]);
  },

  create(data) {
    return db.insert(packTypes).values(data).returning();
  },

  update(id, data) {
    return db.update(packTypes).set(data).where(eq(packTypes.id, id)).returning();
  },

  remove(id) {
    return db.delete(packTypes).where(eq(packTypes.id, id));
  },
};
