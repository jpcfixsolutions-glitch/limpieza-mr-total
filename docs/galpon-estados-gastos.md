# Gastos del Galpón: registro y pago

El balance se calcula como **ingresos efectivamente cobrados − gastos pagados**. Sólo se suman filas de `warehouse_expenses` con `status='paid'`, `paid_at` dentro del período y `deleted_at IS NULL`. Los días, semanas (lunes a domingo) y meses usan hora de Argentina. Registrar una obligación pendiente no genera una salida de dinero. Revertir un pago erróneo excluye ese gasto del período de pago original; no representa una devolución bancaria.

## Modelo y compatibilidad

- `warehouse_expenses`: agrega `status` (`pending` / `paid`), `paid_at` y `status_changed_at`. `created_at`, `occurred_at` y el resto de los datos anteriores se conservan. La fecha del gasto sigue siendo editable; cambiarla no modifica la fecha efectiva de pago.
- `warehouse_fixed_expenses` conserva la configuración semanal/mensual y su calendario. `warehouse_fixed_occurrences` conserva un snapshot de cada vencimiento y un vínculo único a su obligación en `warehouse_expenses`. Se materializan los vencimientos alcanzados por el calendario existente. Editar una configuración afecta los próximos vencimientos; no reescribe períodos ya generados.
- Cada obligación fija tiene ahora un gasto pendiente desde su generación. Pagar, revertir y volver a pagar actualizan ese mismo registro, sin crear otra salida ni desvincular el período.
- `warehouse_expense_audit` conserva todas las revisiones previas y agrega las acciones `pay`, `reverse_payment`, `migration_pending` y `migration_obligation`. Las transiciones guardan usuario, fecha, valores anteriores y posteriores, incluida la fecha de pago revertida.
- La API de creación exige `status`. Para un gasto pagado admite `paidAt` (hora argentina; si se omite usa la hora actual). La interfaz pide la fecha/hora efectiva. `PATCH /api/warehouse/expenses/:id/status` requiere estado destino y `expectedVersion`; para pagar requiere `method` y admite `paidAt`. El endpoint fijo `/fixed-occurrences/:id/pay` usa el mismo mecanismo y requiere `expectedVersion` de la obligación vinculada. Un reintento con revisión antigua devuelve 409 y debe refrescarse: no vuelve a pagar una obligación revertida.
- Se mantienen el control de administrador y el aislamiento por unidad. Las tablas del Local (`daily_expenses`, `fixed_expenses`) pertenecen a otro módulo y no cambian. Inicio del Galpón sólo muestra indicadores de pedidos/producción; su información económica se consulta en Estadísticas y comparte el mismo cálculo para todos los períodos.

## Migración 20261116_021_warehouse_expense_states

Es aditiva y se aplica como un batch transaccional, con su identificador en `app_migrations`. Una segunda ejecución mediante el migrador omite la migración completa y no vuelve a poner pendientes pagos revisados manualmente. No ejecutar su lista de sentencias individualmente ni borrar su marcador.

1. Todos los gastos anteriores quedan pendientes con `paid_at=NULL`, incluso los vinculados a pagos fijos anteriores. Se preservan importes, conceptos, fechas originales, revisiones, bajas lógicas y auditorías. `occurred_at` y las auditorías anteriores siguen disponibles como información histórica; no se interpretan automáticamente como nuevos pagos.
2. Los vencimientos fijos que ya estaban vinculados conservan su `expense_id`. Los no vinculados reciben una sola obligación pendiente, usando la clave única `fixed:<id del vencimiento>` y el importe/concepto congelados del vencimiento.
3. Las obligaciones creadas por la migración usan la hora de migración como registro y el vencimiento como fecha de obligación. No existía una hora histórica de creación para esos vencimientos: la nueva columna `warehouse_fixed_occurrences.created_at` queda nula en los registros antiguos, sin inventarla. Los nuevos vencimientos registran su hora de creación.
4. No se borran movimientos ni se insertan compensaciones financieras. Los reportes se recalculan al consultar y el descuento previo desaparece hasta confirmar manualmente el pago. Las restricciones de base exigen coherencia entre estado y fecha de pago.

## Procedimiento de aplicación segura

La migración se verificó con bases temporales de pruebas. No se ejecutó sobre la base operativa durante esta implementación.

1. Detener el backend y las escrituras. Antes de desplegar o reiniciar, crear una copia/snapshot recuperable de la base desde su proveedor. En SQLite local, copiar el archivo con el servicio detenido y sin conexiones abiertas. Conservar también el código de la versión anterior.
2. Restaurar esa copia en un entorno de prueba y apuntar allí `TURSO_DATABASE_URL` y las credenciales del backend. Registrar previamente los conteos de `warehouse_expenses`, `warehouse_fixed_occurrences`, `warehouse_fixed_expenses` y `warehouse_expense_audit`, junto con los identificadores y vínculos existentes.
3. Desde `backend`, ejecutar `npm run db:migrate` y `npm run db:check`. Ejecutar nuevamente `npm run db:migrate`: no deben cambiar conteos, estados ni vínculos. Verificar que todos los gastos anteriores estén pendientes, que cada vencimiento tenga una obligación y que las auditorías anteriores sigan presentes.
4. Desplegar backend y frontend coordinadamente, con el respaldo listo. Ejecutar `npm run db:migrate` con la configuración operativa y luego `npm run db:check`, antes de habilitar usuarios. El arranque del backend también ejecuta el migrador; por eso el respaldo debe hacerse **antes del primer arranque del código nuevo**.
5. Recargar las sesiones del navegador. En Estadísticas → ver todos los gastos, revisar los pendientes y confirmar cada pago con su fecha/hora efectiva. Verificar un pago y su reversión en reportes diarios, semanales y mensuales. El botón de estado abre la confirmación y la revisión evita descuentos repetidos.

Si falla cualquier sentencia, el batch completo se revierte y no se registra el identificador. No usar `db:reset`, semillas ni borrados de historial para recuperarse. Si hay vínculos o claves incompatibles en una base real, corregir el diagnóstico en una copia y preparar otra migración compatible antes de reintentar. Si se necesita restaurar, detener el servicio y restaurar el respaldo junto con la versión anterior; conservar aparte la base posterior para no perder nuevas operaciones.

## Validación

Las pruebas de integración usan SQLite temporal y cubren migración sobre gastos anteriores, repetición del migrador, preservación de vínculos/auditorías, pagos y reversiones, solicitudes concurrentes, permisos y unidad, independencia entre meses, reportes por fecha efectiva y medianoche argentina. El listado muestra todos los gastos activos y permite filtrar Todos / Pendientes / Pagados, independientemente del período seleccionado para los indicadores.

Para repetir toda la suite de backend sin que las pruebas antiguas de caja consulten la base configurada en `.env`, ejecutar desde `backend`: `node scripts/run-local-suite.mjs`. El script crea una base temporal para esas pruebas; las suites de integración mantienen sus propias bases temporales. Frontend: `npm test` y `npm run build` (esta última requiere `VITE_API_URL`).
