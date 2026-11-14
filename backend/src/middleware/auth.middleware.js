import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { businessUnits, users } from "../db/schema.js";

const JWT_SECRET = process.env.JWT_SECRET || "yofre-secret-key";

// Lista cerrada para este rol, incluso en rutas que históricamente sólo
// requerían una sesión (catálogo, estadísticas, movimientos, etc.).
function employeeOperationAllowed(req) {
  const path = `${req.baseUrl || ""}${req.path || ""}`.replace(/^\/api(?=\/)/, "").replace(/\/+$/, "");
  if (req.method === "GET") return ["/warehouse/operations", "/warehouse/orders", "/warehouse/liquids", "/warehouse/stock-options", "/warehouse/legacy-stock"].includes(path);
  if (req.method === "PUT") return /^\/warehouse\/liquids\/[1-9]\d*$/.test(path);
  if (req.method !== "PATCH") return false;
  return /^\/warehouse\/orders\/[1-9]\d*\/status$/.test(path)
    || /^\/warehouse\/orders\/[1-9]\d*\/items\/[1-9]\d*\/status$/.test(path)
    || /^\/warehouse\/stock\/[1-9]\d*$/.test(path);
}

export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token de acceso requerido." });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const currentUser = await db.select({ role: users.role }).from(users).where(eq(users.id, decoded.id)).then((rows) => rows[0]);
    if (!currentUser || currentUser.role !== decoded.role) return res.status(401).json({ message: "La sesión cambió. Iniciá sesión nuevamente." });
    req.user = decoded;
    const isEmployee = decoded.role === "EMPLEADO_GALPON";
    if (isEmployee && !employeeOperationAllowed(req)) return res.status(403).json({ message: "Tu usuario sólo tiene acceso a las operaciones habilitadas del Galpón." });
    const requestedCode = String(req.headers["x-business-unit"] || (isEmployee ? "WAREHOUSE" : "LOCAL")).trim().toUpperCase();
    if (!new Set(["LOCAL", "WAREHOUSE"]).has(requestedCode)) {
      return res.status(400).json({ message: "Unidad de negocio inválida." });
    }
    if (isEmployee && requestedCode !== "WAREHOUSE") return res.status(403).json({ message: "Tu usuario sólo puede operar en el Galpón." });
    if (requestedCode === "WAREHOUSE" && decoded.role !== "admin" && !isEmployee) {
      return res.status(403).json({ message: "Tu usuario sólo puede operar en el Local." });
    }
    const effectiveCode = isEmployee ? "WAREHOUSE" : decoded.role === "admin" ? requestedCode : "LOCAL";
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
