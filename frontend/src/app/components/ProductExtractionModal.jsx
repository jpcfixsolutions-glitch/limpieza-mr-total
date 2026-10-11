import { useMemo, useState } from "react";
import { Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import api from "../../services/api.js";

const REASONS = [
  ["uso_interno", "Uso interno"], ["rotura_dano", "Rotura / Daño"], ["vencimiento", "Vencimiento"], ["donacion", "Donación"], ["otro", "Otro"],
];

export function ProductExtractionModal({ products, onClose, onCreated }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [reason, setReason] = useState("");
  const [reasonDetail, setReasonDetail] = useState("");
  const [observations, setObservations] = useState("");
  const [saving, setSaving] = useState(false);
  const matches = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return [];
    return products.filter((p) => Number(p.stock) > 0 && ((p.name || "").toLowerCase().includes(value) || String(p.codbarra || "").includes(query.trim()))).slice(0, 8);
  }, [products, query]);
  const total = items.reduce((sum, item) => sum + Number(item.cost || 0) * item.quantity, 0);

  const add = (product) => {
    setItems((current) => {
      const found = current.find((item) => item.id === product.id);
      if (!found) return [...current, { ...product, quantity: 1 }];
      if (found.quantity >= Number(found.stock)) { toast.error(`No hay más stock disponible de ${found.name}`); return current; }
      return current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
    });
    setQuery("");
  };
  const updateQuantity = (id, raw) => {
    const quantity = Number(raw);
    setItems((current) => current.map((item) => item.id === id ? { ...item, quantity: Number.isInteger(quantity) && quantity > 0 ? Math.min(quantity, Number(item.stock)) : 0 } : item));
  };
  const handleSearchKeyDown = (event) => {
    if (event.key !== "Enter" || !query.trim()) return;
    const exact = products.find((p) => String(p.codbarra || "") === query.trim());
    if (exact) { event.preventDefault(); add(exact); }
  };
  const submit = async () => {
    if (!items.length || items.some((item) => !Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > Number(item.stock))) return toast.error("Revisá las cantidades seleccionadas.");
    if (!reason) return toast.error("Seleccioná un motivo.");
    if (reason === "otro" && !reasonDetail.trim()) return toast.error("Describí el motivo de la extracción.");
    setSaving(true);
    try {
      await api.post("/product-extractions", { items: items.map((item) => ({ productId: item.id, quantity: item.quantity })), reason, reasonDetail, observations });
      toast.success("Extracción registrada y stock actualizado");
      onCreated();
      onClose();
    } catch (error) { toast.error(error.response?.data?.message || "No se pudo registrar la extracción"); }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-50 bg-black/60 p-4 flex items-center justify-center">
    <div className="bg-background rounded-2xl border border-surface shadow-2xl w-full max-w-4xl max-h-[calc(100dvh-2rem)] overflow-hidden grid grid-rows-[auto_1fr_auto]">
      <div className="p-5 border-b border-foreground/15 flex justify-between items-center"><div><h2 className="text-primary text-xl font-bold">Extraer productos</h2><p className="text-foreground/60 text-sm">La extracción descuenta stock, sin afectar la caja.</p></div><button onClick={onClose} disabled={saving}><X /></button></div>
      <fieldset disabled={saving} className="overflow-y-auto p-5 space-y-4 disabled:opacity-70">
        <div className="relative"><Search size={18} className="absolute left-3 top-3.5 text-foreground/50"/><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={handleSearchKeyDown} placeholder="Buscar por nombre o escanear código…" className="w-full bg-surface rounded-xl pl-10 pr-3 py-3 border border-foreground/15 font-medium outline-none focus:border-primary"/>
          {matches.length > 0 && <div className="absolute z-10 top-full mt-1 w-full rounded-xl border border-foreground/15 bg-background shadow-xl overflow-hidden">{matches.map((p) => <button key={p.id} onClick={() => add(p)} className="w-full px-4 py-3 text-left hover:bg-surface flex justify-between gap-3"><span className="font-bold">{p.name}</span><span className="text-sm text-foreground/60">Stock: {p.stock}</span></button>)}</div>}
        </div>
        <div className="overflow-x-auto border border-foreground/15 rounded-xl"><table className="w-full min-w-[650px] text-sm"><thead className="bg-surface text-foreground/70"><tr><th className="p-3 text-left">Producto</th><th className="p-3 text-center">Cantidad</th><th className="p-3 text-right">Costo unit.</th><th className="p-3 text-right">Subtotal</th><th /></tr></thead><tbody>{items.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-foreground/60">Buscá y agregá productos para extraer.</td></tr> : items.map((item) => <tr key={item.id} className="border-t border-foreground/10"><td className="p-3 font-bold">{item.name}<span className="block text-xs font-medium text-foreground/60">Disponible: {item.stock}</span></td><td className="p-3 text-center"><input value={item.quantity || ""} onChange={(e) => updateQuantity(item.id, e.target.value)} inputMode="numeric" className="w-20 text-center rounded-lg bg-surface border border-foreground/15 p-2"/></td><td className="p-3 text-right">${Number(item.cost || 0).toFixed(2)}</td><td className="p-3 text-right font-bold">${(Number(item.cost || 0) * item.quantity).toFixed(2)}</td><td className="p-3"><button onClick={() => setItems((current) => current.filter((x) => x.id !== item.id))} className="text-red-500"><Trash2 size={18}/></button></td></tr>)}</tbody></table></div>
        <p className="text-right text-lg font-black">Total a costo: ${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        <div className="grid sm:grid-cols-2 gap-4"><div><label className="block font-bold text-sm mb-2">Motivo *</label><select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full p-3 rounded-xl bg-surface border border-foreground/15"><option value="">Seleccionar…</option>{REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>{reason === "otro" && <div><label className="block font-bold text-sm mb-2">Descripción *</label><input value={reasonDetail} onChange={(e) => setReasonDetail(e.target.value)} className="w-full p-3 rounded-xl bg-surface border border-foreground/15"/></div>}</div>
        <div><label className="block font-bold text-sm mb-2">Observaciones</label><textarea value={observations} onChange={(e) => setObservations(e.target.value)} className="w-full p-3 rounded-xl bg-surface border border-foreground/15" rows="2"/></div>
      </fieldset>
      <div className="p-5 border-t border-foreground/15 flex justify-end gap-3"><button onClick={onClose} disabled={saving} className="px-4 py-3 font-bold">Cancelar</button><button onClick={submit} disabled={saving || !items.length} className="bg-primary px-5 py-3 rounded-xl font-bold disabled:opacity-50">{saving ? "Registrando…" : "Confirmar extracción"}</button></div>
    </div>
  </div>;
}
