import { useState } from "react";
import { X, Printer, Tag, NotebookPen, IdCard } from "lucide-react";
import { CustomerPickerModal } from "./CustomerPickerModal.jsx";
import { ACCOUNT_METHOD_NAME } from "../constants.js";

export function PaymentModal({ total, paymentMethods, onClose, onConfirm }) {
  const [payments, setPayments] = useState([
    { methodId: String(paymentMethods[0]?.id || ""), amount: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState(null); // número 0-100 o null
  const [accountEnabled, setAccountEnabled] = useState(false);
  const [accountAmount, setAccountAmount] = useState("");
  const [customer, setCustomer] = useState(null);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

  const applyDiscount = () => {
    const val = parseFloat(discountInput);
    if (isNaN(val) || val < 0 || val > 100) return;
    setAppliedDiscount(val);
  };

  const removeDiscount = () => {
    setAppliedDiscount(null);
    setDiscountInput("");
  };

  const discountedTotal = appliedDiscount !== null
    ? Math.round((total * (1 - appliedDiscount / 100)) * 100) / 100
    : total;
  const discountAmount = total - discountedTotal;

  const getSurcharge = (methodId) => {
    const m = paymentMethods.find((m) => String(m.id) === String(methodId));
    return m?.surcharge || 0;
  };

  const getMethodName = (methodId) => {
    const m = paymentMethods.find((m) => String(m.id) === String(methodId));
    return m?.name || "";
  };

  const isCash = (methodId) =>
    getMethodName(methodId).toLowerCase().includes("efectivo");

  const addPaymentMethod = () => {
    const usedIds = payments.map((p) => p.methodId);
    const nextMethod = paymentMethods.find((m) => !usedIds.includes(String(m.id)));
    if (!nextMethod) return;
    setPayments([...payments, { methodId: String(nextMethod.id), amount: "" }]);
  };

  const availableMethodsFor = (index) =>
    paymentMethods.filter(
      (m) =>
        String(m.id) === payments[index].methodId ||
        !payments.some((p, i) => i !== index && String(p.methodId) === String(m.id))
    );

  const updatePayment = (index, field, value) => {
    const newPayments = [...payments];
    if (field === "methodId") {
      newPayments[index].methodId = value;
    } else {
      // Fix 3: eliminar ceros a la izquierda al escribir
      newPayments[index].amount = value === "" ? "" : value.replace(/^0+(?=\d)/, "");
    }
    setPayments(newPayments);
  };

  const removePayment = (index) => {
    if (payments.length > 1) setPayments(payments.filter((_, i) => i !== index));
  };

  const paidBaseTotal = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const accountBase = accountEnabled ? Number(accountAmount) || 0 : 0;
  const pendingBeforeAccount = Math.round((discountedTotal - paidBaseTotal) * 100) / 100;
  const remainingBase = discountedTotal - paidBaseTotal - accountBase;

  // Con cuenta corriente el importe debe cerrar exacto: no hay vuelto sobre lo fiado
  const allCash = !accountEnabled && payments.every((p) => isCash(p.methodId));
  const canConfirm = accountEnabled
    ? !!customer && accountBase > 0 && Math.abs(remainingBase) < 0.01
    : allCash
      ? paidBaseTotal >= discountedTotal
      : Math.abs(remainingBase) < 0.01;

  const change = allCash && paidBaseTotal > discountedTotal ? paidBaseTotal - discountedTotal : 0;

  const finalTotalWithSurcharges = payments.reduce((sum, p) => {
    const amt = Number(p.amount) || 0;
    const surcharge = getSurcharge(p.methodId);
    return sum + amt * (1 + surcharge / 100);
  }, accountBase);

  // Solo mostrar fila de recargos si al menos un método activo tiene recargo > 0
  const hasActiveSurcharge = payments.some(
    (p) => getSurcharge(p.methodId) > 0 && (Number(p.amount) || 0) > 0
  );

  const enableAccount = () => {
    setAccountEnabled(true);
    setAccountAmount(String(Math.max(0, pendingBeforeAccount)));
  };

  const disableAccount = () => {
    setAccountEnabled(false);
    setAccountAmount("");
    setCustomer(null);
  };

  const chargeFullToAccount = () => {
    setAccountAmount(String(Math.max(0, pendingBeforeAccount)));
  };

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const mapped = payments.map((p) => {
        const surcharge = getSurcharge(p.methodId);
        const base = !accountEnabled && isCash(p.methodId) && payments.length === 1
          ? discountedTotal
          : (Number(p.amount) || 0);
        const withSurcharge = base * (1 + surcharge / 100);
        return {
          methodId: p.methodId,
          type: getMethodName(p.methodId),
          baseAmount: base,
          surchargePercent: surcharge,
          amount: withSurcharge,
          finalAmount: withSurcharge,
        };
      });

      const finalPayments = accountEnabled
        ? mapped.filter((p) => p.baseAmount > 0)
        : mapped;

      if (accountEnabled) {
        finalPayments.push({
          methodId: null,
          type: ACCOUNT_METHOD_NAME,
          baseAmount: accountBase,
          surchargePercent: 0,
          amount: accountBase,
          finalAmount: accountBase,
        });
      }

      await onConfirm(finalPayments, { customerId: customer?.id ?? null });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-2xl w-full max-w-2xl border border-surface shadow-2xl max-h-[92vh] flex flex-col">
        <div className="p-6 border-b border-surface flex items-center justify-between shrink-0">
          <h2 className="text-primary font-bold text-2xl">Procesar Pago</h2>
          <button onClick={onClose} className="text-foreground/60 hover:text-foreground transition-colors"><X size={24} /></button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          <div className="bg-surface rounded-xl p-6 space-y-3 shadow-sm border border-foreground/15">
            {/* Total original */}
            <div className="flex items-center justify-between">
              <span className="text-foreground/80 font-medium">Total a cobrar:</span>
              <span className={`text-2xl font-black ${appliedDiscount !== null ? "line-through text-foreground/40 text-lg" : "text-foreground"}`}>
                ${total.toFixed(2)}
              </span>
            </div>

            {/* Sección descuento */}
            <div className="pt-2 border-t border-foreground/15">
              {appliedDiscount === null ? (
                /* Input para ingresar descuento */
                <div className="flex items-center gap-2">
                  <Tag size={16} className="text-foreground/50 shrink-0" />
                  <span className="text-foreground/70 font-medium text-sm shrink-0">Descuento:</span>
                  <div className="relative flex-1">
                    <input
                      type="number"
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => e.key === "Enter" && applyDiscount()}
                      placeholder="0"
                      min="0"
                      max="100"
                      step="1"
                      className="w-full bg-surface text-foreground font-bold rounded-lg px-3 py-2 pr-7 border border-foreground/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-sm text-sm"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/50 font-bold text-sm">%</span>
                  </div>
                  <button
                    onClick={applyDiscount}
                    disabled={!discountInput || parseFloat(discountInput) <= 0 || parseFloat(discountInput) > 100}
                    className="bg-secondary hover:brightness-125 disabled:bg-surface disabled:text-foreground/40 text-foreground font-bold px-4 py-2 rounded-lg text-sm transition-all shadow-sm shrink-0"
                  >
                    Aplicar
                  </button>
                </div>
              ) : (
                /* Descuento aplicado */
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Tag size={16} className="text-success shrink-0" />
                      <span className="text-success font-bold text-sm">Descuento {appliedDiscount}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-success font-bold">-${discountAmount.toFixed(2)}</span>
                      <button
                        onClick={removeDiscount}
                        className="text-foreground/40 hover:text-red-500 transition-colors"
                        title="Quitar descuento"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-success/10 border border-success/40 rounded-lg px-4 py-2">
                    <span className="text-success font-bold text-sm">Total con descuento:</span>
                    <span className="text-success text-2xl font-black">${discountedTotal.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            {hasActiveSurcharge && (
              <div className="flex items-center justify-between pt-2 border-t border-foreground/15">
                <span className="text-primary font-bold">Total con recargos:</span>
                <span className="text-primary text-2xl font-black">${finalTotalWithSurcharges.toFixed(2)}</span>
              </div>
            )}

            {/* Estado del pago */}
            {(paidBaseTotal > 0 || accountBase > 0) && (
              <div className="pt-2 border-t border-foreground/15">
                {remainingBase > 0.01 ? (
                  // Falta plata — cualquier método
                  <div className="flex items-center justify-between">
                    <span className="text-primary font-bold">Falta cubrir:</span>
                    <span className="text-foreground font-bold">${remainingBase.toFixed(2)}</span>
                  </div>
                ) : remainingBase < -0.01 && allCash ? (
                  // Pagó de más en efectivo → vuelto permitido
                  <div className="flex items-center justify-between">
                    <span className="text-success font-bold">Vuelto a entregar:</span>
                    <span className="text-success text-xl font-black">${change.toFixed(2)}</span>
                  </div>
                ) : remainingBase < -0.01 ? (
                  // Pagó de más con no-efectivo o cuenta corriente → error
                  <div className="flex items-center justify-between">
                    <span className="text-red-500 font-bold">Monto excedido en:</span>
                    <span className="text-red-500 font-black">${Math.abs(remainingBase).toFixed(2)}</span>
                  </div>
                ) : (
                  // Monto exacto
                  <div className="flex items-center justify-between">
                    <span className="text-success font-bold">Monto exacto</span>
                    <span className="text-success font-black">✓</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-foreground font-bold">
                {accountEnabled ? "Saldo a cobrar ahora" : "Métodos de Pago"}
              </h3>
              {payments.length < paymentMethods.length && (
                <button
                  onClick={addPaymentMethod}
                  className="text-primary font-bold hover:text-foreground text-sm transition-colors"
                >
                  + Agregar Método
                </button>
              )}
            </div>

            {accountEnabled && pendingBeforeAccount - accountBase < 0.01 && (
              <p className="text-foreground/60 font-medium text-sm">
                La compra se carga completa a la cuenta: no hay saldo a cobrar en el momento.
              </p>
            )}

            {payments.map((payment, index) => {
              const surcharge = getSurcharge(payment.methodId);
              const amountNum = Number(payment.amount) || 0;
              const surchargeAmount = amountNum * (surcharge / 100);
              const isThisCash = isCash(payment.methodId);

              return (
                <div key={index} className="bg-surface border border-foreground/15 shadow-sm rounded-lg p-4 flex gap-4 items-start">
                  <div className="flex-1">
                    <select
                      value={payment.methodId}
                      onChange={(e) => updatePayment(index, "methodId", e.target.value)}
                      className="w-full bg-background text-foreground font-bold rounded-lg px-4 py-3 border border-foreground/15 focus:border-primary outline-none shadow-sm"
                    >
                      {availableMethodsFor(index).map((m) => (
                        <option key={m.id} value={String(m.id)}>
                          {m.name} {m.surcharge > 0 ? `(+${m.surcharge}%)` : ""}
                        </option>
                      ))}
                    </select>
                    {!isThisCash && payments.length > 1 && (
                      <p className="text-foreground/60 font-medium text-xs mt-1 ml-1">Monto exacto requerido</p>
                    )}
                  </div>

                  <div className="flex-1">
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/60 font-bold">$</span>
                      <input
                        type="number"
                        value={payment.amount}
                        onChange={(e) => updatePayment(index, "amount", e.target.value)}
                        onFocus={(e) => e.target.select()}
                        placeholder="0.00"
                        className="w-full bg-background text-foreground font-bold rounded-lg pl-8 pr-4 py-3 border border-foreground/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-sm"
                        step="0.01"
                        min="0"
                      />
                    </div>
                    {surcharge > 0 && amountNum > 0 && (
                      <p className="text-primary font-bold text-xs mt-2 ml-1">+ recargo: ${surchargeAmount.toFixed(2)}</p>
                    )}
                  </div>

                  {payments.length > 1 && (
                    <button onClick={() => removePayment(index)} className="text-foreground/50 hover:text-red-500 p-3 transition-colors mt-1">
                      <X size={20} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Cuenta corriente */}
          <div className="space-y-4">
            {!accountEnabled ? (
              <button
                onClick={enableAccount}
                className="w-full bg-surface hover:bg-primary/10 text-foreground font-bold py-3 rounded-xl border border-foreground/15 transition-all shadow-sm flex items-center justify-center gap-2"
              >
                <NotebookPen size={18} />
                Cargar a cuenta corriente
              </button>
            ) : (
              <div className="bg-primary/10 border border-primary/40 rounded-xl p-4 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-foreground font-bold flex items-center gap-2">
                    <NotebookPen size={18} className="text-secondary" />
                    Cuenta corriente
                  </h3>
                  <button
                    onClick={disableAccount}
                    className="text-foreground/50 hover:text-red-500 transition-colors"
                    title="Quitar cuenta corriente"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div>
                  <label className="text-foreground/80 font-bold text-sm block mb-2">Monto a cuenta</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/60 font-bold">$</span>
                      <input
                        type="number"
                        value={accountAmount}
                        onChange={(e) => setAccountAmount(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        className="w-full bg-background text-foreground font-bold rounded-lg pl-8 pr-4 py-3 border border-foreground/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-sm"
                        step="0.01"
                        min="0"
                      />
                    </div>
                    <button
                      onClick={chargeFullToAccount}
                      className="bg-secondary hover:brightness-125 text-foreground font-bold px-4 rounded-lg transition-all shadow-sm shrink-0"
                    >
                      Cargar totalidad
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-foreground/80 font-bold text-sm block mb-2">Cliente</label>
                  {customer ? (
                    <div className="bg-background border border-foreground/15 rounded-lg p-3 flex items-center justify-between gap-3 shadow-sm">
                      <div className="min-w-0">
                        <p className="text-foreground font-bold truncate">{customer.name} {customer.lastName}</p>
                        <p className="text-foreground/70 font-medium text-sm">
                          DNI {customer.document} · deuda previa ${Number(customer.debt || 0).toFixed(2)}
                        </p>
                      </div>
                      <button
                        onClick={() => setShowCustomerPicker(true)}
                        className="text-primary hover:text-foreground font-bold text-sm transition-colors shrink-0"
                      >
                        Cambiar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowCustomerPicker(true)}
                      className="w-full bg-background hover:bg-surface text-foreground font-bold py-3 rounded-lg border border-foreground/15 transition-all shadow-sm flex items-center justify-center gap-2"
                    >
                      <IdCard size={18} />
                      Buscar cliente por DNI
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-surface flex gap-4 shrink-0">
          <button onClick={onClose} className="flex-1 bg-surface hover:bg-primary/10 text-foreground font-bold py-4 rounded-xl transition-all shadow-sm">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || submitting}
            className="flex-1 bg-secondary hover:brightness-125 disabled:bg-surface disabled:text-foreground/50 disabled:cursor-not-allowed text-foreground font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-secondary/20"
          >
            <Printer size={20} />
            {submitting ? "Registrando..." : change > 0 ? `Confirmar — Dar vuelto $${change.toFixed(2)}` : "Confirmar e Imprimir Ticket"}
          </button>
        </div>
      </div>

      {showCustomerPicker && (
        <CustomerPickerModal
          initialDocument={customer?.document || ""}
          onClose={() => setShowCustomerPicker(false)}
          onSelect={(selected) => {
            setCustomer(selected);
            setShowCustomerPicker(false);
          }}
        />
      )}
    </div>
  );
}
