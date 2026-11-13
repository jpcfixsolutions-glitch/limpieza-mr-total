# Galpón: estadísticas y días de actividad

## Implementación

- La navegación reemplaza Compras y Movimientos por Estadísticas. Se conservan las tablas, los registros y los endpoints históricos de compras e inventario.
- Períodos día, semana (lunes a domingo) y mes, con navegación y fecha de referencia. Se actualizan al cambiar el período, al volver a la ventana y cada 30 segundos mientras la pantalla está visible.
- Pedidos y su valor se agrupan por creación, una vez por identificador; incluyen borradores y anulados, identificados por su estado actual. No representan ingresos.
- Cobros y devoluciones se agrupan por fecha efectiva, separando efectivo y transferencia. Los pagos de cuentas existentes se reutilizan con su desglose, sin duplicar el encabezado del pago combinado.
- Los métodos históricos diferentes o sin desglose se muestran como otros métodos y se incluyen en ingresos. No se asignan arbitrariamente a efectivo o transferencia.
- Historial del período descendente, con pedidos/productos, cobros, gastos expandibles y balance del día. El detalle ocupa el ancho del dispositivo; la tabla tiene desplazamiento horizontal en móvil.
- Los días se derivan de eventos, sin guardar totales ni crear filas diarias que puedan duplicarse. Un día puede existir sólo por cobros o gastos.
- Gastos operativos: alta, consulta, edición con control de versión y eliminación confirmada. Eliminación lógica y auditoría con valores anteriores/nuevos, usuario y fecha.
- Cobros de pedidos sin cuenta corriente: parciales o combinados, sin superar el saldo, con clave de idempotencia. Devolución completa de cada cobro como movimiento negativo independiente; para corregir un cobro, devolverlo y registrar el correcto.
- Importes financieros nuevos en centavos enteros; fechas nuevas en hora de Argentina. Validación de fecha y de importes con hasta dos decimales.
- Finanzas exclusivas de administradores del Galpón. No utilizan cajas, gastos ni transacciones del Local. Se respetan los permisos restringidos del empleado del Galpón.

## Migración

`20261113_019_warehouse_activity`, integrada al ciclo habitual de migraciones del backend. Crea `warehouse_receipts`, `warehouse_expenses`, `warehouse_expense_audit` e índices para las consultas por unidad/fecha y pedido.

No elimina ni reescribe registros históricos, no genera cobros retrospectivos y no almacena resúmenes diarios. Fue aplicada y comprobada en bases temporales; no se ejecutó contra la base operativa. Para aplicarla en el entorno configurado, ejecutar `npm run db:migrate` desde `backend` antes de usar el nuevo módulo. El arranque habitual también ejecuta `initializeDatabase`.

## Archivos de esta tarea

- `backend/src/db/warehouseFinanceMigration.js`: migración nueva.
- `backend/src/db/databaseLifecycle.js`: integración de la migración.
- `backend/src/db/schema.js`: esquema de los nuevos registros.
- `backend/src/services/warehouseActivity.service.js`: agregaciones, detalle y operaciones financieras.
- `backend/src/services/warehouse.service.js`: exportación de la cola transaccional existente para reutilizarla.
- `backend/src/controllers/warehouse.controller.js`: controladores de estadísticas, detalle, gastos y cobros.
- `backend/src/routes/warehouse.routes.js`: rutas protegidas del administrador.
- `backend/src/services/warehouseActivity.integration.test.js`: pruebas aisladas de cálculos, persistencia, permisos y fechas.
- `frontend/src/app/components/WarehouseActivityView.jsx`: dashboard y modales.
- `frontend/src/app/components/WarehouseViews.jsx`: reexportación de la nueva vista y retirada del dashboard anterior.
- `frontend/src/app/components/Sidebar.jsx`: navegación del Galpón.
- `frontend/src/app/App.jsx`: integración de la vista y retirada de las pantallas de Compras/Movimientos.
- `frontend/scripts/verify-warehouse-activity.mjs`: verificación de interfaz con datos ficticios.
- `GALPON_ESTADISTICAS.md`: entrega y decisiones.

Se preservaron los cambios previos sin confirmar del proyecto. No se añadieron dependencias, ni se ejecutaron commit o push.

## Validación

- 46 pruebas de integración/regresión aprobadas: actividad, pedidos, empleado del Galpón, multiunidad/Local, cuentas corrientes, historial de caja y conservación/idempotencia de migraciones.
- Incluyen cobros en un día distinto al pedido, pagos combinados/parciales, sobrepago y concurrencia, devolución en otro día, auditoría de gastos, modificación de fecha, borrado lógico, igualdad entre balances diarios y del período, HTTP/autorización y medianoche argentina con cambio de año.
- 11 pruebas unitarias del frontend aprobadas.
- Compilación de producción aprobada usando una URL de backend de prueba. Vite mantiene la advertencia de tamaño del bundle mayor a 500 kB.
- Navegador con datos ficticios: filtros, navegación, detalle, cobro combinado, devolución, gastos CRUD, confirmaciones, reintento tras error, error/recuperación de estadísticas; tamaños 1440, 768 y 390 px, sin desborde de la página ni errores de React. Capturas inspeccionadas en escritorio y móvil.
- `git diff --check` aprobado.
- La ejecución general inicial detectó limitaciones ajenas al módulo: dos pruebas de caja dependen de Turso remoto y fallaron por resolución de red; la limpieza final de `productExtraction.service.test.js` falla en Windows con `EBUSY` al borrar su SQLite temporal (sus cinco comprobaciones funcionales pasan). Las pruebas HTTP inicialmente bloqueadas por el sandbox se repitieron fuera de él y pasaron.

## Decisiones y límites históricos

- Los pagos de cuentas corrientes existentes identifican un cliente, sin imputación a un pedido. Se muestran de esa manera, sin inventar una relación ni un estado de pago por pedido. Los pedidos a cuenta se siguen cobrando en Clientes y cuentas.
- Las devoluciones del nuevo flujo corresponden a cobros por pedido. No se incorporó un mecanismo de devolución de cuentas corrientes: ese flujo requiere definir cómo restituir deuda o generar crédito del cliente y permanece con su comportamiento existente.
- Anular un pedido no equivale a una devolución de dinero. El cobro se conserva; una devolución por pedido se registra explícitamente en su fecha real. La reversión de cargos de cuentas existente se conserva.
- Editar o eliminar un gasto corrige el balance de su fecha original y conserva la auditoría; una devolución de cobro afecta la fecha de la devolución y conserva el cobro original.
- Los pedidos antiguos sin cobros registrados no producen ingresos ni se marcan como pagados automáticamente.
