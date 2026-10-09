import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { appSettings } from "../db/schema.js";

export const SettingsModel = {
  async get(key) {
    const rows = await db.select().from(appSettings).where(eq(appSettings.key, key));
    return rows[0] || null;
  },

  async set(key, value) {
    await db
      .insert(appSettings)
      .values({ key, value: String(value) })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: String(value) } });
  },
};
