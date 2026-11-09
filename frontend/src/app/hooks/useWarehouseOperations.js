import { useCallback, useEffect, useRef, useState } from "react";
import api from "../../services/api.js";

// Inicio y Pedidos consumen la misma instantánea y el mismo cálculo del servidor.
export function useWarehouseOperations() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const active = useRef(null);
  const refresh = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    try {
      const response = await api.get("/warehouse/operations", { signal: controller.signal });
      if (!controller.signal.aborted) {
        setData(response.data);
        setError("");
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err.response?.data?.message || "No se pudieron actualizar los pedidos y la producción del Galpón.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const update = () => { if (!document.hidden) refresh(); };
    const interval = window.setInterval(update, 15_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      active.current?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh]);
  const replaceOrder = useCallback((updated) => {
    // Mantener el cliente ya cargado: la respuesta de transición contiene los
    // campos del pedido y sus productos, sin repetir los datos del contacto.
    setData((previous) => previous && ({ ...previous, orders: previous.orders.map((order) => order.id === updated.id ? { ...order, ...updated } : order) }));
  }, []);
  return { data, loading, error, refresh, replaceOrder };
}
