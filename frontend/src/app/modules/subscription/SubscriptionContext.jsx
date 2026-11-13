import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../../../services/api.js";

const SubscriptionContext = createContext(undefined);

export function SubscriptionProvider({ children, userRole }) {
  const [status, setStatus] = useState({
    cutoffDay: null,
    isExpired: false,
    isWarningPhase: false,
    daysRemaining: null,
  });

  const fetchStatus = useCallback(async () => {
    if (userRole === "EMPLEADO_GALPON") return;
    // El creador nunca es bloqueado, pero puede consultar el estado
    try {
      const { data } = await api.get("/subscription/status");
      setStatus(data);
    } catch {
      // Si falla (sin conexión, etc.) no bloqueamos
    }
  }, [userRole]);

  useEffect(() => {
    if (userRole === "EMPLEADO_GALPON") return;
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, [fetchStatus, userRole]);

  const setCutoffDay = async (day) => {
    const { data } = await api.post("/subscription/set-cutoff", { cutoffDay: day });
    setStatus(data);
    return data;
  };

  const reactivate = async () => {
    const { data } = await api.post("/subscription/reactivate");
    setStatus(data);
    return data;
  };

  const applyOperationalAccess = useCallback((access) => {
    setStatus((previous) => ({ ...previous, isExpired: access.isExpired, isWarningPhase: access.isWarningPhase, daysRemaining: access.daysRemaining }));
  }, []);

  return (
    <SubscriptionContext.Provider value={{ ...status, setCutoffDay, reactivate, refresh: fetchStatus, applyOperationalAccess }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription debe usarse dentro de SubscriptionProvider");
  return ctx;
}

// Las vistas operativas también se prueban de forma aislada, sin el proveedor.
export function useOperationalAccessSync() {
  return useContext(SubscriptionContext)?.applyOperationalAccess;
}
