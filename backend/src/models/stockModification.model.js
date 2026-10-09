import { eq, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { stockModifications, internalWithdrawals, products } from "../db/schema.js";

export const StockModificationModel = {
  findAll() {
    return db.select().from(stockModifications).orderBy(desc(stockModifications.createdAt));
  },

  create(data) {
    return db.insert(stockModifications).values(data).returning().then((r) => r[0]);
  },
};

export const InternalWithdrawalModel = {
  findAll() {
    return db.select().from(internalWithdrawals).orderBy(desc(internalWithdrawals.createdAt));
  },

  create(data) {
    return db.insert(internalWithdrawals).values(data).returning().then((r) => r[0]);
  },

  findProductById(id) {
    return db.select().from(products).where(eq(products.id, id)).then((r) => r[0]);
  },

  decrementStock(productId, quantity) {
    return db
      .update(products)
      .set({ stock: db.raw ? undefined : undefined }) // Handled in service
      .where(eq(products.id, productId));
  },
};
