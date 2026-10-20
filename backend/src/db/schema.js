import { sql } from "drizzle-orm";
import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ─── Usuarios ────────────────────────────────────────────────────────────────

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role", { enum: ["admin", "cajero", "creador"] }).notNull().default("cajero"),
  createdAt: text("created_at").default(sql`(datetime('now','localtime'))`),
});

// ─── Unidades de negocio ────────────────────────────────────────────────────

export const businessUnits = sqliteTable("business_units", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code", { enum: ["LOCAL", "WAREHOUSE"] }).notNull().unique(),
  name: text("name").notNull(),
  type: text("type", { enum: ["retail", "warehouse"] }).notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").default(sql`(datetime('now','localtime'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now','localtime'))`),
});

// ─── Categorías ──────────────────────────────────────────────────────────────

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

// ─── Métodos de pago ─────────────────────────────────────────────────────────

export const paymentMethods = sqliteTable("payment_methods", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  surcharge: real("surcharge").notNull().default(0), // porcentaje, ej: 10.5
});

// ─── Proveedores y colecciones (aumentos de precio) ──────────────────────────

export const priceGroups = sqliteTable("price_groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type", { enum: ["proveedor", "coleccion"] }).notNull(),
  lastIncreasePercent: real("last_increase_percent").notNull().default(0),
}, (table) => [
  uniqueIndex("price_groups_name_type_unique").on(table.name, table.type),
]);

// ─── Tipos de bulto (paquete, caja, rollo, etc.) ─────────────────────────────

export const packTypes = sqliteTable("pack_types", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

// ─── Productos ───────────────────────────────────────────────────────────────

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  codbarra: text("cod_barra").unique(),
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
  priceGroupId: integer("price_group_id").references(() => priceGroups.id, { onDelete: "set null" }),
  packTypeId: integer("pack_type_id").references(() => packTypes.id, { onDelete: "set null" }),
  cost: real("cost").notNull().default(0),
  price: real("price").notNull(),
  unitsPerPack: integer("units_per_pack").notNull().default(1),
  packPrice: real("pack_price"),
  useSuggestedPrice: integer("use_suggested_price", { mode: "boolean" }).notNull().default(false),
  suggestedPricePercent: real("suggested_price_percent"),
  stock: integer("stock").notNull().default(0),
  minStock: integer("min_stock").notNull().default(5),
  icon: text("icon").notNull().default("Package"),
  isAvailable: integer("is_available", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").default(sql`(datetime('now','localtime'))`),
});

// El catálogo de productos es compartido. Todo dato operativo que puede variar
// entre Local y Galpón vive en esta tabla.
export const businessUnitProducts = sqliteTable("business_unit_products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  businessUnitId: integer("business_unit_id").notNull().references(() => businessUnits.id, { onDelete: "restrict" }),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  stock: integer("stock").notNull().default(0),
  minStock: integer("min_stock").notNull().default(0),
  cost: real("cost").notNull().default(0),
  salePrice: real("sale_price").notNull().default(0),
  wholesalePrice: real("wholesale_price").notNull().default(0),
  isAvailable: integer("is_available", { mode: "boolean" }).notNull().default(true),
  fulfillmentMode: text("fulfillment_mode", { enum: ["OWN_STOCK", "WAREHOUSE_DIRECT"] }).notNull().default("OWN_STOCK"),
  updatedAt: text("updated_at").default(sql`(datetime('now','localtime'))`),
}, (table) => [
  uniqueIndex("business_unit_products_unit_product_unique").on(table.businessUnitId, table.productId),
]);

export const inventoryMovements = sqliteTable("inventory_movements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  businessUnitId: integer("business_unit_id").notNull().references(() => businessUnits.id, { onDelete: "restrict" }),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  movementType: text("movement_type").notNull(),
  direction: text("direction", { enum: ["IN", "OUT"] }).notNull(),
  quantity: integer("quantity").notNull(),
  unitCost: real("unit_cost").notNull().default(0),
  stockBefore: integer("stock_before").notNull(),
  stockAfter: integer("stock_after").notNull(),
  counterpartBusinessUnitId: integer("counterpart_business_unit_id").references(() => businessUnits.id, { onDelete: "set null" }),
  sourceType: text("source_type"),
  sourceId: text("source_id"),
  sourceItemId: text("source_item_id"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  reversalOfMovementId: integer("reversal_of_movement_id"),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: text("created_at").default(sql`(datetime('now','localtime'))`),
});

// ─── Promociones combinadas ─────────────────────────────────────────────────

export const promotions = sqliteTable("promotions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description"),
  price: real("price").notNull(),
  isAvailable: integer("is_available", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").default(sql`(datetime('now','localtime'))`),
});

export const promotionItems = sqliteTable("promotion_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  promotionId: integer("promotion_id").notNull().references(() => promotions.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull(),
}, (table) => [
  uniqueIndex("promotion_items_promotion_product_unique").on(table.promotionId, table.productId),
]);

// ─── Configuración global de la app ──────────────────────────────────────────

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ─── Cajas registradoras ─────────────────────────────────────────────────────

