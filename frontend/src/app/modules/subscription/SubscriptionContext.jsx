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
    // El creador nunca es bloqueado, pero puede consultar el estado
    try {
      const { data } = await api.get("/subscription/status");
      setStatus(data);
    } catch {
      // Si falla (sin conexión, etc.) no bloqueamos
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

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

  return (
    <SubscriptionContext.Provider value={{ ...status, setCutoffDay, reactivate, refresh: fetchStatus }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription debe usarse dentro de SubscriptionProvider");
  return ctx;
}
