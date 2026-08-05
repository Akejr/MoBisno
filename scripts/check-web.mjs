/**
 * Portão do `web/`: apanha referências que rebentam em execução.
 *
 * PORQUÊ EXISTE: o `tsconfig.json` do projeto inclui apenas `src/` e `tests/`,
 * por isso `npm run build` nunca olhou para o `web/` — que é onde vive a maior
 * parte do código. O `npm run web:build` também não chega: o esbuild remove os
 * tipos sem os verificar, e o rollup só acusa um import em falta quando ele é
 * usado (a tree-shaking descarta os outros em silêncio).
 *
 * O resultado foi previsível e repetiu-se: `PLAN_PERIOD_DAYS` importado de um
 * módulo que deixou de o exportar, e `prodLimit`, `limit` e `dataUrls` usados
 * depois de as declarações terem sido removidas. Compilava, empacotava, passava
 * 540 testes — e o painel não abria.
 *
 * NÃO tenta tipar o `web/` a sério: há folga de tipos herdada que não se
 * resolve num dia. Falha apenas nos códigos que significam «isto lança um
 * ReferenceError ou um TypeError assim que a linha correr».
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

/** Códigos que garantem avaria em execução, e não apenas imprecisão de tipos. */
const FATAIS = new Map([
  ["TS2304", "nome não definido"],
  ["TS2552", "nome não definido (parecido com outro)"],
  ["TS2551", "propriedade inexistente (parecida com outra)"],
  ["TS2305", "o módulo não exporta esse nome"],
  ["TS2724", "o módulo não exporta esse nome"],
  ["TS2306", "não é um módulo"],
  ["TS2307", "módulo não encontrado"],
]);

/** Todos os `.ts` de `web/`, descobertos na hora (uma lista fixa ficaria velha). */
function tsDe(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const caminho = join(dir, e.name);
    if (e.isDirectory()) return tsDe(caminho);
    return e.name.endsWith(".ts") ? [caminho.replace(/\\/g, "/")] : [];
  });
}

const ficheiros = tsDe("web");

const r = spawnSync("npx", [
  "tsc", "--noEmit", "--strict", "--target", "ES2022", "--module", "ESNext",
  "--moduleResolution", "Bundler", "--lib", "ES2022,DOM,DOM.Iterable",
  "--types", "vite/client,node", "--skipLibCheck", ...ficheiros,
], { encoding: "utf8", shell: process.platform === "win32" });

const linhas = (r.stdout || "").split("\n");
const problemas = linhas.filter((l) => [...FATAIS.keys()].some((c) => l.includes(`error ${c}:`)));

if (problemas.length) {
  console.error("\nO web/ tem referências que rebentam em execução:\n");
  for (const p of problemas) console.error("  " + p.trim());
  console.error(`\n${problemas.length} problema(s). Estes códigos não são folga de tipos: são ReferenceError à espera de acontecer.\n`);
  process.exit(1);
}
console.log(`check-web: ${ficheiros.length} ficheiros, nenhuma referência partida.`);
