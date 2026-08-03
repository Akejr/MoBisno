/**
 * Tarefa 14.6 da spec `melhorias-loja-e-admin` (R4.3, R4.10, R4.11, R4.19, R4.20).
 *
 * Exemplos nomeados, com valores concretos e legíveis, que fixam o
 * comportamento de `src/services/variations.ts`. Import estático directo: o
 * módulo é puro e não toca em `document`, `window` nem `localStorage`, pelo que
 * não é preciso o contorno de `await import()` com o especificador numa
 * constante que os testes de módulos de `web/` usam.
 *
 * ## O que este ficheiro faz que os outros não fazem
 *
 * A Propriedade 2 (`tests/variations.property.test.ts`) cobre a aritmética de
 * `effectivePrice` sobre entradas arbitrárias, e `tests/productFormVariations.ts`
 * mais `tests/variationPicker.test.ts` asseguram que as vistas chamam este
 * módulo em vez de reimplementarem a regra. Nenhum dos três fixa os **valores
 * esperados** do domínio: a ordem exacta do produto cartesiano, que preço e que
 * stock sobrevivem a uma remoção, e a lista de nomes que uma seleção incompleta
 * devolve. É isso que está aqui, e é por isso que estes exemplos falham com
 * mensagem clara quando alguém mexer na regra.
 *
 * Exemplos e não propriedade: cada caso abaixo é um estado enumerável do
 * Formulario_De_Produto ou da Pagina_De_Produto, e vale mais lido do que
 * gerado.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeVariations,
  combinationsOf,
  syncCombinations,
  variantKeyOf,
  variantLabelOf,
  findCombination,
  combinationAvailable,
  missingAxes,
  variationsPlainText,
} from "../src/services/variations.js";
import type { ProductVariations } from "../src/models/domain.js";

/** U+001F, o separador de valores dentro de uma chave de Combinação. */
const US = "\u001F";

/** Eixos de referência de todo o ficheiro: uma t-shirt em duas cores e dois tamanhos. */
const EIXOS = [
  { name: "Cor", values: ["Preto", "Branco"] },
  { name: "Tamanho", values: ["S", "M"] },
];

/* -------------------------------------------------------------------------- */
/* R4.3 — produto cartesiano                                                  */
/* -------------------------------------------------------------------------- */

