# limpieza-mr-total

## Unidades de negocio

La aplicación opera dos unidades sobre la misma base de datos:

- `LOCAL`: punto de venta, caja e inventario minorista.
- `WAREHOUSE`: Galpón mayorista, pedidos, compras, clientes e inventario propios.

Toda llamada autenticada acepta `X-Business-Unit: LOCAL|WAREHOUSE`. Si se omite,
el backend usa `LOCAL` por compatibilidad. Sólo los administradores pueden usar
`WAREHOUSE`; el backend rechaza el intento aunque se modifique manualmente el
encabezado. Las operaciones que cambian inventario aceptan `Idempotency-Key` o
`idempotencyKey` en el cuerpo.

La migración incremental `20261011_012_business_units_and_warehouse` crea las
unidades, copia el inventario histórico a `LOCAL` y conserva las columnas
anteriores de `products` como espejo compatible del Local. La migración
`20261011_013_account_movement_reversals` agrega el vínculo auditable de las
reversiones de cuenta corriente.

### Endpoints mayoristas

- `GET|POST /api/warehouse/orders`
- `PUT /api/warehouse/orders/:id` (sólo borradores)
- `PATCH /api/warehouse/orders/:id/status`
- `GET|POST /api/warehouse/purchases`
- `PATCH /api/warehouse/purchases/:id/status`
- `GET /api/warehouse/stats`
- `GET /api/inventory/movements`
- `POST /api/inventory/transfers`

La modalidad interna está configurada por defecto como `inventory_only`: una
venta local abastecida por Galpón genera costo y salida de inventario, pero no
crea ingresos, egresos ni deuda interna.
