import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { customers } from "../db/schema.js";

export const CustomerModel = {
  findAll(businessUnitId = null) {
    return db
      .select()
      .from(customers)
      .where(businessUnitId ? and(eq(customers.isActive, true), eq(customers.businessUnitId, businessUnitId)) : eq(customers.isActive, true))
      .orderBy(asc(customers.lastName), asc(customers.name));
  },

  findById(id, businessUnitId = null) {
    return db.select().from(customers).where(businessUnitId ? and(eq(customers.id, id), eq(customers.businessUnitId, businessUnitId)) : eq(customers.id, id)).then((r) => r[0]);
  },

  findByDocument(document, businessUnitId = null) {
    return db
      .select()
      .from(customers)
      .where(businessUnitId ? and(eq(customers.document, document), eq(customers.businessUnitId, businessUnitId)) : eq(customers.document, document))
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
