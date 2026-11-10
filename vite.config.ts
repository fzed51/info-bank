import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { readAppVersion } from "./src/build/version.ts";

const root = resolve("src/app");
const publicDir = resolve("public");

/** CSP stricte, ajoutée au build seulement (le serveur de dev injecte des scripts en ligne). */
const csp: Plugin = {
  name: "info-bank-csp",
  apply: "build",
  transformIndexHtml: () => [
    {
      tag: "meta",
      attrs: {
        "http-equiv": "Content-Security-Policy",
        content:
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'",
      },
      injectTo: "head-prepend",
    },
  ],
};

const listFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)],
  );

/**
 * Service worker généré au build : liste exacte des fichiers à précharger et version
 * dérivée de cette liste, pour que chaque déploiement remplace l'ancien cache.
 * Les données (`data.enc`) ne sont pas préchargées : elles passent par le réseau d'abord.
 */
const serviceWorker: Plugin = {
  name: "info-bank-sw",
  apply: "build",
  generateBundle(_options, bundle) {
    const statics = listFiles(publicDir)
      .map((f) => relative(publicDir, f).replaceAll("\\", "/"))
      .filter((f) => f !== "data.enc" && !f.startsWith("."));
    // Polices : seuls les sous-ensembles latins en woff2 sont préchargés ; les autres
    // (cyrillique, woff de repli…) sont mis en cache à la demande.
    const optional = /.woff$|cyrillic|greek|vietnamese/;
    const files = ["./", ...Object.keys(bundle), ...statics]
      .filter((f) => !optional.test(f))
      .map((f) => (f === "./" ? f : `./${f}`))
      .sort();
    const version = createHash("sha256")
      .update(files.join("\n"))
      .digest("hex")
      .slice(0, 12);
    const template = readFileSync(join(root, "sw-template.js"), "utf8");
    this.emitFile({
      type: "asset",
      fileName: "sw.js",
      source: template
        .replace("__VERSION__", version)
        .replace("__PRECACHE__", JSON.stringify(files)),
    });
  },
};

export default defineConfig({
  root,
  base: "./",
  publicDir,
  define: { injectedAppVersion: JSON.stringify(readAppVersion()) },
  oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
  build: {
    outDir: resolve("dist"),
    emptyOutDir: true,
    target: "es2022",
    assetsInlineLimit: 0,
  },
  plugins: [csp, serviceWorker],
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1" },
});
