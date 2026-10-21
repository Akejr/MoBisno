/**
 * Constrói o pacote da pré-renderização: `web/ssr/entry.ts` → `api/_ssr/render.mjs`.
 *
 * PORQUÊ: as funções serverless (`api/*.js`) são JavaScript sem passo de
 * compilação e não podem importar TypeScript de `web/` nem de `src/`. Para o
 * servidor desenhar a loja com os MESMOS modelos que a SPA (e a SPA poder adotar
 * esse HTML em vez de o reescrever), os modelos são empacotados aqui num único
 * módulo ESM para Node 18.
 *
 * O ficheiro gerado vai para o repositório (a Vercel também corre isto no
 * `web:build`). Tem de ser **determinista** — sem datas, sem caminhos absolutos,
 * sem mapas de origem — para `tests/ssrBundle.test.ts` poder verificar, byte a
 * byte, que o ficheiro do repositório corresponde ao código: se não
 * corresponder, o teste falha com «Corre npm run ssr:build».
 *
 * Guardas: o pacote não pode levar o cliente Supabase (`web/supabase/client.ts`,
 * que lê `import.meta.env` e a sessão do navegador) nem `import.meta.env`. Se
 * algum import os puxar, a construção falha e diz porquê.
 */
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const SSR_ENTRY = "web/ssr/entry.ts";
export const SSR_OUTFILE = "api/_ssr/render.mjs";

// Só ASCII: o resto do pacote sai em ASCII (`charset: "ascii"`), e assim o ficheiro
// lê-se igual em qualquer editor e em qualquer codificação.
const BANNER = [
  "// Gerado por scripts/build-ssr.mjs a partir de web/ssr/entry.ts - nao editar a mao.",
  "// Para o voltar a gerar: npm run ssr:build",
].join("\n");

/** Recusa os módulos que não podem entrar no pacote do servidor. */
const guardPlugin = {
  name: "mobisno-ssr-guard",
  setup(b) {
    b.onResolve({ filter: /^@supabase\// }, (args) => ({
      errors: [{ text: `O pacote SSR não pode importar ${args.path} (pedido por ${args.importer}).` }],
    }));
    b.onResolve({ filter: /supabase[\\/]client(\.js|\.ts)?$/ }, (args) => ({
      errors: [{ text: `O pacote SSR não pode importar o cliente Supabase (pedido por ${args.importer}).` }],
    }));
    b.onResolve({ filter: /(^|[\\/])composition(\.js|\.ts)?$/ }, (args) => ({
      errors: [{ text: `O pacote SSR não pode importar web/composition.ts (pedido por ${args.importer}).` }],
    }));
  },
};

/** Opções do esbuild — partilhadas com `tests/ssrBundle.test.ts`. */
export function ssrBuildOptions() {
  return {
    absWorkingDir: ROOT,
    entryPoints: [SSR_ENTRY],
    outfile: SSR_OUTFILE,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    sourcemap: false,
    legalComments: "none",
    charset: "ascii",
    minify: false,
    treeShaking: true,
    logLevel: "silent",
    banner: { js: BANNER },
    plugins: [guardPlugin],
  };
}

/** Verifica o texto gerado. Lança com uma mensagem acionável. */
export function checkBundleText(text) {
  if (text.includes("import.meta.env")) {
    throw new Error("O pacote SSR contém import.meta.env — algum módulo do servidor lê variáveis do Vite.");
  }
  const variantes = [ROOT, ROOT.replace(/\\/g, "/"), ROOT.replace(/\\/g, "\\\\")];
  if (variantes.some((v) => v.length > 3 && text.includes(v))) {
    throw new Error("O pacote SSR contém o caminho absoluto do projeto — a saída deixaria de ser determinista.");
  }
}

/** Constrói em memória e devolve o texto do pacote. */
export async function buildSsrText() {
  const result = await build({ ...ssrBuildOptions(), write: false });
  const out = result.outputFiles?.[0];
  if (!out) throw new Error("O esbuild não produziu nenhum ficheiro.");
  checkBundleText(out.text);
  return out.text;
}

async function main() {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const text = await buildSsrText();
  mkdirSync(join(ROOT, dirname(SSR_OUTFILE)), { recursive: true });
  writeFileSync(join(ROOT, SSR_OUTFILE), text, "utf8");
  console.log(`ssr:build: ${SSR_OUTFILE} (${Math.round(text.length / 1024)} kB)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`ssr:build falhou: ${e && e.message ? e.message : e}`);
    if (e && Array.isArray(e.errors)) for (const err of e.errors) console.error(`  - ${err.text}`);
    process.exit(1);
  });
}
