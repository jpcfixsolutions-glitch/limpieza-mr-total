import { ShoppingCart, Package, DollarSign, Settings, LogOut, Home, BarChart3, Users, ShieldCheck, NotebookPen, Warehouse, ClipboardList, Truck, ArrowLeftRight } from "lucide-react";
import logo from "../../img/Logotipo Mister Total con Aro Azul.png";

export function Sidebar({ activeView, onViewChange, role, onLogout, businessUnit = "LOCAL", onBusinessUnitChange }) {
  const localMenuItems = [
    { id: "creador", icon: ShieldCheck, label: "Suscripción", roles: ["creador"] },
    { id: "inicio", icon: Home, label: "Inicio", roles: ["admin"] },
    { id: "ventas", icon: ShoppingCart, label: "Ventas", roles: ["admin", "cajero"] },
    { id: "inventario", icon: Package, label: "Stock", roles: ["admin"] },
    { id: "caja", icon: DollarSign, label: "Caja", roles: ["admin", "cajero"] },
    { id: "cuentas", icon: NotebookPen, label: "Cuentas", roles: ["admin", "cajero"] },
    { id: "estadisticas", icon: BarChart3, label: "Stats", roles: ["admin"] },
    { id: "usuarios", icon: Users, label: "Usuarios", roles: ["admin"] },
    { id: "configuracion", icon: Settings, label: "Config", roles: ["admin"] },
  ];
  const warehouseMenuItems = [
    { id: "warehouse-home", icon: Home, label: "Inicio", roles: ["admin"] },
    { id: "warehouse-orders", icon: ClipboardList, label: "Pedidos", roles: ["admin"] },
    { id: "warehouse-stock", icon: Package, label: "Stock e insumos", roles: ["admin"] },
    { id: "warehouse-purchases", icon: Truck, label: "Compras", roles: ["admin"] },
    { id: "warehouse-customers", icon: NotebookPen, label: "Clientes y cuentas", roles: ["admin"] },
    { id: "warehouse-movements", icon: ArrowLeftRight, label: "Movimientos", roles: ["admin"] },
    { id: "warehouse-stats", icon: BarChart3, label: "Estadísticas", roles: ["admin"] },
  ];

  const visibleMenuItems = (businessUnit === "WAREHOUSE" ? warehouseMenuItems : localMenuItems).filter((item) => item.roles.includes(role));

  return (
    <>
      {/* Sidebar desktop */}
      <div className="hidden md:flex bg-sidebar border-r border-foreground/10 flex-col py-6 h-screen sticky top-0 shrink-0 group w-20 hover:w-64 transition-all duration-300 overflow-hidden z-50">
        <div className="mb-8 w-full px-3 flex items-center h-16">
          <img src={logo} alt="Mr.Total" className="w-14 group-hover:w-48 h-16 object-contain transition-all duration-300" />
        </div>

        <div className="flex-1 flex flex-col gap-2 w-full px-3">
          {role === "admin" && (
            <button onClick={() => onBusinessUnitChange?.(businessUnit === "LOCAL" ? "WAREHOUSE" : "LOCAL")} title={`Cambiar a ${businessUnit === "LOCAL" ? "Galpón" : "Local"}`} className="w-full min-h-12 rounded-lg flex items-center px-4 gap-4 bg-primary/10 text-foreground font-bold overflow-hidden mb-2">
              <Warehouse size={24} className="shrink-0" />
              <span className="text-sm opacity-0 group-hover:opacity-100 whitespace-nowrap">{businessUnit === "LOCAL" ? "Local" : "Galpón"} · Cambiar</span>
            </button>
          )}
          {visibleMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                title={item.label}
                className={`w-full h-12 rounded-lg flex items-center px-4 gap-4 transition-all font-medium overflow-hidden ${
                  isActive ? "bg-secondary text-foreground shadow-md" : "text-foreground hover:bg-white/45"
                }`}
              >
                <Icon size={24} className="shrink-0" />
                <span className="text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="w-full px-3 mt-auto pt-4 border-t border-foreground/15">
          <button
            onClick={onLogout}
              title="Salir"
              className="w-full h-12 rounded-lg flex items-center px-4 gap-4 text-foreground hover:bg-white/45 transition-all font-medium overflow-hidden"
          >
              <LogOut size={24} className="shrink-0" />
              <span className="text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">Salir</span>
          </button>
        </div>
      </div>

      {/* Barra de navegación inferior — móvil */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-sidebar border-t border-foreground/10 flex md:hidden z-40 safe-area-pb overflow-x-auto">
        {role === "admin" && (
          <button onClick={() => onBusinessUnitChange?.(businessUnit === "LOCAL" ? "WAREHOUSE" : "LOCAL")} className="min-w-16 flex-1 flex flex-col items-center justify-center gap-0.5 text-primary font-bold">
            <Warehouse size={20} />
            <span className="text-[9px]">{businessUnit === "LOCAL" ? "Local" : "Galpón"}</span>
          </button>
        )}
        {visibleMenuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-all active:scale-90 font-medium ${
                isActive ? "text-secondary" : "text-foreground/60"
              }`}
            >
              <Icon size={20} />
              <span className="text-[9px] leading-tight">{item.label}</span>
            </button>
          );
        })}
        <button
          onClick={onLogout}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-foreground/60 active:scale-90 transition-all font-medium"
        >
          <LogOut size={20} />
          <span className="text-[9px] leading-tight">Salir</span>
        </button>
      </nav>
    </>
  );
}
