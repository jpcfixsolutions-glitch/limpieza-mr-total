export function normalizeProductSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const searchableProductCache = new WeakMap();

function searchableProduct(product) {
  const sourceName = product?.name || "";
  const sourceCode = String(product?.codbarra || "").trim();
  if (!product || typeof product !== "object") {
    return { sourceName, sourceCode, name: normalizeProductSearch(sourceName), code: sourceCode };
  }
  const cached = searchableProductCache.get(product);
  if (cached?.sourceName === sourceName && cached.sourceCode === sourceCode) return cached;

  const searchable = { sourceName, sourceCode, name: normalizeProductSearch(sourceName), code: sourceCode };
  searchableProductCache.set(product, searchable);
  return searchable;
}

function scoreName(name, query) {
  if (!query) return 0;
  if (name === query) return 9000;
  if (name.startsWith(query)) return 8000;

  const queryTerms = query.split(" ");
  const nameTerms = name.split(" ");
  let prefixMatches = 0;
  let partialMatches = 0;

  for (const term of queryTerms) {
    if (nameTerms.some((word) => word.startsWith(term))) prefixMatches += 1;
    else if (name.includes(term)) partialMatches += 1;
    else return null;
  }

  const allPrefixes = prefixMatches === queryTerms.length;
  const startsWithFirstTerm = nameTerms[0]?.startsWith(queryTerms[0]);
  return (allPrefixes ? 6000 : 5000)
    + prefixMatches * 20
    + partialMatches * 5
    + (startsWithFirstTerm ? 10 : 0);
}

function scoreProduct(product, normalizedQuery) {
  const { name, code } = searchableProduct(product);
  const compactQuery = normalizedQuery.replace(/\s/g, "");
  if (code === compactQuery) return 10000;
  if (compactQuery && code.startsWith(compactQuery)) return 7000;
  if (compactQuery && code.includes(compactQuery)) return 4000;

  return scoreName(name, normalizedQuery);
}

export function productSearchScore(product, query) {
  const normalizedQuery = normalizeProductSearch(query);
  return normalizedQuery ? scoreProduct(product, normalizedQuery) : 0;
}

export function searchProducts(products, query) {
  const normalizedQuery = normalizeProductSearch(query);
  if (!normalizedQuery) return [...products];

  return products
    .map((product, index) => ({ product, index, score: scoreProduct(product, normalizedQuery) }))
    .filter(({ score }) => score != null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ product }) => product);
}
