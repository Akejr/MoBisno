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
