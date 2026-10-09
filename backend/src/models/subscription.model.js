import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { subscriptionConfig } from "../db/schema.js";

function nowTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function todayDate() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const SubscriptionModel = {
  async getConfig() {
    const rows = await db.select().from(subscriptionConfig).limit(1);
    return rows[0] || null;
  },

  async upsert(fields) {
    const existing = await this.getConfig();
    const updatedAt = nowTimestamp();
    if (existing) {
      return db
        .update(subscriptionConfig)
        .set({ ...fields, updatedAt })
        .where(eq(subscriptionConfig.id, existing.id))
        .returning()
        .then((r) => r[0]);
    }
    return db
      .insert(subscriptionConfig)
      .values({ ...fields, updatedAt })
      .returning()
      .then((r) => r[0]);
  },

  async setCutoffDay(day) {
    return this.upsert({ cutoffDay: day });
  },

  async markPaid() {
    return this.upsert({ lastPaidAt: todayDate() });
  },
};
