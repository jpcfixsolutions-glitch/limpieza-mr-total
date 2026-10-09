import { useState } from "react";
import { X, Search, UserPlus, IdCard } from "lucide-react";
import { toast } from "sonner";
import api from "../../services/api.js";

export function CustomerPickerModal({ initialDocument = "", onClose, onSelect }) {
  const [documentInput, setDocumentInput] = useState(initialDocument);
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState({ name: "", lastName: "", phone: "" });
  const [creating, setCreating] = useState(false);

  const documentValue = documentInput.trim();

  const handleSearch = async () => {
    if (!documentValue || searching) return;
    setSearching(true);
    setFound(null);
    setNotFound(false);
    try {
      const { data } = await api.get(`/customers/document/${encodeURIComponent(documentValue)}`);
      setFound(data);
    } catch (err) {
      if (err.response?.status === 404) {
        setNotFound(true);
      } else {
        toast.error(err.response?.data?.message || "Error al buscar el cliente");
      }
    } finally {
      setSearching(false);
    }
  };

  const handleCreate = async () => {
    if (creating) return;
    if (!form.name.trim() || !form.lastName.trim()) {
      toast.error("Nombre y apellido son requeridos");
      return;
    }
    setCreating(true);
    try {
      const { data } = await api.post("/customers", {
        name: form.name,
        lastName: form.lastName,
        document: documentValue,
        phone: form.phone,
      });
      toast.success("Cliente creado correctamente");
      onSelect(data);
    } catch (err) {
      toast.error(err.response?.data?.message || "No se pudo crear el cliente");
    } finally {
      setCreating(false);
    }
  };

  const resetSearch = () => {
    setFound(null);
    setNotFound(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-background rounded-2xl w-full max-w-md border border-surface shadow-2xl">
        <div className="p-6 border-b border-surface flex items-center justify-between">
          <h2 className="text-primary font-bold text-xl flex items-center gap-2">
            <IdCard size={22} /> Cliente de la cuenta
          </h2>
          <button onClick={onClose} className="text-foreground/60 hover:text-foreground transition-colors">
            <X size={22} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-foreground/80 font-bold text-sm block mb-2">DNI / Documento</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={documentInput}
                onChange={(e) => { setDocumentInput(e.target.value); resetSearch(); }}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                autoFocus
                placeholder="Ej. 30123456"
                className="flex-1 bg-surface text-foreground placeholder-foreground/50 font-bold rounded-xl px-4 py-3 border border-foreground/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-sm transition-all"
              />
              <button
                onClick={handleSearch}
                disabled={!documentValue || searching}
                className="bg-secondary hover:brightness-125 disabled:bg-surface disabled:text-foreground/40 text-foreground font-bold px-4 rounded-xl transition-all shadow-sm flex items-center gap-2"
              >
                <Search size={18} />
                {searching ? "..." : "Buscar"}
              </button>
            </div>
          </div>

          {found && (
            <div className="bg-surface border border-foreground/15 rounded-xl p-4 space-y-1 shadow-sm">
              <p className="text-foreground font-black text-lg">{found.name} {found.lastName}</p>
              <p className="text-foreground/70 font-medium text-sm">DNI {found.document}</p>
              {found.phone && <p className="text-foreground/70 font-medium text-sm">Tel. {found.phone}</p>}
              <p className="text-secondary font-bold text-sm pt-1">
                Deuda actual: ${Number(found.debt || 0).toFixed(2)}
              </p>
            </div>
          )}

          {notFound && (
            <div className="space-y-4">
              <div className="bg-primary/10 border border-primary/40 rounded-xl p-3 flex items-start gap-2">
                <UserPlus size={18} className="text-secondary shrink-0 mt-0.5" />
                <p className="text-foreground/80 font-medium text-sm">
                  No existe un cliente con ese documento. Completá los datos para crearlo.
                </p>
              </div>
              <div>
                <label className="text-foreground/80 font-bold text-sm block mb-2">Nombre</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-surface text-foreground placeholder-foreground/50 font-bold rounded-xl px-4 py-3 border border-foreground/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-sm transition-all"
                  placeholder="Ej. Juan"
                />
              </div>
              <div>
                <label className="text-foreground/80 font-bold text-sm block mb-2">Apellido</label>
                <input
                  type="text"
                  value={form.lastName}
                  onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                  className="w-full bg-surface text-foreground placeholder-foreground/50 font-bold rounded-xl px-4 py-3 border border-foreground/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-sm transition-all"
                  placeholder="Ej. Pérez"
                />
              </div>
              <div>
                <label className="text-foreground/80 font-bold text-sm block mb-2">Teléfono (opcional)</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                  className="w-full bg-surface text-foreground placeholder-foreground/50 font-bold rounded-xl px-4 py-3 border border-foreground/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-sm transition-all"
                  placeholder="Ej. 3511234567"
                />
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-surface flex gap-4">
          <button onClick={onClose} className="flex-1 bg-surface hover:bg-primary/10 text-foreground font-bold py-3 rounded-xl transition-all shadow-sm">
            Cancelar
          </button>
          {notFound ? (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex-1 bg-secondary hover:brightness-125 disabled:bg-surface disabled:text-foreground/50 text-foreground font-bold py-3 rounded-xl transition-all shadow-md"
            >
              {creating ? "Creando..." : "Crear y usar"}
            </button>
          ) : (
            <button
              onClick={() => onSelect(found)}
              disabled={!found}
              className="flex-1 bg-secondary hover:brightness-125 disabled:bg-surface disabled:text-foreground/50 text-foreground font-bold py-3 rounded-xl transition-all shadow-md"
            >
              Usar cliente
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
