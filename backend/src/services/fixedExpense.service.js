import { FixedExpenseModel } from "../models/fixedExpense.model.js";

export const FixedExpenseService = {
  async getAll() {
    return FixedExpenseModel.findAll();
  },

  async create({ name, amount }) {
    if (!name?.trim()) throw { status: 400, message: "El nombre es requerido." };
    if (amount === undefined || Number(amount) < 0) {
      throw { status: 400, message: "El monto debe ser un número positivo." };
    }
    const [created] = await FixedExpenseModel.create({ name: name.trim(), amount: Number(amount) });
    return created;
  },

  async update(id, { name, amount }) {
    const existing = await FixedExpenseModel.findById(id);
    if (!existing) throw { status: 404, message: "Gasto fijo no encontrado." };

    const updateData = {};
    if (name?.trim()) updateData.name = name.trim();
    if (amount !== undefined) updateData.amount = Number(amount);

    const [updated] = await FixedExpenseModel.update(id, updateData);
    return updated;
  },

  async remove(id) {
    const existing = await FixedExpenseModel.findById(id);
    if (!existing) throw { status: 404, message: "Gasto fijo no encontrado." };
    await FixedExpenseModel.remove(id);
    return { message: "Gasto fijo eliminado." };
  },
};
