// Pruebas de interfaz aisladas: no se conecta a la base operativa.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import { WarehouseStatsView } from '/src/app/components/WarehouseActivityView.jsx';
import '/src/styles/index.css';
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(WarehouseStatsView));
</script></body></html>`;
const server = await createServer({ server: { host: "127.0.0.1", port: 0 }, plugins: [{ name: "activity-fixture", configureServer(vite) {
  vite.middlewares.use("/__activity-check", async (req, res) => { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(await vite.transformIndexHtml(req.originalUrl, fixture)); });
} }] });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: process.env.PRINT_BROWSER });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date("2026-11-13T15:00:00Z") });
  await page.addInitScript(() => { localStorage.setItem("businessUnit", "WAREHOUSE"); });
  const expenses = [], receipts = [], queries = [];
  let failSave = false, failStats = false;
  const order = { id: 1, total: 1000, status: "confirmed", customerName: "Almacén Norte", customerLastName: "", charge_to_account: 0, created_at: "2026-11-13 10:00:00", items: [{ id: 1, quantity: 2, product_name: "Bolsas", total: 1000 }] };
  await page.route("**/api/**", async (route) => {
    const request = route.request(), url = new URL(request.url()), body = request.postDataJSON();
    assert.equal(request.headers()["x-business-unit"], "WAREHOUSE");
    let result;
    if (url.pathname === "/api/warehouse/stats") {
      queries.push(Object.fromEntries(url.searchParams));
      if (failStats) { await route.fulfill({ status: 503, json: { message: "Error estadístico de prueba" } }); return; }
      const hasDay = url.searchParams.get("date") === "2026-11-13" || url.searchParams.get("period") !== "day";
      const cashCents = receipts.reduce((s, r) => s + r.cash_cents, 0), transferCents = receipts.reduce((s, r) => s + r.transfer_cents, 0);
      const expenseCents = expenses.reduce((s, r) => s + r.amount_cents, 0);
      const summary = { orders: hasDay ? 1 : 0, orderCents: hasDay ? 100000 : 0, cashCents, transferCents, otherCents: 0, expenseCents, incomeCents: cashCents + transferCents, netCents: cashCents + transferCents - expenseCents };
      result = { summary, statuses: hasDay ? [{ status: "confirmed", count: 1 }] : [], days: hasDay ? [{ day: "2026-11-13", ...summary }] : [], expenses };
    } else if (url.pathname.startsWith("/api/warehouse/activity/")) result = { orders: [{ ...order, paidCents: receipts.reduce((s, r) => s + r.cash_cents + r.transfer_cents, 0) }], receipts, accountPayments: [], expenses };
    else if (url.pathname.startsWith("/api/warehouse/expenses")) {
      if (failSave) { failSave = false; await route.fulfill({ status: 503, json: { message: "Error recuperable de prueba" } }); return; }
      if (request.method() === "DELETE") { expenses.splice(0, 1); result = {}; }
      else {
        const entry = { id: 1, concept: body.concept, description: body.description, amount_cents: Math.round(Number(body.amount) * 100), method: body.method, occurred_at: body.occurredAt.replace("T", " "), updated_at: "2026-11-13 12:00:00", version: request.method() === "PUT" ? 1 : 0 };
        if (request.method() === "PUT") expenses[0] = entry; else expenses.push(entry);
        result = entry;
      }
    } else if (url.pathname.endsWith("/receipts")) {
      const original = body.reversalOfId && receipts.find((r) => r.id === body.reversalOfId);
      if (original) original.reversed = 1;
      const entry = { id: receipts.length + 1, order_id: 1, kind: original ? "refund" : "receipt", cash_cents: original ? -original.cash_cents : Math.round(Number(body.cash) * 100), transfer_cents: original ? -original.transfer_cents : Math.round(Number(body.transfer) * 100), occurred_at: "2026-11-13 12:00:00", reason: body.reason };
      receipts.push(entry); result = entry;
    } else throw new Error(`Solicitud inesperada: ${url.pathname}`);
    await route.fulfill({ json: result });
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__activity-check`);
  await page.getByRole("heading", { name: "Historial de actividad" }).waitFor();
  assert.equal(queries.at(-1).date, "2026-11-13");
  assert.equal(await page.locator("header select, header input").count(), 0);
  assert.deepEqual(await page.getByRole("group", { name: "Período", exact: true }).getByRole("button").allTextContents(), ["Hoy", "Esta Semana", "Este Mes", "Todo"]);
  assert.equal(await page.locator('header button[aria-pressed="true"]').count(), 1);
  const choosePeriod = (name, period) => Promise.all([
    page.waitForResponse((r) => r.url().includes(`period=${period}`)),
    page.getByRole("button", { name, exact: true }).click(),
  ]);
  await choosePeriod("Esta Semana", "week");
  await choosePeriod("Este Mes", "month");
  await choosePeriod("Hoy", "day");
  assert.ok(queries.every((query) => query.date === "2026-11-13"));
  await choosePeriod("Todo", "all");
  assert.equal(queries.at(-1).date, undefined);
  assert.equal(await page.locator('header button[aria-pressed="true"]').count(), 1);
  assert.equal(await page.getByRole("button", { name: "Todo", exact: true }).getAttribute("aria-pressed"), "true");
  await choosePeriod("Hoy", "day");
  await page.getByRole("button", { name: "13/11/2026 +" }).click();
  await page.getByText("2 × Bolsas", { exact: false }).waitFor({ state: "attached" });
  await page.locator("details").first().locator("summary").click();
  await page.getByRole("button", { name: "Registrar cobro" }).click();
  await page.getByLabel("Efectivo ($)").fill("100"); await page.getByLabel("Transferencia ($)").fill("200");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.getByText("Cobro · Pedido #1", { exact: false }).waitFor();
  assert.equal(receipts.length, 1);
  await page.getByText("Cobro · Pedido #1", { exact: false }).click();
  await page.getByRole("button", { name: "Devolver / corregir cobro" }).click();
  await page.getByLabel("Motivo").fill("Importe incorrecto"); await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await page.getByText("Devolución · Pedido #1", { exact: false }).waitFor();
  assert.equal(receipts.length, 2);
  await page.getByLabel("Agregar gasto").click();
  await page.getByLabel("Concepto", { exact: true }).fill("Flete de prueba"); await page.getByLabel("Importe ($)").fill("50");
  assert.equal(await page.getByLabel("Fecha y hora (Argentina)").inputValue(), "2026-11-13T12:00");
  failSave = true; await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Error recuperable" }).waitFor();
  assert.equal(await page.getByLabel("Concepto", { exact: true }).inputValue(), "Flete de prueba");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(expenses.length, 1);
  await page.getByLabel("Ver gastos del período").click();
  await page.getByRole("dialog").locator("summary").click(); await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Importe ($)").fill("75"); await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" }); assert.equal(expenses[0].amount_cents, 7500);
  await page.getByLabel("Ver gastos del período").click(); await page.getByRole("dialog").locator("summary").click();
  await page.getByRole("dialog").getByRole("button", { name: "Eliminar", exact: true }).click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click(); assert.equal(expenses.length, 1);
  // El detalle se renderiza al ancho del dispositivo, fuera del scroll de la tabla.
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `desborde horizontal a ${width}px`);
    await page.screenshot({ path: path.join(tmpdir(), `warehouse-activity-${width}.png`), fullPage: true });
    console.log(`Captura: ${path.join(tmpdir(), `warehouse-activity-${width}.png`)}`);
  }
  await page.getByLabel("Ver gastos del período").click(); await page.getByRole("dialog").locator("summary").click();
  await page.getByRole("dialog").getByRole("button", { name: "Eliminar", exact: true }).click(); await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" }); assert.equal(expenses.length, 0);
  failStats = true; await page.getByRole("button", { name: "Esta Semana", exact: true }).click(); await page.getByRole("alert").filter({ hasText: "Error estadístico" }).waitFor();
  failStats = false; await page.clock.runFor(30000); await page.getByRole("heading", { name: "Historial de actividad" }).waitFor();
  // UTC ya cambió de fecha, Argentina todavía está en el día anterior.
  await page.clock.setSystemTime(new Date("2026-11-14T02:59:59Z"));
  await choosePeriod("Este Mes", "month");
  assert.equal(queries.at(-1).date, "2026-11-13");
  // El refresco automático recalcula la fecha sin remontar la pantalla.
  await page.clock.setSystemTime(new Date("2026-11-14T03:00:00Z"));
  await Promise.all([page.waitForResponse((r) => r.url().includes("date=2026-11-14")), page.clock.runFor(30000)]);
  assert.equal(queries.at(-1).date, "2026-11-14");
  assert.deepEqual(errors, []);
  console.log("OK: cuatro botones, selección única, histórico completo, períodos actuales, medianoche argentina, detalle, cobros, gastos y layouts 1440/768/390.");
} finally { await browser?.close(); await server.close(); }
