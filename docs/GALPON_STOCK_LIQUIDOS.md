# Stock independiente de líquidos del Galpón

## Correcciones de envases y configuración

Se corrigió el agregado repetido de envases: cada fila nueva muestra **Eliminar envase**, incluso si se cargaron litros en ese borrador. No es necesario cerrar la modal. Los envases nuevos comienzan con contenido cero. Los recipientes guardados con contenido y las filas derivadas de sus traslados o divisiones conservan la protección contra eliminación accidental; primero se registra la salida de sus litros.

Configuración del Galpón incorpora **Categorías de productos** y **Tipos de envase**, con alta, edición, eliminación lógica y reactivación. La modal de productos usa desplegables alimentados por estas opciones. Granel permanece como modalidad de almacenamiento sin recipiente. Las opciones eliminadas dejan de ofrecerse en nuevas selecciones; los productos existentes conservan su texto actual hasta una edición explícita. Los nombres no se propagan automáticamente a productos ni envases.

Los controles editables tienen fondo blanco, bordes contrastantes y foco visible. Las ubicaciones se muestran en secciones diferenciadas: verde para Galpón y azul para En Local, cada una con su subtotal. Cambiar la ubicación mueve la tarjeta a su sección y muestra un aviso para revisar y guardar el traslado.

La migración adicional `20261114_022_warehouse_stock_options` crea únicamente `warehouse_stock_options` y `warehouse_stock_options_audit`. No transforma productos ni cantidades. El comando `npm run db:migrate-warehouse-liquids` ahora aplica tanto 021 como 022, omitiendo las que ya estén registradas. Continúa sin ejecutar migraciones históricas y no se ejecutó contra la base real durante esta corrección.

Archivos adicionales: `warehouseStockOptionsMigration.js`, `warehouseStockOptions.service.js`, `warehouseStockOptions.integration.test.js`, `WarehouseStockSettings.jsx`, `warehouseStockDraft.js` y sus pruebas. Se integran en el esquema, el registro y comando de migraciones, las rutas y permisos operativos, Configuración y la modal de líquidos.

Verificación: regresión de cinco envases eliminados sin cerrar la modal; protección de recipientes guardados; CRUD y versiones de opciones; validaciones y permisos HTTP; conservación del inventario del Local; migración idempotente; compilación del frontend y sus 14 pruebas aprobadas. Revisión visual con datos simulados de los desplegables, la eliminación, el cambio de ubicación y Configuración en móvil.

Implementación para revisión, sin commit, push ni aplicación de migraciones sobre la base real.

## Protección del Local

Se revisaron el esquema, las migraciones, las consultas del catálogo, los servicios de inventario y el flujo de pedidos. La consulta anterior incluía productos sin relación con la unidad seleccionada. Además, la edición del catálogo compartido desde Galpón permitía cambiar nombres y categorías de productos comerciales.

El catálogo nuevo no referencia `products` ni `business_unit_products`: no copia productos, precios, cantidades ni categorías del Local. Los datos nuevos se escriben únicamente en tablas de líquidos y, para pedidos, en las estructuras de Galpón. Las consultas y operaciones de venta del Local conservan su lógica. Las escrituras del catálogo comercial con contexto WAREHOUSE se rechazan; la lectura del catálogo anterior en Galpón exige una relación explícita con esa unidad.

No se ejecutaron reset, seed, importaciones ni migraciones sobre la base real. La verificación de compatibilidad con esa instancia queda pendiente de aplicar el comando específico descrito abajo. Se verificó la compatibilidad del esquema documentado y de bases temporales con datos existentes.

## Modelo y operaciones

- `warehouse_liquid_products`: nombre, código opcional, categoría propia, costo y precio por litro, mínimo y versión. Identificadores independientes.
- `warehouse_liquid_containers`: recipiente o grupo, capacidad nominal, cantidad, contenido real y ubicación `WAREHOUSE` o `LOCAL`. Única fuente de verdad de las cantidades; no hay otro saldo que actualizar.
- `warehouse_liquid_movements`: usuario, fecha UTC, motivo, operación, snapshots anterior/posterior y clave idempotente. El historial muestra nombres de usuarios y distribuciones legibles.
- Columna nullable `warehouse_order_items.liquid_product_id`: relaciona los pedidos nuevos con el catálogo independiente. Los ítems anteriores y sus relaciones permanecen intactos.

