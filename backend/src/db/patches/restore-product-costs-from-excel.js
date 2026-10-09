import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { roundPriceUpToTen } from "../../constants.js";
import { client } from "../client.js";

const apply = process.argv.includes("--apply");
const workbookPath = fileURLToPath(
  new URL("../../../../lista precio YOFREDESCARTABLES(Recuperado automáticamente).xlsx", import.meta.url)
);

function cleanText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeName(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

function numberOrNull(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = cleanText(value);
  if (!text) return null;
  const normalized = text.includes(",")
    ? text.replaceAll(".", "").replace(",", ".")
    : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function readCostSources() {
  const workbook = XLSX.readFile(workbookPath, { cellDates: false });
  const sheet = workbook.Sheets.Hoja1;
  if (!sheet) throw new Error("No se encontró la hoja Hoja1 en la planilla de costos.");

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }).slice(1);
  const byName = new Map();

  rows.forEach((row, index) => {
    const name = cleanText(`${cleanText(row[0])} ${cleanText(row[1])}`);
    if (!name) return;
    const source = { excelRow: index + 3, cost: numberOrNull(row[5]) };
    const key = normalizeName(name);
    const matches = byName.get(key) || [];
    matches.push(source);
    byName.set(key, matches);
  });

  return { byName, rowCount: rows.length };
}

function classifyProduct(product, sources) {
  if (sources.length === 0) return { status: "unmatched" };

  const costs = [...new Set(sources.map((source) => source.cost).filter((cost) => cost !== null))];
  if (costs.length === 0) return { status: "missing-source-cost", excelRows: sources.map((source) => source.excelRow) };
  if (costs.length > 1) return { status: "ambiguous-source-cost", excelRows: sources.map((source) => source.excelRow) };

  const sourceCost = costs[0];
  if (Math.abs(product.cost - sourceCost) < 1e-8) {
    return { status: "already-exact", sourceCost };
  }
  if (Math.abs(product.cost - roundPriceUpToTen(sourceCost)) < 1e-8) {
    return { status: "restorable", sourceCost };
  }
  return { status: "current-cost-does-not-match-rounding", sourceCost };
}

async function run() {
  const source = readCostSources();
  const result = await client.execute("SELECT id, name, cost FROM products ORDER BY id");
  const products = result.rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    cost: Number(row.cost),
  }));

  const classified = products.map((product) => ({
    ...product,
    ...classifyProduct(product, source.byName.get(normalizeName(product.name)) || []),
  }));
  const restorable = classified.filter((product) => product.status === "restorable");
  const uncertain = classified.filter((product) => !["restorable", "already-exact"].includes(product.status));
  const statusCounts = Object.fromEntries(
    [...new Set(classified.map((product) => product.status))]
      .map((status) => [status, classified.filter((product) => product.status === status).length])
  );

  const report = {
    mode: apply ? "apply" : "dry-run",
    databaseProducts: products.length,
    spreadsheetRows: source.rowCount,
    statusCounts,
    restorableProducts: restorable.length,
    uncertainProducts: uncertain.map(({ id, name, cost, status, excelRows }) => ({
      id,
      name,
      currentCost: cost,
      status,
      excelRows,
    })),
  };

  if (!apply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const backupDir = path.join(os.homedir(), ".local", "share", "descartables-yofre", "backups");
  await fs.mkdir(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `product-costs-before-restore-${timestamp}.json`);
  await fs.writeFile(
    backupPath,
    JSON.stringify({ capturedAt: new Date().toISOString(), products }, null, 2),
    "utf8"
  );

  const batchSize = 100;
  let updated = 0;
  for (let index = 0; index < restorable.length; index += batchSize) {
    const chunk = restorable.slice(index, index + batchSize);
    const updates = await client.batch(
      chunk.map((product) => ({
        sql: "UPDATE products SET cost = ? WHERE id = ? AND cost = ?",
        args: [product.sourceCost, product.id, product.cost],
      })),
      "write"
    );
    updated += updates.reduce((sum, update) => sum + Number(update.rowsAffected || 0), 0);
  }

  if (updated !== restorable.length) {
    throw new Error(`Se esperaban ${restorable.length} cambios de costo y se aplicaron ${updated}. Respaldo: ${backupPath}`);
  }

  const verification = await client.execute("SELECT id, cost FROM products ORDER BY id");
  const restoredCosts = new Map(verification.rows.map((row) => [Number(row.id), Number(row.cost)]));
  const verificationErrors = restorable.filter(
    (product) => Math.abs(restoredCosts.get(product.id) - product.sourceCost) >= 1e-8
  );
  if (verificationErrors.length > 0) {
    throw new Error(`Falló la verificación de ${verificationErrors.length} costos. Respaldo: ${backupPath}`);
  }

  console.log(JSON.stringify({ ...report, updatedProducts: updated, backupPath, verified: true }, null, 2));
}

try {
  await run();
} finally {
  client.close();
}
