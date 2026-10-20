import "dotenv/config";
import path from "node:path";
import XLSX from "xlsx";
import { client } from "./client.js";
import { roundPriceUpToTen } from "../constants.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const inputPath = args.find((arg) => !arg.startsWith("--"));

if (!inputPath) {
  console.error("Uso: node src/db/import-products-from-xlsx.js <archivo.xlsx> [--apply]");
  process.exit(1);
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeKey(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function numberOrNull(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let text = cleanText(value).replace(/[$\s]/g, "");
  if (!text) return null;
  if (text.includes(",") && text.includes(".")) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (text.includes(",")) {
    text = text.replace(",", ".");
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBarcode(value) {
  const text = cleanText(typeof value === "number" ? Math.trunc(value) : value);
  if (!text) return null;
  const placeholder = normalizeKey(text).replace(/[^a-z0-9]/g, "");
  if (["cod", "notienecod", "notienecodi", "notienecodigo"].includes(placeholder)) return null;
  return text;
}

function sourceDateValue(value) {
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function chooseNewer(current, candidate) {
  if (candidate.sourceDate > current.sourceDate) return candidate;
  if (candidate.sourceDate < current.sourceDate) return current;
  return candidate.sourceRow > current.sourceRow ? candidate : current;
}

function deduplicateProducts(rows) {
  const selected = [];
  const byName = new Map();
  const skipped = [];

  for (const row of rows) {
    const nameKey = normalizeKey(row.name);
    const sameName = byName.get(nameKey) || [];
    const duplicate = sameName.find((existing) => (
      existing.barcode === row.barcode || !existing.barcode || !row.barcode
    ));

    if (!duplicate) {
      selected.push(row);
      sameName.push(row);
      byName.set(nameKey, sameName);
      continue;
    }

    const preferred = chooseNewer(duplicate, row);
    const discarded = preferred === duplicate ? row : duplicate;
    skipped.push({ sourceRow: discarded.sourceRow, name: discarded.name, keptRow: preferred.sourceRow });
    if (preferred !== duplicate) {
      selected[selected.indexOf(duplicate)] = preferred;
      sameName[sameName.indexOf(duplicate)] = preferred;
    }
  }

  return { selected, skipped };
}

function clearConflictingBarcodes(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.barcode) continue;
    const group = groups.get(row.barcode) || [];
    group.push(row);
    groups.set(row.barcode, group);
  }

  const conflicts = [];
  for (const [barcode, group] of groups) {
    if (group.length < 2) continue;
    const keeper = group.reduce(chooseNewer);
    for (const row of group) {
      if (row === keeper) continue;
      conflicts.push({ barcode, clearedRow: row.sourceRow, clearedProduct: row.name, keptRow: keeper.sourceRow, keptProduct: keeper.name });
      row.barcode = null;
    }
  }
  return conflicts;
}

function chunkedInsert(table, columns, rows, chunkSize = 100) {
  const statements = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const placeholders = chunk.map(() => `(${columns.map(() => "?").join(", ")})`).join(", ");
    statements.push({
      sql: `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders}`,
      args: chunk.flat(),
    });
  }
  return statements;
}

const workbook = XLSX.readFile(path.resolve(inputPath), { cellDates: true, cellFormula: true });
const sheetName = "LISTA  NEGOCIO";
const sheet = workbook.Sheets[sheetName];
if (!sheet) throw new Error(`No se encontró la hoja "${sheetName}".`);

const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
const candidates = [];
let currentCategory = "Sin categoría";

for (let index = 0; index < grid.length; index++) {
  const sourceRow = index + 1;
  const row = grid[index];
  const barcode = normalizeBarcode(row[0]);
  const name = cleanText(row[1]);
  const retailRaw = numberOrNull(row[2]);
  const wholesaleRaw = numberOrNull(row[3]);
  const costRaw = numberOrNull(row[9]);
  const productMarker = Boolean(name) && (
    barcode !== null || retailRaw !== null || wholesaleRaw !== null || costRaw !== null
  );

  if (!productMarker) {
    const heading = cleanText(row[1] ?? row[0]);
    if (heading && normalizeKey(heading) !== "descripcion") currentCategory = heading;
    continue;
  }

  const retailPrice = retailRaw > 0 ? roundPriceUpToTen(retailRaw) : 0;
  const wholesalePrice = wholesaleRaw > 0
    ? roundPriceUpToTen(wholesaleRaw)
    : retailPrice;
  candidates.push({
    sourceRow,
    sourceDate: sourceDateValue(row[10]),
    name,
    barcode,
    category: currentCategory,
    cost: costRaw > 0 ? costRaw : 0,
    retailPrice,
    wholesalePrice,
    localAvailable: retailPrice > 0 || wholesalePrice > 0,
    warehouseAvailable: retailPrice > 0 || wholesalePrice > 0,
    usedWholesaleFallback: !(wholesaleRaw > 0) && retailPrice > 0,
    missingRetailPrice: !(retailRaw > 0),
    missingCost: !(costRaw > 0),
  });
}

const deduplication = deduplicateProducts(candidates);
const products = deduplication.selected.sort((a, b) => a.sourceRow - b.sourceRow);
const barcodeConflicts = clearConflictingBarcodes(products);
const categoryNames = [...new Set(products.map((product) => product.category))];
const categoryIds = new Map(categoryNames.map((name, index) => [name, index + 1]));

const report = {
  mode: apply ? "apply" : "dry-run",
  sourceSheet: sheetName,
  sourceRows: grid.length,
  productCandidates: candidates.length,
  productsToImport: products.length,
  categoriesToImport: categoryNames.length,
  duplicateRowsSkipped: deduplication.skipped.length,
  duplicateBarcodesCleared: barcodeConflicts.length,
  productsInactiveInLocal: products.filter((product) => !product.localAvailable).length,
  productsInactiveInWarehouse: products.filter((product) => !product.warehouseAvailable).length,
  productsWithoutCost: products.filter((product) => product.missingCost).length,
  productsUsingRetailAsWholesale: products.filter((product) => product.usedWholesaleFallback).length,
  productsWithRetailBelowCost: products.filter((product) => product.localAvailable && product.cost > 0 && product.retailPrice < product.cost).length,
  missingRetailPriceExamples: products.filter((product) => product.missingRetailPrice).slice(0, 15).map((product) => ({
    sourceRow: product.sourceRow,
    name: product.name,
    cost: product.cost,
    wholesalePrice: product.wholesalePrice,
  })),
  duplicateExamples: deduplication.skipped.slice(0, 15),
  barcodeConflictExamples: barcodeConflicts.slice(0, 15),
};

if (!apply) {
  console.log(JSON.stringify(report, null, 2));
  client.close();
  process.exit(0);
}

const existing = await client.batch([
  "SELECT COUNT(*) AS total FROM products",
  "SELECT COUNT(*) AS total FROM categories",
  "SELECT id, code FROM business_units WHERE code IN ('LOCAL', 'WAREHOUSE') ORDER BY code",
], "read");
if (Number(existing[0].rows[0].total) !== 0 || Number(existing[1].rows[0].total) !== 0) {
  throw new Error("La importación requiere productos y categorías vacíos. Ejecutá db:prepare-client antes de volver a intentar.");
}

const businessUnits = new Map(existing[2].rows.map((row) => [row.code, Number(row.id)]));
if (!businessUnits.has("LOCAL") || !businessUnits.has("WAREHOUSE")) {
  throw new Error("Faltan las unidades de negocio LOCAL o WAREHOUSE.");
}

const categoryRows = categoryNames.map((name, index) => [index + 1, name]);
const productRows = products.map((product, index) => [
  index + 1,
  product.name,
  product.barcode,
  categoryIds.get(product.category),
  product.cost,
  product.retailPrice,
  1,
  null,
  0,
  null,
  0,
  0,
  "Package",
  product.localAvailable ? 1 : 0,
]);
const inventoryRows = products.flatMap((product, index) => {
  const productId = index + 1;
  return [
    [businessUnits.get("LOCAL"), productId, 0, 0, product.cost, product.retailPrice, product.wholesalePrice, product.localAvailable ? 1 : 0, "OWN_STOCK"],
    [businessUnits.get("WAREHOUSE"), productId, 0, 0, product.cost, product.retailPrice, 0, product.warehouseAvailable ? 1 : 0, "OWN_STOCK"],
  ];
});

const statements = [
  ...chunkedInsert("categories", ["id", "name"], categoryRows, 200),
  ...chunkedInsert("products", [
    "id", "name", "cod_barra", "category_id", "cost", "price", "units_per_pack", "pack_price",
    "use_suggested_price", "suggested_price_percent", "stock", "min_stock", "icon", "is_available",
  ], productRows, 75),
  ...chunkedInsert("business_unit_products", [
    "business_unit_id", "product_id", "stock", "min_stock", "cost", "sale_price", "wholesale_price", "is_available", "fulfillment_mode",
  ], inventoryRows, 100),
];

await client.batch(statements, "write");

const verification = await client.batch([
  "SELECT COUNT(*) AS total FROM categories",
  "SELECT COUNT(*) AS total FROM products",
  "SELECT COUNT(*) AS total FROM business_unit_products",
  "SELECT COUNT(*) AS total FROM products WHERE cod_barra IS NOT NULL",
], "read");

report.importedCategories = Number(verification[0].rows[0].total);
report.importedProducts = Number(verification[1].rows[0].total);
report.importedBusinessUnitProducts = Number(verification[2].rows[0].total);
report.importedBarcodes = Number(verification[3].rows[0].total);
console.log(JSON.stringify(report, null, 2));
client.close();
