import { Plus, Minus, Trash2, CreditCard, X } from "lucide-react";
import { maxQuantityForLine, saleLabel } from "../../utils/pack.js";
import { formatCatalogPrice } from "../../utils/price.js";

export function CartSidebar({ items, onUpdateQuantity, onRemoveItem, onCheckout, isMobileOpen, onMobileClose, getMaxQuantity }) {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const ItemsList = () => (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {items.length === 0 ? (
        <div className="text-center text-foreground/60 font-medium mt-16">
          <p>Carrito vacío</p>
          <p className="text-sm mt-2">Agrega productos para comenzar</p>
        </div>
      ) : (
        items.map((item) => {
          const maxQty = getMaxQuantity?.(item) ?? maxQuantityForLine(items, item);
          return (
          <div key={item.lineId} className="bg-background rounded-lg p-4 shadow-sm border border-surface">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 mr-2">
                <h4 className="text-primary font-bold text-sm leading-snug">{item.name}</h4>
                <p className="text-foreground/70 mt-0.5 text-xs font-bold">{item.saleMode === "promocion" ? item.compositionLabel || "Promoción combinada" : saleLabel(item)}</p>
                <p className="text-foreground/80 mt-1 text-sm font-medium">${formatCatalogPrice(item.price)}</p>
              </div>
              <button onClick={() => onRemoveItem(item.lineId)} className="text-foreground/50 hover:text-foreground transition-colors shrink-0">
                <Trash2 size={18} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 bg-surface rounded-lg p-1">
                <button
                  onClick={() => onUpdateQuantity(item.lineId, item.quantity - 1)}
                  disabled={item.quantity <= 1}
                  className="w-8 h-8 flex items-center justify-center text-foreground hover:bg-background disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
                >
                  <Minus size={16} />
                </button>
                <span className="text-foreground font-bold w-7 text-center text-sm">{item.quantity}</span>
                <button
                  onClick={() => onUpdateQuantity(item.lineId, item.quantity + 1)}
                  disabled={item.quantity >= maxQty}
                  className="w-8 h-8 flex items-center justify-center text-foreground hover:bg-background disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
              <div className="text-right">
                <span className="text-foreground font-black block text-sm">${formatCatalogPrice(item.price * item.quantity)}</span>
                {item.stock != null && item.stock <= 5 && (
                  <span className="text-primary font-bold text-xs">Stock: {item.stock} u.</span>
                )}
              </div>
            </div>
          </div>
          );
        })
      )}
    </div>
  );

  const Footer = () => (
    <div className="p-4 md:p-6 border-t border-foreground/15 space-y-3">
      <div className="flex items-center justify-between text-lg md:text-xl">
        <span className="text-foreground/80 font-medium">Total:</span>
        <span className="text-foreground font-black">${formatCatalogPrice(total)}</span>
      </div>
      <button
        onClick={onCheckout}
        disabled={items.length === 0}
        className="w-full bg-secondary hover:brightness-125 disabled:bg-surface disabled:text-foreground/50 disabled:cursor-not-allowed text-foreground font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-secondary/20"
      >
        <CreditCard size={20} />
        Finalizar Venta
      </button>
    </div>
  );

  return (
    <>
      {/* Panel derecho — desktop */}
      <div className="hidden md:flex w-96 bg-surface border-l border-foreground/15 flex-col shrink-0">
        <div className="p-6 border-b border-foreground/15">
          <h2 className="text-primary font-bold text-2xl">Carrito</h2>
          <p className="text-foreground/70 font-medium text-sm mt-1">{itemCount} productos</p>
        </div>
        <ItemsList />
        <Footer />
      </div>

      {/* Drawer desde abajo — móvil */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          <div
            className="absolute bottom-0 left-0 right-0 bg-surface rounded-t-2xl border-t border-foreground/15 flex flex-col shadow-2xl"
            style={{ maxHeight: "85vh" }}
          >
            {/* Handle visual */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-primary/20" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-foreground/15">
              <div>
                <h2 className="text-primary text-xl font-bold">Carrito</h2>
                <p className="text-foreground/70 font-medium text-xs mt-0.5">{itemCount} productos</p>
              </div>
              <button
                onClick={onMobileClose}
                className="text-foreground/60 hover:text-foreground transition-colors p-1 rounded-lg hover:bg-background"
              >
                <X size={22} />
              </button>
            </div>
            <ItemsList />
            <Footer />
          </div>
        </div>
      )}
    </>
  );
}
