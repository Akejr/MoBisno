/**
 * Guardas da Pagina_Loja_Nao_Encontrada (R10).
 *
 * O ecrã «Loja não encontrada» existe em dois lados que nunca correm no mesmo
 * sítio: a SPA (`web/templates/notFound.ts`, consumido pelas cinco vistas
 * públicas) e o HTML pré-renderizado das funções serverless (`notFoundHtml` de
 * `api/prerender.js`, o que um visitante sem JavaScript lê). São duas
 * implementações do mesmo texto, e é por isso que divergem sem que nada falhe —
 * exactamente o problema que a §5.2 do `SEO.md` descreve para
 * `api/_seo.js` vs `src/services/`.
 *
 * As asserções são sobre o **texto-fonte** e não sobre o DOM gerado: `tests/`
 * compila com `lib: ["ES2022"]`, sem DOM, por isso nem `web/templates/`
 * nem `api/prerender.js` podem ser importados. É o mesmo padrão `readFileSync`
 * de `tests/seoInfra.test.ts`.
 *
 * Nota sobre a paridade de texto: as cinco vistas **não contêm** o texto —
 * importam as constantes de `web/templates/notFound.ts`. A comparação de
 * paridade é portanto `web/templates/notFound.ts` ↔ `api/prerender.js`; nas
 * vistas o que se verifica é o **uso** de `storeNotFoundHtml(...)`, e é isso que
 * prova o R10.6 (as cinco mostram o mesmo ecrã).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

const TEMPLATE = readFileSync(join(ROOT, "web/templates/notFound.ts"), "utf8");
const PRERENDER = readFileSync(join(ROOT, "api/prerender.js"), "utf8");

/** As cinco vistas públicas que o R10.6 obriga a mostrar o mesmo ecrã. */
const VIEWS = ["storefront", "product", "category", "cart", "checkout"] as const;

const VIEW_SOURCES = VIEWS.map((name) => ({
  name,
  text: readFileSync(join(ROOT, `web/views/${name}.ts`), "utf8"),
}));

/** Os quatro literais que são a fonte do texto dos dois lados. */
const SHARED_LITERALS = [
  "STORE_NOT_FOUND_MESSAGE",
  "STORE_NOT_FOUND_INVITE",
  "STORE_NOT_FOUND_PRIMARY_LABEL",
  "STORE_NOT_FOUND_SECONDARY_LABEL",
] as const;

/**
 * Valor de uma constante de módulo declarada num literal de cadeia de uma só
 * expressão (`const X = "…";`, com ou sem `export`, com ou sem quebra de linha
 * depois do `=`). Devolve `null` quando a constante não existe ou quando é
 * composta por concatenação — que é precisamente o que se quer detetar, porque
 * um texto partido em pedaços deixa de ser comparável entre os dois lados.
 */
function literalValue(source: string, name: string): string | null {
  const re = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*"([^"]*)"\\s*;`);
  const m = re.exec(source);
  return m ? m[1] : null;
}

/** Corpo da função `notFoundHtml` de `api/prerender.js`, do `function` ao `}` da coluna 0. */
function notFoundHtmlBlock(): string {
  const start = PRERENDER.indexOf("function notFoundHtml(");
  expect(start, "notFoundHtml não encontrada em api/prerender.js").toBeGreaterThan(-1);
  const end = PRERENDER.indexOf("\n}", start);
  expect(end, "fim de notFoundHtml não encontrado").toBeGreaterThan(start);
  return PRERENDER.slice(start, end + 2);
}

describe("Loja não encontrada — as cinco vistas mostram o mesmo ecrã (R10.6)", () => {
  it.each(VIEW_SOURCES)("$name importa o ecrã partilhado e chama storeNotFoundHtml", ({ text }) => {
    // Se uma vista voltar a compor o seu próprio HTML de erro, o R10.6 quebra
    // sem que nada falhe: cada vista passa a mostrar um ecrã diferente.
    expect(text).toContain('from "../templates/notFound.js"');
    expect(text).toContain("storeNotFoundHtml(");
  });

  it("o ecrã partilhado vive num único ficheiro", () => {
    expect(TEMPLATE).toContain("export function storeNotFoundHtml(");
  });
});

