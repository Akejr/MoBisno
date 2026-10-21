/**
 * O desenho genérico dos blocos de conteúdo não mudou **um byte**.
 *
 * ## O que se protege
 *
 * `web/templates/blocks.ts` passou a aceitar o desenho de cada modelo
 * (`BlockCtx.style`, `MODELO-GUIA.md` §9.3). Um modelo que não passe `style`
 * fica com o desenho genérico — e esse desenho é o que as lojas publicadas têm
 * hoje. A primeira versão da mudança trocou-o sem dar por isso: `rounded-3xl`
 * passou a `rounded-2xl`, `shadow-md` a `shadow-sm`, `text-gray-600` a
 * `text-gray-500`, e os nomes das localizações ganharam `font-black`. Nada
 * falhava, porque nenhum teste olhava para o HTML genérico.
 *
 * ## Como se prova
 *
 * `tests/fixtures/blocksDefault.json` guarda o HTML que o `blocks.ts` **de
 * HEAD** (antes de `style` existir) produzia para um conjunto fixo de entradas:
 * cada tipo e cada variante, com e sem fundo, com texto a escapar, testemunhos
 * com foto, com letra e sem nome, localizações no formato legado, em lista e
 * sem nada (a cair na morada do rodapé). O fixture foi gerado uma vez, a partir
 * desse ficheiro, numa worktree temporária — não se regenera a partir do código
 * actual, senão deixava de provar o que quer que fosse.
 *
 * Este teste desenha as mesmas entradas com o código actual, sem `style`, e
 * compara **byte a byte**.
 *
 * ## A única diferença admitida
 *
 * Cada `<section>` de bloco passou a levar `data-block-variant` (o editor lê
 * daí a variante desenhada, em vez de a deduzir do identificador do modelo). Em
 * HEAD só as secções de testemunhos não o tinham. O teste retira esse atributo
 * **só das secções de testemunhos** antes de comparar, e verifica à parte que
 * todas as secções o trazem com a variante certa. É um atributo de dados: não
 * muda o aspeto de nada.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface Caso {
  nome: string;
  ctx: Record<string, unknown>;
  custom: Record<string, unknown> | null;
  html: string;
}

interface Fixture {
  origem: string;
  newBlock: Record<string, unknown>;
  casos: Caso[];
}

interface Blocks {
  blocksHtml(custom: unknown, ctx: unknown): string;
  newBlock(type: string, variant?: string): Record<string, unknown>;
}

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "blocksDefault.json"), "utf8"),
) as Fixture;

let B: Blocks;

beforeAll(async () => {
  // `blocks.ts` importa `esc` de `web/lib/dom.ts`, que puxa `web/lib/routing.ts`.
  // Especificador em constante: o `tsc` compila `tests/` sem DOM e não o segue.
  const g = globalThis as unknown as { location?: unknown };
  if (!g.location) g.location = { hostname: "localhost", pathname: "/", search: "", origin: "http://localhost" };
  const especificador = "../web/templates/blocks.js";
  B = (await import(especificador)) as Blocks;
});

/** Retira o atributo novo só onde HEAD não o tinha: as secções de testemunhos. */
function semVarianteNosTestemunhos(html: string): string {
  return html.replace(/(<section data-edit-block="\d+" data-block-type="testimonials") data-block-variant="[a-z]+"/g, "$1");
}

/** Abertura de cada `<section>` de bloco, com o tipo e a variante declarados. */
function seccoes(html: string): { tipo: string; variante: string | undefined }[] {
  return [...html.matchAll(/<section data-edit-block="\d+" data-block-type="([a-z]+)"(?: data-block-variant="([a-z]+)")?/g)]
    .map((m) => ({ tipo: m[1]!, variante: m[2] }));
}

describe("Desenho genérico — igual a HEAD, byte a byte", () => {
  it("o fixture cobre todos os tipos e todas as variantes", () => {
    expect(FIXTURE.origem).toContain("HEAD");
    const tipos = new Set<string>();
    const pares = new Set<string>();
    for (const c of FIXTURE.casos) {
      for (const s of seccoes(c.html)) {
        tipos.add(s.tipo);
        if (s.variante) pares.add(`${s.tipo}/${s.variante}`);
      }
    }
    expect([...tipos].sort()).toEqual(["info", "location", "testimonials", "text"]);
    for (const par of ["info/lado", "info/sobreposto", "info/cartao", "text/centrado", "text/destaque", "text/linha",
      "location/classico", "location/cartao", "location/estilizado"]) {
      expect(pares, `fixture sem ${par}`).toContain(par);
    }
    // Os testemunhos não traziam a variante em HEAD: confirma-se pelas classes
    // próprias de cada uma que as três estão no fixture.
    const tudo = FIXTURE.casos.map((c) => c.html).join("");
    expect(tudo).toContain("mb-mq-track");            // carrossel
    expect(tudo).toContain("border-top:2px solid");   // editorial
    expect(tudo).toContain('data-testi-item="0" class="relative bg-white'); // cartões
  });

  for (const caso of FIXTURE.casos) {
    it(caso.nome, () => {
      // Nenhum caso traz `style`: é o desenho de um modelo que não declara nada.
      expect(caso.ctx).not.toHaveProperty("style");
      const actual = B.blocksHtml(caso.custom ?? undefined, caso.ctx);
      expect(semVarianteNosTestemunhos(actual)).toBe(caso.html);
    });
  }

  it("cada secção declara a variante que desenhou", () => {
    for (const caso of FIXTURE.casos) {
      const actual = B.blocksHtml(caso.custom ?? undefined, caso.ctx);
      const blocos = ((caso.custom?.["blocks"] ?? []) as { type?: string; variant?: string }[])
        .filter((b) => ["info", "text", "testimonials", "location"].includes(b.type ?? ""));
      const vistas = seccoes(actual);
      expect(vistas.length, caso.nome).toBe(blocos.length);
      vistas.forEach((s, k) => {
        const b = blocos[k]!;
        const omissao: Record<string, string> = {
          info: "lado",
          text: "centrado",
          location: "classico",
          testimonials: caso.ctx["variant"] === "galeria" ? "editorial" : "cards",
        };
        expect(s.tipo, caso.nome).toBe(b.type);
        expect(s.variante, `${caso.nome}: secção ${k} sem data-block-variant`).toBe(b.variant ?? omissao[b.type!]);
      });
    }
  });

  it("o conteúdo de uma secção nova é o de sempre", () => {
    // `newBlock` ganhou o parâmetro `variant`; sem ele, o bloco nasce igual.
    for (const [tipo, esperado] of Object.entries(FIXTURE.newBlock)) {
      expect(B.newBlock(tipo), tipo).toEqual(esperado);
    }
  });
});
