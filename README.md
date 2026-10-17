# limpieza-mr-total

Aplicacion de gestion compuesta por dos proyectos desplegables de formaaa
independiente:

- `frontend`: React + Vite.
- `backend`: Express + Turso/libSQL.

## Despliegue independiente en Vercel

El mismo repositorio debe importarse **dos veces** en Vercel. Cada importacion
crea un proyecto con su propio dominio, configuracion y ciclo de despliegue.

### 1. Crear el proyecto del backend

1. En Vercel, importar este repositorio como un proyecto nuevo.
2. En **Root Directory**, seleccionar `backend`.
3. Vercel detectara Express y usara `backend/vercel.json`.
4. Crear estas variables en **Settings > Environment Variables** para
   Production, Preview y Development:

   - `TURSO_DATABASE_URL`: URL `libsql://...` de la base Turso.
   - `TURSO_AUTH_TOKEN`: token de acceso a Turso.
   - `JWT_SECRET`: secreto aleatorio largo para firmar sesiones.
   - `FRONTEND_URL`: URL publica del frontend, sin ruta ni barra final. Admite
     varios origenes separados por comas.

5. Desplegar y comprobar `https://DOMINIO-BACKEND/api/health`.

No es necesario definir `PORT`: Vercel lo administra. El backend exporta la
aplicacion Express como una unica Function y solo abre un puerto al ejecutarse
localmente.

### 2. Crear el proyecto del frontend

1. Importar nuevamente el mismo repositorio en otro proyecto de Vercel.
2. En **Root Directory**, seleccionar `frontend`.
3. Crear la variable `VITE_API_URL` para Production, Preview y Development con
   la URL publica del backend, incluyendo `/api` y sin barra final. Ejemplo:
   `https://mi-backend.vercel.app/api`.
4. Desplegar. Vercel ejecutara el build de Vite y publicara `dist`.

El archivo `frontend/vercel.json` incluye la reescritura necesaria para que las
rutas internas de la SPA funcionen al recargar la pagina.

### 3. Cerrar el circuito de CORS

Cuando Vercel asigne el dominio definitivo al frontend, copiarlo en
`FRONTEND_URL` del proyecto backend y volver a desplegar el backend. Si tambien
se usa un dominio personalizado, agregar ambos separados por coma:

```text
https://mi-frontend.vercel.app,https://sistema.midominio.com
```

Los valores de referencia completos estan en `backend/.env.example` y
`frontend/.env.example`. Los archivos `.env` reales no deben subirse a Git.

## Desarrollo local

Crear `backend/.env` a partir de `backend/.env.example`. Para el frontend se
puede crear `frontend/.env` a partir de su ejemplo, aunque `VITE_API_URL=/api`
ya coincide con el proxy local de Vite.

```powershell
cd backend
pnpm install --frozen-lockfile
pnpm dev
```

En otra terminal:

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

El frontend queda disponible en `http://localhost:5173` y el backend en
`http://localhost:3001`.

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
