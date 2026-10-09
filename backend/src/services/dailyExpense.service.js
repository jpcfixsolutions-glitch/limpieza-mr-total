import { DailyExpenseModel } from "../models/dailyExpense.model.js";
import { CashRegisterModel } from "../models/cashRegister.model.js";
import { getArgentinaTime } from "../db/timeUtils.js";

export const DailyExpenseService = {
  async getAll() {
    return DailyExpenseModel.findAll();
  },

  async create({ reason, amount, method }) {
    if (!reason?.trim()) throw { status: 400, message: "El motivo es requerido." };
    if (!amount || Number(amount) <= 0) {
      throw { status: 400, message: "El monto debe ser mayor a cero." };
    }

    const validMethods = ["efectivo", "transferencia"];
    const methodValue = method?.toLowerCase() || "efectivo";
    if (!validMethods.includes(methodValue)) {
      throw { status: 400, message: "Método inválido. Debe ser 'efectivo' o 'transferencia'." };
    }

    const openRegister = await CashRegisterModel.findOpen();
    if (!openRegister) {
      throw { status: 400, message: "No hay una caja abierta. Abrí la caja antes de registrar gastos." };
    }

    const { datetime } = getArgentinaTime();
    const created = await DailyExpenseModel.create({
      reason: reason.trim(),
      amount: Number(amount),
      method: methodValue,
      registerId: openRegister.id,
      createdAt: datetime,
    });

    return created;
  },
};
