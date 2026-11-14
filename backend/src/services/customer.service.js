import { warehouseAccountPayment } from "./warehouseAccountPayment.service.js";
import { CustomerModel } from "../models/customer.model.js";
import { AccountMovementModel } from "../models/accountMovement.model.js";
import { CashRegisterModel } from "../models/cashRegister.model.js";
import { PaymentMethodModel } from "../models/paymentMethod.model.js";
import { TransactionModel } from "../models/transaction.model.js";
import { getArgentinaTime } from "../db/timeUtils.js";
import { isAccountMethod, round2 } from "../constants.js";
import { db } from "../db/client.js";
import { accountMovements, accountPaymentDetails, customers } from "../db/schema.js";
import { and, eq, sql } from "drizzle-orm";

function debtFrom({ charges = 0, payments = 0 }) {
  return Math.max(0, round2(charges - payments));
}

function normalizeDocument(document) {
  return String(document || "").trim();
}

function parseDetail(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizePaymentEntries({ payments, amount, methodName }, availableMethods) {
  const rawEntries = Array.isArray(payments) && payments.length > 0
    ? payments
    : [{ amount, methodName }];
  if (!rawEntries.length) throw { status: 400, message: "Indicá al menos un método de pago." };

  return rawEntries.map((entry) => {
    const value = round2(entry?.amount);
    if (!Number.isFinite(value) || value <= 0) {
      throw { status: 400, message: "El importe de cada método debe ser mayor a cero." };
    }
    const requestedId = Number(entry?.paymentMethodId ?? entry?.methodId);
    const requestedName = String(entry?.methodName || "").trim();
    const matched = Number.isInteger(requestedId) && requestedId > 0
      ? availableMethods.find((method) => method.id === requestedId)
      : availableMethods.find((method) => method.name.trim().toLowerCase() === requestedName.toLowerCase());
    if (!matched) throw { status: 400, message: "Método de pago inválido." };
    if (isAccountMethod(matched.name)) {
      throw { status: 400, message: "No se puede saldar una cuenta con cuenta corriente." };
    }
    return { paymentMethodId: matched.id, methodName: matched.name, amount: value };
  });
}

async function requireCustomer(id, businessUnit = null) {
  const customer = await CustomerModel.findById(Number(id), businessUnit?.id);
  if (!customer) throw { status: 404, message: "Cliente no encontrado." };
  return customer;
}

export const CustomerService = {
  async list({ search } = {}, businessUnit = null) {
    const [customers, balances] = await Promise.all([
      CustomerModel.findAll(businessUnit?.id),
      AccountMovementModel.balances(),
    ]);

    const balanceByCustomer = new Map(balances.map((b) => [b.customerId, b]));

    const term = String(search || "").trim().toLowerCase();
    return customers
      .filter((c) => {
        if (!term) return true;
        return (
          `${c.name} ${c.lastName}`.toLowerCase().includes(term) ||
          String(c.document).toLowerCase().includes(term)
        );
      })
      .map((c) => ({ ...c, debt: debtFrom(balanceByCustomer.get(c.id) || {}) }))
      .sort((a, b) => b.debt - a.debt);
  },

  async getByDocument(document, businessUnit = null) {
    const value = normalizeDocument(document);
    if (!value) throw { status: 400, message: "El documento es requerido." };

    const customer = await CustomerModel.findByDocument(value, businessUnit?.id);
    if (!customer) throw { status: 404, message: "No existe un cliente con ese documento." };

    const balance = await AccountMovementModel.balanceByCustomerId(customer.id);
    return { ...customer, debt: debtFrom(balance) };
  },

  async create({ name, lastName, document, phone, initialDebt }, businessUnit = null) {
    if (!name?.trim()) throw { status: 400, message: "El nombre es requerido." };

    const documentValue = normalizeDocument(document);
    if (!documentValue) throw { status: 400, message: "El documento es requerido." };

    const debt = round2(initialDebt ?? 0);
    if (!Number.isFinite(debt) || debt < 0) throw { status: 400, message: "La deuda inicial no puede ser negativa." };

    const { datetime } = getArgentinaTime();
    try {
      return await db.transaction(async (tx) => {
        const existing = await tx.select().from(customers).where(businessUnit?.id
          ? and(eq(customers.document, documentValue), eq(customers.businessUnitId, businessUnit.id))
          : eq(customers.document, documentValue)).then((rows) => rows[0]);
        if (existing) throw { status: 409, message: "Ya existe un cliente con ese documento." };
        const [created] = await tx.insert(customers).values({ name: name.trim(), lastName: lastName?.trim() || "", document: documentValue, phone: phone?.trim() || null, isActive: true, businessUnitId: businessUnit?.id || null, createdAt: datetime }).returning();
        if (debt > 0) await tx.insert(accountMovements).values({ customerId: created.id, type: "cargo", amount: debt, transactionId: null, methodName: null, detail: JSON.stringify([{ name: "Deuda inicial", quantity: 1, total: debt }]), registerId: null, userId: null, businessUnitId: businessUnit?.id || null, createdAt: datetime });
        return { ...created, debt };
      });
    } catch (error) {
      if (String(error?.message || "").includes("customers.document")) throw { status: 409, message: "Ya existe un cliente con ese documento." };
      throw error;
    }
  },

  async getDetail(id, businessUnit = null) {
    const customer = await requireCustomer(id, businessUnit);
    const [balance, movements] = await Promise.all([
      AccountMovementModel.balanceByCustomerId(customer.id),
      AccountMovementModel.findByCustomerId(customer.id),
    ]);

    const timeline = [];
    for (const movement of movements) {
      let items = parseDetail(movement.detail);
      // Ventas anteriores al snapshot: reconstruir desde los ítems de la venta
      if (movement.type === "cargo" && items.length === 0 && movement.transactionId) {
        const txItems = await TransactionModel.findItemsByTransactionId(movement.transactionId);
        items = txItems.map((i) => ({
          name: i.productName,
          quantity: i.quantity,
          total: i.total,
        }));
      }

      timeline.push({
        id: movement.id,
        type: movement.type,
        amount: movement.amount,
        methodName: movement.methodName,
        transactionId: movement.transactionId,
        createdAt: movement.createdAt,
        description: movement.type === "pago" ? movement.detail : null,
        paymentDetails: movement.paymentDetails || [],
        items: movement.type === "cargo" ? items : [],
        isReversal: movement.type === "reversion_cargo",
      });
    }

    return {
      ...customer,
      debt: debtFrom(balance),
      totalCharges: round2(balance.charges),
      totalPayments: round2(balance.payments),
      movements: timeline,
    };
  },

  // Cargo generado por una venta: solo la porción fiada, no el total de la venta.
  async chargeSale({ customerId, amount, transactionId, items, registerId, userId }, businessUnit = null) {
    const value = round2(amount);
    if (value <= 0) throw { status: 400, message: "El monto a cuenta debe ser mayor a cero." };

    const customer = await requireCustomer(customerId, businessUnit);
    const { datetime } = getArgentinaTime();

    return AccountMovementModel.create({
      customerId: customer.id,
      type: "cargo",
      amount: value,
      transactionId: transactionId || null,
      methodName: null,
      detail: JSON.stringify(
        (items || []).map((i) => ({
          name: i.name || i.productName,
          quantity: Number(i.quantity),
          total: Number(i.total),
        }))
      ),
      registerId: registerId || null,
      userId: userId || null,
      createdAt: datetime,
      businessUnitId: businessUnit?.id || customer.businessUnitId || null,
    });
  },

  async registerPayment(id, { payments, amount, methodName, description, idempotencyKey }, userId, businessUnit = null) {
    if (businessUnit?.code === 'WAREHOUSE') return warehouseAccountPayment(businessUnit,id,{payments,amount,methodName,description,idempotencyKey},userId);
    const customer = await requireCustomer(id, businessUnit);
    const availableMethods = await PaymentMethodModel.findAll();
    const normalizedPayments = normalizePaymentEntries({ payments, amount, methodName }, availableMethods);
    // Los recargos se aplican a ventas; este flujo cancela una deuda ya emitida.
    // Por compatibilidad, cada importe informado reduce la deuda y es el mismo que ingresa a Caja.
    const value = round2(normalizedPayments.reduce((sum, payment) => sum + payment.amount, 0));
    const requestKey = String(idempotencyKey || "").trim() || null;

    const openRegister = businessUnit?.code === "WAREHOUSE" ? null : await CashRegisterModel.findOpen();
    if (businessUnit?.code !== "WAREHOUSE" && !openRegister) {
      throw {
        status: 400,
        message: "No hay una caja abierta. Abrí la caja antes de registrar cobros.",
      };
    }

    const { datetime } = getArgentinaTime();
    return db.transaction(async (tx) => {
      if (requestKey) {
        const duplicate = await tx.select().from(accountMovements).where(and(
          eq(accountMovements.businessUnitId, businessUnit?.id || customer.businessUnitId || null),
          eq(accountMovements.idempotencyKey, requestKey)
        )).then((rows) => rows[0]);
        if (duplicate) {
          const details = await tx.select().from(accountPaymentDetails).where(eq(accountPaymentDetails.accountMovementId, duplicate.id));
          const balance = await tx.select({
            charges: sql`COALESCE(SUM(CASE WHEN ${accountMovements.type} = 'cargo' THEN ${accountMovements.amount} WHEN ${accountMovements.type} = 'reversion_cargo' THEN -${accountMovements.amount} ELSE 0 END), 0)`,
            payments: sql`COALESCE(SUM(CASE WHEN ${accountMovements.type} = 'pago' THEN ${accountMovements.amount} ELSE 0 END), 0)`,
          }).from(accountMovements).where(eq(accountMovements.customerId, customer.id)).then((rows) => rows[0]);
          return { ...duplicate, paymentDetails: details, debt: debtFrom(balance), duplicated: true };
        }
      }
      const balance = await tx.select({
        charges: sql`COALESCE(SUM(CASE WHEN ${accountMovements.type} = 'cargo' THEN ${accountMovements.amount} WHEN ${accountMovements.type} = 'reversion_cargo' THEN -${accountMovements.amount} ELSE 0 END), 0)`,
        payments: sql`COALESCE(SUM(CASE WHEN ${accountMovements.type} = 'pago' THEN ${accountMovements.amount} ELSE 0 END), 0)`,
      }).from(accountMovements).where(eq(accountMovements.customerId, customer.id)).then((rows) => rows[0]);
      const debt = debtFrom({ charges: Number(balance?.charges || 0), payments: Number(balance?.payments || 0) });
      if (debt <= 0) throw { status: 400, message: "El cliente no tiene deuda pendiente." };
      if (value > debt) throw { status: 400, message: `El pago no puede superar la deuda actual ($${debt.toFixed(2)}).` };
      const [movement] = await tx.insert(accountMovements).values({
        customerId: customer.id, type: "pago", amount: value, transactionId: null,
        methodName: normalizedPayments.length === 1 ? normalizedPayments[0].methodName : "Pago combinado",
        detail: String(description || "").trim() || null, registerId: openRegister?.id || null,
        userId: userId || null, businessUnitId: businessUnit?.id || customer.businessUnitId || null,
        createdAt: datetime, idempotencyKey: requestKey,
      }).returning();
      const details = await tx.insert(accountPaymentDetails).values(normalizedPayments.map((payment) => ({
        accountMovementId: movement.id,
        paymentMethodId: payment.paymentMethodId,
        methodName: payment.methodName,
        amount: payment.amount,
      }))).returning();
      return { ...movement, paymentDetails: details, debt: round2(debt - value), duplicated: false };
    });
  },

  async getPaymentsByRegister(registerId) {
    return AccountMovementModel.findPaymentsByRegisterId(Number(registerId));
  },

  async listMovements(businessUnit = null) {
    return AccountMovementModel.findRecentWithCustomers(businessUnit?.id);
  },
};
