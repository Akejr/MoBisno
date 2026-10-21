/**
 * Registo de Modelos_De_Loja depois da saída de dois modelos — o modelo escuro e
 * a mercearia (R1.4, R1.10, passo 5 da decisão D7).
 *
 * A avaria que este teste guarda: remover uma entrada de `TEMPLATE_REGISTRY`
 * não parte nada visível: `getTemplate` tem fallback, e qualquer Loja gravada
 * com esse `template_id` passa **silenciosamente** a ser servida com o primeiro
 * Modelo registado. Nenhum teste da linha de base apanhava a alteração, e o
 * `tsc` não olha para `web/` (o `tsconfig.json` compila só `src/**` e
 * `tests/**`). Este ficheiro é a rede: fixa quais os modelos que estão no
 * registo, para onde vai um id desconhecido, e que nenhum módulo de desenho fica
 * no repositório sem estar registado.
 *
 * ## Contorno escolhido: `await import()` com o especificador em constante
 *
 * `web/templates/registry.ts` importa os módulos de desenho, que importam `esc`
 * de `web/lib/dom.ts` — e `tests/` compila com `lib: ["ES2022"]`, sem DOM, pelo
 * que um import estático não compila. Dos dois contornos em uso no repositório
 * usa-se o de `tests/storeCustom.property.test.ts`: o especificador vive numa
 * **constante**, logo o `tsc` não o segue e o módulo de `web/` não entra no
 * programa; em execução, o `vitest` resolve-o normalmente.
 *
 * A alternativa (`readFileSync` do texto-fonte, padrão de
 * `tests/seoInfra.test.ts` e `tests/seedRename.test.ts`) chegava para «o que
 * está no registo», mas não prova o R1.10: só executando `getTemplate` se vê que
 * um id desconhecido devolve o primeiro Modelo registado.
 *
 * Os dois modelos que saíram já não existem no repositório — nem o desenho nem
 * o comportamento —, por isso não são nomeados aqui: a guarda é a lista
 * deliberada de modelos prontos e a ausência de módulos de desenho órfãos.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Especificador em constante: mantém `web/templates/registry.ts` fora do `tsc`. */
const ESPECIFICADOR_REGISTO = "../web/templates/registry.js";

type Modelo = { id: string; name: string; previewUrl: string; ready?: boolean };

const { TEMPLATE_REGISTRY, getTemplate, templateOptions } = (await import(
  ESPECIFICADOR_REGISTO
)) as {
  TEMPLATE_REGISTRY: Modelo[];
  getTemplate(id: string): Modelo;
  templateOptions(): { id: string; name: string; previewUrl: string }[];
};

const ids = (): string[] => TEMPLATE_REGISTRY.map((t) => t.id);

/**
 * Os modelos prontos, por esta ordem. Acrescentar ou retirar um modelo é uma
 * decisão (muda o que o Dono pode escolher e, para o primeiro, o que serve as
 * Lojas com ids desconhecidos): tem de passar por aqui.
 */
const PRONTOS = ["desportivo", "beauty", "galeria", "lumiere", "tech-essentials"];

describe("TEMPLATE_REGISTRY — os modelos que estão no registo (R1.4)", () => {
  it("os modelos prontos são exactamente os previstos, pela ordem prevista", () => {
    expect(TEMPLATE_REGISTRY.filter((t) => t.ready).map((t) => t.id)).toEqual(PRONTOS);
  });

  it("mantém `desportivo` como primeiro", () => {
    // A identidade do primeiro é o que define o destino de qualquer id
    // desconhecido (R1.10): trocar a ordem do registo muda o Modelo servido às
    // Lojas gravadas com os modelos que saíram, e é uma alteração que tem de ser
    // deliberada.
    expect(TEMPLATE_REGISTRY.length).toBeGreaterThan(0);
    expect(TEMPLATE_REGISTRY[0]!.id).toBe("desportivo");
  });

  it("não tem ids repetidos", () => {
    // Com um id duplicado, `getTemplate` devolveria sempre o primeiro e o outro
    // Modelo ficaria inalcançável sem nada falhar.
    expect(new Set(ids()).size).toBe(ids().length);
  });

  it("a galeria de Modelos só oferece modelos prontos e registados", () => {
    const oferecidos = templateOptions().map((o) => o.id);
    expect(oferecidos).toEqual(PRONTOS);
    for (const id of oferecidos) expect(ids()).toContain(id);
  });
});

describe("getTemplate — id desconhecido devolve o primeiro registado (R1.10)", () => {
  const primeiro = (): Modelo => TEMPLATE_REGISTRY[0]!;

  it("devolve o primeiro Modelo para um id que já não está no registo", () => {
    // É este o comportamento que serve as demos publicadas depois da remoção:
    // não rebenta, serve o primeiro Modelo registado.
    for (const id of ["modelo-que-saiu", "modelo-escuro", "mercearia"]) {
      expect(ids()).not.toContain(id);
      expect(getTemplate(id)).toBe(primeiro());
    }
  });

  it("devolve o primeiro Modelo para qualquer id inventado", () => {
    for (const id of ["modelo-que-nunca-existiu", "", "DESPORTIVO", "lumière"]) {
      expect(getTemplate(id)).toBe(primeiro());
    }
  });

  it("continua a devolver o Modelo certo para um id registado", () => {
    // A guarda de que o fallback não engoliu a procura: se `getTemplate`
    // devolvesse sempre o primeiro, os testes de cima passariam mesmo assim.
    const lumiere = getTemplate("lumiere");
    expect(lumiere.id).toBe("lumiere");
    expect(lumiere.name).toBe("Lumière Chic");
    for (const modelo of TEMPLATE_REGISTRY) expect(getTemplate(modelo.id)).toBe(modelo);
  });
});

describe("registry.ts — nenhum módulo de desenho fica de fora (R1.4)", () => {
  const PASTA = join(__dirname, "..", "web", "templates");
  const FONTE = readFileSync(join(PASTA, "registry.ts"), "utf8");

  /** Módulos que exportam um `StoreTemplate` (`export const xTemplate: StoreTemplate`). */
  const modulosDeModelo = (): string[] =>
    readdirSync(PASTA)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => /export const \w+Template: StoreTemplate/.test(readFileSync(join(PASTA, f), "utf8")))
      .map((f) => f.replace(/\.ts$/, ""));

  it("todo o módulo que exporta um modelo está importado no registo", () => {
    // Um modelo que sai do registo sai também do repositório. Deixá-lo no disco
    // «só para reutilizar uma função» foi o que manteve a mercearia viva no
    // editor, com materializações e controlos para um modelo que nenhuma loja
    // podia escolher.
    const importados = [...FONTE.matchAll(/import \{ \w+Template \} from "\.\/(\w+)\.js"/g)].map((m) => m[1]!);
    expect(modulosDeModelo().sort()).toEqual([...importados].sort());
  });
});
