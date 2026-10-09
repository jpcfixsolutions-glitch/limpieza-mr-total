import { useState } from "react";
import { X, Wallet } from "lucide-react";

export function DailyExpenseModal({ onClose, onSubmit }) {
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("efectivo");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason || !amount || amount <= 0) return;
    setSubmitting(true);
    try {
      await onSubmit({ reason, amount: Number(amount), method });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-2xl w-full max-w-md border border-surface shadow-2xl">
        <div className="p-6 border-b border-surface flex items-center justify-between">
          <h2 className="text-primary font-bold text-2xl flex items-center gap-2">
            <Wallet size={24} className="text-primary" />
            Registrar Gasto Diario
          </h2>
          <button onClick={onClose} className="text-foreground/60 hover:text-foreground transition-colors">
            <X size={24} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-foreground/80 font-bold text-sm block mb-2">Motivo de extracción</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. Compra de bolsas, Pago proveedor..."
              className="w-full bg-surface text-foreground placeholder-foreground/50 font-bold rounded-xl px-4 py-3 border border-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-sm transition-all"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="text-foreground/80 font-bold text-sm block mb-2">Monto ($)</label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                // Reemplaza todo lo que no sea número o punto
                const val = e.target.value.replace(/[^0-9.]/g, "");
                setAmount(val === "" ? "" : val.replace(/^0+(?=\d)/, ""));
              }}
              onFocus={(e) => e.target.select()}
              placeholder="0.00"
              className="w-full bg-surface text-foreground font-bold rounded-xl px-4 py-3 border border-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-sm transition-all"
              required
            />
          </div>
          <div>
            <label className="text-foreground/80 font-bold text-sm block mb-2">Método de extracción</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full bg-surface text-foreground font-bold rounded-xl px-4 py-3 border border-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-sm transition-all"
            >
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
            </select>
          </div>
          <div className="pt-4 flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-surface hover:bg-surface text-foreground font-bold py-4 rounded-xl transition-all shadow-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-secondary hover:brightness-125 disabled:bg-surface disabled:text-foreground/50 disabled:cursor-not-allowed text-foreground font-bold py-4 rounded-xl transition-all shadow-md shadow-secondary/20"
            >
              {submitting ? "Guardando..." : "Confirmar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
