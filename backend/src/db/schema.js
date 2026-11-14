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
  role: text("role", { enum: ["admin", "cajero", "creador", "EMPLEADO_GALPON"] }).notNull().default("cajero"),
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
  idempotencyKey: text("idempotency_key"),
});

export const accountPaymentDetails = sqliteTable("account_payment_details", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountMovementId: integer("account_movement_id")
    .notNull()
    .references(() => accountMovements.id, { onDelete: "cascade" }),
  paymentMethodId: integer("payment_method_id").references(() => paymentMethods.id, {
    onDelete: "set null",
  }),
  methodName: text("method_name").notNull(),
  amount: real("amount").notNull(),
});

// ─── Operación mayorista del Galpón ─────────────────────────────────────────

export const warehouseReceipts = sqliteTable("warehouse_receipts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  businessUnitId: integer("business_unit_id").notNull().references(() => businessUnits.id),
  orderId: integer("order_id").notNull().references(() => warehouseOrders.id),
  cashCents: integer("cash_cents").notNull().default(0),
  transferCents: integer("transfer_cents").notNull().default(0),
  occurredAt: text("occurred_at").notNull(),
  reversalOfId: integer("reversal_of_id").unique().references(() => warehouseReceipts.id),
  reason: text("reason"), userId: integer("user_id").references(() => users.id),
  idempotencyKey: text("idempotency_key").notNull(), createdAt: text("created_at").notNull(),
}, (t) => [uniqueIndex("warehouse_receipts_unit_key").on(t.businessUnitId, t.idempotencyKey)]);

export const warehouseExpenses = sqliteTable("warehouse_expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  businessUnitId: integer("business_unit_id").notNull().references(() => businessUnits.id),
  concept: text("concept").notNull(), description: text("description"),
  amountCents: integer("amount_cents").notNull(), method: text("method").notNull(),
  occurredAt: text("occurred_at").notNull(), userId: integer("user_id").references(() => users.id),
  idempotencyKey: text("idempotency_key").notNull(), createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(), deletedAt: text("deleted_at"), version: integer("version").notNull().default(0),
}, (t) => [uniqueIndex("warehouse_expenses_unit_key").on(t.businessUnitId, t.idempotencyKey)]);

export const warehouseExpenseAudit = sqliteTable("warehouse_expense_audit", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  expenseId: integer("expense_id").notNull().references(() => warehouseExpenses.id),
  action: text("action").notNull(), snapshot: text("snapshot").notNull(),
  userId: integer("user_id").references(() => users.id), createdAt: text("created_at").notNull(),
});

export const warehouseCustomerDetails = sqliteTable("warehouse_customer_details", {
  customerId: integer("customer_id").primaryKey().references(() => customers.id, { onDelete: "cascade" }),
  businessUnitId: integer("business_unit_id").notNull().references(() => businessUnits.id, { onDelete: "restrict" }),
  address: text("address").notNull(),
  contactKey: text("contact_key").notNull(),
}, (table) => [uniqueIndex("warehouse_customer_contact_unique").on(table.businessUnitId, table.contactKey)]);

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
  deliveredAt: text("delivered_at"),
  readyAt: text("ready_at"),
  version: integer("version").notNull().default(0),
  cancelledAt: text("cancelled_at"),
  createdAt: text("created_at").default(sql`(datetime('now','localtime'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now','localtime'))`),
}, (table) => [
  uniqueIndex("warehouse_orders_unit_idempotency_unique").on(table.businessUnitId, table.idempotencyKey),
]);

