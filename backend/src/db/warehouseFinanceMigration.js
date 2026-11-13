// Sólo registros transaccionales: los días y los totales se calculan al consultar.
export const warehouseFinanceMigration = {
  id: "20261113_019_warehouse_activity",
  statements: [
    `CREATE TABLE IF NOT EXISTS warehouse_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_unit_id INTEGER NOT NULL REFERENCES business_units(id),
      order_id INTEGER NOT NULL REFERENCES warehouse_orders(id),
      cash_cents INTEGER NOT NULL DEFAULT 0,
      transfer_cents INTEGER NOT NULL DEFAULT 0,
      occurred_at TEXT NOT NULL,
      reversal_of_id INTEGER UNIQUE REFERENCES warehouse_receipts(id),
      reason TEXT,
      user_id INTEGER REFERENCES users(id),
      idempotency_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(business_unit_id, idempotency_key),
      CHECK ((reversal_of_id IS NULL AND cash_cents >= 0 AND transfer_cents >= 0 AND cash_cents + transfer_cents > 0)
        OR (reversal_of_id IS NOT NULL AND cash_cents <= 0 AND transfer_cents <= 0 AND cash_cents + transfer_cents < 0))
    )`,
    `CREATE TABLE IF NOT EXISTS warehouse_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_unit_id INTEGER NOT NULL REFERENCES business_units(id),
      concept TEXT NOT NULL, description TEXT,
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      method TEXT NOT NULL CHECK(method IN ('cash','transfer')),
      occurred_at TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id),
      idempotency_key TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      deleted_at TEXT, version INTEGER NOT NULL DEFAULT 0,
      UNIQUE(business_unit_id, idempotency_key)
    )`,
    `CREATE TABLE IF NOT EXISTS warehouse_expense_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL REFERENCES warehouse_expenses(id),
      action TEXT NOT NULL, snapshot TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL
    )`,
    "CREATE INDEX IF NOT EXISTS warehouse_receipts_unit_date ON warehouse_receipts(business_unit_id, occurred_at)",
    "CREATE INDEX IF NOT EXISTS warehouse_receipts_order ON warehouse_receipts(order_id)",
    "CREATE INDEX IF NOT EXISTS warehouse_expenses_unit_date ON warehouse_expenses(business_unit_id, occurred_at)",
    "CREATE INDEX IF NOT EXISTS warehouse_orders_unit_created ON warehouse_orders(business_unit_id, created_at)",
    "CREATE INDEX IF NOT EXISTS account_movements_unit_created ON account_movements(business_unit_id, created_at)",
  ],
};