describe("combinationsOf — produto cartesiano de dois eixos (R4.3)", () => {
  it("gera as quatro Combinação com o primeiro eixo a variar mais devagar", () => {
    // A ordem é a garantia que interessa: sem ela, a lista de Combinação do
    // Formulario_De_Produto mudava de ordem entre duas aberturas do mesmo
    // Produto, e o Dono via os preços que escreveu noutras linhas.
    expect(combinationsOf(EIXOS)).toEqual([
      ["Preto", "S"],
      ["Preto", "M"],
      ["Branco", "S"],
      ["Branco", "M"],
    ]);
  });

  it("é determinista: duas chamadas com os mesmos eixos dão a mesma lista", () => {
    expect(combinationsOf(EIXOS)).toEqual(combinationsOf(EIXOS));
  });

  it("com três eixos, o último varia mais depressa e o total é o produto dos comprimentos", () => {
    const lista = combinationsOf([
      { name: "Cor", values: ["Preto", "Branco"] },
      { name: "Tamanho", values: ["S", "M"] },
      { name: "Gola", values: ["Redonda", "Em V"] },
    ]);

    expect(lista).toHaveLength(8);
    expect(lista[0]).toEqual(["Preto", "S", "Redonda"]);
    expect(lista[1]).toEqual(["Preto", "S", "Em V"]);
    expect(lista[2]).toEqual(["Preto", "M", "Redonda"]);
    expect(lista[7]).toEqual(["Branco", "M", "Em V"]);
  });

  it("um eixo só dá uma Combinação por valor, cada uma com um valor apenas", () => {
    expect(combinationsOf([{ name: "Tamanho", values: ["S", "M", "L"] }])).toEqual([
      ["S"],
      ["M"],
      ["L"],
    ]);
  });

  it("sem eixos utilizáveis devolve `[]`, e não `[[]]`", () => {
    // A diferença não é cosmética: `[[]]` seria uma Combinação sem valores, que
    // o Formulario_De_Produto desenharia como uma linha de preço e stock para um
    // Produto que não tem versões nenhumas.
    expect(combinationsOf([])).toEqual([]);
    expect(combinationsOf([{ name: "Cor", values: [] }])).toEqual([]);
    expect(combinationsOf([{ name: "   ", values: ["Preto"] }])).toEqual([]);
  });

  it("valores duplicados dentro de um eixo não duplicam Combinação", () => {
    expect(combinationsOf([{ name: "Cor", values: ["Preto", "Preto", "Branco"] }])).toEqual([
      ["Preto"],
      ["Branco"],
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* R4.19, R4.20 — remoção de um valor de eixo                                 */
/* -------------------------------------------------------------------------- */

describe("syncCombinations — remover um valor de eixo preserva as restantes (R4.19, R4.20)", () => {
  /**
   * Estado de partida: as quatro Combinação do cartesiano, cada uma com preço e
   * stock distintos, para se ver **qual** sobrevive e não só quantas.
   */
  const gravadas: ProductVariations = {
    enabled: true,
    priceMode: "substitui",
    axes: [
      { name: "Cor", values: ["Preto", "Branco"] },
      { name: "Tamanho", values: ["S", "M"] },
    ],
    combinations: [
      { values: ["Preto", "S"], price: 5000, stock: 3 },
      { values: ["Preto", "M"], price: 5500, stock: 0 },
      { values: ["Branco", "S"], price: 6000, stock: 7 },
      { values: ["Branco", "M"], price: 6500 },
    ],
  };

  it("as Combinação do valor removido desaparecem e as restantes mantêm preço e stock", () => {
    // O Dono deixou de vender branco: `Cor` fica só com `Preto`.
    const depois = syncCombinations({
      ...gravadas,
      axes: [
        { name: "Cor", values: ["Preto"] },
        { name: "Tamanho", values: ["S", "M"] },
      ],
    });

    // As duas Combinação de branco desapareceram (R4.19); as duas de preto
    // ficaram com exatamente os dados que tinham, incluindo o `stock: 0`, que é
    // um estado com significado próprio e não um campo vazio (R4.20).
    expect(depois.combinations).toEqual([
      { values: ["Preto", "S"], price: 5000, stock: 3 },
      { values: ["Preto", "M"], price: 5500, stock: 0 },
    ]);
  });

  it("remover um valor do segundo eixo preserva os dados das Combinação de todos os outros eixos", () => {
    // Mesma regra pelo outro lado: `Tamanho` perde o `S`.
    const depois = syncCombinations({
      ...gravadas,
      axes: [
        { name: "Cor", values: ["Preto", "Branco"] },
        { name: "Tamanho", values: ["M"] },
      ],
    });

    expect(depois.combinations).toEqual([
      { values: ["Preto", "M"], price: 5500, stock: 0 },
      // «Branco M» tinha preço e nunca teve stock: continua sem `stock`, que é
      // «não controlado» e não `0`.
      { values: ["Branco", "M"], price: 6500 },
    ]);
    expect("stock" in depois.combinations[1]!).toBe(false);
  });

  it("acrescentar um valor acrescenta Combinação sem preço e sem stock, sem tocar nas antigas", () => {
    const depois = syncCombinations({
      ...gravadas,
      axes: [
        { name: "Cor", values: ["Preto", "Branco"] },
        { name: "Tamanho", values: ["S", "M", "L"] },
      ],
    });

    expect(depois.combinations).toEqual([
      { values: ["Preto", "S"], price: 5000, stock: 3 },
      { values: ["Preto", "M"], price: 5500, stock: 0 },
      { values: ["Preto", "L"] },
      { values: ["Branco", "S"], price: 6000, stock: 7 },
      { values: ["Branco", "M"], price: 6500 },
      { values: ["Branco", "L"] },
    ]);
    // As entradas novas valem o preço base e não têm stock controlado — a
    // leitura correta para uma versão do Produto que o Dono ainda não preencheu.
    expect(depois.combinations[2]).toEqual({ values: ["Preto", "L"] });
  });

  it("remover um valor e acrescentar outro na mesma passagem só preserva o que sobreviveu", () => {
    const depois = syncCombinations({
      ...gravadas,
      axes: [
        { name: "Cor", values: ["Preto", "Azul"] },
        { name: "Tamanho", values: ["S", "M"] },
      ],
    });

    expect(depois.combinations).toEqual([
      { values: ["Preto", "S"], price: 5000, stock: 3 },
      { values: ["Preto", "M"], price: 5500, stock: 0 },
      { values: ["Azul", "S"] },
      { values: ["Azul", "M"] },
    ]);
  });

  it("acrescentar um eixo inteiro perde os dados de todas as Combinação — consequência da invariante posicional", () => {
    // Não é perda acidental. `values` passa de dois para três valores, logo
    // nenhuma chave antiga corresponde: «Preto S» e «Preto S Redonda» não são a
    // mesma versão do Produto, e não há maneira de saber se o preço de «Preto S»
    // pertence à gola redonda ou à gola em V.
    const depois = syncCombinations({
      ...gravadas,
      axes: [
        { name: "Cor", values: ["Preto", "Branco"] },
        { name: "Tamanho", values: ["S", "M"] },
        { name: "Gola", values: ["Redonda"] },
      ],
    });

    expect(depois.combinations).toEqual([
      { values: ["Preto", "S", "Redonda"] },
      { values: ["Preto", "M", "Redonda"] },
      { values: ["Branco", "S", "Redonda"] },
      { values: ["Branco", "M", "Redonda"] },
    ]);
    expect(depois.combinations.every((c) => c.price === undefined && c.stock === undefined)).toBe(true);
  });

  it("remover um eixo inteiro perde os dados pela mesma razão", () => {
    const depois = syncCombinations({
      ...gravadas,
      axes: [{ name: "Cor", values: ["Preto", "Branco"] }],
    });

    expect(depois.combinations).toEqual([{ values: ["Preto"] }, { values: ["Branco"] }]);
  });

  it("é idempotente: aplicar duas vezes dá o mesmo resultado", () => {
    const uma = syncCombinations({
      ...gravadas,
      axes: [
        { name: "Cor", values: ["Preto"] },
        { name: "Tamanho", values: ["S", "M"] },
      ],
    });

    expect(syncCombinations(uma)).toEqual(uma);
  });

  it("sobre o cartesiano completo devolve a mesma lista, apenas filtrada", () => {
    expect(syncCombinations(gravadas)).toEqual(gravadas);
  });

  it("total: com `null` devolve Variação desativadas, sem eixos nem Combinação", () => {
    expect(syncCombinations(null as unknown as ProductVariations)).toEqual({
      enabled: false,
      priceMode: "substitui",
      axes: [],
      combinations: [],
    });
  });
});

/* -------------------------------------------------------------------------- */
/* R4.10 — seleção incompleta                                                 */
/* -------------------------------------------------------------------------- */

describe("missingAxes — seleção incompleta (R4.10)", () => {
  it("devolve os nomes dos eixos sem valor escolhido, na ordem dos eixos", () => {
    // O Cliente escolheu a cor e não o tamanho: a mensagem diz «Tamanho», e não
    // que «falta escolher».
    expect(missingAxes(EIXOS, ["Preto", null])).toEqual(["Tamanho"]);
    expect(missingAxes(EIXOS, [null, "M"])).toEqual(["Cor"]);
  });

  it("estado inicial da página: seleção mais curta do que os eixos dá todos os nomes", () => {
    // Nenhum seletor tocado. A seleção pode ainda não ter posições nenhumas, e
    // isso não é um erro — é a primeira coisa que a Pagina_De_Produto mostra.
    expect(missingAxes(EIXOS, [])).toEqual(["Cor", "Tamanho"]);
    expect(missingAxes(EIXOS, ["Preto"])).toEqual(["Tamanho"]);
  });

  it("seleção completa devolve lista vazia, que é a condição que autoriza a adição", () => {
    expect(missingAxes(EIXOS, ["Preto", "M"])).toEqual([]);
  });

  it("cadeia vazia, só espaços e `undefined` contam como não escolhido", () => {
    expect(missingAxes(EIXOS, ["", "   "])).toEqual(["Cor", "Tamanho"]);
    expect(missingAxes(EIXOS, [undefined as unknown as string, "M"])).toEqual(["Cor"]);
  });

  it("com um só eixo em falta de três, devolve apenas esse", () => {
    const tres = [...EIXOS, { name: "Gola", values: ["Redonda", "Em V"] }];

    expect(missingAxes(tres, ["Preto", null, "Em V"])).toEqual(["Tamanho"]);
  });

  it("total: nunca lança com entradas de forma errada", () => {
    expect(missingAxes(null as unknown as { name: string }[], [])).toEqual([]);
    expect(missingAxes(EIXOS, null as unknown as string[])).toEqual(["Cor", "Tamanho"]);
  });
});

/* -------------------------------------------------------------------------- */
/* R4.11, R4.12 — stock por Combinação                                        */
/* -------------------------------------------------------------------------- */

describe("combinationAvailable — Combinação esgotada (R4.11, R4.12)", () => {
  it("`stock === 0` é esgotado: a adição ao Carrinho é rejeitada", () => {
    expect(combinationAvailable({ values: ["Preto", "M"], stock: 0 })).toBe(false);
  });

  it("`stock` positivo está disponível", () => {
    expect(combinationAvailable({ values: ["Preto", "S"], stock: 1 })).toBe(true);
    expect(combinationAvailable({ values: ["Branco", "S"], stock: 7 })).toBe(true);
  });

  it("`stock` ausente é «não controlado» e está sempre disponível — não é o mesmo caso que `0`", () => {
    expect(combinationAvailable({ values: ["Branco", "M"] })).toBe(true);
    expect(combinationAvailable({ values: ["Branco", "M"], price: 6500 })).toBe(true);
  });

  it("Combinação inexistente (`null`) está disponível: é uma versão que o Dono não restringiu", () => {
    expect(combinationAvailable(null)).toBe(true);
  });

  it("um `stock` de tipo errado conta como ausente: não se bloqueia uma venda por um campo malformado", () => {
    const errado = { values: ["Preto", "M"], stock: "0" } as unknown as {
      values: string[];
      stock: number;
    };

    expect(combinationAvailable(errado)).toBe(true);
  });

  it("stock negativo lê-se como esgotado, que é a leitura segura", () => {
    expect(combinationAvailable({ values: ["Preto", "M"], stock: -3 })).toBe(false);
  });

  it("a Combinação esgotada encontra-se pela seleção, e é aí que a Pagina_De_Produto lê o `0`", () => {
    const v: ProductVariations = {
      enabled: true,
      priceMode: "substitui",
      axes: EIXOS.map((a) => ({ ...a })),
      combinations: [
        { values: ["Preto", "S"], stock: 3 },
        { values: ["Preto", "M"], stock: 0 },
      ],
    };

    expect(combinationAvailable(findCombination(v, ["Preto", "M"]))).toBe(false);
    expect(combinationAvailable(findCombination(v, ["Preto", "S"]))).toBe(true);
    // Seleção sem Combinação gravada: disponível, pela mesma razão que vale o
    // preço base.
    expect(findCombination(v, ["Branco", "M"])).toBeNull();
    expect(combinationAvailable(findCombination(v, ["Branco", "M"]))).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Chave, etiqueta e texto legível                                            */
/* -------------------------------------------------------------------------- */

describe("variantKeyOf — U+001F impede a colisão de chaves", () => {
  it("dois valores unidos por U+001F não colidem com um valor que contenha o separador escrivível", () => {
    // Com `"|"` como separador, `["A", "B"]` e `["A|B"]` davam a mesma chave, e
    // duas Combinação distintas colapsavam numa só linha de Carrinho.
    expect(variantKeyOf(["A", "B"])).toBe(`A${US}B`);
    expect(variantKeyOf(["A|B"])).toBe("A|B");
    expect(variantKeyOf(["A", "B"])).not.toBe(variantKeyOf(["A|B"]));
  });

  it("é sensível à ordem, porque é a posição que liga um valor ao seu eixo", () => {
    expect(variantKeyOf(["Preto", "M"])).not.toBe(variantKeyOf(["M", "Preto"]));
  });

  it("lista vazia dá `\"\"`", () => {
    expect(variantKeyOf([])).toBe("");
  });
});

describe("variantLabelOf — etiqueta legível da Combinação", () => {
  it("inclui o nome do eixo, para o Cliente saber que «M» é um tamanho", () => {
    expect(variantLabelOf(EIXOS, ["Preto", "M"])).toBe("Cor: Preto · Tamanho: M");
  });

  it("uma seleção incompleta produz a etiqueta do que já está escolhido", () => {
    expect(variantLabelOf(EIXOS, ["Preto"])).toBe("Cor: Preto");
    expect(variantLabelOf(EIXOS, [])).toBe("");
  });
});

describe("variationsPlainText — texto legível para o HTML pré-renderizado (R4.18)", () => {
  it("uma linha por eixo, nome e valores unidos por vírgula", () => {
    const v: ProductVariations = {
      enabled: true,
      priceMode: "substitui",
      axes: EIXOS.map((a) => ({ ...a })),
      combinations: [],
    };

    expect(variationsPlainText(v)).toBe("Cor: Preto, Branco\nTamanho: S, M");
  });

  it("sem eixos utilizáveis, e com `null`, devolve `\"\"`", () => {
    expect(variationsPlainText(null)).toBe("");
    expect(
      variationsPlainText({ enabled: true, priceMode: "substitui", axes: [], combinations: [] }),
    ).toBe("");
  });
});

/* -------------------------------------------------------------------------- */
/* normalizeVariations — o `null` que garante o comportamento atual (R4.16)    */
/* -------------------------------------------------------------------------- */

describe("normalizeVariations — leitura utilizável", () => {
  const custom = {
    productVariations: {
      p1: {
        enabled: true,
        priceMode: "acresce",
        axes: EIXOS,
        combinations: [{ values: ["Preto", "M"], price: 500, stock: 2 }],
      },
    },
  };

  it("devolve eixos, modo de preço e as Combinação gravadas", () => {
    expect(normalizeVariations(custom, "p1")).toEqual({
      enabled: true,
      priceMode: "acresce",
      axes: EIXOS,
      combinations: [{ values: ["Preto", "M"], price: 500, stock: 2 }],
    });
  });

  it("filtra as Combinação gravadas, sem as regenerar a partir dos eixos", () => {
    // Quatro Combinação possíveis, uma gravada: a lista fica com uma. Quem
    // quiser o cartesiano completo chama `syncCombinations`.
    expect(normalizeVariations(custom, "p1")!.combinations).toHaveLength(1);
  });

  it("descarta Combinação com `values` de comprimento errado ou com valor fora do eixo", () => {
    const v = normalizeVariations(
      {
        productVariations: {
          p1: {
            enabled: true,
            axes: EIXOS,
            combinations: [
              { values: ["Preto"], price: 1 },
              { values: ["Preto", "M", "Redonda"], price: 2 },
              { values: ["Azul", "M"], price: 3 },
              { values: ["Preto", "S"], price: 4 },
              { values: ["Preto", "S"], price: 99 },
            ],
          },
        },
      },
      "p1",
    );

    // Só a quarta passa; a quinta é duplicada e fica pela primeira ocorrência.
    expect(v!.combinations).toEqual([{ values: ["Preto", "S"], price: 4 }]);
  });

  it("devolve `null` em todos os casos que mantêm o comportamento atual (R4.16)", () => {
    const base = { enabled: true, axes: EIXOS };

    expect(normalizeVariations(null, "p1")).toBeNull();
    expect(normalizeVariations(42, "p1")).toBeNull();
    expect(normalizeVariations({ productVariations: [] }, "p1")).toBeNull();
    expect(normalizeVariations({ productVariations: { p1: 7 } }, "p1")).toBeNull();
    expect(normalizeVariations(custom, "p2")).toBeNull();
    // `enabled` é comparado estritamente: nada se coage a `true`.
    expect(normalizeVariations({ productVariations: { p1: { ...base, enabled: "true" } } }, "p1")).toBeNull();
    expect(normalizeVariations({ productVariations: { p1: { ...base, enabled: 1 } } }, "p1")).toBeNull();
    expect(normalizeVariations({ productVariations: { p1: { ...base, enabled: {} } } }, "p1")).toBeNull();
    // `axes` não é array, ou não sobra eixo com valores.
    expect(normalizeVariations({ productVariations: { p1: { enabled: true, axes: {} } } }, "p1")).toBeNull();
    expect(normalizeVariations({ productVariations: { p1: { enabled: true, axes: [] } } }, "p1")).toBeNull();
    expect(
      normalizeVariations(
        { productVariations: { p1: { enabled: true, axes: [{ name: "Cor", values: [] }] } } },
        "p1",
      ),
    ).toBeNull();
  });

  it("descarta eixos sem nome e valores duplicados, e apara os espaços", () => {
    const v = normalizeVariations(
      {
        productVariations: {
          p1: {
            enabled: true,
            axes: [
              { name: "  Cor  ", values: [" Preto ", "Preto", 7, "Branco"] },
              { name: "   ", values: ["S"] },
              { values: ["M"] },
            ],
          },
        },
      },
      "p1",
    );

    expect(v!.axes).toEqual([{ name: "Cor", values: ["Preto", "Branco"] }]);
  });

  it("`priceMode` desconhecido vale «substitui», o modo predefinido", () => {
    const v = normalizeVariations(
      { productVariations: { p1: { enabled: true, priceMode: "desconto", axes: EIXOS } } },
      "p1",
    );

    expect(v!.priceMode).toBe("substitui");
  });
});