Los litros se almacenan como mililitros enteros, con precisión de 0,001 L. Los grupos admiten envases llenos o vacíos. Un envase parcial se separa del grupo. Granel tiene cantidad 1 y capacidad nominal 0. Los totales se calculan desde el contenido real, nunca desde la capacidad.

La modal permite altas, edición, ingresos, salidas, cambios de ubicación, traslados de litros y retiro de envases vacíos. Un traslado parcial genera contenido a granel en la ubicación destino; para mover un recipiente completo se cambia su ubicación. Los cambios se aplican primero al borrador y se persisten al guardar. Se exige motivo y se conserva la versión para detectar ediciones simultáneas.

El administrador puede configurar productos, valores comerciales, consultar movimientos y archivar productos vacíos. La baja es lógica y conserva el historial. El empleado puede consultar existencias y modificar distribución, sin ver ni modificar costos o precios, crear productos, archivarlos ni consultar auditoría comercial. La lista cerrada de rutas del rol incorpora únicamente las lecturas y la edición operativa necesarias.

## Pedidos y producción

Se conserva el descuento al despachar; preparación y Listo no generan descuentos. Los productos nuevos utilizan una clave pública `liquid:<id>` para evitar colisiones con identificadores comerciales.

El cálculo de producción usa exclusivamente litros físicamente en Galpón. En Local se muestra separado y no abastece automáticamente pedidos. Las cantidades admiten tres decimales; los resúmenes separan litros y unidades.

Al despachar líquidos es obligatorio indicar cuántos litros salen de cada envase. El servidor valida pertenencia, ubicación, contenido y suma exacta de la asignación. Los descuentos, la auditoría y el estado del pedido se guardan en la misma transacción. Una asignación inválida revierte toda la operación. Los reintentos no duplican descuentos. La cancelación de un despacho devuelve los litros a granel en Galpón, porque los recipientes originales podrían haberse modificado.

Los productos anteriores del Galpón continúan usando su lógica de pedidos y cantidades en unidades. Se muestran aparte, como consulta del inventario anterior, sin conversión automática a litros.

## Migración y puesta en marcha

Migración nueva: `20261114_021_warehouse_liquids`. Sólo crea tablas e índices y agrega una referencia nullable a los ítems de pedidos. No contiene UPDATE, DELETE, DROP, reclasificaciones ni cargas iniciales de productos.

Para aplicar exclusivamente esta migración, después de revisar el resultado y verificar que la conexión apunta a la instancia deseada:

```powershell
cd backend
npm run db:migrate-warehouse-liquids
```

Este comando verifica que existe el registro de migraciones y que `warehouse_order_items.product_id` admite NULL. Si detecta incompatibilidad o una columna nueva sin su registro de migración, se detiene antes de escribir. Ejecuta la migración y su registro en un batch transaccional; repetir el comando no repite cambios. No ejecuta migraciones históricas pendientes. No usar reset, seed ni importación como parte de esta puesta en marcha.

La migración también está registrada en el ciclo habitual de inicialización. El comando específico es la opción controlada para esta entrega, porque el inicializador general puede ejecutar otras migraciones históricas pendientes.

## Archivos

Nuevos:

- `backend/src/db/warehouseLiquidsMigration.js`: DDL aditivo y preflight.
- `backend/src/db/migrateWarehouseLiquids.js`: aplicación exclusiva e idempotente.
- `backend/src/db/warehouseLiquids.migration.test.js`: compatibilidad, preservación e idempotencia del comando real sobre una base temporal.
- `backend/src/services/warehouseLiquids.service.js`: catálogo, distribución, auditoría, archivo y despacho.
- `backend/src/services/warehouseTransaction.js`: cola transaccional compartida por pedidos y líquidos.
- `frontend/src/app/components/WarehouseLiquidStockView.jsx`: tabla, filtros, selección, editor e historial.

Modificados:

