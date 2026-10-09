import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { client } from "../client.js";
import { roundPriceUpToTen } from "../../constants.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const inputPath = args.find((arg) => !arg.startsWith("--"));

if (!inputPath) {
  console.error("Uso: node src/db/patches/import-excel-product-details.js <excel-data.json> [--apply]");
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
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

function positivePrice(value) {
  const parsed = numberOrNull(value);
  return parsed !== null && parsed > 0 ? roundPriceUpToTen(parsed) : null;
}

function positiveQuantity(value) {
  const parsed = Math.trunc(numberOrNull(value) ?? 1);
  return parsed > 1 ? parsed : 1;
}

function canonicalPackType(value) {
  const text = cleanText(value);
  if (!text) return "";
  const key = normalizeKey(text);
  const aliases = {
    unidad: "Unidad",
    paquete: "Paquete",
    caja: "Caja",
    casa: "Caja",
    bulto: "Bulto",
    kg: "Kg",
    rollo: "Rollo",
    gramos: "Gramos",
  };
  return aliases[key] || text.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function chooseDisplayName(values) {
  const counts = new Map();
  for (const value of values.map(cleanText).filter(Boolean)) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function addToMap(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

async function getDatabaseSnapshot() {
  const productsResult = await client.execute(`
    SELECT
      p.id,
      p.name,
      p.category_id AS categoryId,
      c.name AS category,
      p.price_group_id AS priceGroupId,
      pg.name AS priceGroupName,
      pg.type AS priceGroupType,
      p.pack_type_id AS packTypeId,
      pt.name AS packTypeName,
      p.units_per_pack AS unitsPerPack,
      p.pack_price AS packPrice,
      p.stock
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN price_groups pg ON pg.id = p.price_group_id
    LEFT JOIN pack_types pt ON pt.id = p.pack_type_id
    ORDER BY p.id
  `);
  const tiersResult = await client.execute(
    "SELECT id, product_id AS productId, quantity, price FROM product_price_tiers ORDER BY product_id, quantity"
  );
  const groupsResult = await client.execute(
    "SELECT id, name, type, last_increase_percent AS lastIncreasePercent FROM price_groups ORDER BY id"
  );
  const packTypesResult = await client.execute("SELECT id, name FROM pack_types ORDER BY id");
  return {
    products: productsResult.rows,
    tiers: tiersResult.rows,
    priceGroups: groupsResult.rows,
    packTypes: packTypesResult.rows,
  };
}

function buildMatch(excelRows, products) {
  const excelByName = new Map();
  const excelByCategoryAndName = new Map();
  for (const row of excelRows) {
    addToMap(excelByName, normalizeKey(row.name), row);
    addToMap(
      excelByCategoryAndName,
      normalizeKey(`${cleanText(row.category)} ${cleanText(row.name)}`),
      row
    );
  }

  const matched = [];
  const unmatchedProducts = [];
  const ambiguousProducts = [];
  const usedRows = new Set();
  const duplicateCounters = new Map();

  for (const product of products) {
    const productKey = normalizeKey(product.name);
    const directCandidates = excelByName.get(productKey) || [];
    const prefixedCandidates = excelByCategoryAndName.get(productKey) || [];
    const candidates = directCandidates.length ? directCandidates : prefixedCandidates;
    let selected = null;
    if (candidates.length === 1) {
      selected = candidates[0];
    } else if (candidates.length > 1) {
      const categoryMatches = candidates.filter(
        (row) => normalizeKey(row.category) === normalizeKey(product.category)
      );
      const pool = categoryMatches.length ? categoryMatches : candidates;
      if (pool.length === 1) {
        selected = pool[0];
      } else {
        const counterKey = `${productKey}|${normalizeKey(product.category)}`;
        const occurrence = duplicateCounters.get(counterKey) || 0;
        selected = pool[occurrence % pool.length];
        duplicateCounters.set(counterKey, occurrence + 1);
      }
    }

    if (selected) {
      matched.push({ product, row: selected });
      usedRows.add(selected.excelRow);
    } else if (candidates.length > 0) {
      ambiguousProducts.push({ id: product.id, name: product.name, category: product.category, candidateRows: candidates.map((r) => r.excelRow) });
    } else {
      unmatchedProducts.push({ id: product.id, name: product.name, category: product.category });
    }
  }

  const unmatchedExcel = excelRows
    .filter((row) => !usedRows.has(row.excelRow))
    .map((row) => ({ excelRow: row.excelRow, name: cleanText(row.name), category: cleanText(row.category) }));

  return { matched, unmatchedProducts, ambiguousProducts, unmatchedExcel };
}

const source = JSON.parse(await fs.readFile(inputPath, "utf8"));
const excelRows = source.rows.filter((row) => cleanText(row.name));
const before = await getDatabaseSnapshot();
const matching = buildMatch(excelRows, before.products);

const supplierNamesByKey = new Map();
const packNamesByKey = new Map();
for (const { row } of matching.matched) {
  const supplier = cleanText(row.supplier);
  if (supplier) addToMap(supplierNamesByKey, normalizeKey(supplier), supplier);
  const packType = canonicalPackType(row.packType);
  if (packType) addToMap(packNamesByKey, normalizeKey(packType), packType);
}

const existingSuppliers = new Map(
  before.priceGroups
    .filter((group) => group.type === "proveedor" || group.type === "marca")
    .map((group) => [normalizeKey(group.name), group])
);
const existingPackTypes = new Map(before.packTypes.map((item) => [normalizeKey(item.name), item]));
const suppliersToCreate = [...supplierNamesByKey.entries()]
  .filter(([key]) => !existingSuppliers.has(key))
  .map(([, names]) => chooseDisplayName(names));
const packTypesToCreate = [...packNamesByKey.entries()]
  .filter(([key]) => !existingPackTypes.has(key))
  .map(([, names]) => chooseDisplayName(names));

const tierCounts = { 10: 0, 25: 0, 100: 0 };
let productsWithPack = 0;
let productsWithoutSupplier = 0;
let productsWithStockQuantity = 0;
for (const { row } of matching.matched) {
  if (positiveQuantity(row.quantity) > 1 || positivePrice(row.packPrice)) productsWithPack++;
  if ((numberOrNull(row.quantity) ?? 0) > 0) productsWithStockQuantity++;
  if (!cleanText(row.supplier)) productsWithoutSupplier++;
  if (positivePrice(row.price10)) tierCounts[10]++;
  if (positivePrice(row.price25)) tierCounts[25]++;
  if (positivePrice(row.price100)) tierCounts[100]++;
}

const report = {
  mode: apply ? "apply" : "dry-run",
  excelRows: excelRows.length,
  databaseProducts: before.products.length,
  matchedProducts: matching.matched.length,
  unmatchedDatabaseProducts: matching.unmatchedProducts.length,
  ambiguousDatabaseProducts: matching.ambiguousProducts.length,
  unmatchedExcelRows: matching.unmatchedExcel.length,
  productsWithPack,
  productsWithStockQuantity,
  productsWithoutSupplier,
  tierCounts,
  suppliersToCreate,
  packTypesToCreate,
  unmatchedDatabaseExamples: matching.unmatchedProducts.slice(0, 20),
  ambiguousExamples: matching.ambiguousProducts.slice(0, 20),
  unmatchedExcelExamples: matching.unmatchedExcel.slice(0, 20),
};

if (!apply) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

if (matching.matched.length === 0) {
  throw new Error("No hubo coincidencias; se cancela la importación.");
}

const backupDir = path.join(os.tmpdir(), "yofre-excel-import");
await fs.mkdir(backupDir, { recursive: true });
const backupPath = path.join(backupDir, `turso-before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await fs.writeFile(backupPath, JSON.stringify(before, null, 2), "utf8");

for (const name of suppliersToCreate) {
  await client.execute({
    sql: "INSERT INTO price_groups (name, type, last_increase_percent) VALUES (?, 'proveedor', 0)",
    args: [name],
  });
}
for (const name of packTypesToCreate) {
  await client.execute({
    sql: "INSERT INTO pack_types (name) VALUES (?)",
    args: [name],
  });
}

const refreshed = await getDatabaseSnapshot();
const supplierMap = new Map(
  refreshed.priceGroups
    .filter((group) => group.type === "proveedor" || group.type === "marca")
    .map((group) => [normalizeKey(group.name), group])
);
const packTypeMap = new Map(refreshed.packTypes.map((item) => [normalizeKey(item.name), item]));

const statements = [];
for (const { product, row } of matching.matched) {
  const supplierKey = normalizeKey(row.supplier);
  const packTypeKey = normalizeKey(canonicalPackType(row.packType));
  const supplierId = supplierKey ? supplierMap.get(supplierKey)?.id ?? null : null;
  const packTypeId = packTypeKey ? packTypeMap.get(packTypeKey)?.id ?? null : null;
  const unitsPerPack = positiveQuantity(row.quantity);
  const stock = Math.max(0, Math.trunc(numberOrNull(row.quantity) ?? 0));
  const packPrice = positivePrice(row.packPrice);

  statements.push({
    sql: `UPDATE products
          SET stock = ?, units_per_pack = ?, pack_price = ?, pack_type_id = ?, price_group_id = ?
          WHERE id = ?`,
    args: [stock, unitsPerPack, packPrice, packTypeId, supplierId, product.id],
  });
  if (Number(product.stock) !== stock) {
    statements.push({
      sql: `INSERT INTO stock_modifications (product_id, product_name, old_stock, new_stock)
            VALUES (?, ?, ?, ?)`,
      args: [product.id, product.name, Number(product.stock) || 0, stock],
    });
  }
  statements.push({
    sql: "DELETE FROM product_price_tiers WHERE product_id = ?",
    args: [product.id],
  });

  const tiers = [
    { quantity: 10, price: positivePrice(row.price10) },
    { quantity: 25, price: positivePrice(row.price25) },
    { quantity: 100, price: positivePrice(row.price100) },
  ].filter((tier) => tier.price !== null);

  for (const tier of tiers) {
    statements.push({
      sql: "INSERT INTO product_price_tiers (product_id, quantity, price) VALUES (?, ?, ?)",
      args: [product.id, tier.quantity, tier.price],
    });
  }
}

const chunkSize = 300;
for (let index = 0; index < statements.length; index += chunkSize) {
  await client.batch(statements.slice(index, index + chunkSize), "write");
}

const after = await getDatabaseSnapshot();
const matchedIds = new Set(matching.matched.map(({ product }) => Number(product.id)));
const afterMatched = after.products.filter((product) => matchedIds.has(Number(product.id)));
const afterTiers = after.tiers.filter((tier) => matchedIds.has(Number(tier.productId)));

report.backupPath = backupPath;
report.updatedProducts = afterMatched.length;
report.productsWithAssignedSupplier = afterMatched.filter((product) => product.priceGroupType === "proveedor").length;
report.productsWithoutAssignedSupplier = afterMatched.filter((product) => product.priceGroupId == null).length;
report.productsWithPackType = afterMatched.filter((product) => product.packTypeId != null).length;
report.productsWithPackPrice = afterMatched.filter((product) => product.packPrice != null).length;
report.productsWithPositiveStock = afterMatched.filter((product) => Number(product.stock) > 0).length;
report.priceTierRows = afterTiers.length;

console.log(JSON.stringify(report, null, 2));
