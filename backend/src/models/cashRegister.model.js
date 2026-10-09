import { eq, desc, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { cashRegisters } from "../db/schema.js";

export const CashRegisterModel = {
  findOpen() {
    return db
      .select()
      .from(cashRegisters)
      .where(eq(cashRegisters.isOpen, true))
      .then((r) => r[0]);
  },

  findById(id) {
    return db
      .select()
      .from(cashRegisters)
      .where(eq(cashRegisters.id, id))
      .then((r) => r[0]);
  },

  findClosed() {
    return db
      .select()
      .from(cashRegisters)
      .where(eq(cashRegisters.isOpen, false))
      .orderBy(desc(cashRegisters.closedAt));
  },

  findLastClosed() {
    return db
      .select()
      .from(cashRegisters)
      .where(eq(cashRegisters.isOpen, false))
      .orderBy(desc(cashRegisters.closedAt), desc(cashRegisters.id))
      .limit(1)
      .then((r) => r[0] || null);
  },

  findAll() {
    return db.select().from(cashRegisters).orderBy(desc(cashRegisters.openedAt));
  },

  create(data) {
    return db.insert(cashRegisters).values(data).returning().then((r) => r[0]);
  },

  update(id, data) {
    return db
      .update(cashRegisters)
      .set(data)
      .where(eq(cashRegisters.id, id))
      .returning()
      .then((r) => r[0]);
  },

  closeAtomically(id, data) {
    return db
      .update(cashRegisters)
      .set(data)
      .where(and(eq(cashRegisters.id, id), eq(cashRegisters.isOpen, true)))
      .returning()
      .then((r) => r[0] || null);
  },
};
