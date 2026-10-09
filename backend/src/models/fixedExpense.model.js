import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { fixedExpenses } from "../db/schema.js";

export const FixedExpenseModel = {
  findAll() {
    return db.select().from(fixedExpenses);
  },

  findById(id) {
    return db.select().from(fixedExpenses).where(eq(fixedExpenses.id, id)).then((r) => r[0]);
  },

  create(data) {
    return db.insert(fixedExpenses).values(data).returning();
  },

  update(id, data) {
    return db.update(fixedExpenses).set(data).where(eq(fixedExpenses.id, id)).returning();
  },

  remove(id) {
    return db.delete(fixedExpenses).where(eq(fixedExpenses.id, id));
  },
};
