import { Plus, Tags } from "lucide-react";
import { formatCatalogPrice } from "../../utils/price.js";
export function PromotionCard({ promotion, onAddToCart }) {
  const available = Number(promotion.availableQuantity || 0);
  return <div className="bg-surface border border-primary/40 rounded-xl p-3 md:p-4 flex items-center justify-between gap-3 shadow-sm"><div className="min-w-0"><h3 className="text-primary font-bold text-base md:text-lg flex items-center gap-2"><Tags size={18}/> {promotion.name}</h3>{promotion.description && <p className="text-foreground/70 text-sm mt-1">{promotion.description}</p>}<p className="text-foreground/60 text-xs mt-1">Incluye: {promotion.items.map((item) => `${item.quantity}× ${item.name}`).join(" · ")}</p><p className="text-foreground/60 text-xs mt-1">Disponibles: {available}</p></div><div className="flex items-center gap-3 shrink-0"><span className="font-black text-lg">${formatCatalogPrice(promotion.price)}</span><button disabled={!available} onClick={() => onAddToCart(promotion)} className="bg-secondary disabled:bg-background disabled:text-foreground/40 h-10 px-3 rounded-lg"><Plus size={18}/></button></div></div>;
}
