# Verificación de impresión

Se conserva la impresión HTML/CSS con `window.print()`. No se cambiaron datos,
cálculos, persistencia ni métodos de pago. No se agregaron dependencias.

## Diagnóstico y cambios

- El ticket forzaba 58 mm en `html`, `body` y el comprobante, con un contenido
  de 52 mm (58 menos 6 de padding). Un driver POS-58 puede exponer sólo unos
  48 mm imprimibles (384 puntos a 203 dpi), causando recortes. Ahora ocupa
  el ancho disponible hasta 48 mm, centrado con márgenes automáticos y 2 mm
  de padding por lado: el contenido utiliza hasta 44 mm y mantiene espacio
  incluso cuando el driver ya descuenta los bordes físicos. El papel
  continúa siendo de 58 mm; el ancho físico imprimible depende del modelo.
- `size: 58mm auto` es inválido. La página térmica ahora usa `size: auto` para
  respetar el rollo elegido en el driver. Las páginas térmica y A4 tienen nombres
  separados. Se permite envolver fecha/número de venta e importes muy grandes
  sin perder su alineación. El logo es un bloque centrado. Se quitó el filtro
  de contraste del contenedor; el texto ya utiliza negro puro y se evita una
  composición gráfica adicional en la salida térmica.
- La plantilla y el logo no contienen la secuencia extraña de la foto. No existe
  una ruta ESC/POS en esta impresión: el navegador entrega gráficos al driver.
  Los PDF de prueba comienzan con el logo, sin esos caracteres. No se puede
  atribuir su origen exacto ni garantizar su eliminación física sin la POS-58.
  No se agregaron ni eliminaron comandos de control.
- La fecha superior, título y URL corresponden a los márgenes automáticos del
  navegador, no a los datos del remito. Las cajas de margen A4 ahora se declaran
  explícitamente vacías, salvo la inferior derecha con página/total. En Chromium
  152 se comprobó su supresión incluso solicitando encabezados automáticos.
  La fecha comercial dentro del remito se conserva.
- Los valores de la tabla A4 tenían `text-align: right`. Ahora encabezados y
  valores comparten centrado, salvo la descripción, que queda a la izquierda.
  Se conservan las proporciones de las seis columnas y el ajuste de texto largo.
  Se evita partir filas, resumen y conformidad entre páginas. El ancho A4 se
  limita al área disponible, hasta 190 mm dentro de una hoja con margen de 10 mm.

## Configuración de impresión física

1. En Chrome/Edge, abrir Más configuraciones: escala 100 %, sin escalado extra
   del driver. Desactivar **Encabezados y pies de página** como respaldo para
   navegadores que no implementan cajas de margen CSS. En Chromium moderno el
   remito conserva su numeración propia aunque se desactive esa casilla.
2. Para ticket, seleccionar la POS-58, papel/rollo **58 mm**, márgenes **ninguno**
   y longitud de rollo apropiada. No elegir A4 ni ajustar a página. El máximo de
   48 mm del contenido reserva espacio frente a las limitaciones físicas habituales.
   Comprobar en el manual el ancho imprimible y el origen horizontal reales.
3. Para remito, seleccionar **A4 vertical**; respetar los márgenes CSS de 10 mm.
4. Imprimir dos copias y comparar bordes e importes. No hay acceso a impresoras
   físicas en esta verificación.
5. Si persisten los caracteres extraños: guardar la misma venta como PDF y
   comparar. Si sólo aparecen en papel, revisar el controlador instalado en
   Windows, el modelo y la emulación configurados con el fabricante. Para esta
   ruta de navegador usar un controlador gráfico compatible con la POS-58;
   comprobar que no se esté usando Generic / Text Only ni un procesador RAW
   incompatible. Comparar con la página de prueba de Windows y con la impresión
   del PDF. Esta comprobación permite localizar el origen sin cambiar la aplicación.

Referencia sobre márgenes automáticos y su configuración:
https://developer.chrome.com/blog/print-margins

## Pruebas ejecutadas

- `npm test`: 11 pruebas aprobadas.
- `npm run build`: aprobado usando `VITE_API_URL=http://localhost:3000/api`
  sólo durante la compilación de prueba; no se guardó configuración ni se desplegó.
  Advertencia existente de bundle mayor a 500 kB.
- `scripts/verify-print.mjs`: 18 renderizados correctos en Chromium 152 con CSS
  de impresión: 1, 8 y 60 productos; áreas térmicas de 181/219 px (~48/58 mm),
  A4 y dos renderizados consecutivos de cada caso. Sin desbordamientos
  horizontales, geometría idéntica entre copias, logo cargado, fecha, total,
  pagos y conformidad presentes; celdas A4 centradas bajo sus encabezados.
- Se generaron seis PDF con datos ficticios y encabezados automáticos activados.
  Se extrajo su texto y se revisaron visualmente sus ocho páginas rasterizadas:
  sin URL, fecha adicional ni caracteres extraños. Fecha comercial conservada.
  A4 con 1/8 productos: una página; 60 productos: tres páginas con encabezados
  repetidos y numeración. Ticket: una página de rollo por caso, sin contenido perdido.
- Pendiente: confirmar centrado físico, alimentación/longitud del rollo, dos
  copias reales y ausencia de caracteres con el controlador de la POS-58.

Para repetir la prueba desde `frontend`, usar una instalación existente de
Playwright y Chromium (no se agregan al proyecto):

```powershell
$env:PLAYWRIGHT_MODULE = 'RUTA_ABSOLUTA_A_PLAYWRIGHT'
$env:PRINT_BROWSER = 'RUTA_ABSOLUTA_A_CHROMIUM.exe'
$env:PRINT_CHECK_OUTPUT = 'DIRECTORIO_DE_SALIDA'
# Opcional: generar también PDF de diagnóstico.
$env:PRINT_CHECK_PDF = '1'
node scripts/verify-print.mjs
```

El script monta únicamente los comprobantes con datos ficticios en un servidor
Vite temporal. No llama a la API ni registra ventas. Las comparaciones de copias
verifican renderizados sucesivos; la opción de dos copias del driver requiere
verificación física.
