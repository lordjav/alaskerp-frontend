# Alaskerp frontend

SPA TypeScript/Vite para el punto de venta táctil de Helados Alaska.

## Desarrollo local

```bash
cp .env.development.example .env.local
npm install
npm run dev
```

Abre `http://localhost:5173/`. La plantilla de desarrollo usa la API CloudFront
de desarrollo y el cliente Cognito correspondiente. `.env.local` no se sube a Git.
En Cognito deben estar permitidas las URL de callback y cierre de sesión
`http://localhost:5173/`. El puerto se mantiene fijo para no cambiar ese callback.
Para usar un backend local, reemplaza solo `VITE_API_URL` por su dirección real;
debe usar un puerto distinto del frontend (5173).

El instalador de Windows se distribuye en `installers/AlaskaCaja-Instalador.zip`.

## GitHub Pages

Activa GitHub Pages desde la rama `gh-pages` y configura `alaskerp.javiermeza.dev` como dominio personalizado. El workflow publica:

- `main` en `/` (producción).
- `development` en `/dev/` (desarrollo).

Define estas variables de repositorio en GitHub Actions antes del primer despliegue:

- `PROD_API_URL`, `PROD_COGNITO_DOMAIN`, `PROD_COGNITO_CLIENT_ID`
- `DEV_API_URL`, `DEV_COGNITO_DOMAIN`, `DEV_COGNITO_CLIENT_ID`

El callback OAuth de cada app client Cognito debe ser exactamente la raíz de su entorno: `https://alaskerp.javiermeza.dev/` y `https://lordjav.github.io/alaskerp-frontend/dev/`.

Las decisiones de producto están en [PLANNING.md](PLANNING.md).

## Tiquetes y cajón SAT15TUS

Desde **Registrar venta → Tiquetes e impresora** se ajustan el nombre del negocio,
dirección, teléfono, mensaje final y ancho. Valores guardados por navegador/equipo.
El formato inicial usa 58 mm / 32 columnas; confirma el rollo instalado antes de
cambiar a 80 mm / 42 columnas. Se usa texto ASCII (acentos transliterados) para
no depender de la página de caracteres configurada en la impresora.

- El tiquete usa el snapshot devuelto por el API, con fecha de Colombia, vendedor,
  productos, sabores, cantidades, precios, total y pago. No inventa NIT, impuestos
  ni numeración fiscal; es un comprobante de venta.
- La impresión automática es configurable y ocurre después de registrar la venta.
  La opción de apertura envía el pulso únicamente en la impresión automática de
  ventas activas en efectivo. Las reimpresiones nunca abren el cajón.
- **Último tiquete** conserva la última venta durante la sesión de la página.
  Manager/admin pueden recuperar otras ventas desde **Listado → Tiquete**.
  Observador puede ver la vista previa, pero no enviar órdenes desde la interfaz.
- Un fallo de impresión conserva la venta registrada. Antes de volver a imprimir
  se debe comprobar el papel/cola; una desconexión no demuestra que no se imprimió.
- **Abrir cajón** envía solo `1B 70 00 32 FA`. No genera una venta ni imprime texto.

### Alaska Caja: instalación permanente en Windows

La web envía las órdenes al conector de **este mismo equipo**. El navegador puede
estar abierto en el sitio HTTPS publicado o en el frontend local; no es necesario
que el sitio web se ejecute desde el repositorio. El cambio del frontend debe
publicarse antes de que los botones nuevos aparezcan en el sitio en línea.

1. Ejecuta `local-print/Install-AlaskaCaja.ps1` una vez, con Windows de 64 bits.
   Instala la aplicación en `%LOCALAPPDATA%\AlaskerpPrint`, con su propio Python
   embebido oficial; no depende de Python global, de Codex ni del repositorio.
   Admite `-RuntimeArchive <zip>` para instalar sin internet y verifica el SHA256
   del archivo publicado por Python.org.
2. **Alaska Caja** se inicia minimizada al entrar a tu sesión de Windows después
   de un reinicio. Permanece en la barra de tareas y junto al reloj. Cerrar la
   ventana con **X** la minimiza. **Salir del conector**, en el menú junto al reloj,
   sí detiene la aplicación hasta que vuelvas a abrirla.
