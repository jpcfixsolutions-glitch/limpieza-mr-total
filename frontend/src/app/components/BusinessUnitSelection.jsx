import { Building2, Warehouse } from "lucide-react";

export function BusinessUnitSelection({ user, onSelect, onLogout }) {
  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <p className="text-primary font-bold text-center">Hola, {user.name}</p>
        <h1 className="text-3xl font-black text-center mt-2 mb-2">¿En qué unidad vas a trabajar?</h1>
        <p className="text-foreground/60 text-center mb-8">La información y las operaciones se mantienen separadas.</p>
        <div className="grid md:grid-cols-2 gap-5">
          <button onClick={() => onSelect("LOCAL")} className="bg-surface border border-foreground/15 rounded-2xl p-8 text-left hover:border-primary hover:shadow-xl transition-all">
            <Building2 size={38} className="text-primary mb-5" />
            <span className="block text-2xl font-black">Entrar al Local</span>
            <span className="block text-foreground/60 mt-2">Ventas minoristas, caja, stock local y cuentas.</span>
          </button>
          <button onClick={() => onSelect("WAREHOUSE")} className="bg-surface border border-foreground/15 rounded-2xl p-8 text-left hover:border-secondary hover:shadow-xl transition-all">
            <Warehouse size={38} className="text-secondary mb-5" />
            <span className="block text-2xl font-black">Entrar al Galpón</span>
            <span className="block text-foreground/60 mt-2">Pedidos mayoristas, compras e inventario del Galpón.</span>
          </button>
        </div>
        <button onClick={onLogout} className="block mx-auto mt-8 text-sm font-bold text-foreground/60 hover:text-foreground">Cerrar sesión</button>
      </div>
    </div>
  );
}
