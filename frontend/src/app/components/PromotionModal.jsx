import { useEffect, useMemo, useRef, useState } from "react";
import { PackagePlus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import api from "../../services/api.js";
import { calculateProfitabilityPercent, formatCatalogPrice } from "../../utils/price.js";

function productCost(product) {
  return Number(product?.fulfillmentMode === "WAREHOUSE_DIRECT" ? product.warehouseCost : product?.cost) || 0;
}

export function PromotionModal({ products, promotion, onClose, onCreated }) {
  const [name, setName] = useState(() => promotion?.name || "");
  const [description, setDescription] = useState(() => promotion?.description || "");
  const [price, setPrice] = useState(() => promotion?.price != null ? String(promotion.price) : "");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState(() => (promotion?.items || []).map((item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    return {
      productId: item.productId,
      name: item.name,
      codbarra: item.codbarra,
      quantity: item.quantity,
      cost: Number(item.cost ?? productCost(product)) || 0,
    };
  }));
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
      ? current.map((item) => item.productId === product.id ? { ...item, quantity: Number(item.quantity) + 1 } : item)
      : [...current, { productId: product.id, name: product.name, codbarra: product.codbarra, quantity: 1, cost: productCost(product) }]);
    setSearch("");
  };
  const totalCost = useMemo(
    () => items.reduce((total, item) => total + Number(item.cost || 0) * Number(item.quantity || 0), 0),
    [items]
  );
  const profitability = calculateProfitabilityPercent(totalCost, price);
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
    if (items.length === 0) return toast.error("Agregá al menos un producto");
    if (items.some((item) => !Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0)) return toast.error("Las cantidades deben ser enteros positivos");
    if (items.length === 1 && Number(items[0].quantity) < 2) return toast.error("Para una promoción de un solo producto, indicá al menos 2 unidades");
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
        <div><label className="text-sm font-bold block mb-2">Agregar productos</label><p className="text-xs text-foreground/60 mb-2">Podés combinar productos distintos o crear una promoción con 2 o más unidades del mismo producto.</p><div className="relative"><Search size={18} className="absolute left-3 top-3.5 text-foreground/50"/><input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={onSearchKeyDown} className="w-full bg-surface rounded-xl pl-10 pr-11 py-3 border border-foreground/15" placeholder="Nombre o escaneá código de barras" />{search && <button type="button" onClick={() => { setSearch(""); searchRef.current?.focus(); }} className="absolute right-3 top-2.5 p-1 text-foreground/45 hover:text-foreground rounded-full" title="Limpiar búsqueda" aria-label="Limpiar búsqueda"><X size={17}/></button>}</div>{results.length > 0 && <div className="mt-2 bg-surface border border-foreground/15 rounded-xl overflow-hidden">{results.map((product) => <button type="button" key={product.id} onClick={() => addProduct(product)} className="w-full px-3 py-2 text-left hover:bg-primary/10 flex justify-between gap-3"><span className="font-bold">{product.name}</span><span className="text-sm text-right"><span className="block">Costo: ${formatCatalogPrice(productCost(product))}</span><span className="text-foreground/60">{product.codbarra || "Sin código"}</span></span></button>)}</div>}</div>
        <div className="space-y-2">{items.length === 0 ? <p className="text-sm text-foreground/60">Seleccioná al menos un producto.</p> : items.map((item) => <div key={item.productId} className="flex gap-3 items-center bg-surface rounded-xl p-3"><div className="flex-1 min-w-0"><p className="font-bold">{item.name}</p><p className="text-xs text-foreground/60">Costo unitario: ${formatCatalogPrice(item.cost)} · Subtotal: ${formatCatalogPrice(Number(item.cost || 0) * Number(item.quantity || 0))}</p></div><label className="text-xs font-bold text-foreground/60 text-center">Cantidad<input type="number" min="1" step="1" value={item.quantity} inputMode="numeric" onChange={(e) => setItems((current) => current.map((row) => row.productId === item.productId ? { ...row, quantity: e.target.value.replace(/[^0-9]/g, "") } : row))} className="mt-1 block w-20 text-center text-foreground bg-background rounded-lg py-2 border border-foreground/15"/></label><button type="button" onClick={() => setItems((current) => current.filter((row) => row.productId !== item.productId))} className="text-red-500"><Trash2 size={18}/></button></div>)}</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4">
          <div><p className="text-xs font-bold uppercase tracking-wide text-foreground/60">Costo total</p><p className="mt-1 text-lg font-black text-foreground">${formatCatalogPrice(totalCost)}</p></div>
          <div><p className="text-xs font-bold uppercase tracking-wide text-foreground/60">Precio de venta</p><p className="mt-1 text-lg font-black text-foreground">${formatCatalogPrice(Number(price) || 0)}</p></div>
          <div><p className="text-xs font-bold uppercase tracking-wide text-foreground/60">Rentabilidad</p><p className={`mt-1 text-lg font-black ${profitability == null ? "text-foreground/50" : profitability >= 0 ? "text-success" : "text-red-600"}`}>{profitability == null ? "Sin calcular" : `${profitability.toFixed(2)}%`}</p></div>
        </div>
      </div>
      <div className="p-5 border-t border-foreground/15 flex justify-end gap-3"><button onClick={onClose} className="px-4 py-3 font-bold">Cancelar</button><button disabled={saving} onClick={save} className="bg-secondary px-5 py-3 rounded-xl font-bold">{saving ? "Guardando..." : "Guardar Promoción"}</button></div>
    </div>
  </div>;
}
