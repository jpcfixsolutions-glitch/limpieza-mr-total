import { asc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { customers } from "../db/schema.js";

export const CustomerModel = {
  findAll() {
    return db
      .select()
      .from(customers)
      .where(eq(customers.isActive, true))
      .orderBy(asc(customers.lastName), asc(customers.name));
  },

  findById(id) {
    return db.select().from(customers).where(eq(customers.id, id)).then((r) => r[0]);
  },

  findByDocument(document) {
    return db
      .select()
      .from(customers)
      .where(eq(customers.document, document))
      .then((r) => r[0]);
  },

  create(data) {
    return db.insert(customers).values(data).returning().then((r) => r[0]);
  },

  update(id, data) {
    return db
      .update(customers)
      .set(data)
      .where(eq(customers.id, id))
      .returning()
      .then((r) => r[0]);
  },
};
