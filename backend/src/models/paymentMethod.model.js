import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { paymentMethods } from "../db/schema.js";

export const PaymentMethodModel = {
  findAll() {
    return db.select().from(paymentMethods);
  },

  findById(id) {
    return db.select().from(paymentMethods).where(eq(paymentMethods.id, id)).then((r) => r[0]);
  },

  create(data) {
    return db.insert(paymentMethods).values(data).returning();
  },

  update(id, data) {
    return db.update(paymentMethods).set(data).where(eq(paymentMethods.id, id)).returning();
  },

  remove(id) {
    return db.delete(paymentMethods).where(eq(paymentMethods.id, id));
  },
};
