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