describe("Loja não encontrada — mesma mensagem e mesmo convite nos dois lados (R10.7)", () => {
  it.each(SHARED_LITERALS)("%s é declarado nos dois lados num literal de uma só expressão", (name) => {
    expect(literalValue(TEMPLATE, name), `${name} em web/templates/notFound.ts`).toBeTruthy();
    expect(literalValue(PRERENDER, name), `${name} em api/prerender.js`).toBeTruthy();
  });

  it.each(SHARED_LITERALS)("%s tem exactamente o mesmo texto na SPA e no prerender", (name) => {
    // O coração deste teste: alterar o texto num lado e esquecer o outro faz o
    // visitante sem JavaScript ler uma coisa e o visitante com JavaScript outra.
    expect(literalValue(PRERENDER, name)).toBe(literalValue(TEMPLATE, name));
  });

  it("a mensagem e o convite são o texto que o utilizador lê, em português de Portugal (R10.10)", () => {
    expect(literalValue(TEMPLATE, "STORE_NOT_FOUND_MESSAGE"))
      .toBe("Não encontrámos nenhuma loja publicada neste endereço.");
    expect(literalValue(TEMPLATE, "STORE_NOT_FOUND_INVITE")).toContain("criar a sua");
  });

  it("os dois lados apresentam o convite e as duas ações", () => {
    const block = notFoundHtmlBlock();
    for (const name of SHARED_LITERALS) {
      expect(TEMPLATE, `${name} usado na SPA`).toContain(`esc(${name})`);
    }
    expect(block).toContain("STORE_NOT_FOUND_INVITE");
    expect(block).toContain("STORE_NOT_FOUND_PRIMARY_LABEL");
    expect(block).toContain("STORE_NOT_FOUND_SECONDARY_LABEL");
    expect(PRERENDER).toContain("intro: STORE_NOT_FOUND_MESSAGE");
  });
});

describe("Loja não encontrada — caminhos reais, sem fragmento (R10.5, SEO.md §5.1)", () => {
  it("o ecrã da SPA não gera nenhuma ligação com fragmento", () => {
    expect(TEMPLATE).not.toContain('href="#');
    expect(TEMPLATE).not.toContain("`#/loja/");
  });

  it("o notFoundHtml do prerender não gera nenhuma ligação com fragmento", () => {
    const block = notFoundHtmlBlock();
    expect(block).not.toContain('href="#');
    expect(block).not.toContain("`#/loja/");
  });

  it("as duas ações usam os caminhos reais /criar e /lojas (R10.3, R10.4)", () => {
    expect(TEMPLATE).toContain('platformHref("/criar")');
    expect(TEMPLATE).toContain('platformHref("/lojas")');
    const block = notFoundHtmlBlock();
    expect(block).toContain("${platform}/criar");
    expect(block).toContain("${platform}/lojas");
  });
});

describe("Loja não encontrada — códigos HTTP e indexação (R10.8, R10.9, SEO.md §3.5)", () => {
  it("o ecrã sai sempre com noindex", () => {
    // Sem isto, cada endereço inexistente vira uma URL indexada da plataforma.
    expect(notFoundHtmlBlock()).toContain("noindex: true");
  });

  it("loja inexistente ou não publicada responde 404 (R10.8)", () => {
    expect(PRERENDER).toMatch(/notFoundHtml\(shell, "Loja não encontrada", canonicalBase\),\s*404/);
  });

  it("conta sem acesso ativo responde 410 (R10.9)", () => {
    expect(PRERENDER).toMatch(/notFoundHtml\(shell, "Loja indisponível", canonicalBase\),\s*410/);
  });

  it("nenhuma destas respostas cai no shell da plataforma com 200", () => {
    // `send(..., 200)` aqui devolveria um soft-404: o Google indexaria centenas
    // de endereços inexistentes como se fossem páginas válidas.
    const chamadas = PRERENDER.match(/notFoundHtml\(shell,[^)]*\),\s*(\d{3})/g) ?? [];
    expect(chamadas.length).toBeGreaterThanOrEqual(2);
    for (const c of chamadas) {
      expect(c, c).toMatch(/,\s*(404|410)$/);
    }
  });
});
