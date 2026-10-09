import { useState, useEffect } from "react";
import { Lock, X, CheckCircle2, TrendingUp, AlertTriangle, Banknote, Calculator, FileText } from "lucide-react";

export function ClosureModal({
  isOpen,
  onClose,
  onConfirm,
  initialCash = 0,
  cashSales = 0,
  cashExpenses = 0,
  otherPayments = 0,
  totalSales = 0,
}) {
  const expectedCash = initialCash + cashSales - cashExpenses;

  const [countedCash, setCountedCash] = useState("");
  const [nextInitialCash, setNextInitialCash] = useState("");
  const [isNextEdited, setIsNextEdited] = useState(false);
  const [arqueoNotes, setArqueoNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCountedCash("");
      setNextInitialCash("");
      setIsNextEdited(false);
      setArqueoNotes("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const countedNum = Number(countedCash);
  const hasCountedInput = countedCash !== "" && !isNaN(countedNum) && countedNum >= 0;

  const nextNum = Number(nextInitialCash);
  const hasNextInput = nextInitialCash !== "" && !isNaN(nextNum) && nextNum >= 0;

  const isValid = hasCountedInput && (nextInitialCash === "" || hasNextInput);

  const cashDifference = hasCountedInput ? Number((countedNum - expectedCash).toFixed(2)) : 0;

  const handleCountedChange = (e) => {
    const val = e.target.value;
    setCountedCash(val);
    if (!isNextEdited) {
      setNextInitialCash(val);
    }
  };

  const handleNextInitialChange = (e) => {
    setNextInitialCash(e.target.value);
    setIsNextEdited(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid || submitting) return;

    setSubmitting(true);
    try {
      await onConfirm({
        countedCash: countedNum,
        nextInitialCash: hasNextInput ? nextNum : countedNum,
        arqueoNotes,
      });
      onClose();
    } catch {
      // toast error handled by caller
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-background rounded-2xl w-full max-w-2xl border border-foreground/15 shadow-2xl overflow-hidden my-8">
        {/* Modal Header */}
        <div className="p-6 border-b border-foreground/15 flex items-center justify-between bg-surface/50">
          <h2 className="text-primary font-bold text-xl md:text-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary/20 text-secondary flex items-center justify-center">
              <Lock size={20} />
            </div>
            Cierre y Arqueo de Caja
          </h2>
          <button
            onClick={onClose}
            className="text-foreground/50 hover:text-foreground p-1 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Tarjetas Informativas de Arqueo */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-surface p-3.5 rounded-xl border border-foreground/15">
              <span className="text-foreground/70 font-medium text-xs block mb-1">Fondo Inicial</span>
              <span className="text-foreground font-black text-base md:text-lg">${initialCash.toFixed(2)}</span>
            </div>

            <div className="bg-surface p-3.5 rounded-xl border border-success/30">
              <span className="text-foreground/70 font-medium text-xs block mb-1">Ventas en Efectivo</span>
              <span className="text-success font-black text-base md:text-lg">+${cashSales.toFixed(2)}</span>
            </div>

            <div className="bg-surface p-3.5 rounded-xl border border-red-500/30">
              <span className="text-foreground/70 font-medium text-xs block mb-1">Gastos/Retiros Efectivo</span>
              <span className="text-red-500 font-black text-base md:text-lg">-${cashExpenses.toFixed(2)}</span>
            </div>

            <div className="bg-surface p-3.5 rounded-xl border border-primary/30">
              <span className="text-foreground/70 font-medium text-xs block mb-1">Efectivo Esperado</span>
              <span className="text-primary font-black text-base md:text-lg">${expectedCash.toFixed(2)}</span>
            </div>

            <div className="bg-surface p-3.5 rounded-xl border border-foreground/15">
              <span className="text-foreground/70 font-medium text-xs block mb-1">Otros Medios de Pago</span>
              <span className="text-foreground font-black text-base md:text-lg">${otherPayments.toFixed(2)}</span>
            </div>

            <div className="bg-surface p-3.5 rounded-xl border border-foreground/15">
              <span className="text-foreground/70 font-medium text-xs block mb-1">Ventas Totales Día</span>
              <span className="text-foreground font-black text-base md:text-lg">${totalSales.toFixed(2)}</span>
            </div>
          </div>

          {/* Banner de Diferencia en Tiempo Real */}
          {hasCountedInput ? (
            <div
              className={`p-4 rounded-xl border flex items-center gap-3 transition-all ${
                Math.abs(cashDifference) < 0.001
                  ? "bg-success/10 border-success/40 text-success"
                  : cashDifference > 0
                  ? "bg-blue-500/10 border-blue-500/40 text-blue-400"
                  : "bg-red-500/10 border-red-500/40 text-red-500"
              }`}
            >
              <div className="shrink-0">
                {Math.abs(cashDifference) < 0.001 ? (
                  <CheckCircle2 size={28} />
                ) : cashDifference > 0 ? (
                  <TrendingUp size={28} />
                ) : (
                  <AlertTriangle size={28} />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-base">
                    {Math.abs(cashDifference) < 0.001
                      ? "Caja correcta"
                      : cashDifference > 0
                      ? "Sobrante de efectivo"
                      : "Faltante de efectivo"}
                  </span>
                  <span className="font-black text-lg">
                    {Math.abs(cashDifference) < 0.001
                      ? "$0.00"
                      : cashDifference > 0
                      ? `+$${cashDifference.toFixed(2)}`
                      : `-$${Math.abs(cashDifference).toFixed(2)}`}
                  </span>
                </div>
                <p className="text-xs opacity-90 mt-0.5 font-medium">
                  {Math.abs(cashDifference) < 0.001
                    ? "El efectivo contado coincide exactamente con el saldo esperado."
                    : cashDifference > 0
                    ? "Hay más efectivo físico en caja que el total calculado por el sistema."
                    : "Hay menos efectivo físico en caja que el total calculado por el sistema."}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-surface p-4 rounded-xl border border-foreground/15 flex items-center gap-3 text-foreground/70">
              <Calculator size={24} className="shrink-0 text-primary" />
              <p className="text-xs font-medium">
                Ingresá el <span className="font-bold text-foreground">Efectivo contado</span> para calcular la diferencia en tiempo real.
              </p>
            </div>
          )}

          {/* Form Fields */}
          <div className="space-y-4">
            <div>
              <label className="text-foreground font-bold text-sm block mb-1.5 flex items-center justify-between">
                <span>Efectivo contado en caja <span className="text-red-500">*</span></span>
                <span className="text-xs text-foreground/60 font-normal">(Requerido)</span>
              </label>
              <div className="relative">
                <Banknote size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={countedCash}
                  onChange={handleCountedChange}
                  placeholder="0.00"
                  className="w-full bg-surface text-foreground font-bold text-lg rounded-xl pl-12 pr-4 py-3.5 border border-foreground/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-sm transition-all"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="text-foreground font-bold text-sm block mb-1.5">
                Fondo para la próxima apertura
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={nextInitialCash}
                onChange={handleNextInitialChange}
                placeholder="0.00"
                className="w-full bg-surface text-foreground font-bold text-base rounded-xl px-4 py-3 border border-foreground/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-sm transition-all"
              />
              <p className="text-foreground/60 text-xs font-medium mt-1">
                Precargado con el efectivo contado pero editable si dejás otro cambio para mañana.
              </p>
            </div>

            <div>
              <label className="text-foreground font-bold text-sm block mb-1.5 flex items-center gap-1.5">
                <FileText size={16} className="text-foreground/60" />
                Observaciones del arqueo <span className="text-foreground/50 text-xs font-normal">(Opcional)</span>
              </label>
              <textarea
                value={arqueoNotes}
                onChange={(e) => setArqueoNotes(e.target.value)}
                placeholder="Motivo del faltante/sobrante, notas adicionales del turno..."
                rows={2}
                className="w-full bg-surface text-foreground font-medium text-sm rounded-xl p-3.5 border border-foreground/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-sm transition-all resize-none"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex gap-4 border-t border-foreground/15">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-surface hover:bg-surface/80 text-foreground font-bold py-3.5 rounded-xl transition-all shadow-sm text-sm md:text-base"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!isValid || submitting}
              className="flex-1 bg-secondary hover:brightness-125 disabled:opacity-50 text-foreground font-bold py-3.5 rounded-xl transition-all shadow-md text-sm md:text-base"
            >
              {submitting ? "Guardando Cierre..." : "Confirmar Cierre"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
