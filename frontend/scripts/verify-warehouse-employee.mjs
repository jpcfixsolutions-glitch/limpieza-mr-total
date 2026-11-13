import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import { calculateWarehouseProduction } from "../../backend/src/services/warehouseProduction.js";
import { employeeOperations, employeeOrder } from "../../backend/src/services/warehouseEmployee.js";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fixture = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import App from '/src/app/App.jsx';
import '/src/styles/index.css';
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
</script></body></html>`;
const server = await createServer({ server: { port: 0, host: "127.0.0.1" }, plugins: [{ name: "warehouse-employee-fixture", configureServer(vite) {
  vite.middlewares.use("/__employee-check", async (req, res, next) => {
    try { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(await vite.transformIndexHtml(req.originalUrl, fixture)); } catch (error) { next(error); }
  });
} }] });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: process.env.PRINT_BROWSER });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(15_000);
  await page.clock.install({ time: new Date("2026-11-09T13:35:00Z") });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const users = [{ id: 1, name: "Admin de prueba", email: "admin@test", role: "admin" }];
  const products = [{ id: 1, name: "Bolsas 50×70", codbarra: "501", stock: 15, price: 18, isAvailable: true }, { id: 2, name: "Guantes", codbarra: "502", stock: 5, price: 12, isAvailable: true }];
  const item = (id, productId, quantity) => ({ id, productId, productName: products.find((product) => product.id === productId).name, quantity, status: "preparing", unitPrice: 18, unitCost: 8 });
  const orders = [
    { id: 20, status: "confirmed", version: 0, customerName: "Cliente reciente", customerLastName: "", createdAt: "2026-11-08 10:00:00", items: [item(201, 1, 25)] },
    { id: 10, status: "confirmed", version: 0, customerName: "Cliente antiguo", customerLastName: "", createdAt: "2026-11-07 09:00:00", items: [item(101, 1, 20), item(102, 2, 2)] },
  ];
  const snapshot = () => {
    const { allocations, ...production } = calculateWarehouseProduction(orders, products);
    return employeeOperations({ orders: orders.map((order) => ({ ...order, items: (allocations[order.id] || order.items).map((row) => ({ ...row, status: ["dispatched", "delivered"].includes(order.status) ? order.status : row.status })) })), products, production, counts: { pending: orders.filter((order) => ["confirmed", "preparing"].includes(order.status)).length, inDelivery: orders.filter((order) => ["ready", "dispatched"].includes(order.status)).length, soldToday: orders.filter((order) => order.status === "delivered").length } });
  };
  let createdEmployee;
  let stockSaves = 0;
  let stockConflict = false;
  let failOperations = false;
  let accessExpired = false;
  const savedKeys = new Set();
  const employeeCalls = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();
    const isEmployee = request.headers().authorization === "Bearer employee-test-token";
    if (isEmployee) {
      employeeCalls.push(`${method} ${pathname}`);
      assert.equal(request.headers()["x-business-unit"], "WAREHOUSE");
      assert(pathname.startsWith("/api/warehouse/"), `consulta no autorizada desde UI: ${pathname}`);
    }
    let data;
    if (pathname === "/api/auth/login") {
      const body = request.postDataJSON();
      const admin = body.email === "admin@test";
      assert.equal(body.password, admin ? "admin-test-password" : "employee-test-password");
      data = { token: admin ? "admin-test-token" : "employee-test-token", user: admin ? users[0] : createdEmployee };
      assert(data.user);
    } else if (pathname === "/api/auth/register") {
      assert(!isEmployee);
      const { name, email, role } = request.postDataJSON();
      assert.equal(role, "EMPLEADO_GALPON");
      createdEmployee = { id: 3, name, email, role }; users.push(createdEmployee); data = createdEmployee;
    } else if (pathname === "/api/users") data = users;
    else if (pathname === "/api/warehouse/operations") {
      if (failOperations) { await route.fulfill({ status: 503, json: { message: "No se pudieron actualizar las operaciones." } }); return; }
      data = { ...snapshot(), access: { isExpired: accessExpired, isWarningPhase: false, daysRemaining: accessExpired ? 0 : null } };
    } else if (/\/warehouse\/stock\/\d+$/.test(pathname)) {
      assert.equal(method, "PATCH");
      const body = request.postDataJSON();
      assert.deepEqual(Object.keys(body).sort(), ["expectedStock", "idempotencyKey", "stock"]);
      if (stockConflict) { stockConflict = false; await route.fulfill({ status: 409, json: { message: "El stock cambió en otra sesión. Actualizá y revisá la cantidad." } }); return; }
      const product = products.find((product) => product.id === Number(pathname.split("/").at(-1)));
      if (!savedKeys.has(body.idempotencyKey)) { assert.equal(body.expectedStock, product.stock); product.stock = body.stock; stockSaves++; savedKeys.add(body.idempotencyKey); }
      data = { productId: product.id, stock: product.stock };
    } else if (/\/items\/\d+\/status$/.test(pathname)) {
      const order = orders.find((order) => order.id === Number(pathname.split("/").at(-4)));
      const row = order.items.find((row) => row.id === Number(pathname.split("/").at(-2)));
      const body = request.postDataJSON(); assert.equal(body.expectedVersion, order.version);
      row.status = body.status; order.version++;
      data = employeeOrder(order);
    } else if (/\/orders\/\d+\/status$/.test(pathname)) {
      const order = orders.find((order) => order.id === Number(pathname.split("/").at(-2)));
      const body = request.postDataJSON(); assert.equal(body.expectedVersion, order.version);
      assert(["ready", "dispatched", "delivered", "preparing"].includes(body.status));
      if (body.status === "dispatched") for (const row of order.items) products.find((product) => product.id === row.productId).stock -= row.quantity;
      order.status = body.status; order.version++;
      if (body.status === "delivered") order.deliveredAt = "2026-11-09 10:36:00";
      data = employeeOrder({ ...order, items: order.items.map((row) => ({ ...row, status: ["dispatched", "delivered"].includes(order.status) ? order.status : row.status })) });
    } else if (pathname === "/api/subscription/status") data = { isExpired: false, isWarningPhase: false };
    else if (pathname === "/api/cash-register/status") data = { isOpen: false, suggestedInitialCash: 0 };
    else if (!isEmployee && method === "GET") data = [];
    else throw new Error(`Consulta inesperada: ${method} ${pathname}`);
    await route.fulfill({ json: data });
  });
  await page.goto(`${server.resolvedUrls.local[0]}__employee-check`);
  const login = async (email, password) => {
    await page.getByPlaceholder("usuario@empresa.com").fill(email);
    await page.getByPlaceholder("••••••••").fill(password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  };
  console.log("Checking admin creates employee...");
  await login("admin@test", "admin-test-password");
  await page.getByRole("button", { name: /Entrar al Local/ }).click();
  await page.getByRole("button", { name: "Usuarios", exact: true }).click();
  await page.getByRole("button", { name: "Nuevo Usuario", exact: true }).click();
  await page.getByRole("textbox", { name: "Nombre Completo", exact: true }).fill("Andrea Operativa");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("empleada@test");
  await page.getByLabel("Contraseña", { exact: true }).fill("employee-test-password");
  await page.getByRole("combobox", { name: "Rol", exact: true }).selectOption("EMPLEADO_GALPON");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.getByRole("cell", { name: "Empleado del galpón", exact: true }).waitFor();
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  console.log("Checking employee login, navigation and oldest-first dashboard...");
  await login("empleada@test", "employee-test-password");
  await page.getByRole("heading", { name: "¡Buen día, Andrea Operativa!", exact: true }).waitFor();
  await page.getByText("Lunes, 9 de noviembre de 2026 · 10:35 hs", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "Faltantes de producción", exact: true }).waitFor();
  for (const label of ["Usuarios", "Config", "Compras", "Caja", "Clientes y cuentas", "Estadísticas", "Nuevo pedido", "Cambiar a Local"]) assert.equal(await page.getByRole("button", { name: label, exact: true }).count(), 0, label);
  const tableRows = page.locator("table tbody tr");
  assert.match(await tableRows.nth(0).innerText(), /^#10/);
  assert.match(await tableRows.nth(1).innerText(), /^#20/);
  assert.match(await tableRows.nth(0).innerText(), /20× Bolsas 50×70.*2× Guantes/s);
  const needs = () => page.getByRole("region", { name: "Faltantes de producción", exact: true });
  await needs().getByText("30 u. a producir", { exact: true }).waitFor();
  await needs().getByRole("button", { name: "Pedido #10 · 5 u.", exact: true }).waitFor();
  await page.clock.fastForward(60_000);
  await page.getByText("Lunes, 9 de noviembre de 2026 · 10:36 hs", { exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "¡Buen día, Andrea Operativa!", exact: true }).waitFor();
  console.log("Checking stock-only edit, error preservation and production refresh...");
  await page.getByRole("button", { name: "Stock", exact: true }).click();
  await page.getByRole("heading", { name: "Stock", exact: true }).waitFor();
  await page.getByRole("searchbox", { name: "Buscar producto", exact: true }).fill("501");
  await page.getByRole("button", { name: "Actualizar stock", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Nueva cantidad", exact: true }).fill("35");
  stockConflict = true;
  await page.getByRole("button", { name: "Guardar cantidad", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "El stock cambió" }).waitFor();
  assert.equal(await page.getByRole("spinbutton", { name: "Nueva cantidad", exact: true }).inputValue(), "35");
  await page.getByRole("button", { name: "Guardar cantidad", exact: true }).dblclick();
  await page.getByRole("dialog").waitFor({ state: "hidden" }); assert.equal(stockSaves, 1);
  await page.getByRole("button", { name: "Inicio", exact: true }).click();
  await needs().getByText("10 u. a producir", { exact: true }).waitFor();
  assert.equal(await needs().getByRole("button", { name: /Pedido #10/ }).count(), 0, "el stock ahora cubre el pedido más antiguo");
  console.log("Checking employee changes all order stages...");
  await page.locator("table tbody tr").filter({ hasText: "#10" }).getByRole("button", { name: "Ver detalle", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Cancelar pedido", exact: true }).count(), 0);
  for (const name of ["Bolsas 50×70", "Guantes"]) {
    await page.getByRole("dialog").getByRole("combobox", { name: `Estado de ${name}`, exact: true }).selectOption("ready");
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();
    await page.getByRole("dialog", { name: "Pedido #10", exact: true }).waitFor();
  }
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByRole("combobox", { name: "Estado del pedido #10", exact: true }).selectOption("ready");
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("combobox", { name: "Estado del pedido #10", exact: true }).waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Pedidos", exact: true }).click();
  for (const status of ["dispatched", "delivered"]) {
    await page.getByRole("combobox", { name: "Estado del pedido #10", exact: true }).selectOption(status);
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  }
  await page.reload();
  await page.getByRole("button", { name: "Pedidos", exact: true }).click();
  assert.equal(await page.getByRole("combobox", { name: "Estado del pedido #10", exact: true }).inputValue(), "delivered");
  console.log("Checking responsive employee views...");
  const screenshots = [];
  for (const width of [1366, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: "Inicio", exact: true }).click();
    await page.getByRole("heading", { name: "Faltantes de producción", exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Inicio a ${width}px`);
    const screenshot = path.join(tmpdir(), `warehouse-employee-${width}.png`); await page.screenshot({ path: screenshot, fullPage: true }); screenshots.push(screenshot);
    await page.getByRole("button", { name: "Stock", exact: true }).click();
    await page.getByRole("heading", { name: "Stock", exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Stock a ${width}px`);
    assert.doesNotMatch(await page.locator("body").innerText(), /Precio|Costo|\$/);
  }
  await page.getByRole("button", { name: "Inicio", exact: true }).click(); failOperations = true;
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "No se pudieron" }).waitFor(); failOperations = false;
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await needs().getByText("10 u. a producir", { exact: true }).waitFor();
  accessExpired = true;
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await page.getByRole("heading", { name: "Suscripción Vencida", exact: true }).waitFor();
  accessExpired = false;
  await page.clock.fastForward(15_000);
  await page.getByRole("heading", { name: "Suscripción Vencida", exact: true }).waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await page.getByRole("button", { name: "Ingresar", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("token")), null);
  assert(employeeCalls.length > 5); assert.deepEqual(errors, []);
  console.log("PASS: alta desde Usuarios, sesión propia, navegación mínima, saludo/reloj, cronología, faltantes por pedido, stock sin precios, errores, estados persistentes, logout y responsive (1366/768/390).");
  console.log(JSON.stringify({ screenshots }));
} finally { await browser?.close(); await server.close(); }
