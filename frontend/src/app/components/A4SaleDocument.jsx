import { createPortal } from "react-dom";
import logo from "../../img/Logotipo Mister Total con Aro Azul.png";

const money = (value) => new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
}).format(Number(value || 0));

export function A4SaleDocument({ transaction }) {
  if (!transaction) return null;

  const payments = transaction.payments || [];
  const items = transaction.items || [];
  const paymentCondition = [...new Set(payments.map((payment) => payment.type).filter(Boolean))].join(" / ").toUpperCase() || "CONTADO";
  const subtotal = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  const surchargeAmount = payments.reduce(
    (sum, payment) => sum + Math.max(0, Number(payment.amount || 0) - Number(payment.baseAmount || payment.amount || 0)),
    0
  );

  return createPortal(
    <>
      <style className="print-document">{"@media print { @page { size: A4 portrait; margin: 10mm; } }"}</style>
      <article className="print-document a4-ticket" aria-hidden="true">
        <header className="a4-ticket__header">
          <div className="a4-ticket__brand">
            <img src={logo} alt="Mr. Total Limpieza" />
            <div>
              <p><strong>DOMICILIO:</strong> AV. ARTURO CAPDEVILA 2023</p>
              <p><strong>PROVINCIA:</strong> CÓRDOBA - CAPITAL</p>
              <p><strong>E-MAIL:</strong> mistertotal.limpieza@gmail.com</p>
            </div>
          </div>
          <div className="a4-ticket__title-block">
            <h1>REMITO</h1>
            <p>N.º: {String(transaction.id).padStart(6, "0")}</p>
            <div className="a4-ticket__tax-data">
              <p><strong>CONDICIÓN DE IVA:</strong> MONOTRIBUTO</p>
              <p><strong>CUIT:</strong> 20240730996</p>
              <p><strong>TEL:</strong> 3516108050</p>
            </div>
          </div>
        </header>

        <section className="a4-ticket__customer">
          <div className="a4-ticket__customer-row">
            <div><strong>CLIENTE:</strong> {transaction.customerName}</div>
            <div><strong>FECHA:</strong> {[transaction.date, transaction.time].filter(Boolean).join(" · ")}</div>
          </div>
          <p><strong>DIRECCIÓN:</strong> {transaction.address}</p>
          <p><strong>CONDICIÓN DE PAGO:</strong> {paymentCondition}</p>
        </section>

        <table className="a4-ticket__table">
          <thead>
            <tr>
              <th>DESCRIPCIÓN</th>
              <th>CÓDIGO</th>
              <th>UNID.</th>
              <th>P. X BULTO</th>
              <th>BULTOS</th>
              <th>IMPORTE</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.productId || item.promotionId || index}-${index}`}>
                <td>{item.name}</td>
                <td>{item.code || "—"}</td>
                <td>{Number(item.unitsPerPack || 1)}</td>
                <td>{money(item.price)}</td>
                <td>{Number(item.quantity || 0)}</td>
                <td>{money(Number(item.price || 0) * Number(item.quantity || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="a4-ticket__summary">
          <div><span>SUBTOTAL</span><strong>{money(subtotal)}</strong></div>
          {Number(transaction.discountAmount) > 0 && <div><span>DESCUENTO ({Number(transaction.discountPercent || 0)}%)</span><strong>-{money(transaction.discountAmount)}</strong></div>}
          {surchargeAmount > 0 && <div><span>RECARGOS</span><strong>{money(surchargeAmount)}</strong></div>}
          <div className="a4-ticket__total"><span>TOTAL</span><strong>{money(transaction.total)}</strong></div>
        </section>

        <footer className="a4-ticket__footer">
          <div>RECIBÍ CONFORME: <span /></div>
          <strong>{money(transaction.total)}</strong>
        </footer>
      </article>
    </>,
    document.body
  );
}
