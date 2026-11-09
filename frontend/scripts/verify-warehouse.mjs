import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import { calculateWarehouseProduction } from "../../backend/src/services/warehouseProduction.js";

// Datos aislados de prueba. Nunca conecta con la base operativa.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fixture = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import { WarehouseHomeView, WarehouseOrdersView } from '/src/app/components/WarehouseViews.jsx';
import '/src/styles/index.css';
function TestApp() {
  const [view, setView] = React.useState('home');
  return React.createElement(React.Fragment, null,
    React.createElement('nav', { style: { display: 'flex', gap: 16, padding: 12 } },
      React.createElement('button', { onClick: () => setView('home') }, 'Ir a Inicio'),
      React.createElement('button', { onClick: () => setView('orders') }, 'Ir a Pedidos')),
    view === 'home' ? React.createElement(WarehouseHomeView, { user: { name: 'Usuario de prueba' } }) : React.createElement(WarehouseOrdersView));
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(TestApp));
</script></body></html>`;
const server = await createServer({
  server: { port: 0, host: "127.0.0.1" },
  plugins: [{ name: "warehouse-test-fixture", configureServer(vite) {
    vite.middlewares.use("/__warehouse-check", async (req, res, next) => {
      try { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(await vite.transformIndexHtml(req.originalUrl, fixture)); }
      catch (error) { next(error); }
    });
  } }],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: process.env.PRINT_BROWSER });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(15_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => { localStorage.setItem("token", "warehouse-test-token"); localStorage.setItem("businessUnit", "WAREHOUSE"); });
  await page.clock.install({ time: new Date("2026-11-09T13:35:00Z") });
  const products = [{ id: 1, name: "Bolsas 50×70", codbarra: "501", stock: 15, price: 18, isAvailable: true }, { id: 2, name: "Bolsas 60×90", codbarra: "602", stock: 0, price: 20, isAvailable: true }];
  const customers = [{ id: 1, name: "Cliente existente", lastName: "", phone: "+54 351 111-2222", address: "Córdoba 100" }];
  const orders = [];
  const savedKeys = new Map();
  let created = 0;
  let failSave = false;
  let failOperations = false;
  let failStatus = false;
  let operationsRequests = 0;
  let postedCustomer = 0;
  const snapshot = () => {
    const { allocations, ...production } = calculateWarehouseProduction(orders, products);
    return { orders: orders.map((order) => ({ ...order, items: (allocations[order.id] || order.items).map((item) => ({ ...item, status: ["dispatched", "delivered"].includes(order.status) ? order.status : item.status || "preparing" })) })), products, customers, production,
      counts: { pending: orders.filter((order) => ["confirmed", "preparing"].includes(order.status)).length, inDelivery: orders.filter((order) => ["ready", "dispatched"].includes(order.status)).length, soldToday: orders.filter((order) => order.status === "delivered").length } };
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    assert.equal(request.headers()["x-business-unit"], "WAREHOUSE");
    const pathname = new URL(request.url()).pathname;
    let result;
    if (pathname === "/api/warehouse/operations") {
      operationsRequests++;
      if (failOperations) { await route.fulfill({ status: 503, json: { message: "Fallo de prueba" } }); return; }
      result = snapshot();
    } else if (pathname === "/api/warehouse/production-preview") {
      const body = request.postDataJSON();
      const projected = calculateWarehouseProduction([...orders, { id: Number.MAX_SAFE_INTEGER, status: "confirmed", createdAt: "2026-11-09 10:35:00", items: body.items.map((item) => ({ ...item, productName: products.find((row) => row.id === item.productId).name })) }], products);
      result = { items: projected.allocations[Number.MAX_SAFE_INTEGER], production: { items: projected.items, totalUnits: projected.totalUnits } };
    } else if (pathname === "/api/warehouse/customers") {
      postedCustomer++;
      result = { id: customers.length + 1, ...request.postDataJSON(), lastName: "" };
      customers.push(result);
    } else if (pathname === "/api/warehouse/orders") {
      const body = request.postDataJSON();
      if (failSave) { failSave = false; await route.fulfill({ status: 503, json: { message: "Error recuperable de prueba" } }); return; }
      if (savedKeys.has(body.idempotencyKey)) result = savedKeys.get(body.idempotencyKey);
      else {
        created++;
        const customer = customers.find((row) => row.id === body.customerId);
        result = { id: created, ...body, version: 0, customerName: customer.name, customerLastName: customer.lastName, customerPhone: customer.phone, customerAddress: customer.address, createdAt: "2026-11-09 10:35:00", items: body.items.map((item, index) => ({ ...item, status: "preparing", id: created * 10 + index, productName: products.find((row) => row.id === item.productId).name })) };
        savedKeys.set(body.idempotencyKey, result); orders.push(result);
      }
    } else if (/\/orders\/\d+\/items\/\d+\/status$/.test(pathname)) {
      const order = orders.find((row) => row.id === Number(pathname.split("/").at(-4)));
      const item = order.items.find((row) => row.id === Number(pathname.split("/").at(-2)));
      const body = request.postDataJSON();
      assert.equal(body.expectedVersion, order.version);
      item.status = body.status;
      if (body.status === "preparing" && order.status === "ready") order.status = "preparing";
      order.version++;
      result = snapshot().orders.find((row) => row.id === order.id);
    } else if (/\/orders\/\d+\/status$/.test(pathname)) {
      const order = orders.find((row) => row.id === Number(pathname.split("/").at(-2)));
      const { status, expectedVersion } = request.postDataJSON();
      assert.equal(expectedVersion, order.version);
      if (failStatus) { failStatus = false; await route.fulfill({ status: 409, json: { message: "El estado cambió en otra sesión. Revisá el pedido." } }); return; }
      if (["ready", "dispatched", "delivered"].includes(status)) assert(order.items.every((item) => item.status === "ready"));
      if (status === "dispatched") for (const item of order.items) products.find((row) => row.id === item.productId).stock -= item.quantity;
      order.status = status;
      order.version++;
      if (status === "delivered") order.deliveredAt = "2026-11-09 10:35:00";
      result = snapshot().orders.find((row) => row.id === order.id);
    } else throw new Error(`Consulta inesperada: ${pathname}`);
    await route.fulfill({ json: result });
  });
  const url = `${server.resolvedUrls.local[0]}__warehouse-check`;
  await page.goto(url);
  console.log("Checking home and clock...");
  await page.getByRole("heading", { name: "¡Buenos días, Usuario de prueba!" }).waitFor();
  await page.getByText("Lunes, 9 de noviembre de 2026 · 10:35 hs", { exact: true }).waitFor();
  await page.getByText("No hay productos pendientes de producción", { exact: true }).waitFor();
  await page.clock.fastForward(60_000);
  await page.getByText("Lunes, 9 de noviembre de 2026 · 10:36 hs", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Ir a Pedidos", exact: true }).click();
  await page.getByText("Todavía no hay pedidos registrados.", { exact: true }).waitFor();
  console.log("Checking order creation and retries...");

  const newOrder = async () => {
    await page.getByRole("button", { name: "Nuevo pedido", exact: true }).click();
    await page.getByLabel("Cliente registrado", { exact: true }).selectOption("1");
    await page.getByLabel("Buscar producto", { exact: true }).fill("501");
    await page.getByRole("button", { name: /Bolsas 50×70.*Stock: 15/ }).click();
  };
  await newOrder();
  await page.getByRole("spinbutton", { name: "Cantidad de Bolsas 50×70", exact: true }).fill("25");
  await page.getByLabel("Buscar producto", { exact: true }).fill("602");
  await page.getByRole("button", { name: /Bolsas 60×90.*Stock: 0/ }).click();
  await page.getByRole("spinbutton", { name: "Cantidad de Bolsas 60×90", exact: true }).fill("2");
  await page.clock.fastForward(350);
  await page.getByText(/Bolsas 50×70: 10 u. adicionales/).waitFor();
  failSave = true;
  await page.getByRole("button", { name: "Registrar pedido", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Error recuperable" }).waitFor();
  assert.equal(await page.getByRole("spinbutton", { name: "Cantidad de Bolsas 50×70", exact: true }).inputValue(), "25");
  await page.getByRole("button", { name: "Registrar pedido", exact: true }).dblclick();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(created, 1);
  console.log("Checking customer creation and global demand...");
  await page.getByRole("button", { name: "Nuevo pedido", exact: true }).click();
  await page.getByRole("button", { name: "Nuevo cliente", exact: true }).click();
  await page.getByLabel("Nombre del cliente", { exact: true }).fill("Cliente nuevo");
  await page.getByLabel("Número de contacto", { exact: true }).fill("+54 (351) 444-5555");
  await page.getByLabel("Dirección", { exact: true }).fill("San Martín 100");
  await page.getByRole("button", { name: "Guardar cliente", exact: true }).click();
  await page.getByLabel("Cliente registrado", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Cliente registrado", { exact: true }).inputValue(), "2");
  assert.equal(postedCustomer, 1);
  await page.getByLabel("Buscar producto", { exact: true }).fill("501");
  await page.getByRole("button", { name: /Bolsas 50×70.*Stock: 15/ }).click();
  await page.getByRole("spinbutton", { name: "Cantidad de Bolsas 50×70", exact: true }).fill("20");
  await page.clock.fastForward(350);
  await page.getByText(/pendiente global previsto: 30 u/).waitFor();
  await page.getByRole("button", { name: "Registrar pedido", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const production = page.getByRole("region", { name: "Producción pendiente", exact: true });
  await production.getByText("32", { exact: true }).waitFor();
  await page.getByLabel("Buscar pedido", { exact: true }).fill("Cliente nuevo");
  assert.equal(await page.locator("table tbody tr").count(), 1);
  await page.getByLabel("Estado", { exact: true }).selectOption("delivered");
  await page.getByText("No hay pedidos que coincidan con los filtros.", { exact: true }).waitFor();
  await page.getByLabel("Estado", { exact: true }).selectOption("");
  await page.getByLabel("Buscar pedido", { exact: true }).fill("");
  await page.locator("table tbody tr").filter({ hasText: "Cliente nuevo" }).getByRole("button", { name: "Ver detalle" }).click();
  await page.getByRole("dialog").getByText("San Martín 100", { exact: true }).waitFor();
  await page.getByRole("dialog").getByText("Producción necesaria: 20 u.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Cancelar pedido", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await production.getByText("12", { exact: true }).waitFor();
  console.log("Checking dashboard refresh and delivery...");
  await page.getByRole("button", { name: "Ir a Inicio", exact: true }).click();
  await production.getByText("12", { exact: true }).waitFor();
  products[0].stock = 25;
  await page.clock.fastForward(15_000);
  await production.getByText("2", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Ir a Pedidos", exact: true }).click();
  products[1].stock = 2;
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await page.getByText("No hay productos pendientes de producción", { exact: true }).waitFor();
  await page.locator("table tbody tr").filter({ hasText: "Cliente existente" }).getByRole("button", { name: "Ver detalle" }).click();
  assert.equal(await page.getByRole("dialog").getByRole("combobox", { name: "Estado del pedido #1", exact: true }).locator('option[value="ready"]').isDisabled(), true);
  for (const productName of ["Bolsas 50×70", "Bolsas 60×90"]) {
    await page.getByRole("dialog").getByRole("combobox", { name: `Estado de ${productName}`, exact: true }).selectOption("ready");
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();
    await page.getByRole("dialog", { name: "Pedido #1", exact: true }).waitFor();
  }
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  const orderState = () => page.getByRole("combobox", { name: "Estado del pedido #1", exact: true });
  failStatus = true;
  await orderState().selectOption("ready");
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "El estado cambió" }).waitFor();
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  assert.equal(await orderState().inputValue(), "preparing", "un fallo conserva el estado anterior");
  await orderState().selectOption("ready");
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await orderState().inputValue(), "ready");
  assert.equal(products[0].stock, 25, "Listo no mueve stock");
  await page.getByRole("combobox", { name: "Estado", exact: true }).selectOption("ready");
  assert.equal(await page.locator("table tbody tr").count(), 1);
  await page.getByRole("combobox", { name: "Estado", exact: true }).selectOption("dispatched");
  await page.getByText("No hay pedidos que coincidan con los filtros.", { exact: true }).waitFor();
  await page.getByRole("combobox", { name: "Estado", exact: true }).selectOption("");
  await page.reload();
  const inDelivery = () => page.locator("section").filter({ has: page.getByRole("heading", { name: "Pedidos en reparto", exact: true }) });
  await inDelivery().getByText("1", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Ir a Pedidos", exact: true }).click();
  await orderState().waitFor();
  assert.equal(await orderState().inputValue(), "ready", "el estado persiste al recargar");
  await orderState().selectOption("dispatched");
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await orderState().inputValue(), "dispatched");
  await orderState().selectOption("delivered");
  await page.getByRole("button", { name: "Confirmar", exact: true }).dblclick();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.locator("table tbody tr").filter({ hasText: "Cliente existente" }).getByRole("button", { name: "Ver detalle" }).click();
  for (const productName of ["Bolsas 50×70", "Bolsas 60×90"]) {
    const control = page.getByRole("dialog").getByRole("combobox", { name: `Estado de ${productName}`, exact: true });
    assert.equal(await control.inputValue(), "delivered");
    assert.equal(await control.isDisabled(), true);
  }
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByRole("button", { name: "Ir a Inicio", exact: true }).click();
  await page.locator("section").filter({ has: page.getByRole("heading", { name: "Pedidos vendidos hoy", exact: true }) }).getByText("1", { exact: true }).waitFor();
  failOperations = true;
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Fallo de prueba" }).waitFor();
  failOperations = false;
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await page.getByText("No hay productos pendientes de producción", { exact: true }).waitFor();
  for (let id = 3; id < 10; id++) {
    products.push({ id, name: `Producto de prueba ${id}`, stock: 0, price: 5, isAvailable: true });
    orders.push({ id: id + 100, version: 0, status: "confirmed", customerName: "Cliente existente", createdAt: "2026-11-09 10:35:00", items: [{ id: id + 1000, status: "preparing", productId: id, productName: `Producto de prueba ${id}`, quantity: id }] });
  }
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await page.getByRole("button", { name: "Ver todos (7)", exact: true }).click();
  await page.getByRole("dialog").getByText("Producto de prueba 9", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  const screenshots = [];
  console.log("Checking responsive layouts...");
  for (const width of [1366, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `desborde en Inicio a ${width}px`);
    const screenshot = path.join(tmpdir(), `warehouse-home-${width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true }); screenshots.push(screenshot);
    await page.getByRole("button", { name: "Ir a Pedidos", exact: true }).click();
    await page.getByRole("button", { name: "Nuevo pedido", exact: true }).waitFor({ state: "visible" });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `desborde en Pedidos a ${width}px`);
    await page.getByRole("button", { name: "Nuevo pedido", exact: true }).click();
    await page.getByLabel("Cliente registrado", { exact: true }).selectOption("1");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `desborde en modal a ${width}px`);
    await page.getByRole("button", { name: "Cerrar sin guardar", exact: true }).click();
    await page.getByRole("button", { name: "Ir a Inicio", exact: true }).click();
  }
  assert(operationsRequests > 5);
  assert.deepEqual(errors, []);
  console.log("PASS: cuatro estados, preparación individual, bloqueo de Listo incompleto, error sin cambiar estado, persistencia al recargar, dashboard, demanda global, doble clic, clientes, filtros y responsive (1366/768/390).");
  console.log(JSON.stringify({ screenshots }));
} finally { await browser?.close(); await server.close(); }
