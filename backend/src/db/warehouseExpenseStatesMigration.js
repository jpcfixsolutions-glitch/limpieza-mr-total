// Se aplica en un único batch transaccional y se registra en app_migrations.
// No reescribe importes, fechas originales, vínculos ni movimientos históricos.
export const warehouseExpenseStatesMigration = {
  id: '20261116_021_warehouse_expense_states',
  statements: [
    "ALTER TABLE warehouse_expenses ADD COLUMN status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid'))",
    'ALTER TABLE warehouse_expenses ADD COLUMN paid_at TEXT',
    'ALTER TABLE warehouse_expenses ADD COLUMN status_changed_at TEXT',
    'ALTER TABLE warehouse_fixed_occurrences ADD COLUMN created_at TEXT',
    `INSERT INTO warehouse_expense_audit(expense_id,action,snapshot,user_id,created_at)
      SELECT id,'migration_pending',json_object('legacy',1,'occurred_at',occurred_at,'created_at',created_at,'updated_at',updated_at,'version',version,'status','pending'),NULL,datetime('now','-3 hours') FROM warehouse_expenses`,
    "UPDATE warehouse_expenses SET status_changed_at=datetime('now','-3 hours')",
    `INSERT INTO warehouse_expenses(business_unit_id,concept,description,amount_cents,method,occurred_at,user_id,idempotency_key,created_at,updated_at,status_changed_at)
      SELECT business_unit_id,concept,description,amount_cents,'cash',due_date||' 00:00:00',NULL,'fixed:'||id,datetime('now','-3 hours'),datetime('now','-3 hours'),datetime('now','-3 hours')
      FROM warehouse_fixed_occurrences WHERE expense_id IS NULL`,
    `UPDATE warehouse_fixed_occurrences SET expense_id=(SELECT e.id FROM warehouse_expenses e
      WHERE e.business_unit_id=warehouse_fixed_occurrences.business_unit_id AND e.idempotency_key='fixed:'||warehouse_fixed_occurrences.id) WHERE expense_id IS NULL`,
    `INSERT INTO warehouse_expense_audit(expense_id,action,snapshot,user_id,created_at)
      SELECT e.id,'migration_obligation',json_object('status','pending','occurrence_id',f.id,'due_date',f.due_date),NULL,datetime('now','-3 hours')
      FROM warehouse_expenses e JOIN warehouse_fixed_occurrences f ON f.expense_id=e.id
      WHERE NOT EXISTS(SELECT 1 FROM warehouse_expense_audit a WHERE a.expense_id=e.id)`,
    `CREATE INDEX warehouse_expenses_paid_date ON warehouse_expenses(business_unit_id,status,paid_at) WHERE deleted_at IS NULL`,
    `CREATE TRIGGER warehouse_expenses_state_insert BEFORE INSERT ON warehouse_expenses
      WHEN (NEW.status='paid' AND NEW.paid_at IS NULL) OR (NEW.status='pending' AND NEW.paid_at IS NOT NULL)
      BEGIN SELECT RAISE(ABORT,'Estado y fecha de pago inconsistentes'); END`,
    `CREATE TRIGGER warehouse_expenses_state_update BEFORE UPDATE ON warehouse_expenses
      WHEN (NEW.status='paid' AND NEW.paid_at IS NULL) OR (NEW.status='pending' AND NEW.paid_at IS NOT NULL)
      BEGIN SELECT RAISE(ABORT,'Estado y fecha de pago inconsistentes'); END`,
  ],
};
