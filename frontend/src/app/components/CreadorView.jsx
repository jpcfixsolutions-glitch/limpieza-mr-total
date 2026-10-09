import { useState } from "react";
import { ShieldCheck, Calendar, Settings, Play, RotateCcw, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { useSubscription } from "../modules/subscription/SubscriptionContext.jsx";
import { toast } from "sonner";

export function CreadorView() {
  const { cutoffDay, isExpired, isWarningPhase, daysRemaining, lastPaidAt, setCutoffDay, reactivate, refresh } = useSubscription();
  const [selectedDay, setSelectedDay] = useState(cutoffDay ? String(cutoffDay) : "");
  const [saving, setSaving] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  const handleSaveCutoff = async () => {
    const day = parseInt(selectedDay, 10);
    if (isNaN(day) || day < 1 || day > 31) {
      toast.error("Ingresá un día válido entre 1 y 31");
      return;
    }
    setSaving(true);
    try {
      await setCutoffDay(day);
      toast.success(`Día de corte configurado: día ${day} de cada mes`);
    } catch (err) {
      toast.error(err.response?.data?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleReactivate = async () => {
    setReactivating(true);
    try {
      await reactivate();
      toast.success("Suscripción reactivada. El bloqueo fue levantado.");
      await refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || "Error al reactivar");
    } finally {
      setReactivating(false);
    }
  };

  const statusColor = isExpired
    ? "text-red-600 bg-red-500/10"
    : isWarningPhase
    ? "text-primary bg-primary/10"
    : "text-success bg-success/10";

  const statusLabel = isExpired ? "Bloqueado" : isWarningPhase ? "Por vencer" : "Activo";
  const StatusIcon = isExpired ? XCircle : isWarningPhase ? AlertTriangle : CheckCircle;

  return (
    <div className="flex-1 p-4 pb-20 md:p-8 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
          <ShieldCheck className="text-foreground" size={28} />
        </div>
        <div>
          <h1 className="text-foreground font-bold text-2xl md:text-4xl">Panel de Creador</h1>
          <p className="text-foreground/70 font-medium text-sm">Gestión de suscripción del cliente</p>
        </div>
      </div>

      <div className="max-w-2xl space-y-6">

        {/* Estado actual */}
        <div className="bg-surface rounded-xl border border-foreground/15 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-foreground/15 flex items-center gap-3">
            <Settings size={20} className="text-primary" />
            <h2 className="text-primary font-bold text-lg">Estado Actual</h2>
          </div>
          <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-background rounded-lg p-4 border border-foreground/15">
              <p className="text-foreground/60 font-medium text-xs uppercase tracking-wider mb-1">Día de corte</p>
              <p className="text-foreground font-bold text-lg">
                {cutoffDay ? `Día ${cutoffDay}` : "Sin configurar"}
              </p>
            </div>
            <div className="bg-background rounded-lg p-4 border border-foreground/15">
              <p className="text-foreground/60 font-medium text-xs uppercase tracking-wider mb-1">Último pago</p>
              <p className="text-foreground font-bold text-base">
                {lastPaidAt
                  ? new Date(lastPaidAt + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" })
                  : "Sin registrar"}
              </p>
            </div>
            <div className="bg-background rounded-lg p-4 border border-foreground/15">
              <p className="text-foreground/60 font-medium text-xs uppercase tracking-wider mb-1">Fase de aviso</p>
              <p className={`font-bold text-lg ${isWarningPhase ? "text-primary" : "text-foreground/50"}`}>
                {isWarningPhase ? "Activa" : "Inactiva"}
              </p>
            </div>
            <div className="bg-background rounded-lg p-4 border border-foreground/15">
              <p className="text-foreground/60 font-medium text-xs uppercase tracking-wider mb-1">Restricción</p>
              <div className={`inline-flex items-center gap-1.5 font-bold text-lg ${statusColor} px-2 py-0.5 rounded-lg`}>
                <StatusIcon size={16} />
                {statusLabel}
              </div>
            </div>
          </div>
          {cutoffDay && isWarningPhase && !isExpired && (
            <div className="px-5 pb-5">
              <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 text-sm text-foreground font-medium">
                ⚠️ Quedan <span className="font-bold">{daysRemaining} día{daysRemaining !== 1 ? "s" : ""}</span> para el corte. Los usuarios ya están viendo el aviso de vencimiento.
              </div>
            </div>
          )}
          {isExpired && (
            <div className="px-5 pb-5">
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-600 font-medium">
                🔒 El sistema está bloqueado. Usa el botón de reactivación una vez que el cliente haya pagado.
              </div>
            </div>
          )}
        </div>

        {/* Configurar día de corte */}
        <div className="bg-surface rounded-xl border border-foreground/15 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-foreground/15 flex items-center gap-3">
            <Calendar size={20} className="text-primary" />
            <h2 className="text-primary font-bold text-lg">Configurar Día de Corte</h2>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-foreground/70 font-medium text-sm">
              Se configura <span className="font-bold">una sola vez</span>. Cada mes, al superar este día, el sistema bloqueará automáticamente el acceso hasta que presiones "Reactivar". Los avisos de vencimiento aparecen 5 días antes del corte.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/50" />
                <input
                  type="number"
                  min="1"
                  max="31"
                  placeholder="Ej: 20"
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-background text-foreground font-bold rounded-xl border border-foreground/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
              </div>
              <button
                onClick={handleSaveCutoff}
                disabled={saving || !selectedDay}
                className="flex items-center justify-center gap-2 bg-secondary hover:brightness-125 disabled:bg-background disabled:text-foreground/40 text-foreground font-bold px-6 py-3 rounded-xl transition-all shadow-md shadow-secondary/20 disabled:shadow-none"
              >
                <Play size={18} />
                {saving ? "Guardando..." : "Guardar día"}
              </button>
            </div>
          </div>
        </div>

        {/* Reactivar suscripción */}
        {cutoffDay && (
          <div className="bg-surface rounded-xl border border-foreground/15 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-foreground/15 flex items-center gap-3">
              <RotateCcw size={20} className="text-success" />
              <h2 className="text-success font-bold text-lg">Reactivar Suscripción</h2>
            </div>
            <div className="p-5">
              <div className="bg-success/10 border border-success/30 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="text-foreground font-bold mb-1">Levantar el bloqueo manualmente</p>
                  <p className="text-foreground/70 font-medium text-sm">
                    Usá este botón una vez que el cliente haya pagado. El sistema registra la fecha de pago del mes actual y el acceso vuelve a la normalidad. El día de corte se mantiene para el mes siguiente de forma automática.
                  </p>
                </div>
                <button
                  onClick={handleReactivate}
                  disabled={reactivating}
                  className="shrink-0 flex items-center gap-2 bg-success hover:brightness-125 disabled:bg-success/40 text-foreground font-bold px-5 py-3 rounded-xl transition-all shadow-md"
                >
                  <RotateCcw size={18} />
                  {reactivating ? "Reactivando..." : "Reactivar"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
