// Run with PLAYWRIGHT_MODULE pointing to an existing Playwright installation
// and PRINT_BROWSER pointing to its Chromium executable. No extra app dependency.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = resolve(process.env.PRINT_CHECK_OUTPUT || 'tmp/print-check');
await mkdir(output, { recursive: true });
const fixture = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="root"></div><script type="module">
import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import {SaleTicket} from '/src/app/components/SaleTicket.jsx';
import {A4SaleDocument} from '/src/app/components/A4SaleDocument.jsx';
import '/src/styles/index.css';
const params = new URLSearchParams(location.search);
const items = Array.from({length:Number(params.get('count') || 1)}, (_, i) => ({
  productId:i+1, name: i % 2 ? 'SKIP PREMIUM TOTAL X 1 LT JABÓN LÍQUIDO - DESCRIPCIÓN EXTENSA DE PRUEBA' : 'ROPA COLOR LAVANDINA TOTAL X 5 LT',
  code:i % 2 ? 'CODIGO123456789012345678901234567890' : '12345',
  unitsPerPack:12, price:i % 2 ? 12345678.90 : 12450, quantity:2
}));
const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
const transaction = {id:'123456789', date:'06/11/2026', time:'17:49',
  customerName:'Cliente de prueba', address:'Dirección de prueba 123', items, total,
  payments:[{type:'Transferencia', amount:total}]};
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(
  params.get('format') === 'a4' ? A4SaleDocument : SaleTicket, {transaction}));
</script></body></html>`;

const server = await createServer({
  server:{port:0, host:'127.0.0.1'},
  plugins:[{name:'print-check-fixture', configureServer(vite) {
    vite.middlewares.use('/__print-check', async (req, res, next) => {
      try {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(await vite.transformIndexHtml(req.originalUrl, fixture));
      } catch (error) { next(error); }
    });
  }}],
});
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  browser = await chromium.launch({headless:true, executablePath:process.env.PRINT_BROWSER});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  await page.emulateMedia({media:'print'});
  const results = [];
  for (const format of ['thermal', 'a4']) {
    for (const count of [1, 8, 60]) {
      for (const width of format === 'thermal' ? [181, 219] : [794]) {
        await page.setViewportSize({width, height:1123});
        let previous;
        for (let copy = 1; copy <= 2; copy++) {
          await page.goto(`http://127.0.0.1:${address.port}/__print-check?format=${format}&count=${count}`);
          const doc = page.locator(format === 'a4' ? '.a4-ticket' : '.sale-ticket');
          await doc.waitFor({state:'visible'});
          await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all([...document.images].map(img => img.decode()));
          });
          const geometry = await doc.evaluate(element => {
            const box = element.getBoundingClientRect();
            const overflow = [...element.querySelectorAll('*')].filter(child => {
              const rect = child.getBoundingClientRect();
              return rect.width && (rect.left < box.left - 1 || rect.right > box.right + 1 || child.scrollWidth > child.clientWidth + 1);
            }).map(child => child.className || child.tagName);
            const cells = [...element.querySelectorAll('tbody tr')].flatMap(row =>
              [...row.cells].slice(1).map((cell, index) => {
                const header = element.querySelectorAll('th')[index + 1];
                const a = cell.getBoundingClientRect(), b = header.getBoundingClientRect();
                return {delta:Math.abs((a.left+a.right-b.left-b.right)/2), align:getComputedStyle(cell).textAlign};
              }));
            return {x:box.x, width:box.width, overflow, cells, text:element.textContent,
              page:getComputedStyle(element).page, bodyWidth:document.body.clientWidth};
          });
          assert.deepEqual(geometry.overflow, [], `${format}/${count}/${width}: horizontal overflow`);
          assert.match(geometry.text, /06\/11\/2026.*17:49/);
          assert.match(geometry.text, /TOTAL/);
          assert.match(geometry.text, /TRANSFERENCIA|Transferencia/);
          assert.doesNotMatch(geometry.text, /https?:|[\x00-\x08\x0e-\x1f]/);
          assert.equal(geometry.page, format === 'a4' ? 'remito' : 'thermal');
          if (format === 'a4') {
            assert.match(geometry.text, /RECIBÍ CONFORME/);
            assert(geometry.cells.every(cell => cell.delta < 1 && cell.align === 'center'));
          } else {
            assert(Math.abs(geometry.x * 2 + geometry.width - geometry.bodyWidth) < 1, 'centered printable area');
            assert.match(geometry.text, /Gracias por su compra/);
          }
          if (previous) assert.deepEqual(geometry, previous, 'consecutive copies have identical geometry');
          previous = geometry;
          if (copy === 1 && count !== 60) await doc.screenshot({path:resolve(output, `${format}-${count}-${width}.png`)});
          if (process.env.PRINT_CHECK_PDF && copy === 1 && (format === 'a4' || width === 219)) {
            const box = await doc.boundingBox();
            await page.pdf({
              path:resolve(output, `${format}-${count}.pdf`),
              printBackground:true, preferCSSPageSize:true, displayHeaderFooter:true,
              ...(format === 'a4' ? {format:'A4'} : {width:'58mm', height:`${Math.ceil(box.height + 2)}px`}),
            });
          }
        }
        results.push({format, count, width, copies:2, status:'PASS'});
      }
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(results, null, 2));
  console.log('Print-media geometry passed. Physical driver output and pagination require print preview/paper verification.');
} finally {
  await browser?.close();
  await server.close();
}
