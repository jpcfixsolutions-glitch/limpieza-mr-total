import { CashRegisterModel } from "../models/cashRegister.model.js";
import { TransactionModel } from "../models/transaction.model.js";
import { DailyExpenseModel } from "../models/dailyExpense.model.js";
import { AccountMovementModel } from "../models/accountMovement.model.js";
import { getArgentinaTime } from "../db/timeUtils.js";
import { isAccountMethod, isCashMethod, round2 } from "../constants.js";

function isOpenRegisterConflict(error) {
  const message = String(error?.message || "");
  return message.includes("cash_registers_single_open_idx") || message.includes("cash_registers.is_open");
}

function buildClosedRegisterSummary(
  register,
  txs,
  payments,
  items,
  dailyExpenses,
  accountPayments = []
) {
  const totalIngresos = txs.reduce((sum, t) => sum + t.total, 0);

  // El fiado no ingresa plata a la caja: se excluye del arqueo
  const cobrados = payments.filter((p) => !isAccountMethod(p.methodName));
  const totalCuentaCorriente = payments
    .filter((p) => isAccountMethod(p.methodName))
    .reduce((sum, p) => sum + p.amount, 0);

  // Los cobros de deudas previas sí entran al arqueo según su método
  const cobrosEfectivo = accountPayments
    .filter((p) => isCashMethod(p.methodName))
    .reduce((sum, p) => sum + p.amount, 0);
  const cobrosVirtual = accountPayments
    .filter((p) => !isCashMethod(p.methodName))
    .reduce((sum, p) => sum + p.amount, 0);

  const totalEfectivo =
    cobrados.filter((p) => isCashMethod(p.methodName)).reduce((sum, p) => sum + p.amount, 0) +
    cobrosEfectivo;
  const totalTransferencia =
    cobrados.filter((p) => !isCashMethod(p.methodName)).reduce((sum, p) => sum + p.amount, 0) +
    cobrosVirtual;
  const totalSurcharges = cobrados.reduce(
    (sum, p) => sum + (p.amount - p.baseAmount),
    0
  );

  const surchargeBreakdown = {};
  for (const p of cobrados) {
    if (p.surchargePercent > 0) {
      surchargeBreakdown[p.methodName] =
        (surchargeBreakdown[p.methodName] || 0) + (p.amount - p.baseAmount);
    }
  }

  const soldItemsMap = {};
  for (const item of items) {
    if (!soldItemsMap[item.productName]) {
      soldItemsMap[item.productName] = { name: item.productName, quantity: 0, total: 0 };
    }
    soldItemsMap[item.productName].quantity += item.quantity;
    soldItemsMap[item.productName].total += item.total;
  }

  const totalGastosEfectivo = dailyExpenses
    .filter((e) => e.method === "efectivo")
    .reduce((sum, e) => sum + e.amount, 0);

  const calculatedCashBalance = round2(register.initialCash + totalEfectivo - totalGastosEfectivo);

  return {
    id: register.id,
    openedAt: register.openedAt,
    closedAt: register.closedAt,
    initialCash: register.initialCash,
    expectedCash: register.expectedCash !== null && register.expectedCash !== undefined ? register.expectedCash : calculatedCashBalance,
    countedCash: register.countedCash ?? null,
    cashDifference: register.cashDifference ?? null,
    arqueoNotes: register.arqueoNotes ?? null,
    nextInitialCash: register.nextInitialCash ?? null,
    transactionsCount: txs.length,
    totalIngresos,
    totalEfectivo,
    totalTransferencia,
    totalSurcharges,
    totalCuentaCorriente,
    totalCobrosCuenta: cobrosEfectivo + cobrosVirtual,
    surchargeBreakdown: Object.entries(surchargeBreakdown).map(([method, amount]) => ({
      method,
      amount,
    })),
    soldItems: Object.values(soldItemsMap),
    dailyExpenses: dailyExpenses.map((e) => ({
      id: e.id,
      reason: e.reason,
      amount: e.amount,
      method: e.method,
      createdAt: e.createdAt,
    })),
    totalGastosEfectivo,
    cashBalance: calculatedCashBalance,
  };
}

