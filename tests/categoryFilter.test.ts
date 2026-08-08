/**
 * Guardas da barra de filtros por categoria da página de listagem.
 *
 * O defeito: para trocar de categoria só havia o menu «Categorias» do
 * cabeçalho, que navega para outra vista. O Dono descreveu-o assim — «se clico
 * numa categoria ele vai para outra tela e somem todos os botões». A barra
 * filtra na própria página, e há três maneiras de a estragar sem ninguém dar
 * conta:
 *
 *  1. **Chips em `<a>`.** `web/main.ts` interceta o clique em qualquer
 *     `<a href="/...">` e navega pelo History API — ou seja, um chip em `<a>`
 *     reintroduz exactamente o defeito, ainda que o filtro esteja correcto.
 *  2. **`navigate()` no comportamento.** Dispara o router e recarrega a vista,
 *     com o mesmo resultado. O endereço acompanha-se com `history.replaceState`.
 *  3. **Um modelo sem `data-product-category` nos cartões.** O filtro fica
 *     silenciosamente vazio nesse modelo, porque não há por onde comparar.
 *
 * As asserções são sobre o **texto-fonte**: `web/` não é verificado por tipos
 * nem carregável em `node` (usa DOM). É o padrão de `tests/platformChrome.test.ts`
 * e de `tests/assistantScopes.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** Modelos registados com página de categoria própria (ver `registry.ts`). */
const MODELOS = ["galeria", "desportivo", "beauty", "lumiere"] as const;

const FILTER = read("web/templates/categoryFilter.ts");
/** Só o corpo da função — os comentários do módulo falam de `<a>` e de `#F95901`. */
const FILTER_FN = FILTER.slice(FILTER.indexOf("export function categoryFilterHtml("));
const SECTIONS = read("web/templates/sectionsModel.ts");
const CATEGORY_VIEW = read("web/views/category.ts");
const REGISTRY = read("web/templates/registry.ts");
const FONTE = new Map(MODELOS.map((m) => [m, read(`web/templates/${m}.ts`)]));

/** Corpo da função `renderCategory` de um modelo. */
function renderCategoryDe(src: string): string {
  const i = src.indexOf("function renderCategory(");
  expect(i, "renderCategory não encontrada").toBeGreaterThanOrEqual(0);
  return src.slice(i, src.indexOf("\n}", i));
}

/** O ficheiro sem as linhas de comentário (asserções sobre o que corre). */
function codigoDe(src: string): string {
  return src
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .join("\n");
}

/** Corpo da função `productCard` de um modelo. */
function productCardDe(src: string): string {
  const i = src.indexOf("function productCard(");
  expect(i, "productCard não encontrada").toBeGreaterThanOrEqual(0);
  return src.slice(i, src.indexOf("\n}", i));
}

describe("Barra de filtros — presente nos quatro modelos registados", () => {
  it("os quatro modelos verificados são os que estão no registo", () => {
    // Se um modelo novo entrar no registo, esta asserção obriga a incluí-lo aqui.
    for (const m of MODELOS) expect(REGISTRY).toContain(`from "./${m}.js"`);
  });

  it("cada renderCategory desenha a barra com os rótulos partilhados", () => {
    for (const [modelo, src] of FONTE) {
      const fn = renderCategoryDe(src);
      expect(fn, `${modelo}: sem categoryFilterHtml`).toContain("categoryFilterHtml(");
      expect(fn, `${modelo}: rótulos escritos à mão`).toContain("categoryFilterLabels(view, category)");
    }
  });

  it("a barra fica acima da grelha, nunca abaixo", () => {
    for (const [modelo, src] of FONTE) {
      const fn = renderCategoryDe(src);
      const barra = fn.indexOf("${filters}");
      const grelha = fn.indexOf("${grid}");
      expect(barra, `${modelo}: barra não interpolada`).toBeGreaterThanOrEqual(0);
      expect(grelha, `${modelo}: grelha não interpolada`).toBeGreaterThanOrEqual(0);
      expect(barra, `${modelo}: barra abaixo da grelha`).toBeLessThan(grelha);
    }
  });

  it("a grelha da listagem leva todos os produtos, senão não há o que filtrar", () => {
    // Filtrar é esconder e mostrar: um cartão que não veio no HTML não aparece
    // ao clicar no chip da sua categoria.
    for (const [modelo, src] of FONTE) {
      const fn = renderCategoryDe(src);
      expect(fn, `${modelo}: grelha ainda desenha só a categoria activa`).toContain("listingProducts(view, category)");
    }
  });

  it("o título e a contagem têm gancho em todos os modelos", () => {
    for (const [modelo, src] of FONTE) {
      const fn = renderCategoryDe(src);
      expect(fn, `${modelo}: falta data-cat-title`).toContain("data-cat-title");
      expect(fn, `${modelo}: falta data-cat-count`).toContain("data-cat-count");
    }
  });

  it("o Lumière mantém os cantos retos nos chips", () => {
    const fn = renderCategoryDe(FONTE.get("lumiere")!);
    const chip = /chipClass:\s*"([^"]+)"/.exec(fn);
    expect(chip, "lumiere: chipClass não encontrada").not.toBeNull();
    expect(chip![1]).not.toMatch(/\brounded/);
  });
});

