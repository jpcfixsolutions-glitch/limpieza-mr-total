# Funcionalidades

## Local y Galpón

La aplicación permite administrar dos operaciones del mismo negocio sin mezclar su mercadería ni sus números:

- **Local**: la venta al público que ya funciona hoy, con su caja, inventario, clientes y estadísticas.
- **Galpón**: la operación mayorista, pensada para comprar, guardar mercadería, preparar pedidos y vender a clientes mayoristas.

Al ingresar, el administrador puede elegir con cuál de las dos operaciones quiere trabajar y cambiar de una a otra cuando lo necesite. Los cajeros continúan usando únicamente el Local, para mantener su circuito de trabajo simple y seguro.

### Mercadería separada, catálogo compartido

Un mismo producto puede existir en ambas operaciones, pero cada una lleva su propio stock, costo, precio y aviso de faltante. Esto permite, por ejemplo, vender un artículo en el Local mientras el Galpón conserva una cantidad diferente para pedidos mayoristas.

Cada cambio de stock queda registrado: se puede saber qué producto se movió, en qué operación, por qué motivo y quién lo realizó. Así, las correcciones dejan trazabilidad en lugar de borrar el historial.

### Pedidos mayoristas

Desde el Galpón se pueden crear pedidos con uno o varios productos, indicar el cliente, las cantidades, los precios y observaciones.

Un pedido puede estar en borrador, confirmado, en preparación, despachado o cancelado. La mercadería se descuenta recién al despacharlo, no mientras se está armando. Si un pedido ya despachado se cancela, el sistema repone la mercadería y corrige el movimiento correspondiente una sola vez.

### Compras para el Galpón

Las compras permiten registrar proveedor, varios productos, cantidades, costos y observaciones. Una compra se puede dejar en borrador hasta recibirla; recién al marcarla como recibida aumenta el stock del Galpón.

Si una compra recibida se cancela, el sistema realiza la corrección de stock de forma controlada. Estas operaciones no afectan la caja del Local.

### Clientes y cuenta corriente

El Local y el Galpón tienen sus propias listas de clientes y cuentas corrientes. De esta forma, la deuda o el historial de un cliente mayorista no se mezcla con los clientes del punto de venta.

El Local también aparece dentro del Galpón como un cliente interno. Sirve para identificar correctamente los movimientos de mercadería entre ambas operaciones sin confundirlos con una venta a un cliente externo.

### Pasar mercadería entre operaciones

Se pueden transferir productos del Galpón al Local. Al hacerlo, baja el stock del Galpón y sube el del Local como una sola operación, evitando diferencias si algo se interrumpe durante el proceso.

Una transferencia mueve mercadería; no genera por sí sola un ingreso, un gasto ni una deuda entre las dos operaciones.

### Productos abastecidos directamente desde el Galpón

Algunos productos del Local pueden venderse directamente desde el stock del Galpón. En esos casos, la pantalla de productos muestra claramente que se abastecen desde allí y la disponibilidad real antes de vender.

Cuando se concreta una venta de este tipo, el ingreso queda en el Local y la mercadería baja solamente del Galpón. Si no hay suficiente stock en el Galpón, la venta no se confirma. Esto evita descontar dos veces la misma mercadería o registrar ventas incompletas.

Las promociones también respetan esta regla producto por producto: cada componente se descuenta del lugar desde el que se abastece.

### Caja y estadísticas

La caja sigue siendo exclusiva del Local. El Galpón puede registrar compras y pedidos sin necesidad de abrir una caja ni alterar los movimientos del punto de venta.

El Galpón cuenta con su propio resumen: stock disponible, valor de la mercadería, pedidos despachados, ventas mayoristas, compras recibidas y productos con poco stock. Los reportes muestran cada operación por separado para que el negocio pueda evaluar ambas actividades con claridad.

## Rentabilidad de productos

Esta pantalla, disponible en **Estadísticas → Rentabilidad**, ayuda a responder una pregunta sencilla: “¿cuánto ganó realmente el negocio con lo que vendió?”.

No mira sólo la diferencia entre precio de venta y costo actual. Tiene en cuenta el costo que tenía cada producto cuando se realizó la venta, las cantidades vendidas y los descuentos aplicados. Así, el resultado refleja mejor el dinero invertido en la mercadería y la ganancia obtenida.

### Qué se puede consultar

La rentabilidad puede revisarse por día, semana, mes, período personalizado, producto o categoría. Al cambiar el filtro, se actualizan:

- El costo total de la mercadería vendida.
- Los ingresos netos recibidos.
- La ganancia en pesos.
- El porcentaje general de rentabilidad y su comparación con el objetivo del 40%.
- La evolución diaria.
- El detalle de cada producto: cantidad vendida, costo, venta, ganancia y rentabilidad.

El indicador es verde desde el 40%, amarillo entre 30% y 39,99%, y rojo por debajo del 30%. Si no hay costo informado para calcularlo, se muestra **No calculable** en lugar de dar un porcentaje engañoso.

### Datos confiables a lo largo del tiempo

Una vez concretada una venta, el sistema conserva el costo y la categoría que tenía el producto en ese momento. Por eso, si después cambia el costo de reposición o se reorganizan las categorías, los reportes de períodos anteriores no se alteran.

Las ventas anuladas no se incluyen en el informe. Las devoluciones todavía no cuentan con un circuito propio; cuando se incorpore, se descontarán de estos resultados para que el reporte siga siendo fiel a la operación real.

### Promociones y combos

Las promociones se analizan con el costo de todos los productos que las integran. Si la promoción tuvo descuento, ese descuento reduce la ganancia, pero no cambia el costo de la mercadería utilizada. En el informe aparecen diferenciadas para poder evaluar si cada combo es conveniente.
