# Configuración financiera del Galpón

## Activación

La migración `20261113_020_warehouse_settings` se aplica mediante el mecanismo habitual (`npm run db:migrate` desde backend) y también al iniciar el backend. Debe aplicarse antes de utilizar el frontend actualizado. No requiere dependencias, cron ni servicios adicionales. Esta entrega no ejecuta la migración sobre la base remota configurada.

Agrega cinco tablas: `warehouse_fixed_expenses`, `warehouse_fixed_occurrences`, `warehouse_payment_methods`, `warehouse_payment_parts` y `warehouse_settings_audit`. Conserva íntegramente las tablas y movimientos anteriores. Inicializa Efectivo y Transferencia en 0%, exclusivamente para Galpón; los métodos del Local no se copian ni modifican. Los modelos Drizzle incluyen las nuevas tablas y la comprobación de esquema las verifica.

## Gastos fijos y criterio financiero

Se utiliza criterio de caja: ingresos efectivamente recibidos menos gastos pagados. Un vencimiento genera una obligación **pendiente**, no una salida de dinero. En Estadísticas se muestran todos los pendientes, con su vencimiento; Registrar pago solicita fecha real y medio de salida. El gasto pagado pasa a `warehouse_expenses`, única fuente de gastos del balance. No se suma la estimación ni se descuenta otra vez la obligación.

Cada obligación se asocia al día de vencimiento. El historial muestra ese día aunque no haya otros movimientos; su detalle indica pendiente o pagado y la fecha de pago. Si se paga otro día, el balance lo descuenta en la fecha de pago, según Argentina. Se admiten pagos desde el vencimiento hasta hoy; no anticipos ni pagos futuros. Se registra la fecha de pago a las 12:00 locales porque el formulario solicita día, no hora.

La recuperación se ejecuta transaccionalmente al consultar Configuración, Estadísticas o actividad diaria y antes de modificar configuraciones. Genera todos los vencimientos omitidos hasta hoy y avanza `next_due` en la misma transacción. La restricción UNIQUE por configuración y fecha impide duplicaciones; el pago de una obligación es único. No hace falta mantener el sistema abierto ni ejecutar tareas programadas.

- Frecuencia semanal: lunes = 1 hasta domingo = 7.
- Frecuencia mensual: días 29–31 se ajustan al último día disponible y vuelven al día configurado el siguiente mes.
- Alta con inicio pasado: recupera vencimientos desde esa fecha, con el importe inicial.
- Edición: primero recupera los vencimientos ya cumplidos con la configuración anterior. Los cambios afectan vencimientos futuros.
- Cambio de calendario o reactivación: comienza después de hoy, respetando una fecha de inicio futura. No recupera el intervalo inactivo.
- Desactivación: impide nuevas obligaciones. Mantiene pendientes y pagos anteriores.
- Obligaciones y gastos fijos pagados conservan importe y concepto. Los pagos fijos no se editan ni eliminan desde los gastos variables.
- La estimación mensual incluye configuraciones activas: mensual + semanal × 52 ÷ 12. Es informativa y no ingresa al balance.
- Los nombres se normalizan por tildes, mayúsculas y espacios y son únicos por unidad, incluso en configuraciones inactivas. Para reutilizar una obligación, se reactiva la existente.

## Cobros y recargos

El formulario admite entre uno y veinte medios combinados. Cada importe ingresado es **capital a cancelar**, y el recargo se añade por separado. Se presenta subtotal, recargo y total a cobrar antes de confirmar. El backend valida el método activo y su unidad, calcula el recargo y valida que el capital no supere el saldo.

Dinero: centavos enteros; porcentajes: puntos básicos (10% = 1000). Redondeo por tramo al centavo más cercano, con medio centavo hacia arriba. Se acepta hasta dos decimales de importe o porcentaje; recargo entre 0 y 100%. El formulario envía también el porcentaje que mostró; si cambió, el servidor rechaza la operación y pide revisar el total.

`warehouse_payment_parts` conserva por operación el método, nombre, clasificación, capital, porcentaje aplicado y recargo. Desactivar o modificar un método no cambia esos snapshots. Los cobros por pedido conservan la clave idempotente y las devoluciones revierten capital **y** recargo originales, incluso si el método ya está inactivo. Cada devolución impacta su propio día y no altera el cobro original.

Las columnas históricas de `warehouse_receipts` se mantienen por compatibilidad para contabilizar capital cancelado: cash corresponde a capital en efectivo; transfer transporta capital no efectivo cuando hay métodos nuevos. Para cobros con desglose, la clasificación e ingresos reales se toman exclusivamente de los snapshots, nunca de esa columna heredada. Los cobros antiguos sin snapshots conservan su interpretación original.

En cuentas corrientes, `account_movements.amount` representa capital cancelado y reduce la deuda sólo por ese importe. `account_payment_details.amount` conserva el ingreso real por medio, incluido recargo; los snapshots precisan el cálculo aplicado. El balance usa snapshots para cobros nuevos y el detalle legado para cobros antiguos, sin sumar ambas fuentes. No se crean cargos adicionales por el recargo ni se modifica el total comercial del pedido. Los cobros de cuentas siguen asociados al cliente, como en la arquitectura anterior.

## Seguridad e historial

Configuración, gastos y cobros del Galpón son exclusivos de administradores autenticados con contexto WAREHOUSE. Se reutilizan middlewares, transacciones y cola de escritura existentes. Los métodos del Local conservan su comportamiento. Las configuraciones usan versión para rechazar ediciones obsoletas, restricciones únicas y auditoría con snapshots anterior/posterior y usuario. No hay eliminación física de configuraciones.

## Verificación

Las pruebas de integración de actividad incluyen calendario, duplicados, importes inválidos, recuperación, snapshots, desactivación, pago único de gastos, recargos combinados, redondeo, devoluciones, cuentas corrientes, permisos, aislamiento Local/Galpón y balances por día/semana/mes/todo.

La compilación de frontend se verifica con `VITE_API_URL=http://localhost:3001/api` como URL temporal de prueba, sin persistirla en la configuración. La validación visual en navegador móvil no pudo completarse: el host de automatización de navegador no está disponible en esta sesión. La interfaz utiliza formularios de una columna en pantallas pequeñas, tablas desplazables, modales existentes y navegación móvil con ancho mínimo por botón.

## Archivos de la implementación

Nuevos:
- `backend/src/db/warehouseSettingsMigration.js`
- `backend/src/services/warehouseSettings.service.js`
- `backend/src/services/warehouseAccountPayment.service.js`
- `frontend/src/app/components/WarehouseSettingsView.jsx`
- `frontend/src/app/components/WarehousePaymentEditor.jsx`
- `docs/warehouse-configuration.md`

Modificados:
- `backend/src/db/databaseLifecycle.js` y `backend/src/db/schema.js`
- `backend/src/routes/warehouse.routes.js`
- `backend/src/controllers/warehouse.controller.js` y `backend/src/controllers/customer.controller.js`
- `backend/src/services/warehouseActivity.service.js` y `backend/src/services/customer.service.js`
- `backend/src/services/warehouseActivity.integration.test.js`
- `frontend/src/app/App.jsx` y `frontend/src/app/components/Sidebar.jsx`
- `frontend/src/app/components/WarehouseActivityView.jsx` y `frontend/src/app/components/WarehouseViews.jsx`
