import { normalizeCategorySearch } from "./categorySearch.js";

export const PROMOTIONS_CATEGORY = { id: "promotions", name: "Promociones" };

export function withPromotionsCategory(categories) {
  return categories.some((category) => normalizeCategorySearch(category.name) === "promociones")
    ? [...categories]
    : [...categories, PROMOTIONS_CATEGORY];
}

export function promotionCategoryNames(promotion, products) {
  const componentIds = new Set((promotion.items || []).map((item) => String(item.productId)));
  return [...new Set([
    PROMOTIONS_CATEGORY.name,
    promotion.category,
    ...products.filter((product) => componentIds.has(String(product.id))).map((product) => product.category),
  ].filter(Boolean))];
}

export function promotionMatchesCategory(promotion, category, products) {
  return !category || promotionCategoryNames(promotion, products)
    .some((name) => normalizeCategorySearch(name) === normalizeCategorySearch(category.name));
}
