/**
 * Seletores de Variação da Pagina_De_Produto (R4.9, R4.11, R4.16, R4.17).
 *
 * ## Contorno escolhido: `await import()` com o especificador em constante
 *
 * `web/templates/variationPicker.ts` importa `esc` de `web/lib/dom.ts`, e
 * `tests/` compila com `lib: ["ES2022"]`, sem DOM, pelo que um import estático
 * não compilaria. Com o especificador numa constante o `tsc` não segue o import
 * e o módulo de `web/` não entra no programa; em execução o `vitest` resolve-o
 * normalmente. É o mesmo contorno de `tests/registry.test.ts` e de
 * `tests/storeCustom.property.test.ts`, e funciona aqui porque nada em
 * `dom.ts` toca em `document` ao ser carregado — só dentro das funções, que
 * este ficheiro não chama.
 *
 * A alternativa (`readFileSync` do texto-fonte) não servia: o que interessa
 * provar é o **HTML produzido** — que há um seletor por eixo, que a Combinação
 * esgotada vem marcada, e que um Produto sem Variação não ganha um único nó.
 *
 * O comportamento (rejeições, atualização de preço ao mudar a seleção) vive em
 * `web/views/product.ts`, depende de eventos do DOM e fica fora deste programa
 * de testes; a guarda desse lado é `npm run web:build`.
 */
import { describe, it, expect } from "vitest";
// Estas guardas novas leem o texto-fonte de `web/`, que não é carregável em
// `node` (usa DOM): é o mesmo padrão de `tests/platformChrome.test.ts`.
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Raiz do repositório, para as guardas que leem texto-fonte. */
const ROOT = join(__dirname, "..");

/** Especificador em constante: mantém o módulo de `web/` fora do `tsc`. */
const ESPECIFICADOR_PICKER = "../web/templates/variationPicker.js";

interface Picker {
  variationPickerHtml: (
    product: { id: string; name: string; price: number },
    custom: unknown,
    style: { labelClass: string; valueClass: string; valueStyle?: string; selectedStyle?: string },
  ) => string;
}

const ESTILO = { labelClass: "rotulo", valueClass: "valor" };

/** Duas Variação; só «Azul · S» tem stock, as três restantes estão a zero. */
const CUSTOM = {
  productVariations: {
    p1: {
      enabled: true,
      priceMode: "acresce",
      axes: [
        { name: "Cor", values: ["Azul", "Preto"] },
        { name: "Tamanho", values: ["S", "M"] },
      ],
      combinations: [
        { values: ["Azul", "S"], price: 500, stock: 3 },
        { values: ["Azul", "M"], stock: 0 },
        { values: ["Preto", "S"], stock: 0 },
        { values: ["Preto", "M"], stock: 0 },
      ],
    },
  },
};

const PRODUTO = { id: "p1", name: "Camisola", price: 1000 };

async function picker(): Promise<Picker> {
  return (await import(ESPECIFICADOR_PICKER)) as unknown as Picker;
}

/** Recorta o botão de um valor, para asserções sobre esse botão e não sobre o resto. */
function botao(html: string, valor: string): string {
  const inicio = html.indexOf(`data-variation-pick`, html.indexOf(`"${valor}"`) - 200);
  return html.slice(inicio, html.indexOf("</button>", inicio));
}

describe("Seletores de Variação — um seletor por eixo (R4.9)", () => {
  it("apresenta o nome de cada Variação e todos os valores definidos pelo Dono", async () => {
    const html = (await picker()).variationPickerHtml(PRODUTO, CUSTOM, ESTILO);
    expect(html).toContain('data-variations="p1"');
    expect(html).toContain('data-variation-axis="0"');
    expect(html).toContain('data-variation-axis="1"');
    expect(html).toContain("Cor");
    expect(html).toContain("Tamanho");
    for (const valor of ["Azul", "Preto", "S", "M"]) {
      expect(html, valor).toContain(`data-variation-value="${valor}"`);
    }
  });
});

