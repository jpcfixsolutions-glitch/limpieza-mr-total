import { useState } from "react";
import { FileText, Printer, ReceiptText, X } from "lucide-react";

export function PrintOptionsModal({ transaction, onClose, onPrintThermal, onPrintA4 }) {
  const [showA4Form, setShowA4Form] = useState(false);
  const [customerName, setCustomerName] = useState(transaction?.customerName || "");
  const [address, setAddress] = useState("");

  if (!transaction) return null;

  const submitA4 = (event) => {
    event.preventDefault();
    const cleanCustomer = customerName.trim();
    const cleanAddress = address.trim();
    if (!cleanCustomer || !cleanAddress) return;
    onPrintA4({ customerName: cleanCustomer, address: cleanAddress });
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-background rounded-2xl w-full max-w-xl border border-foreground/15 shadow-2xl overflow-hidden">
        <header className="p-6 border-b border-foreground/15 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-primary font-black text-2xl">Venta #{transaction.id} confirmada</h2>
            <p className="text-foreground/65 text-sm mt-1">Elegí si querés imprimir un comprobante.</p>
          </div>
          <button type="button" onClick={onClose} className="text-foreground/60 hover:text-foreground" title="No imprimir">
            <X size={24} />
          </button>
        </header>

        {!showA4Form ? (
          <div className="p-6 space-y-3">
            <button type="button" onClick={onPrintThermal} className="w-full bg-surface hover:bg-primary/10 border border-foreground/15 rounded-xl p-4 text-left flex items-center gap-4 transition-colors">
              <span className="w-11 h-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0"><ReceiptText size={22} /></span>
              <span><strong className="block text-foreground">Ticket térmico 58 mm</strong><span className="text-sm text-foreground/60">Comprobante compacto para impresora térmica.</span></span>
            </button>
            <button type="button" onClick={() => setShowA4Form(true)} className="w-full bg-surface hover:bg-primary/10 border border-foreground/15 rounded-xl p-4 text-left flex items-center gap-4 transition-colors">
              <span className="w-11 h-11 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center shrink-0"><FileText size={22} /></span>
              <span><strong className="block text-foreground">Remito A4</strong><span className="text-sm text-foreground/60">Formato completo con cliente, dirección y detalle.</span></span>
            </button>
            <button type="button" onClick={onClose} className="w-full py-3 rounded-xl font-bold text-foreground/70 hover:bg-surface transition-colors">
              No imprimir
            </button>
          </div>
        ) : (
          <form onSubmit={submitA4} className="p-6 space-y-5">
            <div>
              <h3 className="font-black text-lg text-foreground">Datos para el remito A4</h3>
              <p className="text-sm text-foreground/60 mt-1">Estos datos se usan sólo para esta impresión.</p>
            </div>
            <label className="block text-sm font-bold text-foreground/80">
              Cliente
              <input autoFocus required value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="mt-2 w-full bg-surface text-foreground rounded-xl px-4 py-3 border border-foreground/15 focus:border-primary outline-none" placeholder="Nombre y apellido o razón social" />
            </label>
            <label className="block text-sm font-bold text-foreground/80">
              Dirección
              <textarea required rows={3} value={address} onChange={(event) => setAddress(event.target.value)} className="mt-2 w-full bg-surface text-foreground rounded-xl px-4 py-3 border border-foreground/15 focus:border-primary outline-none resize-none" placeholder="Calle, número, localidad y provincia" />
            </label>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowA4Form(false)} className="flex-1 bg-surface hover:bg-primary/10 text-foreground font-bold py-3 rounded-xl">Volver</button>
              <button type="submit" disabled={!customerName.trim() || !address.trim()} className="flex-1 bg-secondary hover:brightness-110 disabled:bg-surface text-foreground font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                <Printer size={18} /> Imprimir A4
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
