# Alaskerp frontend

SPA TypeScript/Vite para el punto de venta táctil de Helados Alaska.

## Desarrollo local

```bash
cp .env.example .env.local
npm install
npm run dev
```

Configura en `.env.local` la URL de API, dominio Cognito y client ID del entorno desplegado.

## GitHub Pages

Activa GitHub Pages desde la rama `gh-pages` y configura `alaskerp.javiermeza.dev` como dominio personalizado. El workflow publica:

- `main` en `/` (producción).
- `development` en `/dev/` (desarrollo).

Define estas variables de repositorio en GitHub Actions antes del primer despliegue:

- `PROD_API_URL`, `PROD_COGNITO_DOMAIN`, `PROD_COGNITO_CLIENT_ID`
- `DEV_API_URL`, `DEV_COGNITO_DOMAIN`, `DEV_COGNITO_CLIENT_ID`

El callback OAuth de cada app client Cognito debe ser exactamente la raíz de su entorno: `https://alaskerp.javiermeza.dev/` y `https://lordjav.github.io/alaskerp-frontend/dev/`.

Las decisiones de producto están en [PLANNING.md](PLANNING.md).
