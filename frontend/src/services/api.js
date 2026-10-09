import axios from "axios";

// Usamos la variable de entorno de Vite. Si no existe, usamos localhost.
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

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
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

// =========================================================
// MODO LOCAL (MOCK) - SIN BACKEND
// =========================================================
const USE_LOCAL_MOCK = false; // Backend activo en http://localhost:3001

if (USE_LOCAL_MOCK) {
  console.warn("⚠️ MODO MOCK ACTIVADO: El frontend está funcionando sin backend con datos de prueba.");
  
  // Base de datos simulada en memoria
  const mockDb = {
    "/cash-register/closed": [
      { id: 1, totalIngresos: 125000, totalEfectivo: 80000, totalTransferencia: 45000, closedAt: new Date().toISOString() }
    ],
    "/fixed-expenses": [
      { id: 1, name: "Alquiler", amount: 50000 },
      { id: 2, name: "Sueldos", amount: 35000 }
    ],
    "/daily-expenses": [
      { id: 1, reason: "Compra de bolsas", amount: 3000, method: "efectivo", createdAt: new Date().toISOString() }
    ],
    "/products": [
      { id: 1, name: "Vaso térmico 180 cc", category: "Vasos", cost: 5000, price: 8500, stock: 12, minStock: 3, icon: "CupSoda", isAvailable: true },
      { id: 2, name: "Bandeja plástica N° 102", category: "Bandejas", cost: 1500, price: 2500, stock: 24, minStock: 10, icon: "Layers3", isAvailable: true },
      { id: 3, name: "Bolsa camiseta mediana", category: "Bolsas", cost: 200, price: 500, stock: 50, minStock: 20, icon: "ShoppingBag", isAvailable: true }
    ],
    "/stats/restock": { restockCost: 18500 },
    "/stats/activity-log": [
      { id: "caja-open-1", type: "Apertura de Caja", details: "Fondo inicial: $15000", date: new Date().toISOString(), icon: "Unlock", color: "text-success", bg: "bg-success/10" }
    ],
    // Agregamos mocks genéricos para otras rutas (como login, mesas, etc.)
    "/categories": [{ id: 1, name: "Vasos" }, { id: 2, name: "Bandejas" }, { id: 3, name: "Bolsas" }],
    "/bar-bottles": [{ id: 1, productName: "Vaso térmico 180 cc" }]
  };

  api.defaults.adapter = (config) => {
    return new Promise((resolve) => {
      setTimeout(() => { // Simulamos un poco de retraso de red (300ms)
        const url = config.url.replace(API_URL, '').split('?')[0];
        
        // Interceptar el Login dinámicamente según el email ingresado
        if (config.method === 'post' && url.includes('/auth/login')) {
          const body = JSON.parse(config.data);
          if (body.email === 'cajero@yofre.com') {
            return resolve({ data: { token: "token-cajero", user: { id: 2, name: "Cajero Demo", role: "cajero" } }, status: 200, config, headers: {} });
          }
          return resolve({ data: { token: "token-admin", user: { id: 1, name: "Juanjo (Admin)", role: "admin" } }, status: 200, config, headers: {} });
        }

        // Si enviamos un POST a daily-expenses, lo agregamos a nuestra base de datos simulada
        // Esto permite que al agregar un gasto en el modal, se vea reflejado al instante.
        if (config.method === 'post' && url.includes('/daily-expenses')) {
          const body = JSON.parse(config.data);
          const newExpense = { id: Date.now(), ...body, createdAt: new Date().toISOString() };
          mockDb["/daily-expenses"].unshift(newExpense); // Lo ponemos al principio

          // Agregar extracción al historial simulado
          mockDb["/stats/activity-log"].unshift({
            id: `gasto-${Date.now()}`,
            type: "Extracción",
            date: new Date().toISOString(),
            details: `${body.reason} - $${body.amount}`,
            icon: "Wallet",
            color: "text-red-600",
            bg: "bg-red-600/10"
          });
          return resolve({ data: newExpense, status: 201, config, headers: {} });
        }

        // Interceptar retiro de mercadería para uso interno
        if (config.method === 'post' && url.includes('/internal-withdrawals')) {
          const body = JSON.parse(config.data);
          const product = mockDb["/products"].find(p => p.id === body.productId);
          const productName = product ? product.name : "Producto";
          
          // Agregar retiro al historial simulado
          mockDb["/stats/activity-log"].unshift({
            id: `retiro-${Date.now()}`,
            type: "Retiro Consumo",
            date: new Date().toISOString(),
            details: `${body.quantity}x ${productName}`,
            icon: "PackageMinus",
            color: "text-primary",
            bg: "bg-primary/20"
          });
          return resolve({ data: { success: true }, status: 201, config, headers: {} });
        }

        // Buscamos si tenemos una respuesta simulada para esta ruta
        const matchedKey = Object.keys(mockDb).find(key => url.includes(key));
        
        if (matchedKey) {
          resolve({ data: mockDb[matchedKey], status: 200, statusText: 'OK', headers: {}, config, request: {} });
        } else {
          // Si no hay mock configurado para la ruta, devolvemos éxito por defecto para que la app no crashee
          resolve({ data: config.method === 'get' ? [] : { success: true }, status: 200, statusText: 'OK', headers: {}, config, request: {} });
        }
      }, 300);
    });
  };
}

export default api;
