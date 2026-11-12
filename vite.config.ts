import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxy = env.VITE_API_PROXY_TARGET || env.VITE_MENU_API_PROXY_TARGET ? {
    ...(env.VITE_MENU_API_PROXY_TARGET ? { "/menu-api": {
      target: env.VITE_MENU_API_PROXY_TARGET,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/menu-api/, ""),
    } } : {}),
    ...(env.VITE_API_PROXY_TARGET ? { "/api": {
      target: env.VITE_API_PROXY_TARGET,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/, ""),
    } } : {}),
  } : undefined;
  return {
    base: process.env.VITE_BASE_PATH ?? "/",
    build: { rollupOptions: { input: { app: "index.html", menu: "menu/index.html" } } },
    server: { host: "localhost", port: 5173, strictPort: true, proxy },
  };
});
