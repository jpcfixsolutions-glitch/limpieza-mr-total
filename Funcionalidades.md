# Funcionalidades

## Unidades de negocio: Local y Galpón

La misma aplicación y base de datos administran dos operaciones independientes:

- **Local (`LOCAL`)**: conserva el punto de venta, caja, inventario, clientes, cuentas corrientes y estadísticas existentes.
- **Galpón (`WAREHOUSE`)**: concentra la operación mayorista, con inventario, pedidos, compras, clientes, cuentas corrientes, movimientos y estadísticas propios.

Después de iniciar sesión, un administrador elige la unidad en la que desea trabajar y puede cambiarla desde el selector visible en la barra lateral. El cambio de unidad descarta el estado temporal de la pantalla anterior y vuelve a consultar los datos. Los cajeros quedan forzados al Local y el rol creador conserva su acceso previo.

### Seguridad y contexto de la API

El frontend envía la unidad activa mediante `X-Business-Unit: LOCAL|WAREHOUSE`. El backend resuelve ese encabezado en cada petición autenticada y usa `LOCAL` cuando se omite, para conservar compatibilidad con clientes anteriores.

La autorización no depende de la interfaz: sólo los administradores pueden acceder al Galpón. Si un cajero manipula manualmente el encabezado, la petición se rechaza. Productos operativos, clientes, cuentas corrientes, movimientos y estadísticas se consultan dentro del contexto de la unidad resuelta.

### Inventario por unidad

El catálogo conceptual de `products` es compartido, pero el estado operativo vive en `business_unit_products`, con una combinación única de unidad y producto. Cada registro mantiene stock, mínimo, costo, precio de venta, disponibilidad y modalidad de abastecimiento.

La migración inicial copia al Local, sin reiniciar información, el stock, costo, precio, mínimo y disponibilidad históricos. Las columnas anteriores de `products` se conservan como espejo de compatibilidad del inventario Local.

Todo cambio relevante genera un registro auditable en `inventory_movements`, incluyendo unidad, producto, dirección, cantidad, costo histórico, stock anterior y posterior, documento de origen, usuario, contraparte y clave de idempotencia. Las correcciones crean movimientos de reversión; no eliminan el movimiento original.

### Pedidos mayoristas

Los pedidos del Galpón admiten varios productos y los estados `draft`, `confirmed`, `preparing`, `dispatched` y `cancelled`. Guardan cliente, observaciones, responsable, fechas, total y snapshots de nombre, cantidad, precio y costo de cada ítem.

- Un borrador no modifica inventario.
- La confirmación requiere un cliente.
- El despacho descuenta el stock del Galpón una sola vez.
- Un despacho repetido se rechaza o devuelve el resultado idempotente.
- Cancelar después del despacho repone exactamente una vez el inventario y revierte el cargo de cuenta corriente asociado, si existía.

### Compras del Galpón

Las compras admiten varios productos, proveedor, observaciones y los estados `draft`, `received` y `cancelled`. Cada ítem conserva cantidad y costo unitario histórico.

- Crear un borrador no cambia stock.
- Recibir la compra incrementa el stock del Galpón una sola vez.
- Cancelar una compra recibida genera los movimientos inversos una sola vez.
- La compra y su eventual cancelación no se registran como movimientos de caja del Local.

### Clientes y cuentas corrientes

Los clientes se separan por unidad de negocio. El documento es único dentro de cada unidad, lo que permite mantener identidades independientes sin perder los registros anteriores.

El Local existe además como cliente interno estable del Galpón, identificado por `internal_code` y no por su nombre. Los cargos y sus reversiones conservan la unidad y el vínculo con el documento que los originó.

### Transferencias Local–Galpón

Una transferencia descuenta el inventario de origen e incrementa el de destino dentro de una única transacción. Se guardan el documento de transferencia y ambos movimientos vinculados. La clave de idempotencia evita que un reintento duplique la operación.

### Abastecimiento directo desde el Galpón

Un producto del Local puede configurarse como:

- `OWN_STOCK`: la venta descuenta únicamente el stock Local.
- `WAREHOUSE_DIRECT`: la venta valida y descuenta únicamente el stock del Galpón.

El inventario Local muestra la modalidad, su propio stock, precio y costo, y la disponibilidad relevante del Galpón. En Ventas, los productos directos utilizan como disponibilidad el stock del Galpón y muestran esa procedencia.

Al confirmar una venta local con abastecimiento directo, una única transacción de base de datos crea la venta y sus detalles, registra el ingreso sólo en el Local y genera la salida del Galpón. El vínculo y la clave de idempotencia impiden crear dos salidas para la misma venta e ítem. Si falta stock o falla cualquier escritura, no se guarda ninguna parte de la venta.

Las promociones procesan individualmente sus componentes: cada producto descuenta la unidad definida por su modalidad, sin descontar Local y Galpón para la misma unidad física.

La configuración `warehouse_internal_sale_mode` queda inicialmente en `inventory_only`. Por lo tanto, el abastecimiento directo representa costo y salida de inventario del Galpón, pero no crea ingresos, egresos ni deuda interna ficticia. La estructura queda preparada para incorporar en el futuro una venta interna explícita.

### Caja, contabilidad y estadísticas