describe("Seletores de Variação — Combinação esgotada (R4.11, R4.12)", () => {
  it("marca «Esgotado» o valor cujas Combinação estão todas a zero", async () => {
    const html = (await picker()).variationPickerHtml(PRODUTO, CUSTOM, ESTILO);
    expect(botao(html, "Preto")).toContain('data-sold-out="1"');
    expect(botao(html, "Preto")).toContain("Esgotado");
    expect(botao(html, "M")).toContain('data-sold-out="1"');
  });

  it("não marca o valor que ainda tem uma Combinação disponível", async () => {
    const html = (await picker()).variationPickerHtml(PRODUTO, CUSTOM, ESTILO);
    // A etiqueta «Esgotado» existe em todos os botões, escondida — é a execução
    // que a revela quando a seleção muda. O que distingue é `data-sold-out="1"`.
    expect(botao(html, "Azul")).not.toContain('data-sold-out="1"');
    expect(botao(html, "Azul")).toContain('data-sold-out-badge class="hidden');
    expect(botao(html, "S")).not.toContain('data-sold-out="1"');
  });

  it("stock ausente é stock não controlado: nenhum valor fica esgotado", async () => {
    const semStock = {
      productVariations: {
        p1: {
          enabled: true,
          priceMode: "substitui",
          axes: [{ name: "Cor", values: ["Azul", "Preto"] }],
          combinations: [{ values: ["Azul"] }, { values: ["Preto"] }],
        },
      },
    };
    const html = (await picker()).variationPickerHtml(PRODUTO, semStock, ESTILO);
    expect(html).not.toContain('data-sold-out="1"');
  });
});

describe("Seletores de Variação — desenho do próprio Modelo_De_Loja (R4.17)", () => {
  it("usa as classes e o estilo que o modelo passa, e cor de marca no valor escolhido", async () => {
    const html = (await picker()).variationPickerHtml(PRODUTO, CUSTOM, {
      labelClass: "lx-body lx-track uppercase",
      valueClass: "px-4 py-2.5 border",
      valueStyle: "border-color:rgba(28,27,27,.2)",
    });
    expect(html).toContain("lx-body lx-track uppercase");
    expect(html).toContain('class="px-4 py-2.5 border"');
    expect(html).toContain("border-color:rgba(28,27,27,.2)");
    // Sem estilo de escolha declarado, o valor escolhido é botão de marca.
    expect(html).toContain("background:var(--brand);color:var(--brand-ink)");
  });

  it("nunca usa a cor de interface de administração", async () => {
    const html = (await picker()).variationPickerHtml(PRODUTO, CUSTOM, ESTILO);
    expect(html).not.toContain("#F95901");
  });
});

describe("Produto sem Variação — comportamento atual inalterado (R4.16)", () => {
  it("devolve cadeia vazia quando o Produto não está no mapa", async () => {
    expect((await picker()).variationPickerHtml({ id: "p2", name: "Boné", price: 10 }, CUSTOM, ESTILO)).toBe("");
  });

  it("devolve cadeia vazia com Variação desativadas, sem eixos e sem Personalização", async () => {
    const p = await picker();
    const desativadas = { productVariations: { p1: { ...CUSTOM.productVariations.p1, enabled: false } } };
    const semEixos = { productVariations: { p1: { enabled: true, priceMode: "substitui", axes: [], combinations: [] } } };
    expect(p.variationPickerHtml(PRODUTO, desativadas, ESTILO)).toBe("");
    expect(p.variationPickerHtml(PRODUTO, semEixos, ESTILO)).toBe("");
    expect(p.variationPickerHtml(PRODUTO, undefined, ESTILO)).toBe("");
    expect(p.variationPickerHtml(PRODUTO, { productVariations: "isto não é um mapa" }, ESTILO)).toBe("");
  });
});

describe("Foto da variação — a loja troca a imagem ao escolher", () => {
  const PICKER = readFileSync(join(ROOT, "web/templates/variationPicker.ts"), "utf8");
  const GALLERY = readFileSync(join(ROOT, "web/templates/gallery.ts"), "utf8");
  const PRODUCT_VIEW = readFileSync(join(ROOT, "web/views/product.ts"), "utf8");
  const PRODUCT_PAGE = readFileSync(join(ROOT, "web/templates/productPage.ts"), "utf8");

  it("o botão da variação leva a foto e mostra-a como miniatura", () => {
    expect(PICKER).toContain("data-variation-image");
    expect(PICKER).toMatch(/function imageOfValue\(/);
    // A miniatura é decoração: o nome já está no botão, e um leitor de ecrã que
    // lesse a imagem repetia-o.
    expect(PICKER).toMatch(/<img src="\$\{esc\(image\)\}" alt="" aria-hidden="true"/);
  });

  it("as fotos das variações entram na galeria, para a troca ser instantânea", () => {
    // Sem isto, escolher uma variação pedia a imagem à rede no momento do clique.
    expect(GALLERY).toContain("variationImages(normalizeVariations(custom, product.id))");
    // `data-img-src` é o que permite encontrar o slide pelo endereço da imagem.
    expect(GALLERY).toContain('data-img-src="${esc(src)}"');
  });

  it("há sempre onde trocar a imagem, com galeria ou sem ela", () => {
    // A variante «imersivo» não usa galeria: a troca é pelo `src`.
    expect(GALLERY).toContain("<img data-product-image");
    expect(PRODUCT_PAGE).toContain("<img data-product-image");
    const i = PRODUCT_VIEW.indexOf("const showImage =");
    expect(i, "showImage não encontrada").toBeGreaterThan(-1);
    const bloco = PRODUCT_VIEW.slice(i, i + 600);
    expect(bloco).toContain("input[data-img-src=");
    expect(bloco).toContain("[data-product-image]");
  });

  it("a foto da Combinação ganha à do valor, e sem escolha volta a do Produto", () => {
    expect(PRODUCT_VIEW).toMatch(/comb\?\.image \|\| picked\?\.getAttribute\("data-variation-image"\)/);
    expect(PRODUCT_VIEW).toMatch(/selection\.every\(\(s\) => s === null\)\)\s*showImage\(baseImage\)/);
  });

  it("a linha de carrinho leva a foto da versão escolhida", () => {
    expect(PRODUCT_VIEW).toContain("imageUrl: choice.image ?? product.imageUrl ?? undefined");
  });
});