describe("Cartões — todos declaram a categoria", () => {
  it("o elemento de topo do cartão leva data-product-category escapado", () => {
    for (const [modelo, src] of FONTE) {
      const card = productCardDe(src);
      expect(card, `${modelo}: cartão sem data-product-category`).toContain(
        'data-product-category="${esc(p.category ?? "")}"',
      );
    }
  });

  it("nenhum cartão de modelo registado ficou sem o atributo", () => {
    // `data-edit-product` é o gancho de um cartão de produto: onde ele está, a
    // categoria tem de estar no mesmo elemento.
    for (const [modelo, src] of FONTE) {
      const linhas = src.split("\n").filter((l) => l.includes('data-edit-product="${esc(p.id)}"'));
      expect(linhas.length, `${modelo}: nenhum cartão encontrado`).toBeGreaterThan(0);
      for (const l of linhas) {
        expect(l, `${modelo}: cartão sem categoria — ${l.trim().slice(0, 80)}`).toContain("data-product-category=");
      }
    }
  });
});

describe("Chips — botões, nunca ligações", () => {
  it("o módulo da barra só produz <button type=\"button\">", () => {
    expect(FILTER_FN).toContain('<button type="button" data-cat-filter=');
    // Um `<a href>` aqui devolvia o clique ao interceptor de `web/main.ts`.
    expect(FILTER_FN).not.toMatch(/<a[\s>]/);
    expect(FILTER_FN).not.toContain("href=");
  });

  it("a vista da listagem não volta a construir chips em <a>", () => {
    expect(CATEGORY_VIEW).not.toMatch(/<a[^>]*data-cat-filter/);
    expect(CATEGORY_VIEW).not.toMatch(/<a href=/);
  });

  it("os ganchos combinados entre o modelo e o comportamento existem dos dois lados", () => {
    for (const gancho of ["data-cat-filter-bar", "data-cat-active-style", "data-cat-filter", "data-cat-base"]) {
      expect(FILTER, `módulo sem ${gancho}`).toContain(gancho);
    }
    expect(CATEGORY_VIEW).toContain("[data-cat-filter-bar]");
    expect(CATEGORY_VIEW).toContain("[data-cat-filter]");
    expect(CATEGORY_VIEW).toContain("catActiveStyle");
    expect(CATEGORY_VIEW).toContain("catBase");
    expect(CATEGORY_VIEW).toContain("aria-pressed");
  });

  it("o chip escolhido usa a cor de marca, nunca a da plataforma", () => {
    expect(FILTER).toContain("var(--brand)");
    expect(FILTER).toContain("var(--brand-ink");
    expect(FILTER_FN).not.toContain("#F95901");
    for (const [modelo, src] of FONTE) {
      const fn = renderCategoryDe(src);
      expect(fn, `${modelo}: cor de plataforma na loja`).not.toContain("#F95901");
    }
  });
});

describe("Comportamento — filtra na mesma página", () => {
  it("o endereço muda com history.replaceState e sem navigate()", () => {
    expect(CATEGORY_VIEW).toContain("history.replaceState(");
    // `navigate()` dispara o router: a vista era recarregada e voltava o defeito.
    // Só o código conta — os comentários explicam precisamente porque não se usa.
    expect(codigoDe(CATEGORY_VIEW)).not.toContain("navigate(");
  });

  it("o caminho da categoria vem dos helpers, não de texto colado à mão", () => {
    expect(CATEGORY_VIEW).toContain("categorySlug(label)");
    expect(CATEGORY_VIEW).toContain("storeBasePath(identifier)");
    expect(CATEGORY_VIEW).toContain("allProductsHref(view)");
  });

  it("filtra os cartões que já estão no ecrã, sem ir ao servidor", () => {
    const i = CATEGORY_VIEW.indexOf("function mountCategoryFilter(");
    expect(i).toBeGreaterThanOrEqual(0);
    const fn = CATEGORY_VIEW.slice(i, CATEGORY_VIEW.indexOf("\n}\n", i));
    expect(fn).toContain("[data-product-category]");
    expect(fn).toContain("productCategory");
    expect(fn).toContain("style.display");
    expect(fn).toContain("[data-cat-title]");
    expect(fn).toContain("[data-cat-count]");
    // Nada de recarregar dados nem de recarregar a página.
    expect(fn).not.toContain("loadStorefront");
    expect(fn).not.toContain("location.reload");
  });
});

describe("Rótulos da barra", () => {
  it("a barra devolve cadeia vazia com menos de dois rótulos", () => {
    // Um só chip não filtra nada e ainda rouba espaço acima da grelha.
    expect(FILTER).toMatch(/if \(labels\.length < 2\) return "";/);
  });

  it("o primeiro rótulo vem da constante, não do literal", () => {
    const i = SECTIONS.indexOf("export function categoryFilterLabels(");
    expect(i).toBeGreaterThanOrEqual(0);
    const fn = SECTIONS.slice(i, SECTIONS.indexOf("\n}", i));
    expect(fn).toContain("[ALL_LABEL, ...cats]");
    expect(fn).toContain("headerCategories(view)");
    // Uma categoria sem produtos daria um chip que não mostra nada.
    expect(fn).toContain("filterForCategoryPage(view, c).length > 0");
  });
});

describe("Armadilha do acento grave em comentários HTML", () => {
  it("nenhum comentário HTML dos ficheiros tocados abre um acento grave", () => {
    // Dentro de um template literal, o acento grave fecha a string e o build
    // falha — mesmo dentro de um comentário HTML.
    const alvos: [string, string][] = [
      ["web/templates/categoryFilter.ts", FILTER],
      ["web/templates/sectionsModel.ts", SECTIONS],
      ["web/views/category.ts", CATEGORY_VIEW],
      ...[...FONTE].map(([m, src]) => [`web/templates/${m}.ts`, src] as [string, string]),
    ];
    for (const [nome, src] of alvos) {
      expect(src, `${nome}: acento grave dentro de comentário HTML`).not.toMatch(/<!--[^>]*`/);
    }
  });
});