La caja existente pertenece exclusivamente al Local. Los pedidos y compras del Galpón no requieren abrirla y sus operaciones no crean movimientos en esa caja.

Las estadísticas del Galpón presentan unidades y valor de inventario, pedidos despachados, venta mayorista, compras recibidas y productos bajo mínimo. Las estadísticas y los clientes se filtran por unidad para impedir que los datos del Local y el Galpón se mezclen.

### Migraciones

- `20261011_012_business_units_and_warehouse`: crea las unidades, inventarios por unidad, movimientos, pedidos, compras, transferencias, cliente interno y configuración; además migra los datos históricos al Local de manera idempotente.
- `20261011_013_account_movement_reversals`: agrega a las cuentas corrientes el origen y el vínculo de reversión necesario para cancelaciones auditables.

Ambas migraciones se aplicaron sobre la base LibSQL/Turso configurada. El control posterior verificó 31 tablas compatibles y confirmó la existencia de `LOCAL`, `WAREHOUSE` y el cliente interno.

### Pruebas y validación

La cobertura automatizada comprueba la migración idempotente, autorización por rol, separación de clientes y estadísticas, recepción y cancelación de compras, despacho y cancelación de pedidos, transferencias atómicas, ventas locales con stock propio o directo, falta de stock sin escrituras parciales, reintentos idempotentes, promociones mixtas y protección contra stock negativo concurrente.

La suite completa finalizó con 29 pruebas aprobadas y el frontend compiló correctamente. También se validaron en navegador la selección de unidad para administradores, el acceso exclusivo al Local para cajeros, la navegación diferenciada del Galpón y los formularios de pedidos y compras con múltiples ítems.

## Rentabilidad de productos

La rentabilidad se consulta únicamente desde **Estadísticas → Rentabilidad**. No agrega tarjetas ni información a la pantalla principal.

Mide la ganancia sobre el costo invertido, no el margen sobre el precio de venta:

```
ganancia monetaria = ingresos netos - costo total vendido
rentabilidad general = (ganancia monetaria / costo total vendido) × 100
```

La rentabilidad general es ponderada por el costo y las unidades realmente vendidas; no se obtiene promediando los porcentajes de los productos.

### Datos históricos

Cada detalle de venta nuevo guarda el costo unitario y la categoría vigentes al momento de confirmar la operación. Por lo tanto, cambiar después el costo o la categoría de un producto no modifica las ventas ya registradas.

La migración histórica completa las ventas anteriores con el costo disponible al momento de aplicarla. No es posible reconstruir automáticamente un costo antiguo que el sistema nunca había almacenado.

Las promociones conservan el costo de sus componentes y, al mostrar el detalle, su ingreso se distribuye proporcionalmente entre ellos según su costo.

### Promociones y combos

Una promoción no tiene un costo manual. Su costo actual se calcula al consultarla como la suma de `costo del producto × cantidad incluida` para todos sus componentes. Por eso se actualiza automáticamente si cambia el costo de alguno de ellos.

Al concretar una venta se guarda el costo total de la promoción y el costo de cada componente como parte de su composición histórica. La pestaña Rentabilidad presenta la promoción como una fila diferenciada y multiplica ese costo por cada promoción vendida; los descuentos reducen su ingreso neto, nunca su costo.

### Filtros y contenido

La pestaña permite filtrar por día, semana, mes, rango personalizado, producto y categoría. Al cambiar un filtro se actualizan:

- Costo total de la mercadería vendida.
- Ingresos netos.
- Ganancia monetaria total.
- Rentabilidad general, objetivo de 40% y diferencia en puntos porcentuales.
- Evolución diaria de la rentabilidad.
- Tabla por producto con costo y venta unitarios históricos, cantidad vendida, costo total, ganancia y porcentaje de rentabilidad.

El indicador de objetivo es verde desde 40%, amarillo entre 30% y 39,99%, y rojo por debajo de 30%. Cuando el costo total es cero, se muestra **No calculable** para evitar divisiones por cero. Los porcentajes se redondean a dos decimales sólo al mostrarlos.

### Operaciones especiales

El reporte incluye exclusivamente transacciones con estado `completed`; las anuladas quedan excluidas. El sistema actual no dispone de un flujo ni tablas de devoluciones. Cuando se implemente, deberá persistir una reversión que este reporte pueda restar.

Los precios de costo y de venta negativos ya se validan y rechazan desde el servicio de productos.

### Backend

El endpoint `GET /api/stats/profitability` requiere autenticación y rol de administrador. Acepta los parámetros opcionales `from`, `to`, `productId` y `categoryId`, y devuelve el resumen, detalle por producto y evolución diaria.

### Validación manual

1. Registrar una venta de un producto con costo y precio conocidos.
2. Modificar posteriormente su costo desde Inventario.
3. Ir a **Estadísticas → Rentabilidad**.
4. Filtrar el período de la venta y comprobar que el reporte conserva el costo anterior.
5. Cambiar los filtros para verificar que se actualizan las tarjetas, gráfico y tabla.

### Pruebas

Las pruebas de rentabilidad verifican el cálculo ponderado, importes con descuento y el comportamiento cuando el costo es cero. También se ejecutó el build de producción del frontend.