export const cashRegisters = sqliteTable("cash_registers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openedBy: integer("opened_by").references(() => users.id),
  initialCash: real("initial_cash").notNull().default(0),
  isOpen: integer("is_open", { mode: "boolean" }).notNull().default(true),
  openedAt: text("opened_at").default(sql`(datetime('now','localtime'))`),
  closedAt: text("closed_at"),
  expectedCash: real("expected_cash"),
  countedCash: real("counted_cash"),
  cashDifference: real("cash_difference"),
  arqueoNotes: text("arqueo_notes"),
  nextInitialCash: real("next_initial_cash"),
});

// ─── Transacciones (ventas) ───────────────────────────────────────────────────

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  registerId: integer("register_id")
    .notNull()
    .references(() => cashRegisters.id),
  total: real("total").notNull(),
  status: text("status", { enum: ["completed", "cancelled"] }).notNull().default("completed"),
  discountPercent: real("discount_percent").notNull().default(0),
  discountAmount: real("discount_amount").notNull().default(0),
  date: text("date").notNull(), // "DD/MM/YYYY"
  time: text("time").notNull(), // "HH:MM"
  createdAt: text("created_at").default(sql`(datetime('now','localtime'))`),
  businessUnitId: integer("business_unit_id").references(() => businessUnits.id, { onDelete: "restrict" }),
  idempotencyKey: text("idempotency_key"),
}, (table) => [
  uniqueIndex("transactions_unit_idempotency_unique").on(table.businessUnitId, table.idempotencyKey),
]);

// ─── Pagos de una transacción ─────────────────────────────────────────────────

export const transactionPayments = sqliteTable("transaction_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: integer("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  paymentMethodId: integer("payment_method_id").references(() => paymentMethods.id, {
    onDelete: "set null",
  }),
  methodName: text("method_name").notNull(),
  baseAmount: real("base_amount").notNull(),
  surchargePercent: real("surcharge_percent").notNull().default(0),
  amount: real("amount").notNull(), // monto final con recargo
});

// ─── Ítems de una transacción ─────────────────────────────────────────────────

export const transactionItems = sqliteTable("transaction_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: integer("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => products.id, {
    onDelete: "set null",
  }),
  promotionId: integer("promotion_id").references(() => promotions.id, { onDelete: "set null" }),
  productName: text("product_name").notNull(),
  // Snapshot al momento de la venta. No debe depender del costo actual del catálogo.
  unitCost: real("unit_cost"),
  categoryName: text("category_name"),
  price: real("price").notNull(),
  quantity: integer("quantity").notNull(),
  total: real("total").notNull(),
  saleMode: text("sale_mode", { enum: ["unidad", "mayorista", "paquete", "escala", "promocion"] }).notNull().default("unidad"),
  packSize: integer("pack_size").notNull().default(1),
  promotionComposition: text("promotion_composition"),
});

// ─── Precios por cantidad (venta por 10, 25, 100, etc.) ──────────────────────

export const productPriceTiers = sqliteTable("product_price_tiers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  price: real("price").notNull(),
}, (table) => [
  uniqueIndex("product_price_tiers_product_qty_unique").on(table.productId, table.quantity),
]);

// ─── Gastos fijos ─────────────────────────────────────────────────────────────

export const fixedExpenses = sqliteTable("fixed_expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  amount: real("amount").notNull(),
});

// ─── Gastos diarios ───────────────────────────────────────────────────────────

export const dailyExpenses = sqliteTable("daily_expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reason: text("reason").notNull(),
  amount: real("amount").notNull(),
  method: text("method", { enum: ["efectivo", "transferencia"] })
    .notNull()
    .default("efectivo"),
  registerId: integer("register_id").references(() => cashRegisters.id, {
    onDelete: "set null",
  }),
  createdAt: text("created_at").default(sql`(datetime('now','localtime'))`),
});

// ─── Modificaciones de stock ──────────────────────────────────────────────────

export const stockModifications = sqliteTable("stock_modifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").references(() => products.id, {
    onDelete: "set null",
  }),
  productName: text("product_name").notNull(),
  oldStock: integer("old_stock").notNull(),
  newStock: integer("new_stock").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now','localtime'))`),
});

// ─── Retiros internos (consumo propio) ────────────────────────────────────────

export const internalWithdrawals = sqliteTable("internal_withdrawals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").references(() => products.id, {
    onDelete: "set null",
  }),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now','localtime'))`),
});

// ─── Extracciones de productos ──────────────────────────────────────────────
// Estas operaciones valorizan mercadería retirada; no son movimientos de caja.
export const productExtractions = sqliteTable("product_extractions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  userName: text("user_name").notNull(),
  reason: text("reason", { enum: ["uso_interno", "consumo_local", "consumo_casa", "rotura_dano", "vencimiento", "donacion", "otro"] }).notNull(),
  reasonDetail: text("reason_detail"),
  observations: text("observations"),
  totalCost: real("total_cost").notNull(),
  totalUnits: integer("total_units").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now','localtime'))`),
});

