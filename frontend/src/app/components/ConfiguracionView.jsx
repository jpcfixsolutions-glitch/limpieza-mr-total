import { useState, useEffect, useMemo } from "react";
import { CreditCard, Receipt, Plus, Trash2, Edit2, Tag, X, AlertTriangle, Bookmark, Layers, Percent, Package } from "lucide-react";
import { toast } from "sonner";
import api from "../../services/api.js";
import { Loader } from "./Loader.jsx";
import { PaginationBar, paginate, byNameEs } from "./PaginationBar.jsx";

const CONFIG_PAGE_SIZE = 8;

function PagedConfigList({ items, empty, renderItem }) {
  const [page, setPage] = useState(1);
  const sorted = useMemo(
    () => [...items].sort((a, b) => byNameEs(a.name, b.name)),
    [items]
  );
  useEffect(() => { setPage(1); }, [items]);
  const paged = paginate(sorted, page, CONFIG_PAGE_SIZE);

  return (
    <>
      <div className="p-6 space-y-3">
        {paged.slice.map((item) => renderItem(item))}
        {paged.total === 0 && empty}
      </div>
      {paged.total > 0 && (
        <div className="px-4 border-t border-foreground/15">
          <PaginationBar
            page={paged.page}
            pageCount={paged.pageCount}
            total={paged.total}
            start={paged.start}
            end={paged.end}
            onPageChange={setPage}
          />
        </div>
      )}
    </>
  );
}