export const CashRegisterService = {
  async getStatus() {
    const register = await CashRegisterModel.findOpen();
    const lastClosed = await CashRegisterModel.findLastClosed();
    const suggestedInitialCash = lastClosed
      ? (lastClosed.nextInitialCash ?? lastClosed.countedCash ?? lastClosed.initialCash ?? 0)
      : 0;
    return { isOpen: !!register, register: register || null, suggestedInitialCash };
  },

  async open(userId, initialCash) {
    const existing = await CashRegisterModel.findOpen();
    if (existing) throw { status: 409, message: "Ya hay una caja abierta." };

    const amount = Number(initialCash);
    if (!Number.isFinite(amount) || amount < 0) {
      throw { status: 400, message: "El monto inicial debe ser un número mayor o igual a 0." };
    }

    const { datetime } = getArgentinaTime();
    try {
      return await CashRegisterModel.create({
        openedBy: userId,
        initialCash: amount,
        isOpen: true,
        openedAt: datetime,
      });
    } catch (error) {
      if (isOpenRegisterConflict(error)) {
        throw { status: 409, message: "Ya hay una caja abierta." };
      }
      throw error;
    }
  },

  async close(registerId, { countedCash, arqueoNotes, nextInitialCash } = {}) {
    const register = await CashRegisterModel.findById(registerId);
    if (!register) throw { status: 404, message: "Caja no encontrada." };
    if (!register.isOpen) throw { status: 400, message: "La caja ya está cerrada." };

    const counted = Number(countedCash);
    if (
      countedCash === undefined ||
      countedCash === null ||
      String(countedCash).trim() === "" ||
      !Number.isFinite(counted) ||
      counted < 0
    ) {
      throw { status: 400, message: "El efectivo contado es obligatorio y debe ser un número mayor o igual a 0." };
    }

    const nextInitial =
      nextInitialCash !== undefined && nextInitialCash !== null && String(nextInitialCash).trim() !== ""
        ? Number(nextInitialCash)
        : counted;

    if (!Number.isFinite(nextInitial) || nextInitial < 0) {
      throw { status: 400, message: "El fondo para la próxima apertura debe ser un número mayor o igual a 0." };
    }

    // Recalcular expectedCash en el backend usando datos persistidos
    const txs = await TransactionModel.findByRegisterId(register.id);
    const allPayments = [];
    for (const tx of txs) {
      const payments = await TransactionModel.findPaymentsByTransactionId(tx.id);
      allPayments.push(...payments);
    }
    const dailyExpenses = await DailyExpenseModel.findByRegisterId(register.id);
    const accountPayments = await AccountMovementModel.findPaymentsByRegisterId(register.id);

    const cobrados = allPayments.filter((p) => !isAccountMethod(p.methodName));
    const cobrosEfectivo = accountPayments
      .filter((p) => isCashMethod(p.methodName))
      .reduce((sum, p) => sum + p.amount, 0);

    const totalEfectivo =
      cobrados.filter((p) => isCashMethod(p.methodName)).reduce((sum, p) => sum + p.amount, 0) +
      cobrosEfectivo;

    const totalGastosEfectivo = dailyExpenses
      .filter((e) => e.method === "efectivo")
      .reduce((sum, e) => sum + e.amount, 0);

    const expectedCash = round2(register.initialCash + totalEfectivo - totalGastosEfectivo);
    const cashDifference = round2(counted - expectedCash);
    const notes = arqueoNotes ? String(arqueoNotes).trim() : null;

    const { datetime: closedAt } = getArgentinaTime();

    const updated = await CashRegisterModel.closeAtomically(registerId, {
      isOpen: false,
      closedAt,
      expectedCash,
      countedCash: counted,
      cashDifference,
      arqueoNotes: notes,
      nextInitialCash: nextInitial,
    });

    if (!updated) {
      throw { status: 400, message: "La caja ya fue cerrada o no se encuentra disponible." };
    }

    return { message: "Caja cerrada correctamente.", register: updated };
  },

  async getClosed() {
    const closedRegisters = await CashRegisterModel.findClosed();
    const result = [];

    for (const register of closedRegisters) {
      const txs = await TransactionModel.findByRegisterId(register.id);
      const allPayments = [];
      const allItems = [];
      const detailedTransactions = [];

      for (const tx of txs) {
        const payments = await TransactionModel.findPaymentsByTransactionId(tx.id);
        const items = await TransactionModel.findItemsByTransactionId(tx.id);
        allPayments.push(...payments);
        allItems.push(...items);
        detailedTransactions.push({
          id: tx.id,
          date: tx.date,
          time: tx.time,
          total: tx.total,
          payments: payments.map((payment) => ({
            methodName: payment.methodName,
            amount: payment.amount,
          })),
          items: items.map((item) => ({
            productName: item.productName,
            quantity: item.quantity,
            price: item.price,
            total: item.total,
            saleMode: item.saleMode,
            packSize: item.packSize,
          })),
        });
      }

      const dailyExpenses = await DailyExpenseModel.findByRegisterId(register.id);
      const accountPayments = await AccountMovementModel.findPaymentsByRegisterId(register.id);
      result.push({
        ...buildClosedRegisterSummary(
          register,
          txs,
          allPayments,
          allItems,
          dailyExpenses,
          accountPayments
        ),
        transactions: detailedTransactions,
      });
    }

    return result;
  },
};
