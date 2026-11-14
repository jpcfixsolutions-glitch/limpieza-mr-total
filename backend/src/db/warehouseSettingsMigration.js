export const warehouseSettingsMigration = {
  id: "20261113_020_warehouse_settings",
  statements: [
    `CREATE TABLE warehouse_fixed_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT, business_unit_id INTEGER NOT NULL REFERENCES business_units(id),
      name TEXT NOT NULL, name_key TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
      frequency TEXT NOT NULL CHECK(frequency IN ('week','month')), due_day INTEGER NOT NULL,
      start_date TEXT NOT NULL, next_due TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      version INTEGER NOT NULL DEFAULT 0, UNIQUE(business_unit_id,name_key)
    )`,
    `CREATE TABLE warehouse_fixed_occurrences (
      id INTEGER PRIMARY KEY AUTOINCREMENT, business_unit_id INTEGER NOT NULL REFERENCES business_units(id),
      fixed_expense_id INTEGER NOT NULL REFERENCES warehouse_fixed_expenses(id), due_date TEXT NOT NULL,
      concept TEXT NOT NULL, description TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
      expense_id INTEGER UNIQUE REFERENCES warehouse_expenses(id), UNIQUE(fixed_expense_id,due_date)
    )`,
    'CREATE INDEX warehouse_fixed_pending ON warehouse_fixed_occurrences(business_unit_id,due_date,expense_id)',
    'CREATE INDEX warehouse_fixed_schedule ON warehouse_fixed_expenses(business_unit_id,active,next_due)',
    `CREATE TABLE warehouse_payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT, business_unit_id INTEGER NOT NULL REFERENCES business_units(id),
      name TEXT NOT NULL, name_key TEXT NOT NULL, surcharge_bps INTEGER NOT NULL CHECK(surcharge_bps BETWEEN 0 AND 10000),
      kind TEXT NOT NULL CHECK(kind IN ('cash','transfer','other')), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      version INTEGER NOT NULL DEFAULT 0, UNIQUE(business_unit_id,name_key)
    )`,
    `INSERT INTO warehouse_payment_methods(business_unit_id,name,name_key,surcharge_bps,kind)
      SELECT id,'Efectivo','efectivo',0,'cash' FROM business_units WHERE code='WAREHOUSE'`,
    `INSERT INTO warehouse_payment_methods(business_unit_id,name,name_key,surcharge_bps,kind)
      SELECT id,'Transferencia','transferencia',0,'transfer' FROM business_units WHERE code='WAREHOUSE'`,
    `CREATE TABLE warehouse_payment_parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_id INTEGER REFERENCES warehouse_receipts(id),
      account_movement_id INTEGER REFERENCES account_movements(id), method_id INTEGER NOT NULL REFERENCES warehouse_payment_methods(id),
      method_name TEXT NOT NULL, kind TEXT NOT NULL, base_cents INTEGER NOT NULL, surcharge_bps INTEGER NOT NULL,
      surcharge_cents INTEGER NOT NULL, CHECK((receipt_id IS NULL) != (account_movement_id IS NULL))
    )`,
    `CREATE INDEX warehouse_payment_parts_receipt ON warehouse_payment_parts(receipt_id)`,
    `CREATE INDEX warehouse_payment_parts_account ON warehouse_payment_parts(account_movement_id)`,
    `CREATE TABLE warehouse_settings_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, business_unit_id INTEGER NOT NULL REFERENCES business_units(id),
      entity TEXT NOT NULL, entity_id INTEGER NOT NULL, snapshot TEXT NOT NULL, user_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL
    )`,
  ],
};
