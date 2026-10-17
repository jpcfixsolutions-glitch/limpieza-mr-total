import { useState, useEffect } from "react";
import { Toaster } from "sonner";
import { Sidebar } from "./components/Sidebar.jsx";
import { VentasView } from "./components/VentasView.jsx";
import { InventarioView } from "./components/InventarioView.jsx";
import { CajaView } from "./components/CajaView.jsx";
import { LoginView } from "./components/LoginView.jsx";
import { InicioView } from "./components/InicioView.jsx";
import { ConfiguracionView } from "./components/ConfiguracionView.jsx";
import { EstadisticasView } from "./components/EstadisticasView.jsx";
import { UsuariosView } from "./components/UsuariosView.jsx";
import { CuentasCorrientesView } from "./components/CuentasCorrientesView.jsx";
import { CreadorView } from "./components/CreadorView.jsx";
import { Loader } from "./components/Loader.jsx";
import { SubscriptionProvider } from "./modules/subscription/SubscriptionContext.jsx";
import { SubscriptionOverlay } from "./modules/subscription/SubscriptionOverlay.jsx";
import { BusinessUnitSelection } from "./components/BusinessUnitSelection.jsx";
import { WarehouseHomeView, WarehouseOrdersView, WarehouseStockView, WarehousePurchasesView, WarehouseCustomersView, WarehouseMovementsView, WarehouseStatsView } from "./components/WarehouseViews.jsx";
import api from "../services/api.js";

const toastOptions = {
  duration: 2000,
  style: {
    background: "var(--color-surface)",
    color: "var(--color-foreground)",
    border: "1px solid color-mix(in srgb, var(--color-foreground) 15%, transparent)",
  },
};

