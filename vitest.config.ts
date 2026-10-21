import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "src/Modelos/**", "src/Interface/**", "src/WePink Angola/**"],
    /**
     * Cinco segundos não chegam. Vários testes desenham HTML a sério e, para
     * isso, carregam módulos de `web/` por `import()` dinâmico — o que obriga o
     * Vite a transformar o grafo todo (modelos, editor, painéis) na primeira
     * vez. Sozinho, cada ficheiro passava; na suite completa, com os
     * trabalhadores a competir pela máquina, a transformação passava dos cinco
     * segundos e o teste falhava por tempo esgotado, de forma intermitente e
     * conforme a ordem em que os ficheiros eram distribuídos.
     *
     * Um limite generoso não esconde um teste lento a sério: a suite inteira
     * corre em cerca de dois minutos, e um teste pendurado continua a falhar.
     */
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
