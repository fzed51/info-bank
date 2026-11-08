import { resolve } from "node:path";
import { defineConfig } from "vite";
import { backofficeApi } from "./src/build/backoffice-api.ts";

// Backoffice local : serveur de dev uniquement, jamais construit ni publié.
export default defineConfig({
  root: resolve("src/backoffice"),
  // Seulement les icônes (favicon), jamais le reste de public/ (data.enc).
  publicDir: resolve("public/icons"),
  oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
  plugins: [backofficeApi()],
  server: { host: "127.0.0.1", port: 5174, strictPort: true, open: true },
});