export const productExtractionItems = sqliteTable("product_extraction_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  extractionId: integer("extraction_id").notNull().references(() => productExtractions.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitCost: real("unit_cost").notNull(),
  subtotalCost: real("subtotal_cost").notNull(),
});

// ─── Clientes (cuenta corriente) ──────────────────────────────────────────────

export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  lastName: text("last_name").notNull(),
  document: text("document").notNull(),
  phone: text("phone"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").default(sql`(datetime('now','localtime'))`),
  businessUnitId: integer("business_unit_id").references(() => businessUnits.id, { onDelete: "restrict" }),
  internalCode: text("internal_code"),
  isInternal: integer("is_internal", { mode: "boolean" }).notNull().default(false),
}, (table) => [
  uniqueIndex("customers_unit_document_unique").on(table.businessUnitId, table.document),
  uniqueIndex("customers_internal_code_unique").on(table.internalCode),
]);

// ─── Movimientos de cuenta corriente ──────────────────────────────────────────

export const accountMovements = sqliteTable("account_movements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["cargo", "pago", "reversion_cargo"] }).notNull(),
  amount: real("amount").notNull(), // siempre positivo
  transactionId: integer("transaction_id").references(() => transactions.id, {
    onDelete: "set null",
  }),
  methodName: text("method_name"), // solo en pagos
  detail: text("detail"), // snapshot JSON de ítems, solo en cargos
  registerId: integer("register_id").references(() => cashRegisters.id, {
    onDelete: "set null",
  }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: text("created_at").default(sql`(datetime('now','localtime'))`),
  businessUnitId: integer("business_unit_id").references(() => businessUnits.id, { onDelete: "restrict" }),
  sourceType: text("source_type"),
  sourceId: text("source_id"),
  reversalOfMovementId: integer("reversal_of_movement_id"),
});

// ─── Operación mayorista del Galpón ─────────────────────────────────────────

export const warehouseOrders = sqliteTable("warehouse_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  businessUnitId: integer("business_unit_id").notNull().references(() => businessUnits.id, { onDelete: "restrict" }),
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "restrict" }),
  status: text("status", { enum: ["draft", "confirmed", "preparing", "dispatched", "cancelled"] }).notNull().default("draft"),
  total: real("total").notNull().default(0),
  observations: text("observations"),
  chargeToAccount: integer("charge_to_account", { mode: "boolean" }).notNull().default(false),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  idempotencyKey: text("idempotency_key"),
  confirmedAt: text("confirmed_at"),
  dispatchedAt: text("dispatched_at"),
  cancelledAt: text("cancelled_at"),
  createdAt: text("created_at").default(sql`(datetime('now','localtime'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now','localtime'))`),
}, (table) => [
  uniqueIndex("warehouse_orders_unit_idempotency_unique").on(table.businessUnitId, table.idempotencyKey),
]);

export const warehouseOrderItems = sqliteTable("warehouse_order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull().references(() => warehouseOrders.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
  unitCost: real("unit_cost").notNull(),
  total: real("total").notNull(),
});

export const warehousePurchases = sqliteTable("warehouse_purchases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  businessUnitId: integer("business_unit_id").notNull().references(() => businessUnits.id, { onDelete: "restrict" }),
  supplier: text("supplier").notNull(),
  status: text("status", { enum: ["draft", "received", "cancelled"] }).notNull().default("draft"),
  total: real("total").notNull().default(0),
  observations: text("observations"),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  idempotencyKey: text("idempotency_key"),
  receivedAt: text("received_at"),
  cancelledAt: text("cancelled_at"),
  createdAt: text("created_at").default(sql`(datetime('now','localtime'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now','localtime'))`),
}, (table) => [
  uniqueIndex("warehouse_purchases_unit_idempotency_unique").on(table.businessUnitId, table.idempotencyKey),
]);

export const warehousePurchaseItems = sqliteTable("warehouse_purchase_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  purchaseId: integer("purchase_id").notNull().references(() => warehousePurchases.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitCost: real("unit_cost").notNull(),
  total: real("total").notNull(),
});

export const inventoryTransfers = sqliteTable("inventory_transfers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fromBusinessUnitId: integer("from_business_unit_id").notNull().references(() => businessUnits.id, { onDelete: "restrict" }),
  toBusinessUnitId: integer("to_business_unit_id").notNull().references(() => businessUnits.id, { onDelete: "restrict" }),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull(),
  unitCost: real("unit_cost").notNull().default(0),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: text("created_at").default(sql`(datetime('now','localtime'))`),
});

// ─── Configuración de suscripción (bomba lógica) ──────────────────────────────

export const subscriptionConfig = sqliteTable("subscription_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cutoffDay: integer("cutoff_day"),   // día del mes 1-31, null = sin restricción
  lastPaidAt: text("last_paid_at"),   // fecha de última reactivación "YYYY-MM-DD"
  updatedAt: text("updated_at").default(sql`(datetime('now','localtime'))`),
});
