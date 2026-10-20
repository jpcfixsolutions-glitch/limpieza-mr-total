export function normalizeCategorySearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("es");
}

export function filterCategories(categories, query) {
  const term = normalizeCategorySearch(query);
  return categories.filter((category) => !term || normalizeCategorySearch(category.name).includes(term));
}
