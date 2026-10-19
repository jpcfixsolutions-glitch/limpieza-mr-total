export function roundPriceUpToTen(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Number.NaN;
  if (numeric === 0) return 0;
  return Math.ceil(numeric / 10 - 1e-10) * 10;
}

export function roundPriceInput(value) {
  if (value === "" || value === null || value === undefined) return "";
  const rounded = roundPriceUpToTen(value);
  return Number.isFinite(rounded) && rounded >= 0 ? String(rounded) : value;
}

export function formatCatalogPrice(value) {
  const rounded = roundPriceUpToTen(value);
  return Number.isFinite(rounded) ? rounded.toFixed(0) : "0";
}

export function calculateProfitabilityPercent(cost, price) {
  if (cost === "" || cost === null || cost === undefined || price === "" || price === null || price === undefined) return null;
  const numericCost = Number(cost);
  const numericPrice = Number(price);
  if (!Number.isFinite(numericCost) || numericCost <= 0 || !Number.isFinite(numericPrice)) return null;
  return ((numericPrice - numericCost) / numericCost) * 100;
}

// A wholesale price is optional. Treat an empty or zero value as "not set",
// instead of presenting the mathematically correct but misleading -100%.
export function calculateOptionalProfitabilityPercent(cost, price) {
  if (price === "" || price === null || price === undefined || Number(price) <= 0) return null;
  return calculateProfitabilityPercent(cost, price);
}

export function calculateProductProfitabilities(cost, price, wholesalePrice) {
  return {
    retail: calculateProfitabilityPercent(cost, price),
    wholesale: calculateOptionalProfitabilityPercent(cost, wholesalePrice),
  };
}

export function calculatePriceForProfitability(cost, percentage) {
  if (cost === "" || cost === null || cost === undefined || percentage === "" || percentage === null || percentage === undefined) return Number.NaN;
  const numericCost = Number(cost);
  const numericPercentage = Number(percentage);
  if (!Number.isFinite(numericCost) || numericCost <= 0 || !Number.isFinite(numericPercentage) || numericPercentage < 0) return Number.NaN;
  return roundPriceUpToTen(numericCost * (1 + numericPercentage / 100));
}

export function summarizeCatalogProfitability(products = []) {
  const localProducts = products.filter((product) => product.isAvailable !== false && product.inventoryConfigured !== false);
  const capitalInvested = localProducts.reduce((total, product) => total + (Number(product.cost) || 0) * (Number(product.stock) || 0), 0);
  const profitabilityValues = localProducts
    .map((product) => calculateProfitabilityPercent(product.cost, product.price))
    .filter((value) => value != null);
  const averageProfitability = profitabilityValues.length
    ? profitabilityValues.reduce((total, value) => total + value, 0) / profitabilityValues.length
    : null;
  return { productCount: localProducts.length, capitalInvested, averageProfitability };
}
