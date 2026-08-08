/**
 * Página de listagem **renderizada de facto** — a barra de filtros e os cartões.
 *
 * As guardas de `tests/categoryFilter.test.ts` são sobre o texto-fonte, que prova
 * que o código chama as peças certas. Isto prova o que sai: que a barra tem um
 * chip por categoria, que a grelha traz **todos** os cartões (senão o filtro não
 * tem o que mostrar) e que cada cartão declara a sua categoria.
 *
 * ## Dois contornos, os dois necessários
 *
 * 1. **Especificador em constante** — os modelos importam `esc` de
 *    `web/lib/dom.ts` e `tests/` compila sem DOM (`lib: ["ES2022"]`), por isso um
 *    import estático não compilaria. É o contorno de
 *    `tests/variationPicker.test.ts`.
 * 2. **`location` mínimo** — desenhar uma página chama `storeBasePath` de
 *    `web/lib/routing.ts`, que lê `location.hostname` para saber se está num
 *    subdomínio de loja. Em `node` não existe `location`; sem este substituto o
 *    render lança antes de produzir HTML.
 */
import { describe, it, expect, beforeAll } from "vitest";

/** Modelos registados com página de categoria própria. */
const MODELOS = ["galeria", "desportivo", "beauty", "lumiere"] as const;

interface Template {
  renderCategory?: (view: unknown, category: string, custom?: unknown) => string;
}

/** Vitrina de exemplo: três Produtos em duas categorias. */
const VIEW = {
  kind: "render",
  templateId: "galeria",
  storeName: "Loja Teste",
  subdomain: "lojateste.sualoja.digital",
  header: { brand: { kind: "fallback", identity: { text: "LT" }, alt: "LT" }, storeName: "Loja Teste" },
  menu: { brand: { kind: "fallback", identity: { text: "LT" }, alt: "LT" }, items: [] },
  banners: [],
  products: [
    { id: "a", name: "Camisola", description: "", category: "Camisolas", featured: true, physical: true, price: 12000, imageUrl: "https://cdn/a.jpg", stock: null },
    { id: "b", name: "Calções", description: "", category: "Calções", featured: false, physical: true, price: 8000, imageUrl: "https://cdn/b.jpg", stock: null },
    { id: "c", name: "Meias", description: "", category: "Camisolas", featured: false, physical: true, price: 2000, imageUrl: "https://cdn/c.jpg", stock: null },
  ],
};

beforeAll(() => {
  const g = globalThis as unknown as { location?: unknown };
  if (!g.location) g.location = { hostname: "localhost", pathname: "/", search: "", origin: "http://localhost" };
});

/** HTML da página de listagem de um modelo, para uma categoria. */
async function listagem(modelo: string, categoria: string): Promise<string> {
  // O especificador tem de ficar numa variável para o `tsc` não seguir o import.
  const especificador = `../web/templates/${modelo}.js`;
  const mod = (await import(especificador)) as Record<string, Template>;
  const template = Object.values(mod).find((t) => typeof t?.renderCategory === "function");
  expect(template, `${modelo}: sem renderCategory exportada`).toBeTruthy();
  return template!.renderCategory!(VIEW, categoria, {});
}

describe("Listagem renderizada — barra de filtros e cartões", () => {
  for (const modelo of MODELOS) {
    it(`${modelo}: a barra traz um chip por categoria com produtos`, async () => {
      const html = await listagem(modelo, "Camisolas");
      expect(html).toContain("data-cat-filter-bar");
      expect(html).toContain('data-cat-filter="Camisolas"');
      expect(html).toContain('data-cat-filter="Calções"');
      // O chip da categoria aberta vem marcado, senão nenhum aparece escolhido.
      const i = html.indexOf('data-cat-filter="Camisolas"');
      expect(html.slice(i, i + 400)).toContain('aria-pressed="true"');
    });

    it(`${modelo}: a grelha traz os três cartões, cada um com a sua categoria`, async () => {
      const html = await listagem(modelo, "Camisolas");
      // Filtrar é esconder e mostrar: um cartão que não venha no HTML nunca
      // aparece ao clicar no chip da categoria dele.
      for (const nome of ["Camisola", "Calções", "Meias"]) {
        expect(html, `${modelo}: falta o cartão ${nome}`).toContain(nome);
      }
      expect(html).toContain('data-product-category="Camisolas"');
      expect(html).toContain('data-product-category="Calções"');
    });

    it(`${modelo}: os chips são botões e não ligações`, async () => {
      const html = await listagem(modelo, "Camisolas");
      const i = html.indexOf("data-cat-filter-bar");
      const barra = html.slice(i, html.indexOf("</div>", i));
      expect(barra).toContain('<button type="button"');
      expect(barra).not.toContain("<a ");
    });

    it(`${modelo}: o título e a contagem têm gancho para o filtro os actualizar`, async () => {
      const html = await listagem(modelo, "Camisolas");
      expect(html).toContain("data-cat-title");
      expect(html).toContain("data-cat-count");
    });
  }
});

/**
 * Página de produto renderizada — os seletores de variação em **todos** os
 * modelos registados.
 *
 * O pedido era «verifica se todos os modelos estão prontos para apresentar
 * botões da escolha da variação». Isto responde com o HTML: cada modelo desenha
 * um botão por variação, com a miniatura quando a variação tem foto.
 */
describe("Página de produto renderizada — seletores em todos os modelos", () => {
  const CUSTOM = {
    productVariations: {
      a: {
        enabled: true,
        priceMode: "substitui",
        axes: [{ name: "Cor", values: ["Azul", "Preto"] }],
        combinations: [
          { values: ["Azul"], price: 13000, image: "https://cdn/azul.jpg" },
          { values: ["Preto"], stock: 0 },
        ],
      },
    },
  };

  async function produto(modelo: string, custom: unknown): Promise<string> {
    const especificador = `../web/templates/${modelo}.js`;
    const mod = (await import(especificador)) as Record<string, {
      renderProduct?: (view: unknown, p: unknown, c?: unknown) => string;
    }>;
    const template = Object.values(mod).find((t) => typeof t?.renderProduct === "function");
    expect(template, `${modelo}: sem renderProduct exportada`).toBeTruthy();
    return template!.renderProduct!(VIEW, VIEW.products[0], custom);
  }

  for (const modelo of MODELOS) {
    it(`${modelo}: desenha um botão por variação, com o nome do grupo`, async () => {
      const html = await produto(modelo, CUSTOM);
      expect(html).toContain('data-variations="a"');
      expect(html).toContain("Cor");
      expect(html).toContain('data-variation-value="Azul"');
      expect(html).toContain('data-variation-value="Preto"');
      // A variação sem stock vem marcada e desativada, não escondida.
      const i = html.indexOf('data-variation-value="Preto"');
      expect(html.slice(i, i + 300)).toContain("disabled");
    });

    it(`${modelo}: a foto da variação vai no botão e na galeria`, async () => {
      const html = await produto(modelo, CUSTOM);
      expect(html).toContain('data-variation-image="https://cdn/azul.jpg"');
      // A foto entra como slide: trocar não pede nada à rede.
      expect(html).toContain('data-img-src="https://cdn/azul.jpg"');
    });

    it(`${modelo}: um Produto sem variações não ganha um único seletor`, async () => {
      const html = await produto(modelo, {});
      expect(html).not.toContain("data-variations=");
      expect(html).not.toContain("data-variation-pick");
    });
  }
});
