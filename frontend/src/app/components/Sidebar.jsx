import { ShoppingCart, Package, DollarSign, Settings, LogOut, Home, BarChart3, Users, ShieldCheck, NotebookPen } from "lucide-react";
import logo from "../../img/logo-descartables.jpeg";

export function Sidebar({ activeView, onViewChange, role, onLogout }) {
  const menuItems = [
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

  const visibleMenuItems = menuItems.filter((item) => item.roles.includes(role));

  return (
    <>
      {/* Sidebar desktop */}
      <div className="hidden md:flex bg-surface border-r border-foreground/15 flex-col py-6 h-screen sticky top-0 shrink-0 group w-20 hover:w-64 transition-all duration-300 overflow-hidden z-50">
        <div className="mb-8 w-full px-4 flex items-center h-12">
          <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden shadow-md bg-background">
            <img src={logo} alt="Descartables Yofre" className="w-full h-full object-contain" />
          </div>
          <span className="ml-3 text-primary font-black text-sm leading-tight whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300">Descartables Yofre</span>
        </div>

        <div className="flex-1 flex flex-col gap-2 w-full px-3">
          {visibleMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                title={item.label}
                className={`w-full h-12 rounded-lg flex items-center px-4 gap-4 transition-all font-medium overflow-hidden ${
                  isActive ? "bg-secondary text-foreground shadow-md" : "text-foreground/70 hover:bg-elevated hover:text-foreground"
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
              className="w-full h-12 rounded-lg flex items-center px-4 gap-4 text-foreground/70 hover:bg-elevated hover:text-foreground transition-all font-medium overflow-hidden"
          >
              <LogOut size={24} className="shrink-0" />
              <span className="text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">Salir</span>
          </button>
        </div>
      </div>

      {/* Barra de navegación inferior — móvil */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-surface border-t border-foreground/15 flex md:hidden z-40 safe-area-pb">
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