function PriceGroupPanel({ title, hint, type, icon: Icon, groups, onReload }) {
  const [nameModal, setNameModal] = useState({ isOpen: false, item: null });
  const [increaseModal, setIncreaseModal] = useState(null);
  const [percent, setPercent] = useState("");
  const [updateCost, setUpdateCost] = useState(false);
  const [saving, setSaving] = useState(false);
  const noun = type === "proveedor" ? "proveedor" : "colección";

  const handleSaveName = async () => {
    const name = nameModal.item?.name?.trim();
    if (!name) { toast.error("El nombre es obligatorio"); return; }
    if (saving) return;
    setSaving(true);
    try {
      if (nameModal.item.id) {
        await api.put(`/price-groups/${nameModal.item.id}`, { name });
        toast.success("Nombre actualizado");
      } else {
        await api.post("/price-groups", { name, type });
        toast.success(`${noun[0].toUpperCase() + noun.slice(1)} ${type === "proveedor" ? "creado" : "creada"} en 0%`);
      }
      setNameModal({ isOpen: false, item: null });
      onReload();
    } catch (err) {
      toast.error(err.response?.data?.message || "Error");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id) => {
    try {
      await api.delete(`/price-groups/${id}`);
      toast.success("Eliminada");
      onReload();
    } catch (err) {
      toast.error(err.response?.data?.message || "Error");
    }
  };

  const handleApplyIncrease = async () => {
    const value = Number(percent);
    if (!percent || Number.isNaN(value) || value === 0) {
      toast.error("Ingresá el porcentaje de aumento (ej. 10)");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const { data } = await api.post(`/price-groups/${increaseModal.id}/increase`, {
        percent: value,
        updateCost,
      });
      toast.success(`Aumento del ${value}% aplicado a ${data.updatedCount} productos`);
      setIncreaseModal(null);
      setPercent("");
      setUpdateCost(false);
      onReload();
    } catch (err) {
      toast.error(err.response?.data?.message || "Error al aplicar el aumento");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="bg-surface rounded-xl border border-foreground/15 overflow-hidden shadow-sm flex flex-col">
        <div className="p-6 border-b border-foreground/15 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon className="text-foreground" size={24} />
            <div>
              <h2 className="text-primary text-xl font-bold">{title}</h2>
              <p className="text-foreground/60 font-medium text-xs mt-0.5">{hint}</p>
            </div>
          </div>
          <button
            onClick={() => setNameModal({ isOpen: true, item: { name: "" } })}
            className="text-foreground hover:text-foreground hover:bg-secondary transition-colors p-2 bg-elevated rounded-lg shadow-sm font-bold"
          >
            <Plus size={20} />
          </button>
        </div>
        <PagedConfigList
          items={groups}
          empty={
            <p className="text-foreground/60 font-medium text-sm">
              Sin {type === "proveedor" ? "proveedores" : "colecciones"}. Creá uno para agrupar productos y subir precios juntos.
            </p>
          }
          renderItem={(group) => (
            <div key={group.id} className="flex flex-col sm:flex-row sm:items-center gap-3 bg-elevated p-4 rounded-xl border border-foreground/15 shadow-sm">
              <div className="flex-1 min-w-0">
                <span className="text-foreground font-bold block truncate">{group.name}</span>
                <span className="text-foreground/60 font-medium text-xs">
                  {group.productCount} producto{group.productCount === 1 ? "" : "s"} · último aumento {Number(group.lastIncreasePercent || 0)}%
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => { setIncreaseModal(group); setPercent(""); setUpdateCost(false); }}
                  className="flex items-center gap-1.5 bg-secondary text-foreground font-bold text-xs px-3 py-2 rounded-lg hover:brightness-125 transition-colors"
                >
                  <Percent size={14} /> Aplicar aumento
                </button>
                <button onClick={() => setNameModal({ isOpen: true, item: { id: group.id, name: group.name } })} className="text-primary hover:text-secondary p-2 transition-colors"><Edit2 size={18} /></button>
                <button onClick={() => handleRemove(group.id)} className="text-foreground/60 hover:text-red-500 p-2 transition-colors"><Trash2 size={18} /></button>
              </div>
            </div>
          )}
        />
      </div>

      {nameModal.isOpen && nameModal.item && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-2xl w-full max-w-md border border-surface shadow-2xl">
            <div className="p-6 border-b border-surface flex items-center justify-between">
              <h2 className="text-primary font-bold text-2xl">{nameModal.item.id ? `Editar ${noun}` : `Nueva ${noun}`}</h2>
              <button onClick={() => setNameModal({ isOpen: false, item: null })} className="text-foreground/60 hover:text-foreground"><X size={24} /></button>
            </div>
            <div className="p-6">
              <label className="text-foreground/80 font-bold text-sm block mb-2">Nombre</label>
              <input
                type="text"
                value={nameModal.item.name}
                onChange={(e) => setNameModal((prev) => ({ ...prev, item: { ...prev.item, name: e.target.value } }))}
                onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                className="w-full bg-surface text-foreground rounded-xl px-4 py-3 border border-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-bold shadow-sm"
                placeholder={type === "proveedor" ? "Ej. El Bolsero" : "Ej. Bolsas"}
                autoFocus
              />
            </div>
            <div className="p-6 border-t border-surface flex gap-4">
              <button onClick={() => setNameModal({ isOpen: false, item: null })} className="flex-1 bg-surface hover:bg-surface text-foreground font-bold py-4 rounded-xl">Cancelar</button>
              <button onClick={handleSaveName} disabled={saving} className="flex-1 bg-secondary hover:brightness-125 disabled:opacity-50 text-foreground font-bold py-4 rounded-xl">{saving ? "Guardando..." : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}

      {increaseModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-2xl w-full max-w-md border border-surface shadow-2xl">
            <div className="p-6 border-b border-surface">
              <h2 className="text-primary font-bold text-2xl">Aumento · {increaseModal.name}</h2>
              <p className="text-foreground/70 font-medium text-sm mt-2">
                Se multiplica el precio de venta (unidad, bulto y cantidades) de los <span className="font-bold">{increaseModal.productCount} productos</span> de {type === "proveedor" ? "este proveedor" : "esta colección"}. Cada aviso de aumento se aplica sobre el precio actual.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-foreground/80 font-bold text-sm block mb-2">Porcentaje de aumento</label>
                <div className="relative">
                  <input
                    type="number"
                    value={percent}
                    onChange={(e) => setPercent(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="10"
                    step="0.1"
                    className="w-full bg-surface text-foreground font-bold rounded-xl px-4 py-3 pr-10 border border-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-sm"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground/50 font-bold">%</span>
                </div>
              </div>
              <label className="flex items-center gap-3 text-sm text-foreground font-medium cursor-pointer">
                <input type="checkbox" checked={updateCost} onChange={(e) => setUpdateCost(e.target.checked)} className="w-4 h-4 accent-primary" />
                Actualizar también el costo
              </label>
            </div>
            <div className="p-6 border-t border-surface flex gap-4">
              <button onClick={() => setIncreaseModal(null)} className="flex-1 bg-surface hover:bg-surface text-foreground font-bold py-4 rounded-xl">Cancelar</button>
              <button onClick={handleApplyIncrease} disabled={saving || increaseModal.productCount === 0} className="flex-1 bg-secondary hover:brightness-125 disabled:opacity-50 text-foreground font-bold py-4 rounded-xl">{saving ? "Aplicando..." : "Aplicar"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ConfiguracionView() {
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [paymentModal, setPaymentModal] = useState({ isOpen: false, item: null });
  const [expenseModal, setExpenseModal] = useState({ isOpen: false, item: null });
  const [categoryModal, setCategoryModal] = useState({ isOpen: false, item: null });
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteExpenseConfirm, setDeleteExpenseConfirm] = useState(null);
  const [brands, setBrands] = useState([]);
  const [collections, setCollections] = useState([]);
  const [packTypes, setPackTypes] = useState([]);
  const [packTypeModal, setPackTypeModal] = useState({ isOpen: false, item: null });

  async function fetchData() {
    setLoading(true);
    try {
      const [pRes, eRes, cRes, bRes, colRes, packRes] = await Promise.all([
        api.get("/payment-methods"),
        api.get("/fixed-expenses"),
        api.get("/categories"),
        api.get("/price-groups", { params: { type: "proveedor" } }),
        api.get("/price-groups", { params: { type: "coleccion" } }),
        api.get("/pack-types"),
      ]);
      setPaymentMethods(pRes.data);
      setExpenses(eRes.data);
      setCategories(cRes.data);
      setBrands(bRes.data);
      setCollections(colRes.data);
      setPackTypes(packRes.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  // ── Métodos de pago ──────────────────────────────────
  const handleSavePayment = async (payment) => {
    if (!payment.name.trim()) { toast.error("El nombre del método es obligatorio"); return; }
    if (submitting) return;
    setSubmitting(true);
    const payload = { ...payment, surcharge: Number(payment.surcharge) || 0 };
    try {
      if (payment.id && paymentMethods.some((p) => p.id === payment.id)) {
        await api.put(`/payment-methods/${payment.id}`, payload);
        toast.success("Método de pago actualizado");
      } else {
        await api.post("/payment-methods", payload);
        toast.success("Método de pago agregado");
      }
      setPaymentModal({ isOpen: false, item: null });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemovePayment = async (id) => {
    try {
      await api.delete(`/payment-methods/${id}`);
      toast.success("Método de pago eliminado");
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || "Error"); }
  };

  // ── Gastos fijos ─────────────────────────────────────
  const handleSaveExpense = async (expense) => {
    if (!expense.name.trim()) { toast.error("La descripción del gasto es obligatoria"); return; }
    if (submitting) return;
    setSubmitting(true);
    const payload = { ...expense, amount: Number(expense.amount) || 0 };
    try {
      if (expense.id && expenses.some((e) => e.id === expense.id)) {
        await api.put(`/fixed-expenses/${expense.id}`, payload);
        toast.success("Gasto actualizado");
      } else {
        await api.post("/fixed-expenses", payload);
        toast.success("Gasto agregado");
      }
      setExpenseModal({ isOpen: false, item: null });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveExpense = async (id) => {
    try {
      await api.delete(`/fixed-expenses/${id}`);
      toast.success("Gasto eliminado");
      setDeleteExpenseConfirm(null);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || "Error"); }
  };

  // ── Categorías ───────────────────────────────────────
  const handleSaveCategory = async () => {
    const { item } = categoryModal;
    if (!item?.name?.trim()) { toast.error("El nombre de la categoría es obligatorio"); return; }
    if (submitting) return;
    setSubmitting(true);
    try {
      if (item.id) {
        await api.put(`/categories/${item.id}`, { name: item.name.trim() });
        toast.success("Categoría actualizada");
      } else {
        await api.post("/categories", { name: item.name.trim() });
        toast.success("Categoría agregada");
      }
      setCategoryModal({ isOpen: false, item: null });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveCategory = async (id) => {
    try {
      await api.delete(`/categories/${id}`);
      toast.success("Categoría eliminada");
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || "Error"); }
  };

  const handleSavePackType = async () => {
    const { item } = packTypeModal;
    if (!item?.name?.trim()) { toast.error("El nombre del bulto es obligatorio"); return; }
    if (submitting) return;
    setSubmitting(true);
    try {
      if (item.id) {
        await api.put(`/pack-types/${item.id}`, { name: item.name.trim() });
        toast.success("Tipo de bulto actualizado");
      } else {
        await api.post("/pack-types", { name: item.name.trim() });
        toast.success("Tipo de bulto agregado");
      }
      setPackTypeModal({ isOpen: false, item: null });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemovePackType = async (id) => {
    try {
      await api.delete(`/pack-types/${id}`);
      toast.success("Tipo de bulto eliminado");
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || "Error"); }
  };

  return (
    <div className="flex-1 p-4 pb-20 md:p-8 overflow-y-auto relative">
      {loading && <Loader />}
      <div className="mb-6 md:mb-8">
        <h1 className="text-foreground font-bold text-2xl md:text-4xl mb-1 md:mb-2">Configuración</h1>
        <p className="text-foreground/80 font-medium text-sm">Ajustes generales y financieros del sistema</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">

        <PriceGroupPanel
          title="Proveedores"
          hint="Cuando un proveedor avisa aumento, se reajustan todos sus productos."
          type="proveedor"
          icon={Bookmark}
          groups={brands}
          onReload={fetchData}
        />

        <PriceGroupPanel
          title="Colecciones"
          hint="Para productos sin proveedor (bolsas, vasos genéricos, etc.)."
          type="coleccion"
          icon={Layers}
          groups={collections}
          onReload={fetchData}
        />

        {/* Métodos de pago */}
        <div className="bg-surface rounded-xl border border-foreground/15 overflow-hidden shadow-sm flex flex-col">
          <div className="p-6 border-b border-foreground/15 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CreditCard className="text-foreground" size={24} />
              <h2 className="text-primary text-xl font-bold">Métodos de Pago y Cargos</h2>
            </div>
            <button onClick={() => setPaymentModal({ isOpen: true, item: { name: "", surcharge: "" } })} className="text-foreground hover:text-foreground hover:bg-secondary transition-colors p-2 bg-elevated rounded-lg shadow-sm font-bold">
              <Plus size={20} />
            </button>
          </div>
          <PagedConfigList
            items={paymentMethods}
            empty={<p className="text-foreground/60 font-medium text-sm">Sin métodos de pago configurados</p>}
            renderItem={(method) => (
              <div key={method.id} className="flex gap-4 items-center bg-elevated p-4 rounded-xl border border-foreground/15 shadow-sm">
                <div className="flex-1"><span className="text-foreground font-bold">{method.name}</span></div>
                <div className="text-foreground/80 font-medium w-32 text-right">{method.surcharge > 0 ? `+${method.surcharge}%` : "0%"}</div>
                <div className="flex gap-2">
                  <button onClick={() => setPaymentModal({ isOpen: true, item: { ...method, surcharge: method.surcharge === 0 ? "" : String(method.surcharge) } })} className="text-primary hover:text-secondary p-2 transition-colors"><Edit2 size={20} /></button>
                  <button onClick={() => handleRemovePayment(method.id)} className="text-foreground/60 hover:text-red-500 p-2 transition-colors"><Trash2 size={20} /></button>
                </div>
              </div>
            )}
          />
        </div>

        {/* Gastos fijos */}
        <div className="bg-surface rounded-xl border border-foreground/15 overflow-hidden shadow-sm flex flex-col">
          <div className="p-6 border-b border-foreground/15 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Receipt className="text-primary" size={24} />
              <h2 className="text-primary text-xl font-bold">Gastos Fijos</h2>
            </div>
            <button onClick={() => setExpenseModal({ isOpen: true, item: { name: "", amount: "" } })} className="text-foreground hover:text-foreground hover:bg-secondary transition-colors p-2 bg-elevated rounded-lg shadow-sm font-bold">
              <Plus size={20} />
            </button>
          </div>
          <PagedConfigList
            items={expenses}
            empty={<p className="text-foreground/60 font-medium text-sm">Sin gastos configurados</p>}
            renderItem={(expense) => (
              <div key={expense.id} className="flex gap-4 items-center bg-elevated p-4 rounded-xl border border-foreground/15 shadow-sm">
                <div className="flex-1"><span className="text-foreground font-bold">{expense.name}</span></div>
                <div className="w-40 text-right font-black">
                  <span className="text-foreground/80">${Number(expense.amount).toFixed(2)}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setExpenseModal({ isOpen: true, item: { ...expense, amount: expense.amount === 0 ? "" : String(expense.amount) } })} className="text-primary hover:text-secondary p-2 transition-colors"><Edit2 size={20} /></button>
                  <button onClick={() => setDeleteExpenseConfirm(expense)} className="text-foreground/60 hover:text-red-500 p-2 transition-colors"><Trash2 size={20} /></button>
                </div>
              </div>
            )}
          />
        </div>

        {/* Categorías de producto */}
        <div className="bg-surface rounded-xl border border-foreground/15 overflow-hidden shadow-sm flex flex-col">
          <div className="p-6 border-b border-foreground/15 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Tag className="text-green-400" size={24} />
              <h2 className="text-primary text-xl font-bold">Categorías de Producto</h2>
            </div>
            <button onClick={() => setCategoryModal({ isOpen: true, item: { name: "" } })} className="text-foreground hover:text-foreground hover:bg-secondary transition-colors p-2 bg-elevated rounded-lg shadow-sm font-bold">
              <Plus size={20} />
            </button>
          </div>
          <PagedConfigList
            items={categories}
            empty={<p className="text-foreground/60 font-medium text-sm">Sin categorías configuradas</p>}
            renderItem={(cat) => (
              <div key={cat.id} className="flex gap-4 items-center bg-elevated p-4 rounded-xl border border-foreground/15 shadow-sm">
                <div className="flex-1"><span className="text-foreground font-bold">{cat.name}</span></div>
                <div className="flex gap-2">
                  <button onClick={() => setCategoryModal({ isOpen: true, item: { ...cat } })} className="text-primary hover:text-secondary p-2 transition-colors"><Edit2 size={20} /></button>
                  <button onClick={() => handleRemoveCategory(cat.id)} className="text-foreground/60 hover:text-red-500 p-2 transition-colors"><Trash2 size={20} /></button>
                </div>
              </div>
            )}
          />
        </div>

        <div className="bg-surface rounded-xl border border-foreground/15 overflow-hidden shadow-sm flex flex-col">
          <div className="p-6 border-b border-foreground/15 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package className="text-primary" size={24} />
              <div>
                <h2 className="text-primary text-xl font-bold">Tipos de bulto</h2>
                <p className="text-foreground/60 font-medium text-xs mt-0.5">Nombres para el empaque: paquete, caja, rollo, kg...</p>
              </div>
            </div>
            <button onClick={() => setPackTypeModal({ isOpen: true, item: { name: "" } })} className="text-foreground hover:text-foreground hover:bg-secondary transition-colors p-2 bg-elevated rounded-lg shadow-sm font-bold">
              <Plus size={20} />
            </button>
          </div>
          <PagedConfigList
            items={packTypes}
            empty={<p className="text-foreground/60 font-medium text-sm">Sin tipos de bulto. Creá paquete, caja, rollo, etc.</p>}
            renderItem={(pack) => (
              <div key={pack.id} className="flex gap-4 items-center bg-elevated p-4 rounded-xl border border-foreground/15 shadow-sm">
                <div className="flex-1"><span className="text-foreground font-bold">{pack.name}</span></div>
                <div className="flex gap-2">
                  <button onClick={() => setPackTypeModal({ isOpen: true, item: { ...pack } })} className="text-primary hover:text-secondary p-2 transition-colors"><Edit2 size={20} /></button>
                  <button onClick={() => handleRemovePackType(pack.id)} className="text-foreground/60 hover:text-red-500 p-2 transition-colors"><Trash2 size={20} /></button>
                </div>
              </div>
            )}
          />
        </div>

      </div>

      {/* Modal método de pago */}
      {paymentModal.isOpen && paymentModal.item && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-2xl w-full max-w-md border border-surface shadow-2xl">
            <div className="p-6 border-b border-surface flex items-center justify-between">
              <h2 className="text-primary font-bold text-2xl flex items-center gap-2"><CreditCard size={24} className="text-foreground" />{paymentModal.item.id ? "Editar Método" : "Nuevo Método"}</h2>
              <button onClick={() => setPaymentModal({ isOpen: false, item: null })} className="text-foreground/60 hover:text-foreground transition-colors"><X size={24} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-foreground/80 font-bold text-sm block mb-2">Nombre del método</label>
                <input type="text" value={paymentModal.item.name} onChange={(e) => setPaymentModal((prev) => ({ ...prev, item: { ...prev.item, name: e.target.value } }))} className="w-full bg-surface text-foreground placeholder-foreground/50 rounded-xl px-4 py-3 border border-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-bold transition-all shadow-sm" placeholder="Ej. Mercado Pago" />
              </div>
              <div>
                <label className="text-foreground/80 font-bold text-sm block mb-2">Recargo (%)</label>
                <input type="number" value={paymentModal.item.surcharge} onChange={(e) => setPaymentModal((prev) => ({ ...prev, item: { ...prev.item, surcharge: e.target.value } }))} onFocus={(e) => e.target.select()} className="w-full bg-surface text-foreground rounded-xl px-4 py-3 border border-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-bold transition-all shadow-sm" placeholder="0" min="0" step="0.01" />
              </div>
            </div>
            <div className="p-6 border-t border-surface flex gap-4">
              <button onClick={() => setPaymentModal({ isOpen: false, item: null })} className="flex-1 bg-surface hover:bg-surface text-foreground font-bold py-4 rounded-xl transition-all shadow-sm">Cancelar</button>
              <button onClick={() => handleSavePayment(paymentModal.item)} disabled={submitting} className="flex-1 bg-secondary hover:brightness-125 disabled:bg-surface disabled:text-foreground/50 disabled:cursor-not-allowed text-foreground font-bold py-4 rounded-xl transition-all shadow-md">{submitting ? "Guardando..." : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal gasto fijo */}
      {expenseModal.isOpen && expenseModal.item && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-2xl w-full max-w-md border border-surface shadow-2xl">
            <div className="p-6 border-b border-surface flex items-center justify-between">
              <h2 className="text-primary font-bold text-2xl flex items-center gap-2"><Receipt size={24} className="text-primary" />{expenseModal.item.id ? "Editar Gasto" : "Nuevo Gasto"}</h2>
              <button onClick={() => setExpenseModal({ isOpen: false, item: null })} className="text-foreground/60 hover:text-foreground transition-colors"><X size={24} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-foreground/80 font-bold text-sm block mb-2">Descripción del gasto</label>
                <input type="text" value={expenseModal.item.name} onChange={(e) => setExpenseModal((prev) => ({ ...prev, item: { ...prev.item, name: e.target.value } }))} className="w-full bg-surface text-foreground placeholder-foreground/50 rounded-xl px-4 py-3 border border-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-bold transition-all shadow-sm" placeholder="Ej. Alquiler" />
              </div>
              <div>
                <label className="text-foreground/80 font-bold text-sm block mb-2">Monto ($)</label>
                <input type="number" value={expenseModal.item.amount} onChange={(e) => setExpenseModal((prev) => ({ ...prev, item: { ...prev.item, amount: e.target.value } }))} onFocus={(e) => e.target.select()} className="w-full bg-surface text-foreground rounded-xl px-4 py-3 border border-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-bold transition-all shadow-sm" placeholder="0.00" min="0" step="0.01" />
              </div>
            </div>
            <div className="p-6 border-t border-surface flex gap-4">
              <button onClick={() => setExpenseModal({ isOpen: false, item: null })} className="flex-1 bg-surface hover:bg-surface text-foreground font-bold py-4 rounded-xl transition-all shadow-sm">Cancelar</button>
              <button onClick={() => handleSaveExpense(expenseModal.item)} disabled={submitting} className="flex-1 bg-secondary hover:brightness-125 disabled:bg-surface disabled:text-foreground/50 disabled:cursor-not-allowed text-foreground font-bold py-4 rounded-xl transition-all shadow-md">{submitting ? "Guardando..." : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmación eliminación gasto fijo */}
      {deleteExpenseConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-2xl w-full max-w-md border border-surface shadow-2xl">
            <div className="p-6 border-b border-surface flex items-center gap-3">
              <div className="w-10 h-10 bg-red-500/15 rounded-full flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-red-500" />
              </div>
              <h2 className="text-foreground font-bold text-xl">Eliminar Gasto Fijo</h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-foreground font-medium">
                ¿Estás seguro que querés eliminar <span className="font-black">"{deleteExpenseConfirm.name}"</span>?
              </p>
              <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 flex gap-3">
                <AlertTriangle size={18} className="text-primary shrink-0 mt-0.5" />
                <p className="text-foreground/80 font-medium text-sm">
                  Esta acción afectará las métricas de <span className="font-bold">Estadísticas</span>: el total de Gastos Operativos, el Balance Neto y la Liquidez Disponible se recalcularán sin este gasto.
                </p>
              </div>
            </div>
            <div className="p-6 border-t border-surface flex gap-4">
              <button onClick={() => setDeleteExpenseConfirm(null)} className="flex-1 bg-surface hover:bg-surface text-foreground font-bold py-4 rounded-xl transition-all shadow-sm">Cancelar</button>
              <button onClick={() => handleRemoveExpense(deleteExpenseConfirm.id)} className="flex-1 bg-red-500 hover:bg-red-600 text-foreground font-bold py-4 rounded-xl transition-all shadow-md">Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal categoría */}
      {categoryModal.isOpen && categoryModal.item && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-2xl w-full max-w-md border border-surface shadow-2xl">
            <div className="p-6 border-b border-surface flex items-center justify-between">
              <h2 className="text-primary font-bold text-2xl flex items-center gap-2">
                <Tag size={24} className="text-green-400" />
                {categoryModal.item.id ? "Editar Categoría" : "Nueva Categoría"}
              </h2>
              <button onClick={() => setCategoryModal({ isOpen: false, item: null })} className="text-foreground/60 hover:text-foreground transition-colors"><X size={24} /></button>
            </div>
            <div className="p-6">
              <label className="text-foreground/80 font-bold text-sm block mb-2">Nombre de la categoría</label>
              <input type="text" value={categoryModal.item.name} onChange={(e) => setCategoryModal((prev) => ({ ...prev, item: { ...prev.item, name: e.target.value } }))} onKeyDown={(e) => e.key === "Enter" && handleSaveCategory()} className="w-full bg-surface text-foreground placeholder-foreground/50 rounded-xl px-4 py-3 border border-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-bold transition-all shadow-sm" placeholder="Ej. Vasos, Bandejas, Bolsas..." autoFocus />
            </div>
            <div className="p-6 border-t border-surface flex gap-4">
              <button onClick={() => setCategoryModal({ isOpen: false, item: null })} className="flex-1 bg-surface hover:bg-surface text-foreground font-bold py-4 rounded-xl transition-all shadow-sm">Cancelar</button>
              <button onClick={handleSaveCategory} disabled={submitting} className="flex-1 bg-secondary hover:brightness-125 disabled:bg-surface disabled:text-foreground/50 disabled:cursor-not-allowed text-foreground font-bold py-4 rounded-xl transition-all shadow-md">{submitting ? "Guardando..." : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}

      {packTypeModal.isOpen && packTypeModal.item && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-2xl w-full max-w-md border border-surface shadow-2xl">
            <div className="p-6 border-b border-surface flex items-center justify-between">
              <h2 className="text-primary font-bold text-2xl flex items-center gap-2">
                <Package size={24} className="text-primary" />
                {packTypeModal.item.id ? "Editar tipo de bulto" : "Nuevo tipo de bulto"}
              </h2>
              <button onClick={() => setPackTypeModal({ isOpen: false, item: null })} className="text-foreground/60 hover:text-foreground transition-colors"><X size={24} /></button>
            </div>
            <div className="p-6">
              <label className="text-foreground/80 font-bold text-sm block mb-2">Nombre</label>
              <input
                type="text"
                value={packTypeModal.item.name}
                onChange={(e) => setPackTypeModal((prev) => ({ ...prev, item: { ...prev.item, name: e.target.value } }))}
                onKeyDown={(e) => e.key === "Enter" && handleSavePackType()}
                className="w-full bg-surface text-foreground placeholder-foreground/50 rounded-xl px-4 py-3 border border-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-bold transition-all shadow-sm"
                placeholder="Ej. Caja, Paquete, Rollo"
                autoFocus
              />
            </div>
            <div className="p-6 border-t border-surface flex gap-4">
              <button onClick={() => setPackTypeModal({ isOpen: false, item: null })} className="flex-1 bg-surface hover:bg-surface text-foreground font-bold py-4 rounded-xl transition-all shadow-sm">Cancelar</button>
              <button onClick={handleSavePackType} disabled={submitting} className="flex-1 bg-secondary hover:brightness-125 disabled:bg-surface disabled:text-foreground/50 disabled:cursor-not-allowed text-foreground font-bold py-4 rounded-xl transition-all shadow-md">{submitting ? "Guardando..." : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
