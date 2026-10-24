import { createPortal } from "react-dom";
import logo from "../../img/Logotipo Mister Total con Aro Azul.png";

const money = (value) => `$${Number(value || 0).toFixed(2)}`;

const saleModeLabel = (item) => {
  if (item.saleMode === "mayorista") return "Precio mayorista";
  if (item.saleMode === "paquete") return `Bulto x${Number(item.unitsPerPack || 1)}`;
  if (item.saleMode === "escala") return `Cantidad x${Number(item.unitsPerPack || 1)}`;
  if (item.saleMode === "promocion") return "Promoción";
  return null;
};

export function SaleTicket({ transaction }) {
  if (!transaction) return null;

  const items = transaction.items || [];
  const payments = transaction.payments || [];
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );
  const surchargeAmount = payments.reduce(
    (sum, payment) => sum + Math.max(0, Number(payment.amount || 0) - Number(payment.baseAmount || payment.amount || 0)),
    0
  );

  return createPortal(
    <section className="sale-ticket" aria-hidden="true">
      <header className="sale-ticket__header">
        <img src={logo} alt="Mr. Total Limpieza" className="sale-ticket__logo" />
        <h1>Mr. Total Limpieza</h1>
        <p>Comprobante no fiscal</p>
      </header>

      <div className="sale-ticket__meta">
        <p><strong>Venta:</strong> #{transaction.id}</p>
        <p><strong>Fecha:</strong> {[transaction.date, transaction.time].filter(Boolean).join(" · ")}</p>
        {transaction.customerName && <p><strong>Cliente:</strong> {transaction.customerName}</p>}
      </div>

      <div className="sale-ticket__divider" />

      <div className="sale-ticket__items">
        {items.map((item, index) => {
          const quantity = Number(item.quantity || 0);
          const unitPrice = Number(item.price || 0);
          const originalLineTotal = unitPrice * quantity;
          return (
            <div className="sale-ticket__item" key={`${item.productId || item.promotionId || index}-${index}`}>
              <div className="sale-ticket__item-name">
                <strong>{item.name}</strong>
                {saleModeLabel(item) && <span>{saleModeLabel(item)}</span>}
              </div>
              <div className="sale-ticket__item-detail">
                <span>{quantity} × {money(unitPrice)}</span>
                <strong>{money(originalLineTotal)}</strong>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sale-ticket__divider" />

      <div className="sale-ticket__totals">
        <div><span>Subtotal</span><span>{money(subtotal)}</span></div>
        {Number(transaction.discountAmount) > 0 && (
          <div>
            <span>Descuento ({Number(transaction.discountPercent || 0)}%)</span>
            <span>-{money(transaction.discountAmount)}</span>
          </div>
        )}
        {surchargeAmount > 0 && (
          <div><span>Recargos</span><span>{money(surchargeAmount)}</span></div>
        )}
        <div className="sale-ticket__grand-total">
          <span>TOTAL</span>
          <span>{money(transaction.total)}</span>
        </div>
      </div>

      <div className="sale-ticket__divider" />

      <div className="sale-ticket__payments">
        <strong>Forma de pago</strong>
        {payments.map((payment, index) => (
          <div key={`${payment.type}-${index}`}>
            <span>
              {payment.type}
              {Number(payment.surchargePercent) > 0 ? ` (+${Number(payment.surchargePercent)}%)` : ""}
            </span>
            <span>{money(payment.amount)}</span>
          </div>
        ))}
      </div>

      <footer className="sale-ticket__footer">
        <p>¡Gracias por su compra!</p>
      </footer>
    </section>,
    document.body
  );
}
