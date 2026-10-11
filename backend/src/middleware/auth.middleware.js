import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { businessUnits } from "../db/schema.js";

const JWT_SECRET = process.env.JWT_SECRET || "yofre-secret-key";

export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token de acceso requerido." });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    const requestedCode = String(req.headers["x-business-unit"] || "LOCAL").trim().toUpperCase();
    if (!new Set(["LOCAL", "WAREHOUSE"]).has(requestedCode)) {
      return res.status(400).json({ message: "Unidad de negocio inválida." });
    }
    if (requestedCode === "WAREHOUSE" && decoded.role !== "admin") {
      return res.status(403).json({ message: "Tu usuario sólo puede operar en el Local." });
    }
    const effectiveCode = decoded.role === "admin" ? requestedCode : "LOCAL";
    const unit = await db.select().from(businessUnits)
      .where(eq(businessUnits.code, effectiveCode)).then((rows) => rows[0]);
    if (!unit || !unit.isActive) {
      return res.status(503).json({ message: "La unidad de negocio no está disponible." });
    }
    req.businessUnit = unit;
    next();
  } catch (error) {
    if (error?.name !== "JsonWebTokenError" && error?.name !== "TokenExpiredError") {
      console.error("No se pudo resolver la unidad de negocio:", error);
    }
    return res.status(401).json({ message: "Token inválido o expirado." });
  }
}
