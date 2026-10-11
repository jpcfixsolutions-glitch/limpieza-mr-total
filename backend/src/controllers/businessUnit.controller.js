import { asc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { businessUnits } from "../db/schema.js";
import { sendControllerError } from "./controllerError.js";

export const BusinessUnitController = {
  async list(req, res) {
    try {
      const rows = await db.select().from(businessUnits)
        .where(eq(businessUnits.isActive, true)).orderBy(asc(businessUnits.id));
      const allowed = req.user.role === "admin"
        ? rows
        : rows.filter((unit) => unit.code === "LOCAL");
      res.json(allowed);
    } catch (error) {
      sendControllerError(res, error);
    }
  },
};
