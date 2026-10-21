/**
 * Guarda do pacote da pré-renderização (`api/_ssr/render.mjs`).
 *
 * O pacote é gerado por `scripts/build-ssr.mjs` a partir de `web/ssr/entry.ts` e
 * **vai no repositório**, porque as funções serverless de `api/` são JavaScript
 * sem passo de compilação: sem o ficheiro gerado, o servidor não consegue
 * desenhar a loja com os modelos verdadeiros.
 *
 * Um ficheiro gerado e commitado tem um problema óbvio: alguém muda um modelo,
 * não volta a gerar, e o servidor passa a servir HTML diferente do que a SPA
 * produz. O sintoma não é um erro — é o regresso do defeito que isto veio
 * corrigir: a página pisca, porque a impressão digital deixa de coincidir e a
 * SPA reescreve o DOM. Este teste reconstrói em memória e compara byte a byte.
 *
 * A Vercel também corre `ssr:build` dentro do `web:build`, por isso um deploy
 * nunca serve um pacote velho; isto protege o desenvolvimento e a revisão.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

/** O especificador fica numa constante: o `tsc` não segue um `.mjs` de scripts. */
const ESPECIFICADOR = "../scripts/build-ssr.mjs";

interface BuildModule {
  SSR_ENTRY: string;
  SSR_OUTFILE: string;
  buildSsrText(): Promise<string>;
  checkBundleText(text: string): void;
}

const build = (await import(ESPECIFICADOR)) as unknown as BuildModule;

describe("Pacote da pré-renderização — gerado e igual ao código", () => {
  it("o ficheiro existe no repositório", () => {
    expect(existsSync(join(ROOT, build.SSR_OUTFILE)), `${build.SSR_OUTFILE} em falta. Corre npm run ssr:build`).toBe(true);
    expect(existsSync(join(ROOT, build.SSR_ENTRY))).toBe(true);
  });

  it("corresponde, byte a byte, ao que o código produz agora", async () => {
    const esperado = await build.buildSsrText();
    const atual = readFileSync(join(ROOT, build.SSR_OUTFILE), "utf8");
    // A mensagem é a ação a tomar: a diferença em si não ajuda ninguém.
    expect(atual === esperado, "O pacote está desatualizado. Corre npm run ssr:build").toBe(true);
  }, 120_000);

  it("a construção é determinista: duas vezes dá o mesmo texto", async () => {
    const a = await build.buildSsrText();
    const b = await build.buildSsrText();
    expect(a).toBe(b);
  }, 120_000);

  it("não leva o cliente Supabase, variáveis do Vite nem caminhos absolutos", () => {
    const texto = readFileSync(join(ROOT, build.SSR_OUTFILE), "utf8");
    // Correria no servidor, onde não há `import.meta.env` nem sessão de browser.
    expect(texto).not.toContain("import.meta.env");
    expect(texto).not.toContain("@supabase/supabase-js");
    expect(texto).not.toContain("createClient(");
    // O caminho do projeto na máquina de quem gerou tornaria o ficheiro
    // diferente em cada máquina — e este teste num falso alarme permanente.
    expect(() => build.checkBundleText(texto)).not.toThrow();
  });

  it("o `web:build` volta a gerar o pacote antes de empacotar a SPA", () => {
    // A Vercel corre só `web:build`: se o `ssr:build` não estiver lá, um deploy
    // pode servir um pacote antigo sem nada falhar.
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["ssr:build"]).toContain("scripts/build-ssr.mjs");
    expect(pkg.scripts["web:build"]).toMatch(/ssr:build/);
    expect(pkg.scripts["web:build"].indexOf("ssr:build")).toBeLessThan(pkg.scripts["web:build"].indexOf("vite build"));
  });
});
