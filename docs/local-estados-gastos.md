# Gastos pendientes y pagados del Local

El Local aplica la misma separación entre obligación y pago que el Galpón. Los gastos anteriores quedan pendientes al migrar y conservan su importe, motivo, fecha y caja de registro. Sólo los gastos `paid` afectan las salidas de dinero, según `paid_at` en horario argentino.

## Migración 022 y respaldo

Antes de modificar el esquema se guardó una copia consistente de `daily_expenses`, `fixed_expenses`, `cash_registers` y `app_migrations` en `backend/.backups/` (ignorada por Git). Incluye los 19 gastos anteriores, las 7 configuraciones fijas y las 20 cajas existentes. El script `backend/scripts/backup-local-expenses.mjs` permite repetir este respaldo sin imprimir registros ni credenciales. Es una copia de las tablas involucradas, no un respaldo integral del sistema.

La migración `20261116_022_local_expense_states` agrega columnas y una tabla de auditoría. El migrador la ejecuta en un batch transaccional con un marcador en `app_migrations`; repetir `db:migrate` no vuelve a reiniciar los estados revisados. No se eliminan gastos ni se modifican cierres de caja almacenados. No ejecutar sentencias sueltas ni borrar el marcador.

El esquema anterior del Local sólo tenía nombre e importe para gastos fijos, sin frecuencia ni fechas históricas. Se conserva su interpretación mensual. La migración registra una obligación pendiente del mes actual para cada configuración de importe positivo; no inventa deudas de meses anteriores. Desde ese mes se genera un registro independiente por mes, con clave única `(fixed_expense_id,period)` y snapshot del importe/concepto. Las configuraciones de importe cero se conservan y no generan salidas. Editar una configuración afecta los próximos períodos, sin reescribir obligaciones ya generadas. Eliminarla desde Configuración desactiva la recurrencia y conserva sus obligaciones/pagos.

## Caja y reportes

- `register_id` conserva la caja de registro original. `payment_register_id` identifica la caja que contiene la fecha/hora efectiva del pago. Un gasto creado en una caja puede pagarse en otra sin descontarse de la primera.
- Un gasto pendiente puede registrarse sin caja abierta. Para pagar en efectivo debe existir una caja cuyo intervalo incluya la fecha/hora indicada. Se permiten pagos históricos si existe la caja correspondiente. Las transferencias también pueden registrarse sin caja.
- Pagar o revertir requiere `expectedVersion`. Las solicitudes concurrentes o reintentos viejos reciben 409 y no duplican descuentos. La creación utiliza una clave idempotente. La auditoría conserva usuario, hora y snapshot anterior/posterior, incluida la fecha de pagos revertidos.
- El arqueo de la caja abierta y el historial se recalculan con pagos efectivos. En cajas cerradas se conservan en la base los valores originales del cierre; la respuesta ofrece `recordedExpectedCash` y `recordedCashDifference` como snapshot, junto al efectivo esperado y diferencia recalculados. Una reversión por error corrige el cálculo de la caja original; no representa un reintegro bancario.
- Inicio y Caja descuentan sólo gastos pagados asignados a esa caja. Estadísticas suma los gastos por fecha efectiva para Hoy, Semanal, Mensual y Todo. El historial mensual/semanal muestra gastos pagados y el resultado ingresos menos esos gastos; el cálculo de restock continúa en Finanzas.
- En Inicio → Gastos del Local → Gestionar, en Caja y en Estadísticas → Gastos del Local se muestran todos los períodos, con filtro Todos/Pendientes/Pagados y etiquetas interactivas. Configuración conserva las plantillas recurrentes.

## Aplicación

1. Crear respaldo antes del primer arranque del backend nuevo; el arranque ejecuta las migraciones automáticamente. Si hay otras sesiones escribiendo, pausar las operaciones durante el cambio.
2. Probar primero en una base temporal: `node --test src/services/localExpenses.integration.test.js` desde `backend`.
3. Ejecutar `npm run db:migrate` y `npm run db:check` con la configuración deseada. Verificar que se conservaron los identificadores/importes y que los gastos anteriores quedaron pendientes.
4. Reiniciar backend/frontend local y recargar el navegador. Revisar manualmente qué pagos anteriores corresponden y confirmarlos con su fecha efectiva.

Si falla el batch, no se registra la migración y sus sentencias se revierten. No usar reset/seed para recuperarse. Preservar el respaldo y cualquier operación posterior antes de preparar una reparación incremental. El sistema Local sigue conectado a la base definida por su `.env`; ejecutar en localhost no convierte automáticamente Turso en una base local.

## Actualización: pagos parciales

La migración 023 incorpora cuotas e historial sin alterar los importes originales ni reiniciar estados. A partir de esta versión los reportes se basan en `local_expense_payments`, y el estado parcial se deriva del saldo. Los detalles y el procedimiento de despliegue actualizado están en [local-pagos-parciales.md](local-pagos-parciales.md); sus instrucciones reemplazan las referencias anteriores al pago único.
