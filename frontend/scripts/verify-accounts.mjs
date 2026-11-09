import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixture = `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module">
import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import { CuentasCorrientesView } from '/src/app/components/CuentasCorrientesView.jsx';
import '/src/styles/index.css';
window.printedTickets = [];
window.print = () => {
  window.printedTickets.push(document.querySelector('.account-ticket')?.textContent);
  window.dispatchEvent(new Event('afterprint'));
};
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(CuentasCorrientesView));
</script></body></html>`;
const server = await createServer({
  server: { port: 0, host: '127.0.0.1' },
  plugins: [{ name: 'accounts-check-fixture', configureServer(vite) {
    vite.middlewares.use('/__accounts-check', async (req, res, next) => {
      try {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(await vite.transformIndexHtml(req.originalUrl, fixture));
      } catch (error) { next(error); }
    });
  } }],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: process.env.PRINT_BROWSER });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const customers = [
    { id: 1, name: 'Ana', lastName: 'Pérez', document: '12345678', debt: 100 },
    { id: 2, name: 'Luis', lastName: 'Gómez', document: '87654321', debt: 0 },
  ];
  const methods = [{ id: 1, name: 'Efectivo' }, { id: 2, name: 'Transferencia' }];
  const movements = [{ id: 1, customerId: 1, type: 'cargo', amount: 100, items: [], createdAt: '2026-11-08 10:00:00' }];
  const submitted = [];
  let listRequests = 0;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let data;
    if (pathname === '/api/payment-methods') data = methods;
    else if (pathname === '/api/customers') { listRequests++; data = customers; }
    else if (pathname === '/api/customers/movements') data = movements.map((movement) => ({ ...movement, customerName: 'Ana', customerLastName: 'Pérez', document: '12345678' }));
    else if (request.method() === 'POST') {
      const body = request.postDataJSON();
      submitted.push(body);
      const amount = body.payments.reduce((sum, payment) => sum + payment.amount, 0);
      assert(amount > 0 && amount <= customers[0].debt);
      customers[0].debt -= amount;
      data = { id: movements.length + 1, customerId: 1, type: 'pago', amount, debt: customers[0].debt,
        createdAt: '2026-11-08 12:00:00', methodName: body.payments.length > 1 ? 'Pago combinado' : 'Efectivo',
        paymentDetails: body.payments.map((payment) => ({ ...payment, methodName: methods.find((method) => method.id === payment.paymentMethodId).name })),
        description: body.description, items: [] };
      movements.push(data);
    } else {
      const customer = customers.find((entry) => entry.id === Number(pathname.split('/').at(-1)));
      data = { ...customer, totalCharges: customer.id === 1 ? 100 : 0,
        totalPayments: customer.id === 1 ? 100 - customer.debt : 0,
        movements: movements.filter((movement) => movement.customerId === customer.id) };
    }
    await route.fulfill({ json: data });
  });
  const url = `http://127.0.0.1:${server.httpServer.address().port}/__accounts-check`;
  const button = (name) => page.getByRole('button', { name, exact: true });
  const rows = page.locator('tbody tr');
  const input = (index = 1) => page.getByRole('spinbutton', { name: `Importe del método ${index}` });
  const assertBlocked = async () => {
    assert(await button('Registrar sin imprimir').isDisabled());
    assert(await button('Registrar e imprimir').isDisabled());
  };
  await page.goto(url);
  await rows.filter({ hasText: 'Ana' }).waitFor();
  assert.equal(await rows.count(), 1);
  await button('Todos los clientes').click();
  assert.equal(await rows.count(), 2);
  assert.equal(listRequests, 1, 'Cambiar de pestaña reutiliza la lista cargada');
  const search = page.getByPlaceholder('Buscar por nombre o DNI...');
  await search.fill('87654321');
  assert.equal(await rows.count(), 1);
  assert.match(await rows.innerText(), /Luis.*Sin deuda/s);
  await rows.first().click();
  await page.getByRole('heading', { name: 'Luis Gómez' }).waitFor();
  assert(await button('Registrar pago').isDisabled());
  await button('Volver al listado').click();
  await search.fill('Ana');
  assert.equal(await rows.count(), 1);
  await search.fill('');
  await button('Cuentas activas').click();
  await button('Saldar').click();
  await input().waitFor();
  assert.equal(await input().inputValue(), '0.00');
  await assertBlocked();
  await input().fill('-1');
  await assertBlocked();
  await input().fill('100.01');
  await assertBlocked();
  await page.getByRole('alert').waitFor();
  assert.equal(submitted.length, 0);
  await button('Saldar todo con un método').click();
  assert.equal(await input().inputValue(), '100.00');
  assert.equal(await button('Registrar sin imprimir').isDisabled(), false);
  await input().fill('25');
  await page.getByText('$75.00', { exact: true }).waitFor();
  await button('Registrar sin imprimir').click();
  await input().waitFor({ state: 'hidden' });
  await page.getByText('$75.00', { exact: true }).waitFor();
  assert.equal(submitted.length, 1);
  await button('Volver al listado').click();
  await button('Saldar').click();
  await input().waitFor();
  assert.equal(await input().inputValue(), '0.00');
  await input().fill('25');
  await button('Agregar otro método').click();
  assert.equal(await input(2).inputValue(), '0.00');
  await assertBlocked();
  await page.locator('select').nth(1).selectOption('2');
  await input(2).fill('50.01');
  await assertBlocked();
  await input(2).fill('50');
  await page.getByText('$0.00', { exact: true }).waitFor();
  await button('Registrar e imprimir').click();
  await page.waitForFunction(() => window.printedTickets.length === 1);
  const ticket = await page.evaluate(() => window.printedTickets[0]);
  assert.match(ticket, /Efectivo\$25.00.*Transferencia\$50.00/s);
  assert.match(ticket, /TOTAL ABONADO\$75.00.*SALDO PENDIENTE\$0.00/s);
  assert.equal(submitted.length, 2);
  await button('Volver al listado').click();
  await page.getByText('No hay cuentas con deuda pendiente.').waitFor();
  await button('Todos los clientes').click();
  assert.equal(await rows.count(), 2);
  assert.match(await rows.filter({ hasText: 'Ana' }).innerText(), /Sin deuda/);
  await button('Historial de movimientos').click();
  await rows.filter({ hasText: 'Pago combinado' }).waitFor();
  assert.equal(await rows.count(), 3);
  customers[0].debt = 30; // Una nueva compra reutiliza el cliente existente.
  await page.reload();
  await rows.filter({ hasText: 'Ana' }).waitFor();
  assert.equal(await rows.count(), 1);
  assert.match(await rows.innerText(), /\$30.00/);
  await page.setViewportSize({ width: 390, height: 844 });
  await button('Todos los clientes').click();
  assert.equal(await rows.count(), 2);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert.deepEqual(errors, []);
  console.log('PASS: pestañas, búsqueda, saldo cero, reutilización sin duplicados, importes iniciales, pagos parciales/combinados, validaciones, historial, ticket y vista móvil.');
} finally {
  await browser?.close();
  await server.close();
}
