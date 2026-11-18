# Permisos operativos del empleado del Galpón

El rol existente `EMPLEADO_GALPON` puede consultar pedidos/stock/producción, ajustar cantidades del Galpón, registrar clientes y crear pedidos en preparación. Las cuentas administrativas mantienen sus permisos y precios configurables.

## Acceso y seguridad

Se agregaron a la lista cerrada del empleado únicamente estos POST:

- `/api/warehouse/customers`: recibe nombre, teléfono y dirección.
- `/api/warehouse/orders`: recibe cliente, productos, cantidades, observaciones, estado inicial confirmado y clave idempotente.
- `/api/warehouse/production-preview`: calcula disponibilidad/faltantes sin guardar ni reservar stock.

Los GET operativos y PATCH de cantidades/estados ya existentes se conservan. El empleado continúa forzado a `WAREHOUSE`, incluso con un encabezado manipulado; no puede acceder a los endpoints generales de productos/inventario, al stock Local, compras, gastos, finanzas, cobros ni configuración de métodos/recargos. Tampoco puede editar borradores ni cancelar pedidos.

Las solicitudes del empleado usan listas explícitas de campos permitidos. Enviar precios, costos, totales, cuenta corriente, otro usuario/unidad o campos adicionales devuelve 403. Las transiciones de estado requieren la versión actual del pedido y rechazan campos ajenos a estado/versión.

Las respuestas se proyectan explícitamente: productos y presentaciones, cantidades, contactos operativos de clientes, estados y fechas. Pedidos, faltantes y previsualizaciones no exponen precio, costo, importe total, saldo, rentabilidad, cuenta corriente ni datos de pago. Los contactos sólo pertenecen a clientes activos del Galpón.

## Pedidos, producción y auditoría

Los precios de pedidos del empleado se leen de `business_unit_products.sale_price` dentro de la transacción de creación. Los costos y cálculos administrativos se guardan internamente mediante el mismo servicio y tablas que usa el administrador. El empleado no envía precios ni controla si se carga a cuenta: sus pedidos nuevos se registran sin esa opción.

Crear un pedido no descuenta stock ni exige existencias suficientes. La asignación FIFO y los faltantes acumulados reutilizan el cálculo actual de producción; un reintento con la misma clave devuelve el pedido ya creado. Una clave perteneciente a otro usuario no permite apropiarse del pedido. El stock se descuenta al pasar a En envío, con las validaciones actuales; Entregado no repite ese descuento.

Cada pedido conserva `user_id`, `created_at` y `updated_at`. Cada ajuste de stock conserva usuario, fecha/hora, cantidades anterior/posterior y dirección en `inventory_movements`, sin exponer su costo al empleado. El ajuste compara `expectedStock` y utiliza una clave idempotente para evitar actualizaciones duplicadas o que se pisen entre sesiones.

## Interfaz y unidades

`WarehouseOrdersView` y su modal se reutilizan para ambos roles. El empleado ve Nuevo pedido, el buscador/selector de clientes, el alta del cliente, productos, cantidades y faltantes. No se renderizan controles de cuenta corriente ni se incorporan precios a su solicitud.

`WarehouseEmployeeStockView` conserva el buscador y agrega filtros de existencias/disponibilidad. La modal permite establecer el total o registrar un ingreso/salida, utilizando el mismo endpoint de ajuste seguro. Sólo muestra datos operativos.

El esquema actual almacena cantidades enteras y presentaciones (`pack_types`, `units_per_pack`), no una unidad física fraccionaria independiente. Se conservan esas cantidades y se muestra la presentación exacta, incluidas las que contienen litros; no se convierte, renombra ni modifica ningún producto o presentación. No se introdujeron migraciones ni se escribieron datos de prueba en la base operativa.

## Archivos principales

- Backend: `auth.middleware.js`, `warehouse.routes.js`, `warehouse.controller.js`, `warehouseEmployee.js` y `warehouse.service.js`.
- Frontend: `WarehouseOrdersView.jsx`, `WarehouseEmployeeStockView.jsx` y `utils/warehouseOrderInput.js`.
- Pruebas: `warehouseEmployee.integration.test.js` y `warehouseOrderInput.test.js`.

## Verificación

Se probaron ingresos/salidas de stock, auditoría, presentación en litros, aislamiento del Local, creación/reintento de clientes y pedidos, precios/costos internos del administrador, ausencia de información económica en las respuestas del empleado, faltantes acumulados, entrega sin doble descuento, solicitudes manipuladas y revocación de tokens al cambiar el rol.

Resultado: 90 pruebas de backend aprobadas (`node scripts/run-local-suite.mjs`, bases temporales), 15 de frontend aprobadas (`npm test`) y compilación de producción correcta (`npm run build` con `VITE_API_URL` definida).
