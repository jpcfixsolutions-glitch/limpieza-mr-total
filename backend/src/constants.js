// Método de pago especial: no se registra en la tabla payment_methods ni se
// ofrece como método de cobro normal. Representa el saldo que queda fiado.
export const ACCOUNT_METHOD_NAME = "Cuenta corriente";

// Íconos de producto disponibles para el negocio de descartables. Las claves
// coinciden con los nombres exportados por lucide-react en el frontend.
export const PRODUCT_ICONS = [
  "Package",
  "CupSoda",
  "GlassWater",
  "Utensils",
  "Soup",
  "Layers3",
  "ShoppingBag",
  "Box",
  "ScrollText",
  "PartyPopper",
  "SprayCan",
];

export function isAccountMethod(methodName) {
  return String(methodName || "").trim().toLowerCase() === ACCOUNT_METHOD_NAME.toLowerCase();
}

export function isCashMethod(methodName) {
  return String(methodName || "").trim().toLowerCase().includes("efectivo");
}

export function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

// Los precios de catálogo se cobran en decenas enteras. Se resta una tolerancia
// mínima para que errores de punto flotante no eleven un múltiplo exacto de 10.
export function roundPriceUpToTen(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Number.NaN;
  if (numeric === 0) return 0;
  return Math.ceil(numeric / 10 - 1e-10) * 10;
}
