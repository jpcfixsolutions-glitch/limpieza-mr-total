import { useEffect, useMemo, useRef, useState } from "react";
import { PackagePlus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import api from "../../services/api.js";
import { formatCatalogPrice } from "../../utils/price.js";

export function PromotionModal({ products, promotion, onClose, onCreated }) {
  const [name, setName] = useState(() => promotion?.name || "");
  const [description, setDescription] = useState(() => promotion?.description || "");
  const [price, setPrice] = useState(() => promotion?.price != null ? String(promotion.price) : "");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState(() => (promotion?.items || []).map((item) => ({ productId: item.productId, name: item.name, codbarra: item.codbarra, quantity: item.quantity })));
  const [saving, setSaving] = useState(false);
  const searchRef = useRef(null);
  useEffect(() => { searchRef.current?.focus(); }, []);
  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return products.filter((product) => product.isAvailable && ((product.name || "").toLowerCase().includes(term) || String(product.codbarra || "").includes(search.trim()))).slice(0, 8);
  }, [products, search]);
  const addProduct = (product) => {
    setItems((current) => current.some((item) => item.productId === product.id)
      ? current.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item)
      : [...current, { productId: product.id, name: product.name, codbarra: product.codbarra, quantity: 1 }]);
    setSearch("");
  };
  const onSearchKeyDown = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const exact = products.find((product) => String(product.codbarra || "") === search.trim());
    if (exact) addProduct(exact);
    else if (results.length === 1) addProduct(results[0]);
    else toast.error("No se encontró un producto con ese código");
  };
  const save = async () => {
    if (!name.trim()) return toast.error("Indicá un nombre para la promoción");
    if (!(Number(price) > 0)) return toast.error("Indicá un precio de venta mayor a cero");
    if (items.length < 2) return toast.error("Agregá al menos 2 productos distintos");
    if (items.some((item) => !Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0)) return toast.error("Las cantidades deben ser enteros positivos");
    setSaving(true);
    try {
      const payload = { name, description, price: Number(price), items: items.map((item) => ({ productId: item.productId, quantity: Number(item.quantity) })) };
      const { data } = promotion ? await api.put(`/promotions/${promotion.id}`, payload) : await api.post("/promotions", payload);
      onCreated(data); toast.success(promotion ? "Promoción actualizada" : "Promoción creada"); onClose();
    } catch (error) { toast.error(error.response?.data?.message || "No se pudo guardar la promoción"); }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-50 bg-black/60 p-4 flex items-center justify-center">
    <div className="bg-background w-full max-w-2xl rounded-2xl border border-foreground/15 shadow-2xl max-h-[calc(100dvh-2rem)] flex flex-col">
      <div className="p-5 border-b border-foreground/15 flex items-center justify-between"><h2 className="text-primary text-xl font-bold flex items-center gap-2"><PackagePlus size={22}/>{promotion ? "Editar Promoción" : "Nueva Promoción"}</h2><button onClick={onClose}><X /></button></div>
      <div className="p-5 overflow-y-auto space-y-4">
        <div className="grid sm:grid-cols-2 gap-4"><label className="text-sm font-bold">Nombre<input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full bg-surface rounded-xl px-3 py-3 border border-foreground/15" placeholder="Ej. Combo limpieza" /></label><label className="text-sm font-bold">Precio de venta ($)<input value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} className="mt-2 w-full bg-surface rounded-xl px-3 py-3 border border-foreground/15" placeholder="0" /></label></div>
        <label className="text-sm font-bold block">Descripción (opcional)<textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-2 w-full bg-surface rounded-xl px-3 py-3 border border-foreground/15" rows="2" /></label>
        <div><label className="text-sm font-bold block mb-2">Agregar productos</label><div className="relative"><Search size={18} className="absolute left-3 top-3.5 text-foreground/50"/><input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={onSearchKeyDown} className="w-full bg-surface rounded-xl pl-10 pr-3 py-3 border border-foreground/15" placeholder="Nombre o escaneá código de barras" /></div>{results.length > 0 && <div className="mt-2 bg-surface border border-foreground/15 rounded-xl overflow-hidden">{results.map((product) => <button type="button" key={product.id} onClick={() => addProduct(product)} className="w-full px-3 py-2 text-left hover:bg-primary/10 flex justify-between gap-3"><span className="font-bold">{product.name}</span><span className="text-sm">{product.codbarra || "Sin código"}</span></button>)}</div>}</div>
        <div className="space-y-2">{items.length === 0 ? <p className="text-sm text-foreground/60">Seleccioná al menos dos productos.</p> : items.map((item) => <div key={item.productId} className="flex gap-3 items-center bg-surface rounded-xl p-3"><div className="flex-1"><p className="font-bold">{item.name}</p><p className="text-xs text-foreground/60">{item.codbarra || "Sin código"}</p></div><input value={item.quantity} inputMode="numeric" onChange={(e) => setItems((current) => current.map((row) => row.productId === item.productId ? { ...row, quantity: e.target.value.replace(/[^0-9]/g, "") } : row))} className="w-16 text-center bg-background rounded-lg py-2 border border-foreground/15"/><button onClick={() => setItems((current) => current.filter((row) => row.productId !== item.productId))} className="text-red-500"><Trash2 size={18}/></button></div>)}</div>
      </div>
      <div className="p-5 border-t border-foreground/15 flex justify-end gap-3"><button onClick={onClose} className="px-4 py-3 font-bold">Cancelar</button><button disabled={saving} onClick={save} className="bg-secondary px-5 py-3 rounded-xl font-bold">{saving ? "Guardando..." : "Guardar Promoción"}</button></div>
    </div>
  </div>;
}
