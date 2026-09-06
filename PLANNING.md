# Alaskerp Frontend - Planning

## Propósito

SPA de punto de venta para Helados Alaska. Se ejecuta en un navegador moderno en una pantalla táctil de 1920x1080, está escrita en TypeScript vanilla y se publica gratuitamente con GitHub Pages.

La interfaz está en español y prioriza velocidad de operación, controles grandes y una jerarquía visual clara por encima de patrones de e-commerce. La dirección visual toma la energía de las referencias de helados, pero crea un diseño original con el logo Alaska, verde lima, fucsia y fondo crema.

## Entornos y publicación

| Entorno | Rama origen | URL frontend | API |
| --- | --- | --- | --- |
| Desarrollo | `development` | `https://lordjav.github.io/alaskerp-frontend/dev/` | Dominio CloudFront generado por el stack dev |
| Producción | `main` | `https://alaskerp.javiermeza.dev/` | `https://api.alaskerp.javiermeza.dev` |

GitHub Actions construirá cada variante y publicará ambas en el mismo sitio Pages, preservando `/` y `/dev/`. Las URL de API se inyectarán como variables de Actions durante el build; no se codificarán en el repositorio.

Los cambios se desarrollan en `development`, pasan por pull request y se integran a `main` para producción.

## Arquitectura técnica

- TypeScript vanilla compilado con Vite.
- Organización inicial:
  - `src/pages/`: login callback, POS, listado, métricas, configuración y detalle de venta.
  - `src/components/`: navegación, formularios, modales, tarjetas, carrito y controles táctiles reutilizables.
  - `src/services/`: cliente API, autenticación Cognito, configuración en tiempo de compilación.
  - `src/models/`: contratos TypeScript del API.
  - `src/styles/`: tokens, base, layout y estilos por pantalla.
  - `src/assets/`: variantes aprobadas del logo y recursos locales.
- Sin framework UI ni SDK AWS en el navegador.
- SPA con fallback para rutas de aplicación en GitHub Pages.

## Autenticación y autorización

- Cognito Managed Login con plan Essentials y Authorization Code con PKCE.
- La aplicación redirige inmediatamente a Cognito para iniciar sesión; Cognito maneja contraseña temporal, cambio obligatorio y recuperación por correo.
- Al retornar al callback, la aplicación intercambia el código, conserva tokens en `sessionStorage` y envía el access token en `X-Alaskerp-Token` a la API.
- Duraciones: access token 12 h, ID token 12 h y refresh token 7 días.
- Roles recibidos en el JWT: `seller`, `manager`, `observer`, `admin`.
- La navegación y las acciones se ocultan y protegen en cliente según el rol, pero la API es la autoridad final.
- Debido al modelo stateless, un cambio de rol o desactivación puede tardar hasta 12 h en reflejarse.

| Rol | POS | Listado/detalle | Métricas | Configuración |
| --- | --- | --- | --- | --- |
| `seller` | Sí | No | No | No |
| `manager` | Sí | Sí | Sí | No |
| `observer` | No | Sí | No | No |
| `admin` | Sí | Sí | Sí | Sí |

## Pantallas

### POS

Flujo táctil: seleccionar presentación/tamaño -> elegir sabores permitidos -> cantidad -> agregar al carrito -> seleccionar pago -> confirmar -> registrar venta.

- La selección de producto muestra presentación, tamaño, precio y máximo de sabores.
- Pequeño, mediano y grande parten con máximo de 1, 2 y 3 sabores; el catálogo puede añadir tamaños/presentaciones con otra regla.
- La selección incluye sabores activos y `Otro`.
- El carrito conserva una copia visible de presentación, tamaño, sabores, precio, cantidad y total de cada línea.
- Métodos de pago: efectivo, Nequi, Bancolombia, tarjeta de crédito y Otro. Otro exige comentario.
- La confirmación es obligatoria antes de crear la venta.
- La solicitud usa una clave de idempotencia para evitar dobles ventas por doble toque o reintento de red.
- Impresión de ticket y apertura de cajón quedan fuera de alcance.

### Listado y detalle de ventas

- Rango obligatorio, inicialmente hoy y máximo 30 días.
- 25 resultados por página.
- Filtros opcionales por vendedor, método de pago y estado; las anuladas se excluyen por defecto.
- El detalle muestra el snapshot histórico de la venta.
- Manager y Admin pueden anular desde el detalle/listado con motivo libre obligatorio. Nunca se edita ni elimina una venta.

### Métricas

- Rango máximo de 30 días.
- Tarjetas de ventas netas y número de ventas para hoy, semana y mes.
- Serie diaria para el rango seleccionado.
- Desgloses por método de pago, producto/presentación, vendedor y sabor.
- Las ventas anuladas no participan en resultados netos.

### Configuración

- Solo Admin.
- Gestión de usuarios: username, correo, rol y creación con contraseña temporal generada automáticamente.
- Gestión de sabores: crear, activar/desactivar y seed inicial.
- Gestión de productos: presentación, tamaño, máximo de sabores, precio entero COP y estado activo/inactivo.
- Usuarios, sabores y productos no se eliminan físicamente.

## Diseño y accesibilidad

- Diseño desktop-first con barra lateral persistente, mostrando solo destinos autorizados.
- En POS, catálogo a la izquierda y carrito/cobro a la derecha para minimizar desplazamiento.
- Objetivos táctiles de al menos 56 px, estados claros de selección y tipografía legible a distancia.
- Fondo crema; verde lima y fucsia como acentos de acción/estado; contraste suficiente para operación continua.
- Usar recursos propios proporcionados por Alaska; no copiar imágenes de las referencias.

## Fuera de alcance inicial

- Impresión, integración de caja registradora y `terminal_id`.
- Pagos mixtos, valor recibido y cálculo de cambio.
- Autoregistro, inicio de sesión por correo, MFA y revocación inmediata de tokens.
- Soporte móvil como objetivo primario.
