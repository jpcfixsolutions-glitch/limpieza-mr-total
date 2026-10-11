const TARGET_PERCENT = 40;

const number = (value) => Number(value) || 0;

/**
 * Agrupa líneas ya filtradas. unitCost es el costo de una unidad de venta:
 * una unidad, un bulto, una escala o una promoción, según corresponda.
 */
export function calculateProfitability(items) {
  const byProduct = new Map();
  const byDay = new Map();
  let totalCost = 0;
  let netRevenue = 0;

  for (const item of items) {
    const quantity = number(item.quantity);
    const unitCost = item.unitCost == null ? null : number(item.unitCost);
    const revenue = number(item.total);
    const cost = unitCost == null ? 0 : unitCost * quantity;
    const profit = revenue - cost;
    const isPromotion = item.promotionId != null;
    const key = isPromotion ? `promotion-${item.promotionId}` : item.productId ? `product-${item.productId}` : `item-${item.productName}`;
    const current = byProduct.get(key) || {
      productId: item.productId || null,
      promotionId: item.promotionId || null,
      isPromotion,
      name: item.productName,
      category: item.categoryName || null,
      quantitySold: 0,
      totalCost: 0,
      netRevenue: 0,
      totalProfit: 0,
      // El último precio aplicado es informativo; los totales usan cada línea histórica.
      unitCost,
      unitPrice: number(item.price),
      hasCost: unitCost != null,
    };
    current.quantitySold += quantity;
    current.totalCost += cost;
    current.netRevenue += revenue;
    current.totalProfit += profit;
    current.hasCost = current.hasCost && unitCost != null;
    byProduct.set(key, current);

    totalCost += cost;
    netRevenue += revenue;
    const date = String(item.createdAt || "").slice(0, 10);
    if (date) {
      const day = byDay.get(date) || { date, totalCost: 0, netRevenue: 0 };
      day.totalCost += cost;
      day.netRevenue += revenue;
      byDay.set(date, day);
    }
  }

  const decorate = (row) => ({
    ...row,
    unitProfit: row.unitCost > 0 ? row.unitPrice - row.unitCost : null,
    profitability: row.totalCost > 0 ? (row.totalProfit / row.totalCost) * 100 : null,
  });
  const totalProfit = netRevenue - totalCost;
  const profitability = totalCost > 0 ? (totalProfit / totalCost) * 100 : null;

  return {
    targetPercent: TARGET_PERCENT,
    summary: {
      totalCost,
      netRevenue,
      totalProfit,
      profitability,
      targetDifference: profitability == null ? null : profitability - TARGET_PERCENT,
    },
    products: [...byProduct.values()].map(decorate).sort((a, b) => b.totalProfit - a.totalProfit || a.name.localeCompare(b.name, "es")),
    evolution: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map((day) => ({
      ...day,
      totalProfit: day.netRevenue - day.totalCost,
      profitability: day.totalCost > 0 ? ((day.netRevenue - day.totalCost) / day.totalCost) * 100 : null,
    })),
  };
}
