import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Search, Lock, Wallet, ShoppingCart, Unlock, X, ScanBarcode } from "lucide-react";
import { ProductCard } from "./ProductCard.jsx";
import { CartSidebar } from "./CartSidebar.jsx";
import { PaymentModal } from "./PaymentModal.jsx";
import { DailyExpenseModal } from "./DailyExpenseModal.jsx";
import { Loader } from "./Loader.jsx";
import { toast } from "sonner";
import api from "../../services/api.js";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner.js";
import { hasPackSale, lineIdFor, packSizeOf, packTypeLabel, unitsEachOf, unitsInCartForProduct } from "../../utils/pack.js";
import { formatCatalogPrice } from "../../utils/price.js";
import { ACCOUNT_METHOD_NAME } from "../constants.js";
import { PaginationBar, paginate, byNameEs } from "./PaginationBar.jsx";

import { OpenCajaModal } from "./OpenCajaModal.jsx";
import { PromotionCard } from "./PromotionCard.jsx";

export function VentasView({ isCajaOpen, onAddTransaction, onSyncCaja, onOpenCaja, role, suggestedInitialCash = 0 }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [cartItems, setCartItems] = useState([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [products, setProducts] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [page, setPage] = useState(1);
  const cartRef = useRef(cartItems);
  cartRef.current = cartItems;

  const fetchProducts = useCallback(() => {
    return Promise.all([api.get("/products"), api.get("/promotions")]).then(([pRes, promoRes]) => { setProducts(pRes.data); setPromotions(promoRes.data); }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/products"),
      api.get("/payment-methods"),
      api.get("/categories"),
      api.get("/promotions"),
    ]).then(([pRes, mRes, cRes, promoRes]) => {
      setProducts(pRes.data);
      setPaymentMethods(mRes.data);
      setCategories(
        cRes.data
          .map((c) => c.name)
          .sort(byNameEs)
      );
      setPromotions(promoRes.data);
    }).catch(() => {})
    .finally(() => setLoading(false));
  }, []);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.toLowerCase();
    const code = searchTerm.trim();
    return products
      .filter((product) => {
        const matchesSearch =
          (product.name || "").toLowerCase().includes(term) ||
          (product.codbarra && String(product.codbarra).includes(code));
        const matchesCategory = selectedCategory === "Todos" || product.category === selectedCategory;
        return matchesSearch && matchesCategory && product.isAvailable;
      })
      .sort((a, b) => byNameEs(a.name, b.name));
  }, [products, searchTerm, selectedCategory]);

  const filteredPromotions = useMemo(() => {
    if (selectedCategory !== "Todos") return [];
    const term = searchTerm.trim().toLowerCase();
    return promotions.filter((promotion) => !term || promotion.name.toLowerCase().includes(term) || promotion.items.some((item) => item.name.toLowerCase().includes(term) || String(item.codbarra || "").includes(searchTerm.trim())));
  }, [promotions, searchTerm, selectedCategory]);

  useEffect(() => { setPage(1); }, [searchTerm, selectedCategory]);

  const paged = paginate(filteredProducts, page);

  const productByBarcode = useMemo(() => {
    const map = new Map();
    for (const p of products) {
      const code = p.codbarra && String(p.codbarra);
      if (code && !map.has(code)) map.set(code, p);
    }
    return map;
  }, [products]);

  const handleAddToCart = useCallback((product, saleMode = "unidad", extra = {}) => {
    const canPack = hasPackSale(product);
    let mode = "unidad";
    let unitsEach = 1;
    let price = Number(product.price);
    let lineExtra;
    let toastLabel = product.name;

    if (saleMode === "paquete" && canPack) {
      mode = "paquete";
      unitsEach = packSizeOf(product);
      price = Number(product.packPrice);
      toastLabel = `${product.name} (${packTypeLabel(product)} x${unitsEach})`;
    } else if (saleMode === "escala" && extra.tier) {
      mode = "escala";
      unitsEach = Number(extra.tier.quantity);
      price = Number(extra.tier.price);
      lineExtra = unitsEach;
      toastLabel = `${product.name} (x${unitsEach})`;
    }

    const lineId = lineIdFor(product.id, mode, lineExtra);
    const prev = cartRef.current;
    const usedForProduct = prev.reduce((sum, item) => sum + (item.components ? (item.components.find((component) => component.productId === product.id)?.quantity || 0) * item.quantity : ((item.productId ?? item.id) === product.id ? unitsEachOf(item) * item.quantity : 0)), 0);
    const remaining = Number(product.stock) - usedForProduct;

    if (remaining < unitsEach) {
      toast.error("Sin stock suficiente", {
        description: unitsEach > 1
          ? `Quedan ${Math.max(0, remaining)} u. de ${product.name}; esta venta son ${unitsEach} u.`
          : `Solo hay ${product.stock} unidad${product.stock === 1 ? "" : "es"} de ${product.name}`,
      });
      return;
    }

    const existing = prev.find((item) => item.lineId === lineId);
    const next = existing
      ? prev.map((item) => item.lineId === lineId
        ? { ...item, quantity: item.quantity + 1, stock: product.stock }
        : item)
      : [...prev, {
        lineId,
        id: product.id,
        productId: product.id,
        name: product.name,
        saleMode: mode,
        price,
        unitsEach,
        unitsPerPack: unitsEach,
        packTypeName: product.packTypeName,
        stock: product.stock,
        quantity: 1,
      }];
    cartRef.current = next;
    setCartItems(next);
    toast.success(`${toastLabel} agregado`);
  }, []);

  const handleAddPromotion = useCallback((promotion) => {
    const previous = cartRef.current;
    const requirements = new Map();
    for (const line of previous) {
      if (line.components) for (const component of line.components) requirements.set(component.productId, (requirements.get(component.productId) || 0) + component.quantity * line.quantity);
      else requirements.set(line.productId ?? line.id, (requirements.get(line.productId ?? line.id) || 0) + unitsEachOf(line) * line.quantity);
    }
    const insufficient = promotion.items.find((component) => Number(component.stock) - (requirements.get(component.productId) || 0) < Number(component.quantity));
    if (insufficient) return toast.error("Sin stock suficiente", { description: `No alcanza ${insufficient.name} para esta promoción.` });
    const lineId = `promocion-${promotion.id}`;
    const next = previous.some((line) => line.lineId === lineId) ? previous.map((line) => line.lineId === lineId ? { ...line, quantity: line.quantity + 1, components: promotion.items } : line) : [...previous, { lineId, promotionId: promotion.id, name: promotion.name, price: Number(promotion.price), quantity: 1, saleMode: "promocion", components: promotion.items, compositionLabel: promotion.items.map((item) => `${item.quantity}× ${item.name}`).join(" · "), availableQuantity: promotion.availableQuantity }];
    cartRef.current = next; setCartItems(next); toast.success(`${promotion.name} agregada`);
  }, []);

  const handleBarcodeScan = useCallback((code) => {
    const product = productByBarcode.get(String(code));
    if (!product || !product.isAvailable) {
      toast.error("Producto no encontrado", { description: `No hay producto con código ${code}` });
      return;
    }
    handleAddToCart(product, "unidad");
  }, [productByBarcode, handleAddToCart]);

  useBarcodeScanner({
    onScan: handleBarcodeScan,
    enabled: isCajaOpen && !showPaymentModal && !showExpenseModal && !showOpenModal && !showMobileCart,
  });

  const handleSearchKeyDown = (e) => {
    if (e.key !== "Enter" || !searchTerm.trim()) return;
    const code = searchTerm.trim();
    if (!/^\d+$/.test(code)) return;

    const product = productByBarcode.get(code);
    if (product && product.isAvailable) {
      e.preventDefault();
      handleAddToCart(product, "unidad");
      setSearchTerm("");
    }
  };

  const handleUpdateQuantity = (lineId, quantity) => {
    if (quantity <= 0) { handleRemoveItem(lineId); return; }
    const item = cartItems.find((i) => i.lineId === lineId);
    if (!item) return;
    if (item.components) {
      const insufficient = item.components.find((component) => {
        const used = cartItems.filter((line) => line.lineId !== lineId).reduce((sum, line) => sum + (line.components ? (line.components.find((c) => c.productId === component.productId)?.quantity || 0) * line.quantity : ((line.productId ?? line.id) === component.productId ? unitsEachOf(line) * line.quantity : 0)), 0);
        return Number(component.stock) - used < Number(component.quantity) * quantity;
      });
      if (insufficient) return toast.error("Sin stock suficiente", { description: `No alcanza ${insufficient.name} para esa cantidad.` });
      return setCartItems((prev) => prev.map((line) => line.lineId === lineId ? { ...line, quantity } : line));
    }
    const others = cartItems.filter((line) => line.lineId !== lineId).reduce((sum, line) => sum + (line.components ? (line.components.find((c) => c.productId === (item.productId ?? item.id))?.quantity || 0) * line.quantity : ((line.productId ?? line.id) === (item.productId ?? item.id) ? unitsEachOf(line) * line.quantity : 0)), 0);
    const unitsEach = unitsEachOf(item);
    if (others + quantity * unitsEach > item.stock) {
      toast.error("Sin stock suficiente", { description: `Solo hay ${item.stock} unidad${item.stock === 1 ? "" : "es"} de ${item.name}` });
      return;
    }
    setCartItems((prev) => prev.map((i) => i.lineId === lineId ? { ...i, quantity } : i));
  };

  const handleRemoveItem = (lineId) => {
    setCartItems((prev) => prev.filter((item) => item.lineId !== lineId));
    toast.info("Producto eliminado del carrito");
  };

  const handleConfirmPayment = async (payments, meta = {}) => {
    const finalTotal = payments.reduce((sum, p) => sum + p.finalAmount, 0);
    const accountTotal = payments
      .filter((p) => p.type === ACCOUNT_METHOD_NAME)
      .reduce((sum, p) => sum + p.finalAmount, 0);
    const transaction = {
      total: finalTotal,
      customerId: meta.customerId ?? null,
      payments: payments.map((p) => ({
        type: p.type,
        amount: p.finalAmount,
        baseAmount: p.baseAmount,
        surchargePercent: p.surchargePercent,
      })),
      items: cartItems.map((item) => ({
        productId: item.promotionId ? null : (item.productId ?? item.id),
        promotionId: item.promotionId || null,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        total: item.price * item.quantity,
        saleMode: item.saleMode || "unidad",
        unitsPerPack: item.unitsPerPack || 1,
      })),
    };

    try {
      await onAddTransaction(transaction);
      toast.success("Venta procesada exitosamente", {
        description: accountTotal > 0
          ? `Cobrado ahora: $${(finalTotal - accountTotal).toFixed(2)} · A cuenta: $${accountTotal.toFixed(2)}`
          : `Total cobrado: $${finalTotal.toFixed(2)}`,
      });
      setCartItems([]);
      setShowPaymentModal(false);
      fetchProducts();
    } catch (err) {
      toast.error("No se pudo registrar la venta", { description: err.response?.data?.message || err.message });
      throw err;
    }
  };

  const handleConfirmOpen = async (amount) => {
    try {
      await onOpenCaja(amount);
      setShowOpenModal(false);
      toast.success("Caja abierta exitosamente");
    } catch (err) {
      toast.error(err.response?.data?.message || "Error al abrir la caja");
      throw err;
    }
  };

  const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalCartItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const handleOpenCheckout = () => {
    setShowMobileCart(false);
    setShowPaymentModal(true);
  };

  const handleDailyExpense = async (expenseData) => {
    try {
      await api.post("/daily-expenses", expenseData);
      toast.success("Gasto registrado correctamente");
      setShowExpenseModal(false);
    } catch (err) {
      toast.error("Error al registrar el gasto", { description: err.response?.data?.message || err.message });
      throw err;
    }
  };

  return (
    <div className="flex-1 min-w-0 flex relative overflow-hidden">
      {loading && <Loader />}
      {!isCajaOpen && (
        <div className="absolute inset-0 z-50 backdrop-blur-md bg-background/60 flex items-center justify-center p-4">
          <div className="bg-surface p-6 md:p-8 rounded-2xl border border-foreground/15 text-center max-w-sm md:max-w-md shadow-2xl w-full">
            <div className="w-14 h-14 md:w-16 md:h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock size={28} />
            </div>
            <h2 className="text-primary text-xl md:text-2xl font-bold mb-2">Caja Cerrada</h2>
            {role === "admin" ? (
              <>
                <p className="text-foreground/80 text-sm md:text-base mb-4">Abrí la caja para comenzar a registrar ventas.</p>
                <button
                  onClick={() => setShowOpenModal(true)}
                  className="w-full bg-success hover:brightness-125 text-foreground font-bold py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <Unlock size={18} /> Abrir Caja
                </button>
              </>
            ) : (
              <p className="text-foreground/80 text-sm md:text-base">Pedile al administrador que abra la caja.</p>
            )}
          </div>
        </div>
      )}

      {/* Área principal de productos */}
      <div className="flex-1 p-4 pb-24 md:p-8 md:pb-8 overflow-y-auto">
        <div className="mb-6 md:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 md:mb-6 gap-3">
            <h1 className="text-foreground font-bold text-2xl md:text-4xl">Punto de Venta</h1>
            {isCajaOpen && (
              <button
                onClick={() => setShowExpenseModal(true)}
                className="bg-primary hover:bg-secondary text-foreground font-medium px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors text-sm md:text-base self-start sm:self-auto shadow-sm"
              >
                <Wallet size={18} />
                Gastos / Extracción
              </button>
            )}
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/60" size={20} />
            <input
              type="text"
              placeholder="Buscar o escanear código de barras..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="w-full bg-surface text-foreground placeholder-foreground/60 rounded-xl pl-12 pr-12 py-3 md:py-4 border border-foreground/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all font-medium"
            />
            <ScanBarcode className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground/40" size={20} title="Pistola lectora activa" />
          </div>
          {isCajaOpen && (
            <p className="text-foreground/60 text-xs font-medium mb-4 -mt-2">
              Escaneá un código con la pistola o ingresalo y presioná Enter para agregar al carrito.
            </p>
          )}

          <div className="mb-2">
            <label className="text-foreground/80 font-bold text-sm block mb-2">Categoría</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full sm:max-w-sm bg-surface text-foreground font-bold rounded-xl px-4 py-3 border border-foreground/15 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-sm"
            >
              <option value="Todos">Todas las categorías</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {filteredProducts.length === 0 && (
            <p className="text-foreground/60 font-medium text-center py-12">No hay productos disponibles</p>
          )}
          {paged.slice.map((product) => (
            <ProductCard key={product.id} product={product} onAddToCart={handleAddToCart} />
          ))}
          {filteredPromotions.map((promotion) => <PromotionCard key={`promotion-${promotion.id}`} promotion={promotion} onAddToCart={handleAddPromotion} />)}
        </div>
        <PaginationBar
          page={paged.page}
          pageCount={paged.pageCount}
          total={paged.total}
          start={paged.start}
          end={paged.end}
          onPageChange={setPage}
        />
      </div>

      {/* Botón flotante del carrito — solo móvil */}
      <div className="fixed bottom-20 right-4 md:hidden z-30">
        <button
          onClick={() => setShowMobileCart(true)}
          className="bg-secondary hover:brightness-125 text-foreground h-14 px-5 rounded-full flex items-center gap-2.5 shadow-xl shadow-foreground/30 transition-all active:scale-95"
        >
          <ShoppingCart size={20} />
          {totalCartItems > 0 && (
            <span className="bg-primary text-foreground rounded-full w-5 h-5 text-xs flex items-center justify-center font-bold leading-none">
              {totalCartItems}
            </span>
          )}
          <span className="font-medium">${formatCatalogPrice(total)}</span>
        </button>
      </div>

      <CartSidebar
        items={cartItems}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onCheckout={handleOpenCheckout}
        isMobileOpen={showMobileCart}
        onMobileClose={() => setShowMobileCart(false)}
        getMaxQuantity={(item) => item.components ? Math.max(0, Math.min(...item.components.map((component) => Math.floor((Number(component.stock) - cartItems.filter((line) => line.lineId !== item.lineId).reduce((sum, line) => sum + (line.components ? (line.components.find((c) => c.productId === component.productId)?.quantity || 0) * line.quantity : ((line.productId ?? line.id) === component.productId ? unitsEachOf(line) * line.quantity : 0)), 0)) / Number(component.quantity))))) : undefined}
      />

      {showPaymentModal && paymentMethods.length > 0 && (
        <PaymentModal
          total={total}
          paymentMethods={paymentMethods}
          onClose={() => setShowPaymentModal(false)}
          onConfirm={handleConfirmPayment}
        />
      )}
      {showPaymentModal && paymentMethods.length === 0 && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-md border border-foreground/15 p-8 text-center shadow-2xl">
            <p className="text-foreground text-xl mb-4 font-bold">No hay métodos de pago configurados</p>
            <p className="text-foreground/70 mb-6 font-medium">Configurá al menos un método de pago en la sección Configuración.</p>
            <button onClick={() => setShowPaymentModal(false)} className="bg-secondary hover:brightness-125 text-foreground px-6 py-3 rounded-xl font-bold">Cerrar</button>
          </div>
        </div>
      )}

      {showExpenseModal && (
        <DailyExpenseModal
          onClose={() => setShowExpenseModal(false)}
          onSubmit={handleDailyExpense}
        />
      )}

      <OpenCajaModal
        isOpen={showOpenModal}
        onClose={() => setShowOpenModal(false)}
        onConfirm={handleConfirmOpen}
        suggestedAmount={suggestedInitialCash}
      />
    </div>
  );
}