describe("Cobertura dos modelos — todos apresentam os seletores", () => {
  const REGISTRY = readFileSync(join(ROOT, "web/templates/registry.ts"), "utf8");

  it("todo o modelo registado com página de produto desenha os seletores", () => {
    // Um modelo que desenhe a página de produto sem seletores deixa o Cliente sem
    // forma de escolher a versão — e a página passa a vender sempre a versão base.
    for (const modelo of ["galeria", "desportivo", "beauty", "lumiere"]) {
      const src = readFileSync(join(ROOT, `web/templates/${modelo}.ts`), "utf8");
      expect(REGISTRY, `${modelo} fora do registo`).toContain(`from "./${modelo}.js"`);
      const usaPartilhada = src.includes("renderProductPage(");
      const usaPropria = src.includes("variationPickerHtml(");
      expect(usaPartilhada || usaPropria, `${modelo}: página de produto sem seletores`).toBe(true);
    }
  });

  it("a página de produto partilhada desenha os seletores nas três variantes", () => {
    const PAGE = readFileSync(join(ROOT, "web/templates/productPage.ts"), "utf8");
    const variantes = PAGE.split("variationsHtml(product, custom)").length - 1;
    // «clássico», «galeria» e «imersivo».
    expect(variantes).toBe(3);
  });
});

describe("HTML produzido com fotos — o que a loja recebe de facto", () => {
  /** Um grupo, duas variações, a primeira com foto. É a forma que o formulário grava. */
  const COM_FOTO = {
    productVariations: {
      p1: {
        enabled: true,
        priceMode: "substitui",
        axes: [{ name: "Cor", values: ["Azul", "Preto"] }],
        combinations: [
          { values: ["Azul"], price: 12000, image: "https://cdn/azul.jpg" },
          { values: ["Preto"] },
        ],
      },
    },
  };

  it("o botão da variação com foto leva-a no atributo e como miniatura", async () => {
    const { variationPickerHtml } = await picker();
    const html = variationPickerHtml(PRODUTO, COM_FOTO, ESTILO);
    const azul = botao(html, "Azul");
    expect(azul).toContain('data-variation-image="https://cdn/azul.jpg"');
    expect(azul).toContain('<img src="https://cdn/azul.jpg"');
    // A variação sem foto não ganha atributo nenhum — nem uma miniatura vazia.
    const preto = botao(html, "Preto");
    expect(preto).not.toContain("data-variation-image");
    expect(preto).not.toContain("<img");
  });

  it("um Produto sem fotos de variação continua a não ganhar um único nó a mais", async () => {
    const { variationPickerHtml } = await picker();
    const html = variationPickerHtml(PRODUTO, CUSTOM, ESTILO);
    expect(html).not.toContain("data-variation-image");
    expect(html).not.toContain("<img");
  });

  it("a galeria inclui a foto da variação como slide, com o endereço no rádio", async () => {
    const ESPECIFICADOR_GALERIA = "../web/templates/gallery.js";
    const { productGalleryHtml, productImages } = (await import(ESPECIFICADOR_GALERIA)) as unknown as {
      productImages: (p: unknown, c: unknown) => string[];
      productGalleryHtml: (p: unknown, c: unknown, o: { stageClass: string }) => string;
    };
    const produto = { ...PRODUTO, imageUrl: "https://cdn/base.jpg" };
    expect(productImages(produto, COM_FOTO)).toEqual(["https://cdn/base.jpg", "https://cdn/azul.jpg"]);

    const html = productGalleryHtml(produto, COM_FOTO, { stageClass: "palco" });
    // Duas fotos ⇒ galeria: a foto do azul é um slide e o rádio diz qual é.
    expect(html).toContain('data-img-src="https://cdn/azul.jpg"');
    expect(html).toContain('data-img-src="https://cdn/base.jpg"');
  });
});