export default function App() {
  const [activeView, setActiveView] = useState("ventas");
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [businessUnit, setBusinessUnit] = useState(() => {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) return null;
    const parsed = JSON.parse(storedUser);
    if (parsed.role === "admin") return localStorage.getItem("businessUnit") || null;
    return "LOCAL";
  });

  // Estado de caja (sincronizado con el backend)
  const [cajaStatus, setCajaStatus] = useState({ isOpen: false, register: null });
  const [appLoading, setAppLoading] = useState(false);

  // Transacciones de la caja actual (en memoria para velocidad, se persisten en el backend)
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    document.title = "Mr.Total";
    if (user && businessUnit === "LOCAL") {
      fetchCajaStatus(true);
    } else if (businessUnit === "WAREHOUSE") {
      setCajaStatus({ isOpen: false, register: null });
      setTransactions([]);
    }
  }, [user, businessUnit]);

  async function fetchCajaStatus(showLoader = false) {
    if (showLoader) setAppLoading(true);
    try {
      const { data } = await api.get("/cash-register/status");
      setCajaStatus(data);
      if (data.isOpen && data.register) {
        try {
          const txRes = await api.get(`/transactions/register/${data.register.id}`);
          setTransactions(txRes.data.map((t) => ({
            id: String(t.id),
            date: t.date,
            time: t.time,
            total: Number(t.total),
            discountPercent: Number(t.discountPercent || 0),
            discountAmount: Number(t.discountAmount || 0),
            payments: (t.payments || []).map((p) => ({
              type: p.methodName,
              amount: Number(p.amount),
              baseAmount: Number(p.baseAmount || p.amount),
              surchargePercent: Number(p.surchargePercent || 0),
            })),
            items: (t.items || []).map((i) => ({
              name: i.productName || i.name,
              quantity: Number(i.quantity),
              total: Number(i.total),
            })),
          })));
        } catch {
          setTransactions([]);
        }
      } else {
        setTransactions([]);
      }
    } catch (err) {
      console.error("[Caja] Error al obtener estado de caja:", err?.response?.data || err?.message);
    } finally {
      setAppLoading(false);
    }
  }

  async function handleOpenCaja(amount) {
    try {
      const { data } = await api.post("/cash-register/open", { initialCash: amount });
      setCajaStatus({ isOpen: true, register: data });
      setTransactions([]);
    } catch (err) {
      // Si el backend dice que ya hay una caja abierta, sincronizar el estado del frontend
      if (err.response?.status === 409) {
        await fetchCajaStatus();
      }
      throw err;
    }
  }

  async function handleCloseCaja(closureData = {}) {
    if (!cajaStatus.register) return;
    await api.post("/cash-register/close", {
      registerId: cajaStatus.register.id,
      ...closureData,
    });
    // Solo actualizar el estado local DESPUÉS de confirmar que el backend cerró la caja
    setCajaStatus({ isOpen: false, register: null, suggestedInitialCash: 0 });
    setTransactions([]);
    // Resincronizar para confirmar el estado real del backend
    await fetchCajaStatus();
  }

  async function handleAddTransaction(transaction) {
    const payload = {
      total: transaction.total,
      customerId: transaction.customerId ?? null,
      discountPercent: transaction.discountPercent ?? 0,
      discountAmount: transaction.discountAmount ?? 0,
      payments: transaction.payments,
      items: transaction.items,
      idempotencyKey: transaction.idempotencyKey || crypto.randomUUID(),
    };
    const { data } = await api.post("/transactions", payload);
    const normalized = {
      id: String(data.id),
      date: data.date,
      time: data.time,
      total: Number(data.total),
      discountPercent: Number(data.discountPercent || 0),
      discountAmount: Number(data.discountAmount || 0),
      payments: (data.payments || []).map((p) => ({
        type: p.methodName,
        amount: Number(p.amount),
        baseAmount: Number(p.baseAmount || p.amount),
        surchargePercent: Number(p.surchargePercent || 0),
      })),
      items: (data.items || []).map((i) => ({
        name: i.productName || i.name,
        quantity: Number(i.quantity),
        total: Number(i.total),
      })),
    };
    setTransactions((prev) => [normalized, ...prev]);
  }

  function handleLogin(loggedUser) {
    setUser(loggedUser);
    if (loggedUser.role === "creador") {
      setActiveView("creador");
    } else if (loggedUser.role === "admin") {
      localStorage.removeItem("businessUnit");
      setBusinessUnit(null);
      setActiveView("inicio");
    } else {
      localStorage.setItem("businessUnit", "LOCAL");
      setBusinessUnit("LOCAL");
      setActiveView("ventas");
    }
  }

  function handleBusinessUnitChange(code) {
    if (user.role !== "admin" && code !== "LOCAL") return;
    localStorage.setItem("businessUnit", code);
    setBusinessUnit(code);
    setTransactions([]);
    setCajaStatus({ isOpen: false, register: null });
    setActiveView(code === "WAREHOUSE" ? "warehouse-home" : "inicio");
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("businessUnit");
    setUser(null);
    setBusinessUnit(null);
    setActiveView("ventas");
    setCajaStatus({ isOpen: false, register: null });
    setTransactions([]);
  }

  if (!user) {
    return (
      <>
        <LoginView onLogin={handleLogin} />
        <Toaster position="bottom-left" toastOptions={toastOptions} />
      </>
    );
  }

  if (user.role === "admin" && !businessUnit) {
    return <BusinessUnitSelection user={user} onSelect={handleBusinessUnitChange} onLogout={handleLogout} />;
  }

  return (
    <SubscriptionProvider>
      <div key={businessUnit} className="size-full flex bg-background text-foreground relative overflow-x-hidden min-h-screen">
        {appLoading && <Loader fullScreen />}
        <Sidebar
          activeView={activeView}
          onViewChange={setActiveView}
          role={user.role}
          onLogout={handleLogout}
          businessUnit={businessUnit}
          onBusinessUnitChange={handleBusinessUnitChange}
        />

        {businessUnit === "WAREHOUSE" && activeView === "warehouse-home" && <WarehouseHomeView />}
        {businessUnit === "WAREHOUSE" && activeView === "warehouse-orders" && <WarehouseOrdersView />}
        {businessUnit === "WAREHOUSE" && activeView === "warehouse-stock" && <WarehouseStockView />}
        {businessUnit === "WAREHOUSE" && activeView === "warehouse-purchases" && <WarehousePurchasesView />}
        {businessUnit === "WAREHOUSE" && activeView === "warehouse-customers" && <WarehouseCustomersView />}
        {businessUnit === "WAREHOUSE" && activeView === "warehouse-movements" && <WarehouseMovementsView />}
        {businessUnit === "WAREHOUSE" && activeView === "warehouse-stats" && <WarehouseStatsView />}

        {businessUnit === "LOCAL" && activeView === "creador" && user.role === "creador" && <CreadorView />}

        {businessUnit === "LOCAL" && activeView === "inicio" && user.role === "admin" && (
          <InicioView
            isCajaOpen={cajaStatus.isOpen}
            onOpenCaja={handleOpenCaja}
            onCloseCaja={handleCloseCaja}
            transactions={transactions}
            suggestedInitialCash={cajaStatus.suggestedInitialCash || 0}
          />
        )}
        {businessUnit === "LOCAL" && activeView === "ventas" && user.role !== "creador" && (
          <VentasView
            isCajaOpen={cajaStatus.isOpen}
            onAddTransaction={handleAddTransaction}
            onSyncCaja={() => fetchCajaStatus()}
            onOpenCaja={handleOpenCaja}
            role={user.role}
            suggestedInitialCash={cajaStatus.suggestedInitialCash || 0}
          />
        )}
        {businessUnit === "LOCAL" && activeView === "inventario" && user.role === "admin" && <InventarioView />}
        {businessUnit === "LOCAL" && activeView === "caja" && user.role !== "creador" && (
          <CajaView
            role={user.role}
            isCajaOpen={cajaStatus.isOpen}
            register={cajaStatus.register}
            onOpenCaja={handleOpenCaja}
            onCloseCaja={handleCloseCaja}
            transactions={transactions}
            onRefresh={fetchCajaStatus}
            suggestedInitialCash={cajaStatus.suggestedInitialCash || 0}
          />
        )}
        {businessUnit === "LOCAL" && activeView === "cuentas" && user.role !== "creador" && <CuentasCorrientesView />}
        {businessUnit === "LOCAL" && activeView === "estadisticas" && user.role === "admin" && <EstadisticasView />}
        {businessUnit === "LOCAL" && activeView === "usuarios" && user.role === "admin" && <UsuariosView />}
        {businessUnit === "LOCAL" && activeView === "configuracion" && user.role === "admin" && <ConfiguracionView />}

        <SubscriptionOverlay userRole={user.role} onLogout={handleLogout} />
        <Toaster position="bottom-left" toastOptions={toastOptions} />
      </div>
    </SubscriptionProvider>
  );
}