3. Abre **Alaska Caja → Copiar clave para la web** y pega esa clave en
   **Registrar venta → Tiquetes e impresora**. Guarda y comprueba la conexión.
   Esta vinculación se hace una vez por navegador y por origen (dev/producción).
4. Si el navegador solicita acceso al equipo/red local, concédelo al sitio del POS.
   Chrome aplica un permiso de acceso local: [documentación oficial](https://developer.chrome.com/blog/local-network-access).
5. Para abrir el cajón sin web o sin internet, pulsa **ABRIR CAJÓN** en Alaska Caja.
   Envía el pulso directamente a Windows y no necesita que el servidor web local
   esté respondiendo. La impresora sí debe estar encendida y conectada.

La aplicación supervisa el conector cada cinco segundos: lo vuelve a iniciar si
termina y lo reinicia tras tres comprobaciones sin respuesta. Las órdenes de
impresión/apertura inciertas nunca se repiten automáticamente. No puede garantizar
el funcionamiento ante una avería física, Windows detenido o impresora apagada.
El inicio automático ocurre al **iniciar sesión**, no antes del inicio de sesión.

La instalación crea un acceso en Inicio y otro en la carpeta Inicio automático.
Puedes anclar Alaska Caja a la barra de tareas desde el menú de su icono. Para
actualizar, sal del conector y vuelve a ejecutar el instalador; conserva la clave y
el registro de órdenes. Antes de migrar desde el prototipo de consola, ciérralo.

Modo de desarrollo opcional: `python local-print/bridge.py --show-token`.
`--data-dir <carpeta>` selecciona el almacenamiento persistente y `--drawer` abre
el cajón directamente sin arrancar el servidor HTTP.

Solo escucha en `127.0.0.1:19151`; valida Host, origen exacto y clave. Admite los
orígenes del POS publicados y el servidor de desarrollo en puerto 5173. No utiliza
los tokens Cognito ni expone una API de bytes arbitrarios: acepta líneas ASCII
limitadas y una opción de apertura. La clave autoriza control local de impresión;
el conector no valida roles Cognito, que se restringen en la interfaz.

La instalación conserva la clave y el registro SQLite en
`%LOCALAPPDATA%\AlaskerpPrint\data`. El modo de desarrollo usa
`local-print/.local/`, excluido de Git. Conserva este directorio entre reinicios: impide que el mismo
`request_id` se ejecute dos veces. Una orden con resultado incierto no se reenvía
automáticamente. El registro conserva identificador, hash, estado y número de
trabajo, no el texto del tiquete. No borrar mientras existan órdenes pendientes.

La respuesta «Orden aceptada por Windows» confirma el envío a la cola, no el papel
impreso ni la posición física del cajón. El comando de apertura es el comprobado
con esta impresora: pin 2, pulso de 100 ms y pausa de 500 ms. No se envía corte
automático, pues la SAT15TUS utiliza corte manual.

### Verificación de impresión

```sh
npm run check
npm run build
node --experimental-strip-types --test tests/receipt.test.mjs
python -m unittest discover -s tests -p "test_*.py" -v
```

La prueba TypeScript requiere Node 22.6+ (se recomienda Node 24). Con `npm run dev`,
abre `/tests/receipt-preview.html` para probar los componentes con datos ficticios:
el simulador no registra ventas y reemplaza el transporte de impresión por un
registro visible. No se incluye en el build de producción. Usa una clave ficticia
en ese simulador; reemplázala por la real al probar el POS en el mismo origen.

La página `/tests/printer-hardware.html` hace una prueba **real** desde el navegador
con los botones de conexión, impresión y cajón, sin crear ventas. Usa una clave
solo en memoria de la página; no la guarda. Tampoco se incluye en producción.

`5173` es el puerto del frontend Vite. `VITE_API_URL` debe apuntar al puerto real del
backend; si `/products` devuelve HTML del frontend, esa URL no es la API. Los datos
Cognito de desarrollo se mantienen en el archivo local de entorno y la clave del
conector nunca se coloca en `VITE_*`, porque esas variables se publican al compilar.
