import { useState, useEffect } from "react";
import { Unlock, X } from "lucide-react";

export function OpenCajaModal({ isOpen, onClose, onConfirm, suggestedAmount = 0 }) {
  const [openingAmount, setOpeningAmount] = useState(String(suggestedAmount));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setOpeningAmount(String(suggestedAmount));
  }, [suggestedAmount, isOpen]);

  if (!isOpen) return null;

  const amountNum = Number(openingAmount);
  const isValid = openingAmount !== "" && !isNaN(amountNum) && amountNum >= 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(amountNum);
      onClose();
    } catch {
      // toast error handled by caller
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-background rounded-2xl w-full max-w-md border border-foreground/15 shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-foreground/15 flex items-center justify-between">
          <h2 className="text-primary font-bold text-2xl flex items-center gap-2">
            <Unlock size={24} className="text-success" /> Abrir Caja
          </h2>
          <button
            onClick={onClose}
            className="text-foreground/50 hover:text-foreground transition-colors"
          >
            <X size={22} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-foreground/80 font-bold text-sm block mb-2">
              Monto inicial en caja (Cambio)
            </label>
            <input
              type="number"
              value={openingAmount}
              onChange={(e) => setOpeningAmount(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="w-full bg-surface text-foreground rounded-xl px-4 py-4 border border-foreground/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-bold text-lg shadow-sm transition-all"
              placeholder="0.00"
              step="0.01"
              min="0"
              required
              autoFocus
            />
            {suggestedAmount > 0 && (
              <p className="text-foreground/60 text-xs font-medium mt-2">
                Sugerido del último cierre: <span className="font-bold text-primary">${Number(suggestedAmount).toFixed(2)}</span>
              </p>
            )}
          </div>
          <div className="pt-2 flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-surface hover:bg-surface/80 text-foreground font-bold py-4 rounded-xl transition-all shadow-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!isValid || submitting}
              className="flex-1 bg-success hover:brightness-125 disabled:opacity-50 text-foreground font-bold py-4 rounded-xl transition-all shadow-md"
            >
              {submitting ? "Abriendo..." : "Confirmar Apertura"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
