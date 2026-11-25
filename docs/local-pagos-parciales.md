# Pagos parciales de gastos del Local

## Comportamiento

En Estadísticas → Finanzas → Gastos del Local, Registrar pago abre un modal con concepto, importe original, total abonado, saldo pendiente, importe inicial cero, fecha/hora argentina, método (efectivo o transferencia), observación y opción para completar el saldo. El saldo posterior se muestra antes de confirmar. Los filtros incluyen pendientes (también parciales), parcialmente pagados, pagos efectuados, completamente pagados y todos. El historial muestra cada cuota y las reversiones previas.

El importe original no se modifica. Cada cuota genera un registro independiente. El gasto sale de pendientes al cancelar el saldo. Inicio también muestra el estado parcial y suma únicamente los saldos pendientes.

## Base de datos y compatibilidad

La migración `20261125_023_local_partial_payments` es aditiva y se ejecuta en el batch transaccional del migrador existente, junto con su marcador en `app_migrations`.

- Crea `local_expense_payments`: gasto, importe entero en centavos, método, fecha efectiva argentina, caja efectiva, observación, clave única de operación, usuario, fecha de registro y fecha de reversión.
- Agrega índices por gasto y por fecha/caja, y un trigger que impide insertar pagos superiores al saldo.
- Copia cada gasto histórico actualmente pagado a un único pago `legacy:<id>`, conservando su fecha, método y caja. Los pendientes no generan pagos.
- No actualiza ni elimina filas de gastos existentes, sus importes originales, cierres, stock, ventas, cuentas ni tablas del Galpón.
- No reconstruye `daily_expenses`: conserva su restricción previa `pending/paid`. El estado `partial` se deriva del saldo en la respuesta de la API. El historial de pagos es la fuente para calcular egresos.
- Repetir el migrador no vuelve a insertar históricos. No ejecutar esta migración como sentencias sueltas ni borrar su marcador.

Las operaciones usan la transacción existente, control optimista `expectedVersion` y claves idempotentes únicas. Un reintento idéntico devuelve el resultado actual sin crear otra cuota. Reutilizar la misma clave con otros datos devuelve 409. Las solicitudes diferentes con una versión antigua reciben 409. Se rechazan importes no positivos, con más de dos decimales, superiores al saldo y pagos de gastos cancelados.

Se conserva el endpoint heredado para pago total y reversión de un único pago total. Las reversiones quedan visibles en el historial y dejan de computar. Los gastos con cuotas se completan desde Registrar pago; no se admite revertir varias cuotas en conjunto.

## API

- Nuevo `POST /api/daily-expenses/:id/payments`: `{ amount, expectedVersion, idempotencyKey, method, paidAt, observation? }`. `paidAt` usa fecha/hora local argentina; si se omite, se registra la hora actual. Responde 201 con el gasto actualizado. Requiere sesión, unidad LOCAL y rol admin/cajero, igual que los cambios de estado existentes.
- `GET /api/daily-expenses` mantiene los campos anteriores y agrega `totalPaid`, `balance`, `payments` y el estado derivado `partial`. El historial completo se entrega en `payments`; no requiere otro endpoint.
- `POST /api/daily-expenses` registra un movimiento de pago si el gasto se crea pagado.
- `PATCH /api/daily-expenses/:id/status` conserva compatibilidad con pagos totales y su reversión; evita completar cuotas por el camino heredado.

## Balance financiero

Estadísticas, sus agrupaciones por día/semana/mes y las disponibilidades por método suman los pagos activos, con la fecha efectiva de cada cuota. Nunca suman el importe original además de las cuotas. Los filtros de períodos existentes siguen operando sobre esas fechas argentinas, aunque la obligación sea de otro mes.

Los cálculos de caja consumen los mismos pagos y sus cajas efectivas. Un pago en efectivo requiere una caja cuyo intervalo contenga su fecha. Las transferencias pueden registrarse sin caja. No se crean otros movimientos financieros ni se modifican los cierres almacenados: se conserva el cálculo existente de saldos y las instantáneas originales de cierre. No cambia la lógica de ventas, stock ni cuentas corrientes.

