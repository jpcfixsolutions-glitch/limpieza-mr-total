import { eq, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { dailyExpenses } from "../db/schema.js";

export const DailyExpenseModel = {
  findAll() {
    return db.select().from(dailyExpenses).orderBy(desc(dailyExpenses.createdAt));
  },

  findByRegisterId(registerId) {
    return db
      .select()
      .from(dailyExpenses)
      .where(eq(dailyExpenses.registerId, registerId))
      .orderBy(desc(dailyExpenses.createdAt));
  },

  create(data) {
    return db.insert(dailyExpenses).values(data).returning().then((r) => r[0]);
  },

  remove(id) {
    return db.delete(dailyExpenses).where(eq(dailyExpenses.id, id));
  },
};
