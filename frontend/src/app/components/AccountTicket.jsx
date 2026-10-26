import { createPortal } from "react-dom";
import logo from "../../img/Logotipo Mister Total con Aro Azul.png";

const money = (value) => `$${Number(value || 0).toFixed(2)}`;

function formatDate(value) {
  const date = value ? new Date(String(value).replace(" ", "T")) : new Date();
  if (Number.isNaN(date.getTime())) return String(value || "");
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const TITLES = {
  charge: "COMPROBANTE DE DEUDA",
  payment: "RECIBO DE PAGO",
  statement: "ESTADO DE CUENTA",
};

export function AccountTicket({ ticket }) {
  if (!ticket) return null;

  return createPortal(
    <section className="print-document sale-ticket account-ticket" aria-hidden="true">
      <header className="sale-ticket__header">
        <img src={logo} alt="Mr. Total Limpieza" className="sale-ticket__logo" />
        <h1>Mr. Total Limpieza</h1>
        <p className="account-ticket__title">{TITLES[ticket.kind]}</p>
      </header>

      <div className="sale-ticket__meta">
        <p><strong>Fecha:</strong> {formatDate(ticket.createdAt)}</p>
        {ticket.movementId && <p><strong>Movimiento:</strong> #{ticket.movementId}</p>}
        {ticket.transactionId && <p><strong>Venta:</strong> #{ticket.transactionId}</p>}
        <p><strong>Cliente:</strong> {ticket.customerName}</p>
        {ticket.document && <p><strong>DNI:</strong> {ticket.document}</p>}
      </div>

      <div className="sale-ticket__divider" />

      {ticket.kind === "charge" && (
        <>
          {ticket.items?.length > 0 && (
            <div className="account-ticket__items">
              {ticket.items.map((item, index) => (
                <div key={`${item.name}-${index}`}>
                  <span>{Number(item.quantity || 0)} × {item.name}</span>
                  <strong>{money(item.total)}</strong>
                </div>
              ))}
            </div>
          )}
          <div className="sale-ticket__totals">
            <div><span>Deuda tomada</span><strong>{money(ticket.amount)}</strong></div>
            <div className="sale-ticket__grand-total"><span>DEUDA ACTUAL</span><span>{money(ticket.currentDebt)}</span></div>
          </div>
        </>
      )}

      {ticket.kind === "payment" && (
        <div className="sale-ticket__totals">
          <div><span>Método</span><strong>{ticket.methodName || "Sin especificar"}</strong></div>
          {ticket.description && <div><span>Detalle</span><strong>{ticket.description}</strong></div>}
          {ticket.previousDebt != null && <div><span>Deuda anterior</span><strong>{money(ticket.previousDebt)}</strong></div>}
          <div><span>Pago recibido</span><strong>{money(ticket.amount)}</strong></div>
          <div className="sale-ticket__grand-total"><span>SALDO PENDIENTE</span><span>{money(ticket.currentDebt)}</span></div>
        </div>
      )}

      {ticket.kind === "statement" && (
        <div className="sale-ticket__totals">
          <div><span>Total fiado</span><strong>{money(ticket.totalCharges)}</strong></div>
          <div><span>Total pagado</span><strong>{money(ticket.totalPayments)}</strong></div>
          <div className="sale-ticket__grand-total"><span>DEUDA ACTUAL</span><span>{money(ticket.currentDebt)}</span></div>
        </div>
      )}

      <div className="sale-ticket__divider" />
      <footer className="sale-ticket__footer">
        <p>{ticket.kind === "payment" ? "Pago recibido. Gracias." : "Comprobante no fiscal"}</p>
      </footer>
    </section>,
    document.body
  );
}
