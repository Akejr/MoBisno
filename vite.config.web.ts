import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

/**
 * Configuração do Vite para a pré-visualização web do MôBisno.
 *
 * - `root: "web"` — a app vive em web/ (index.html como entrada).
 * - alias `node:crypto` → shim de browser (web/shims/node-crypto.ts), pois o
 *   código de domínio importa `node:crypto` que não existe no browser.
 */
export default defineConfig({
  root: "web",
  resolve: {
    alias: [
      {
        find: /^node:crypto$/,
        replacement: fileURLToPath(new URL("./web/shims/node-crypto.ts", import.meta.url)),
      },
    ],
  },
  server: { port: 5173, open: false },
});