export const warehouseOrderItems = sqliteTable("warehouse_order_items", {
  liquidProductId: integer("liquid_product_id").references(() => warehouseLiquidProducts.id),
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull().references(() => warehouseOrders.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  preparationStatus: text("preparation_status", { enum: ["preparing", "ready"] }).notNull().default("preparing"),
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

// Configuración financiera exclusiva del Galpón. Las ocurrencias conservan su snapshot.
export const warehouseFixedExpenses = sqliteTable('warehouse_fixed_expenses', {
  id: integer('id').primaryKey({autoIncrement:true}),
  businessUnitId: integer('business_unit_id').notNull().references(()=>businessUnits.id),
  name:text('name').notNull(), nameKey:text('name_key').notNull(), description:text('description').notNull().default(''),
  amountCents:integer('amount_cents').notNull(), frequency:text('frequency').notNull(), dueDay:integer('due_day').notNull(),
  startDate:text('start_date').notNull(),nextDue:text('next_due').notNull(),active:integer('active').notNull().default(1),version:integer('version').notNull().default(0),
},t=>[uniqueIndex('warehouse_fixed_name').on(t.businessUnitId,t.nameKey)]);
export const warehouseFixedOccurrences = sqliteTable('warehouse_fixed_occurrences', {
  id:integer('id').primaryKey({autoIncrement:true}),businessUnitId:integer('business_unit_id').notNull().references(()=>businessUnits.id),
  fixedExpenseId:integer('fixed_expense_id').notNull().references(()=>warehouseFixedExpenses.id),dueDate:text('due_date').notNull(),
  concept:text('concept').notNull(),description:text('description').notNull(),amountCents:integer('amount_cents').notNull(),
  expenseId:integer('expense_id').unique().references(()=>warehouseExpenses.id),
},t=>[uniqueIndex('warehouse_fixed_due').on(t.fixedExpenseId,t.dueDate)]);
export const warehousePaymentMethods = sqliteTable('warehouse_payment_methods', {
  id:integer('id').primaryKey({autoIncrement:true}),businessUnitId:integer('business_unit_id').notNull().references(()=>businessUnits.id),
  name:text('name').notNull(),nameKey:text('name_key').notNull(),surchargeBps:integer('surcharge_bps').notNull(),kind:text('kind').notNull(),
  active:integer('active').notNull().default(1),version:integer('version').notNull().default(0),
},t=>[uniqueIndex('warehouse_method_name').on(t.businessUnitId,t.nameKey)]);
export const warehousePaymentParts = sqliteTable('warehouse_payment_parts', {
  id:integer('id').primaryKey({autoIncrement:true}),receiptId:integer('receipt_id').references(()=>warehouseReceipts.id),
  accountMovementId:integer('account_movement_id').references(()=>accountMovements.id),methodId:integer('method_id').notNull().references(()=>warehousePaymentMethods.id),
  methodName:text('method_name').notNull(),kind:text('kind').notNull(),baseCents:integer('base_cents').notNull(),
  surchargeBps:integer('surcharge_bps').notNull(),surchargeCents:integer('surcharge_cents').notNull(),
});
export const warehouseSettingsAudit = sqliteTable('warehouse_settings_audit', {
  id:integer('id').primaryKey({autoIncrement:true}),businessUnitId:integer('business_unit_id').notNull().references(()=>businessUnits.id),
  entity:text('entity').notNull(),entityId:integer('entity_id').notNull(),snapshot:text('snapshot').notNull(),
  userId:integer('user_id').references(()=>users.id),createdAt:text('created_at').notNull(),
});

export const warehouseLiquidProducts = sqliteTable('warehouse_liquid_products', {
  id: integer('id').primaryKey({ autoIncrement: true }), name: text('name').notNull(), barcode: text('barcode'),
  category: text('category').notNull().default(''), cost: real('cost').notNull().default(0), price: real('price').notNull().default(0),
  minStockMl: integer('min_stock_ml').notNull().default(0), version: integer('version').notNull().default(0),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false), createdAt: text('created_at').default(sql`(datetime('now'))`),
});
export const warehouseLiquidContainers = sqliteTable('warehouse_liquid_containers', {
  id: integer('id').primaryKey({ autoIncrement: true }), productId: integer('product_id').notNull().references(() => warehouseLiquidProducts.id),
  kind: text('kind').notNull(), capacityMl: integer('capacity_ml').notNull(), count: integer('count').notNull(),
  contentMl: integer('content_ml').notNull(), location: text('location').notNull(),
});
export const warehouseLiquidMovements = sqliteTable('warehouse_liquid_movements', {
  id: integer('id').primaryKey({ autoIncrement: true }), productId: integer('product_id').notNull().references(() => warehouseLiquidProducts.id),
  userId: integer('user_id').references(() => users.id), operation: text('operation').notNull(), beforeJson: text('before_json').notNull(),
  afterJson: text('after_json').notNull(), notes: text('notes').notNull(), idempotencyKey: text('idempotency_key').notNull().unique(),
  requestJson: text('request_json').notNull(), createdAt: text('created_at').default(sql`(datetime('now'))`),
});

export const warehouseStockOptions = sqliteTable('warehouse_stock_options', {
  id: integer('id').primaryKey({autoIncrement:true}), businessUnitId: integer('business_unit_id').notNull().references(()=>businessUnits.id),
  type: text('type').notNull(), name: text('name').notNull(), nameKey: text('name_key').notNull(),
  active: integer('active',{mode:'boolean'}).notNull().default(true), version: integer('version').notNull().default(0),
});
export const warehouseStockOptionsAudit = sqliteTable('warehouse_stock_options_audit', {
  id: integer('id').primaryKey({autoIncrement:true}), optionId: integer('option_id').notNull().references(()=>warehouseStockOptions.id),
  userId: integer('user_id').notNull().references(()=>users.id), beforeJson: text('before_json').notNull(), afterJson: text('after_json').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});
