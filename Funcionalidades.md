# Funcionalidades

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
