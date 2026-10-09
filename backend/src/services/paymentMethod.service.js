import { PaymentMethodModel } from "../models/paymentMethod.model.js";
import { ACCOUNT_METHOD_NAME, isAccountMethod } from "../constants.js";

function assertNotReserved(name) {
  if (isAccountMethod(name)) {
    throw {
      status: 400,
      message: `"${ACCOUNT_METHOD_NAME}" es un método reservado del sistema y no puede configurarse.`,
    };
  }
}

export const PaymentMethodService = {
  async getAll() {
    const methods = await PaymentMethodModel.findAll();
    return methods.filter((m) => !isAccountMethod(m.name));
  },

  async create({ name, surcharge }) {
    if (!name?.trim()) throw { status: 400, message: "El nombre es requerido." };
    assertNotReserved(name);
    const surchargeValue = Number(surcharge) || 0;
    if (surchargeValue < 0 || surchargeValue > 100) {
      throw { status: 400, message: "El recargo debe estar entre 0 y 100." };
    }
    const [created] = await PaymentMethodModel.create({ name: name.trim(), surcharge: surchargeValue });
    return created;
  },

  async update(id, { name, surcharge }) {
    const existing = await PaymentMethodModel.findById(id);
    if (!existing) throw { status: 404, message: "Método de pago no encontrado." };

    const updateData = {};
    if (name?.trim()) {
      assertNotReserved(name);
      updateData.name = name.trim();
    }
    if (surcharge !== undefined) {
      const surchargeValue = Number(surcharge);
      if (surchargeValue < 0 || surchargeValue > 100) {
        throw { status: 400, message: "El recargo debe estar entre 0 y 100." };
      }
      updateData.surcharge = surchargeValue;
    }

    const [updated] = await PaymentMethodModel.update(id, updateData);
    return updated;
  },

  async remove(id) {
    const existing = await PaymentMethodModel.findById(id);
    if (!existing) throw { status: 404, message: "Método de pago no encontrado." };
    await PaymentMethodModel.remove(id);
    return { message: "Método de pago eliminado." };
  },
};
