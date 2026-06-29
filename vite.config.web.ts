import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

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
  build: {
    rollupOptions: {
      output: {
        // Separa as dependências (ex.: supabase-js) num chunk de vendor cacheável
        // e à parte do código da app, melhorando o carregamento inicial.
        manualChunks(id) {
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
});
