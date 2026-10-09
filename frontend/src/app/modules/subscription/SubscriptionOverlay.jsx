import { useState, useEffect } from "react";
import { Lock, AlertTriangle, X, LogOut } from "lucide-react";
import { useSubscription } from "./SubscriptionContext.jsx";

export function SubscriptionOverlay({ userRole, onLogout }) {
  const { isExpired, isWarningPhase, daysRemaining } = useSubscription();
  const [showWarning, setShowWarning] = useState(false);

  const isCreador = userRole === "creador";

  // El creador nunca ve el bloqueo ni la advertencia
  useEffect(() => {
    if (isCreador || !isWarningPhase) {
      setShowWarning(false);
      return;
    }

    setShowWarning(true);
    const hideTimer = setTimeout(() => setShowWarning(false), 10 * 60 * 1000);
    const cycleTimer = setInterval(() => setShowWarning(true), 3 * 60 * 60 * 1000);

    return () => {
      clearTimeout(hideTimer);
      clearInterval(cycleTimer);
    };
  }, [isWarningPhase, isCreador]);

  // Pantalla de bloqueo total (expirado, no creador)
  if (isExpired && !isCreador) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center backdrop-blur-md bg-background/80">
        <div className="bg-surface p-8 rounded-2xl shadow-2xl max-w-md w-full text-center border border-foreground/15 mx-4">
          <div className="w-20 h-20 bg-red-500/15 rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock className="w-10 h-10 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-3">Suscripción Vencida</h2>
          <p className="text-foreground/70 font-medium mb-6 leading-relaxed">
            El período de uso de la aplicación ha finalizado. Por favor, contacte al administrador del servicio para reactivar el acceso.
          </p>
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 bg-background hover:bg-surface text-foreground font-bold py-3 rounded-xl transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Cerrar Sesión
          </button>
        </div>
      </div>
    );
  }

  // Toast de advertencia (próximo a vencer, no creador)
  if (showWarning && !isCreador) {
    return (
      <div className="fixed top-0 left-1/2 -translate-x-1/2 z-[9990] bg-surface border border-t-0 border-primary rounded-b-2xl shadow-md px-6 py-3 w-max max-w-[95vw] shadow-foreground/10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-secondary shrink-0" />
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 text-sm text-foreground">
              <span className="font-medium">
                Su acceso vence en <span className="font-bold text-secondary">{daysRemaining} día{daysRemaining !== 1 ? "s" : ""}</span>.
              </span>
              <span className="text-xs opacity-90">De no renovarse, se restringirá el uso de la aplicación.</span>
            </div>
          </div>
          <button
            onClick={() => setShowWarning(false)}
            className="text-secondary/50 hover:text-secondary transition-colors shrink-0 ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
