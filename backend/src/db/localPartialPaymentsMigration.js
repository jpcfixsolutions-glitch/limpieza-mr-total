export const localPartialPaymentsMigration = {
  id: '20261125_023_local_partial_payments',
  statements: [
    `CREATE TABLE local_expense_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL REFERENCES daily_expenses(id),
      amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
      method TEXT NOT NULL CHECK(method IN ('efectivo','transferencia')),
      paid_at TEXT NOT NULL,
      payment_register_id INTEGER REFERENCES cash_registers(id),
      observation TEXT NOT NULL DEFAULT '',
      idempotency_key TEXT NOT NULL UNIQUE,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL,
      reversed_at TEXT
    )`,
    'CREATE INDEX local_payments_expense ON local_expense_payments(expense_id)',
    'CREATE INDEX local_payments_date ON local_expense_payments(paid_at,payment_register_id)',
    `INSERT INTO local_expense_payments(expense_id,amount_cents,method,paid_at,payment_register_id,idempotency_key,user_id,created_at)
      SELECT id,CAST(ROUND(amount*100) AS INTEGER),method,paid_at,payment_register_id,'legacy:'||id,user_id,COALESCE(status_changed_at,paid_at)
      FROM daily_expenses WHERE status='paid'`,
    `CREATE TRIGGER local_payment_balance BEFORE INSERT ON local_expense_payments
      WHEN NEW.reversed_at IS NULL AND NEW.amount_cents >
        (SELECT CAST(ROUND(amount*100) AS INTEGER) FROM daily_expenses WHERE id=NEW.expense_id)
        - COALESCE((SELECT SUM(amount_cents) FROM local_expense_payments WHERE expense_id=NEW.expense_id AND reversed_at IS NULL),0)
      BEGIN SELECT RAISE(ABORT,'El pago supera el saldo pendiente'); END`,
  ],
};
