import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { products, productExtractionItems, productExtractions } from "../db/schema.js";
import { getArgentinaTime } from "../db/timeUtils.js";

const REASONS = new Set(["uso_interno", "rotura_dano", "vencimiento", "donacion", "otro"]);

function integer(value, message) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw { status: 400, message };
  return n;
}

function parseItems(items) {
  if (!Array.isArray(items) || !items.length) throw { status: 400, message: "Agregá al menos un producto a extraer." };
  const quantities = new Map();
  for (const item of items) {
    const productId = integer(item?.productId, "El producto de la extracción no es válido.");
    const quantity = integer(item?.quantity, "La cantidad de cada producto debe ser un entero positivo.");
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }
  return quantities;
}

export const ProductExtractionService = {
  async create({ items, reason, reasonDetail, observations }, user) {
    if (!REASONS.has(reason)) throw { status: 400, message: "El motivo de extracción no es válido." };
    if (reason === "otro" && !String(reasonDetail || "").trim()) {
      throw { status: 400, message: "Describí el motivo de la extracción." };
    }
    const quantities = parseItems(items);
    const ids = [...quantities.keys()];
    const { datetime } = getArgentinaTime();

    return db.transaction(async (tx) => {
      const productRows = await tx.select().from(products).where(inArray(products.id, ids));
      const byId = new Map(productRows.map((p) => [p.id, p]));
      const detail = ids.map((productId) => {
        const product = byId.get(productId);
        const quantity = quantities.get(productId);
        if (!product || !product.isAvailable) throw { status: 400, message: `Producto no disponible (id ${productId}).` };
        if (Number(product.stock) < quantity) {
          throw { status: 400, message: `Stock insuficiente para "${product.name}". Disponible: ${product.stock}, solicitado: ${quantity}.` };
        }
        const unitCost = Number(product.cost) || 0;
        return { productId, productName: product.name, quantity, unitCost, subtotalCost: unitCost * quantity };
      });

      // El WHERE condicional es la segunda verificación y evita stock negativo ante concurrencia.
      for (const item of detail) {
        const updated = await tx.update(products)
          .set({ stock: sql`${products.stock} - ${item.quantity}` })
          .where(and(eq(products.id, item.productId), gte(products.stock, item.quantity)))
          .returning({ id: products.id });
        if (!updated.length) throw { status: 409, message: "El stock cambió durante la extracción. Revisá las cantidades e intentá de nuevo." };
      }

      const totalCost = detail.reduce((sum, item) => sum + item.subtotalCost, 0);
      const totalUnits = detail.reduce((sum, item) => sum + item.quantity, 0);
      const [created] = await tx.insert(productExtractions).values({
        userId: user.id,
        userName: user.name || "Usuario",
        reason,
        reasonDetail: String(reasonDetail || "").trim() || null,
        observations: String(observations || "").trim() || null,
        totalCost,
        totalUnits,
        createdAt: datetime,
      }).returning();
      const createdItems = await tx.insert(productExtractionItems).values(detail.map((item) => ({ ...item, extractionId: created.id }))).returning();
      return { ...created, items: createdItems };
    });
  },

  async getByPeriod({ from, to, page = 1, pageSize = 50 } = {}) {
    const conditions = [];
    if (from) conditions.push(gte(productExtractions.createdAt, `${from} 00:00:00`));
    if (to) conditions.push(sql`${productExtractions.createdAt} < datetime(${to} || ' 00:00:00', '+1 day')`);
    const where = conditions.length ? and(...conditions) : undefined;
    const safePage = Math.max(1, Number(page) || 1);
    const safeSize = Math.min(100, Math.max(1, Number(pageSize) || 50));
    const [rows, totalRows] = await Promise.all([
      db.select().from(productExtractions).where(where).orderBy(desc(productExtractions.createdAt)).limit(safeSize).offset((safePage - 1) * safeSize),
      db.select({ count: sql`count(*)` }).from(productExtractions).where(where),
    ]);
    const extractionIds = rows.map((row) => row.id);
    const itemRows = extractionIds.length ? await db.select().from(productExtractionItems).where(inArray(productExtractionItems.extractionId, extractionIds)) : [];
    const itemsByExtraction = new Map();
    for (const item of itemRows) {
      const list = itemsByExtraction.get(item.extractionId) || [];
      list.push(item);
      itemsByExtraction.set(item.extractionId, list);
    }
    return { rows: rows.map((row) => ({ ...row, items: itemsByExtraction.get(row.id) || [] })), total: Number(totalRows[0]?.count || 0), page: safePage, pageSize: safeSize };
  },

  async getSummary({ from, to } = {}) {
    const conditions = [];
    if (from) conditions.push(gte(productExtractions.createdAt, `${from} 00:00:00`));
    if (to) conditions.push(sql`${productExtractions.createdAt} < datetime(${to} || ' 00:00:00', '+1 day')`);
    const where = conditions.length ? and(...conditions) : undefined;
    const [summary] = await db.select({ totalCost: sql`coalesce(sum(${productExtractions.totalCost}), 0)`, operations: sql`count(*)` }).from(productExtractions).where(where);
    return { totalCost: Number(summary?.totalCost || 0), operations: Number(summary?.operations || 0) };
  },
};