- `backend/package.json`: comando de migración específica.
- `backend/src/db/schema.js` y `databaseLifecycle.js`: estructuras nuevas y registro de migración.
- `backend/src/routes/warehouse.routes.js` y `controllers/warehouse.controller.js`: endpoints nuevos y asignación de envases al despachar.
- `backend/src/middleware/auth.middleware.js`: rutas operativas permitidas al empleado.
- `backend/src/services/product.service.js` y `controllers/product.controller.js`: protección del catálogo comercial desde Galpón y filtrado de su consulta anterior.
- `backend/src/services/warehouse.service.js`, `warehouseProduction.js` y `warehouseEmployee.js`: integración de pedidos, faltantes, transacciones y respuestas por rol.
- `frontend/src/app/App.jsx`: apertura de la pantalla nueva para administrador y empleado.
- `frontend/src/app/components/WarehouseOrdersView.jsx`, `WarehouseProductionCard.jsx` y `WarehouseEmployeeProduction.jsx`: litros, faltantes y selección de envases al enviar.
- Tests `businessUnits.integration.test.js`, `warehouseOrders.integration.test.js`, `warehouseEmployee.integration.test.js` y `warehouseProduction.test.js`: fixtures y verificaciones de aislamiento e integración.
- `backend/src/services/cashRegister.service.test.js`: conexión exclusiva a una base temporal; los tests anteriores cargaban la conexión real de `.env`.

## Verificación

Se probaron altas exclusivas, ausencia de productos del Local en el catálogo nuevo, 25 L + 10 L = 35 L, dos tarros agrupados, recipientes parciales, traslado físico, salidas, bajo stock, cero en Galpón con existencia En Local, pedidos decimales, faltantes, asignación de envases, rollback, cancelación y reintentos idempotentes. Se compararon snapshots de las filas comerciales antes y después de las operaciones nuevas. Se verificó persistencia leyendo desde una segunda conexión a la base temporal.

Las pruebas HTTP verifican unidad, administrador, empleado, ocultamiento de costos/precios, bloqueo de cambios comerciales y archivo. La migración se ejecuta dos veces mediante su CLI contra una base temporal y comprueba que el esquema y los registros anteriores se conservan.

Se revisaron visualmente la tabla en desktop, la modal de envases, un traslado de 5 L conservando el total, y la presentación móvil de 390 × 844 con datos simulados. El frontend compila y pasan sus 11 pruebas. La compilación mantiene la advertencia de tamaño de bundle mayor a 500 kB.

En una ejecución completa del backend pasaron las verificaciones funcionales; falló la limpieza de un archivo SQLite temporal del test preexistente de extracciones por `EBUSY` en Windows. Las verificaciones específicas se ejecutan separadamente para distinguir este bloqueo de archivos de un fallo de negocio.

Resultado final de la verificación específica: **49 pruebas del backend aprobadas**, incluyendo migración, compatibilidad, inventarios, pedidos, producción y permisos; **11 pruebas del frontend aprobadas** y compilación de producción correcta. Comando del backend, desde su carpeta:

```powershell
node --test src/db/warehouseLiquids.migration.test.js src/services/warehouseOrders.integration.test.js src/services/warehouseProduction.test.js src/services/warehouseEmployee.integration.test.js src/services/businessUnits.integration.test.js
```

## Límites y decisiones de operación

- La base real todavía requiere aplicar la migración aditiva antes de usar los endpoints nuevos.
- El catálogo nuevo comienza vacío. No se convierten ni copian automáticamente registros anteriores. Los productos anteriores con vínculo explícito a Galpón se conservan y muestran en unidades.
- Los ingresos de líquidos se registran desde Distribución del stock. No se conectan automáticamente a las compras comerciales anteriores ni generan movimientos de caja.
- Los nuevos litros no se agregan al indicador histórico de inventario de las estadísticas anteriores de Galpón; sus existencias y valorización por litro están disponibles en la nueva pantalla. Las estadísticas del Local no se modifican.
- La recarga visual se comprobó con datos simulados; la persistencia real se verificó en bases temporales. Queda la revisión del usuario con su instancia real después de aplicar la migración.