## Archivos

- `backend/src/db/localPartialPaymentsMigration.js`, `databaseLifecycle.js`, `schema.js`: tabla, migración y registro del esquema.
- `backend/src/services/dailyExpense.service.js`: altas y pagos transaccionales, validaciones y compatibilidad.
- `backend/src/models/dailyExpense.model.js`, `cashRegister.model.js`: historial, saldos y movimientos usados por caja.
- `backend/src/controllers/dailyExpense.controller.js`, `backend/src/routes/dailyExpense.routes.js`: endpoint de pagos y permisos.
- `backend/src/services/stats.service.js`: actividad por pago efectivo.
- `backend/scripts/backup-local-expenses.mjs`: incluye auditoría y pagos si las tablas ya existen.
- `frontend/src/app/components/LocalExpensesPanel.jsx`: modal, estados, filtros e historial.
- `frontend/src/app/components/InicioView.jsx`: saldo pendiente y estado parcial.
- `frontend/src/utils/localExpenses.js`: egresos por cuota, fecha y método.
- `backend/src/services/localPartialPayments.integration.test.js`, `localExpenses.integration.test.js`, `cashRegister.history.test.js` y `frontend/src/utils/localExpenses.test.js`: cobertura de migración, pagos, balance y permisos.

## Verificación

Se usaron exclusivamente bases temporales para las pruebas, sin ejecutar migraciones en producción.

- Suite completa del backend: 106 pruebas aprobadas. Incluye regresiones del Galpón y migraciones generales.
- Tras ampliar las verificaciones HTTP y de caja, ejecución dirigida final: 14 pruebas aprobadas.
- Frontend: 23 pruebas aprobadas y compilación Vite exitosa. Vite informa el aviso de tamaño del bundle principal (mayor a 500 kB).
- Casos comprobados: primera cuota, cuotas sucesivas, pago completo directo, cancelación de saldo parcial, sobrepago, cero/negativos/decimales inválidos, períodos diferentes, históricos intactos, reintentos y concurrencia sin duplicación, recarga vía GET con saldos persistidos, permisos y aislamiento, egresos por caja y preservación del cierre original.
- La comprobación de recarga es por API y relectura de base. Queda realizar la revisión visual del modal en el navegador del entorno de preproducción.

## Despliegue seguro

1. Probar primero sobre una copia de la base de producción, con la versión actual de migraciones. Verificar que el marcador 022 ya exista y que los estados históricos sean correctos. La migración nueva respeta esos estados; no reinterpreta pagos que todavía figuren pendientes.
2. Pausar escrituras y detener instancias antiguas del backend. Obtener un respaldo integral del proveedor antes del primer arranque nuevo. Como respaldo adicional de las tablas involucradas, ejecutar desde `backend`: `node scripts/backup-local-expenses.mjs`. El script incluye pagos/auditoría cuando existen; no sustituye un respaldo completo.
3. Con la configuración de la base destino revisada, ejecutar desde `backend`: `npm run db:migrate` y `npm run db:check`. El arranque del servidor también migra automáticamente, por lo que el respaldo debe ser previo. No ejecutar reset, clean ni seed.
4. Comparar cantidad de gastos y sus identificadores/importes con el respaldo. Verificar que cada gasto previamente pagado tenga exactamente un pago histórico por el mismo importe y fecha, sin incremento en los totales financieros. Confirmar el marcador 023.
5. Desplegar backend y frontend de forma coordinada. Compilar frontend con `VITE_API_URL` de producción terminado en `/api`. La URL localhost utilizada en las pruebas sólo sirvió para validar la compilación.
6. Revisar visualmente un pago parcial, su historial, el saldo tras recargar y los períodos de estadísticas. Confirmar que el egreso aparece una sola vez y que Galpón continúa separado. Habilitar nuevamente las operaciones.

Si falla el batch, se revierte y no queda el marcador de la migración. No borrar datos para recuperar el despliegue. Una vez registradas cuotas, no volver al backend antiguo: desconoce ese historial. Preservar base y respaldo y aplicar una corrección incremental.
