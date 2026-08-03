/**
 * Registo de Modelos_De_Loja depois da remoção do «Neon Lab» e do «FoodMart»
 * (R1.4, R1.10, passo 5 da decisão D7).
 *
 * A avaria que este teste guarda: remover uma entrada de `TEMPLATE_REGISTRY`
 * não parte nada visível: `getTemplate` tem fallback, e qualquer Loja gravada
 * com esse `template_id` passa **silenciosamente** a ser servida com o primeiro
 * Modelo registado. Nenhum teste da linha de base apanhava a alteração, e o
 * `tsc` não olha para `web/` (o `tsconfig.json` compila só `src/**` e
 * `tests/**`). Este ficheiro é a rede: fixa quais as entradas que saíram, quais
 * as que ficaram, e para onde vai um id desconhecido.
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
 * `tests/seoInfra.test.ts` e `tests/seedRename.test.ts`) chegava para «as
 * entradas saíram do registo», mas não prova o R1.10: só executando
 * `getTemplate` se vê que um id desconhecido devolve o primeiro Modelo
 * registado. Nenhum stub é necessário — `dom.ts` e `routing.ts` só tocam em
 * `document`/`location` **dentro** das funções, e nem `registry.ts` nem os
 * módulos de desenho correm código de DOM no carregamento: só declaram funções
 * `render` e objetos `StoreTemplate`.
 */
import { describe, it, expect } from "vitest";

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

describe("TEMPLATE_REGISTRY — entradas removidas (R1.4)", () => {
  it("não registra `neonlab` nem `foodmart`", () => {
    expect(ids()).not.toContain("neonlab");
    expect(ids()).not.toContain("foodmart");
  });

  it("mantém os Modelos que ficaram, com `desportivo` como primeiro", () => {
    // A identidade do primeiro é o que define o destino de qualquer id
    // desconhecido (R1.10): trocar a ordem do registo muda o Modelo servido às
    // Lojas gravadas com `neonlab`/`foodmart`, e é uma alteração que tem de ser
    // deliberada.
    expect(TEMPLATE_REGISTRY.length).toBeGreaterThan(0);
    expect(TEMPLATE_REGISTRY[0]!.id).toBe("desportivo");
    expect(ids()).toContain("lumiere");
    expect(ids()).toContain("beauty");
    expect(ids()).toContain("galeria");
  });

  it("não tem ids repetidos", () => {
    // Com um id duplicado, `getTemplate` devolveria sempre o primeiro e o outro
    // Modelo ficaria inalcançável sem nada falhar.
    expect(new Set(ids()).size).toBe(ids().length);
  });

  it("não oferece `neonlab` nem `foodmart` na galeria de Modelos", () => {
    const oferecidos = templateOptions().map((o) => o.id);
    expect(oferecidos).not.toContain("neonlab");
    expect(oferecidos).not.toContain("foodmart");
    for (const id of oferecidos) expect(ids()).toContain(id);
  });
});

describe("getTemplate — id desconhecido devolve o primeiro registado (R1.10)", () => {
  const primeiro = (): Modelo => TEMPLATE_REGISTRY[0]!;

  it("devolve o primeiro Modelo para as Lojas gravadas com `neonlab` ou `foodmart`", () => {
    // É este o comportamento que serve as demos publicadas depois da remoção:
    // não rebenta, serve o primeiro Modelo registado.
    expect(getTemplate("neonlab")).toBe(primeiro());
    expect(getTemplate("foodmart")).toBe(primeiro());
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
