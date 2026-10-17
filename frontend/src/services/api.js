import axios from "axios";

// En desarrollo, /api pasa por el proxy de Vite. En produccion, vite.config.js
// exige la URL publica del proyecto backend.
const API_URL = (import.meta.env.VITE_API_URL?.trim() || "/api").replace(/\/+$/, "");

const api = axios.create({
  baseURL: API_URL,
  // Es un límite máximo, no una espera: una respuesta normal se procesa de inmediato.
  // Si el backend no responde en 12 s, devolvemos el control y preservamos el borrador.
  timeout: 12000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  // Faltaban las comillas invertidas (backticks) en tu código original para que funcione la interpolación
  if (token) config.headers.Authorization = `Bearer ${token}`; 
  const businessUnit = localStorage.getItem("businessUnit") || "LOCAL";
  config.headers["X-Business-Unit"] = businessUnit;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url || "";
    const isLoginRequest = requestUrl.includes("/auth/login");
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("businessUnit");
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

export default api;
