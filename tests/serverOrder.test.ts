/**
 * Paridade entre o servidor e o navegador na conta de uma encomenda: preço por
 * Combinação, entrega, desconto e o próprio pedido (linhas e dados do cliente).
 *
 * ## Porque é que isto importa
 *
 * Desde que o montante passou a ser calculado no servidor (`api/_payments.js`),
 * há duas contas da mesma encomenda: a que o checkout **mostra** ao comprador e
 * a que o servidor **cobra**. O checkout envia `expectedTotal` — o total que o
 * comprador viu — e o servidor responde `PRICE_CHANGED` quando o dele é outro.
 * Se as regras divergirem, toda a encomenda acaba nesse aviso, ou pior: o
 * comprador vê um valor e paga outro.
 *
 * `api/` é JavaScript sem passo de compilação e **não pode importar de `src/`**
 * (`SEO.md` §5.2), por isso as regras do servidor são espelhos escritos à mão.
 * Este ficheiro compara cada espelho com o lado do navegador:
 *
 * | Servidor (`api/`)                          | Navegador / domínio                                   |
 * |--------------------------------------------|-------------------------------------------------------|
 * | `effectivePriceOf`                         | `effectivePrice` (`src/services/variations.ts`)       |
 * | `variantLabelOfValues`                     | `variantLabelOf`                                      |
 * | `linePriceOf`                              | o preço e a etiqueta da Pagina_De_Produto             |
 * | `LUANDA_AREAS`, `deliveredAreasOf`         | `web/lib/areas.ts` (← `src/services/delivery.ts`)     |
 * | `deliveryFeeOf`                            | `deliveryFeeFor`                                      |
 * | `discountAmountOf`                         | `discountAmount` (`src/services/discount.ts`)         |
 * | `requestedLines`, `MAX_*` (`_payments.js`) | `orderRequestLines` (`src/services/cartLine.ts`)      |
 * | `cleanCustomer` (`_payments.js`)           | `buyerCustomer` (`src/services/delivery.ts`)          |
 *
 * ## Como se chega aos módulos
 *
 * `api/_shared.js` importa o cliente do Supabase e `web/` compila com DOM, por
 * isso nenhum dos dois pode ser importado estaticamente aqui: `await import()`
 * com o especificador numa **constante**, que impede o `tsc` de seguir o
 * import (o contorno de `tests/serverStock.test.ts`). `web/lib/areas.ts` não
 * toca em `location`, logo não precisa do substituto que outros testes de
 * `web/` usam.
 *
 * Os geradores partilhados vêm de `tests/geradores.ts`. Os desta paridade (uma
 * configuração de entrega crua, um código de desconto cru, um item de Carrinho,
 * os dados de um comprador) são específicos deste ficheiro e vivem aqui.
 */
import { describe, it, expect } from "vitest";
import { assertProperty, fc } from "./helpers/property.js";
import {
  combinationArb, modoDePrecoArb, precoBaseArb, variationsArb, variationsIncoerentesArb,
} from "./geradores.js";
import {
  effectivePrice, variantLabelOf, normalizeVariations, findCombination, variantKeyOf,
} from "../src/services/variations.js";
import {
  LUANDA_AREAS, deliveredAreas, deliveryFeeFor, buyerCustomer, BUYER_LIMITS, type BuyerDetails,
} from "../src/services/delivery.js";
import { discountAmount, type DiscountRule } from "../src/services/discount.js";
import {
  orderRequestLines, MAX_LINE_QUANTITY, MAX_ORDER_LINES, type OrderRequestSource,
} from "../src/services/cartLine.js";
import type { ProductVariations } from "../src/models/domain.js";

/** Especificadores em constante: mantêm `api/` e `web/` fora do `tsc`. */
const ESPECIFICADOR_SHARED = "../api/_shared.js";
const ESPECIFICADOR_PAYMENTS = "../api/_payments.js";
const ESPECIFICADOR_AREAS = "../web/lib/areas.js";

/** Resultado de uma linha calculada pelo servidor. */
interface LinePrice { ok: boolean; price?: number; label?: string; variantKey?: string }

/** Superfície de `api/_shared.js` exercitada aqui. */
interface ApiShared {
  LUANDA_AREAS: readonly string[];
  deliveredAreasOf(delivery: unknown): { name: string; fee: number }[];
  deliveryFeeOf(delivery: unknown, area: unknown, subtotal: number): { ok: boolean; fee?: number };
  discountAmountOf(code: unknown, total: number): number;
  effectivePriceOf(basePrice: unknown, combination: unknown, mode: unknown): number;
  variantLabelOfValues(axes: unknown, values: unknown): string;
  linePriceOf(custom: unknown, productId: unknown, variantKey: unknown, basePrice: number): LinePrice;
}

/** Superfície de `api/_payments.js` exercitada aqui. */
interface ApiPayments {
  MAX_ORDER_LINES: number;
  MAX_LINE_QUANTITY: number;
  requestedLines(raw: unknown): { id: string; variantKey?: string; quantity: number }[];
  cleanCustomer(raw: unknown): Record<string, string>;
}

/** Superfície de `web/lib/areas.ts` — o que o checkout e o painel importam. */
interface WebAreas {
  LUANDA_AREAS: readonly string[];
  deliveredAreas: typeof deliveredAreas;
  deliveryFeeFor: typeof deliveryFeeFor;
}

const servidor = (await import(ESPECIFICADOR_SHARED)) as unknown as ApiShared;
const pagamentos = (await import(ESPECIFICADOR_PAYMENTS)) as unknown as ApiPayments;
const areasWeb = (await import(ESPECIFICADOR_AREAS)) as unknown as WebAreas;

/** Separador dos valores numa `variantKey` (U+001F), como `variantKeyOf` o escreve. */
const SEPARADOR = "\u001F";

/* ------------------------------- Geradores --------------------------------- */

/**
 * Valores crus que a Personalização pode ter num campo numérico ou de texto:
 * tipos errados, `NaN`, infinitos, texto numérico, vazio. É com eles que dois
 * espelhos escritos à mão costumam divergir — um coage, o outro não.
 */
const valorCruArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom<unknown[]>(undefined, null, true, false, "", "1500", "abc", "single", "perArea", [], {}),
  fc.integer({ min: -5_000, max: 50_000 }),
  fc.double(),
);

/** Mapa de taxas por área, com áreas de Luanda, uma área que não existe e taxas cruas. */
const taxasArb: fc.Arbitrary<unknown> = fc.oneof(
  {
    arbitrary: fc.dictionary(
      fc.constantFrom(...LUANDA_AREAS, "Maianga", "constructor"),
      fc.oneof(fc.integer({ min: 0, max: 20_000 }), valorCruArb),
    ),
    weight: 4,
  },
  { arbitrary: valorCruArb, weight: 1 },
);

/** `custom.delivery` tal como pode estar gravado — bem formado ou não. */
const entregaArb: fc.Arbitrary<unknown> = fc.oneof(
  {
    arbitrary: fc.record(
      {
        mode: fc.oneof(fc.constantFrom("single", "perArea"), valorCruArb),
        flatFee: fc.oneof(fc.integer({ min: 0, max: 10_000 }), valorCruArb),
        fees: taxasArb,
        freeAbove: fc.oneof(fc.integer({ min: 0, max: 100_000 }), valorCruArb),
      },
      { requiredKeys: [] },
    ),
    weight: 8,
  },
  { arbitrary: valorCruArb, weight: 1 },
);

/** Área pedida: uma de Luanda, uma que não existe, ou um valor cru. */
const areaArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom<unknown>(...LUANDA_AREAS),
  fc.constantFrom<unknown>("Maianga", " Talatona", "talatona", "", null, undefined, 7),
);

/** Subtotal: inteiros de Kz, decimais e os extremos. */
const subtotalArb: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: 0, max: 200_000 }),
  fc.double({ min: 0, max: 1e7, noNaN: true }),
);

/** Código de desconto como chega ao cálculo: o do checkout, ou uma linha crua. */
const codigoArb: fc.Arbitrary<unknown> = fc.oneof(
  { arbitrary: fc.record({ type: fc.constant("percent"), value: fc.integer({ min: 0, max: 100 }) }), weight: 3 },
  { arbitrary: fc.record({ type: fc.constant("fixed"), value: fc.integer({ min: 0, max: 60_000 }) }), weight: 3 },
  {
    arbitrary: fc.record(
      { type: fc.oneof(fc.constantFrom("percent", "fixed", "PERCENT", ""), valorCruArb), value: valorCruArb },
      { requiredKeys: [] },
    ),
    weight: 3,
  },
  { arbitrary: valorCruArb, weight: 1 },
);

/** Total sobre o qual o desconto incide (subtotal + entrega). */
const totalArb: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: 0, max: 5_000_000 }),
  fc.double({ min: 0, max: 1e7, noNaN: true }),
);

/** Item de Carrinho como `localStorage` o guarda (incluindo itens legados e manipulados). */
const itemArb: fc.Arbitrary<OrderRequestSource> = fc.record(
  {
    productId: fc.constantFrom("p-1", "p-2", " p-3 ", "8f0c1e2a-0000-4000-8000-000000000001"),
    variantKey: fc.oneof(
      fc.constantFrom<unknown>(undefined, "", null, 7, {}),
      fc.constantFrom<unknown>(variantKeyOf(["Azul", "M"]), variantKeyOf(["Azul", "L"]), variantKeyOf(["Verde"])),
    ),
    quantity: fc.integer({ min: 1, max: 30 }),
  },
  { requiredKeys: ["productId", "quantity"] },
);

/** Texto escrito num campo: vazio, com espaços a mais, quebras de linha, longo demais. */
const textoArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom("", "   ", "\n\t", "  Maria   Silva  ", "Rua\nDireita, 12", "nome@exemplo.ao", "123 456 789"),
  fc.string({ maxLength: 40 }),
  fc.string({ minLength: 100, maxLength: 400 }),
);

/** Telemóvel escrito: válido em várias formas, inválido, vazio, ou texto qualquer. */
const telemovelArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom("923456789", "+244 923 456 789", "244923456789", "923-456-789", "823456789", "12345", ""),
  fc.string({ maxLength: 25 }),
);

/** Dados de um comprador, campo a campo, todos opcionais. */
const compradorArb: fc.Arbitrary<BuyerDetails> = fc.record(
  {
    name: textoArb,
    phone: telemovelArb,
    email: textoArb,
    nif: textoArb,
    street: textoArb,
    number: textoArb,
    reference: textoArb,
    area: fc.oneof(fc.constantFrom<string | null>(...LUANDA_AREAS, null), textoArb),
  },
  { requiredKeys: [] },
);

/* ----------------------------- Preço da linha ------------------------------ */

describe("preço por Combinação — servidor e domínio dão o mesmo número", () => {
  it("effectivePriceOf = effectivePrice, para qualquer preço base, Combinação e modo", () => {
    assertProperty(
      fc.property(precoBaseArb, fc.option(combinationArb, { nil: null }), modoDePrecoArb, (base, comb, modo) => {
        expect(servidor.effectivePriceOf(base, comb, modo)).toBe(effectivePrice(base, comb, modo));
      }),
    );
  });

  it("os dois neutralizam da mesma maneira os valores que não são números finitos", () => {
    const bases: unknown[] = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "5000", null, undefined, -100, 0];
    const combinacoes: unknown[] = [
      null, {}, { price: Number.NaN }, { price: Number.POSITIVE_INFINITY }, { price: "100" }, { price: -0 },
      { price: -999_999 }, { price: Number.MAX_VALUE }, [], 7,
    ];
    const modos: unknown[] = ["substitui", "acresce", "ACRESCE", undefined, 3];
    for (const base of bases) {
      for (const comb of combinacoes) {
        for (const modo of modos) {
          const esperado = effectivePrice(base as number, comb as null, modo as "substitui");
          const obtido = servidor.effectivePriceOf(base, comb, modo);
          expect(Object.is(obtido, esperado), JSON.stringify({ base, comb, modo })).toBe(true);
        }
      }
    }
    // O transbordo de dois finitos fica finito nos dois lados.
    expect(servidor.effectivePriceOf(Number.MAX_VALUE, { price: Number.MAX_VALUE }, "acresce")).toBe(Number.MAX_VALUE);
  });

  it("variantLabelOfValues = variantLabelOf, com seleções completas, curtas, longas e com valores estranhos", () => {
    const selecaoArb = (v: ProductVariations): fc.Arbitrary<string[]> =>
      fc.array(fc.constantFrom(...v.axes.flatMap((a) => a.values), "", "  ", " Azul "), { maxLength: v.axes.length + 1 });
    assertProperty(
      fc.property(variationsArb.chain((v) => fc.tuple(fc.constant(v), selecaoArb(v))), ([v, valores]) => {
        expect(servidor.variantLabelOfValues(v.axes, valores)).toBe(variantLabelOf(v.axes, valores));
      }),
    );
  });

  it("variantLabelOfValues não lança e concorda com o domínio em eixos malformados", () => {
    const eixos: unknown[] = [
      [{ name: " Cor ", values: ["Azul"] }, { name: "", values: ["M"] }, null, 7, { values: ["L"] }],
      "Cor", null, undefined, [], [{ name: 7 }],
    ];
    const valores: unknown[] = [["Azul", "M", "L"], [" Azul ", null, 3], "Azul", null, []];
    for (const a of eixos) {
      for (const v of valores) {
        expect(servidor.variantLabelOfValues(a, v), JSON.stringify({ a, v }))
          .toBe(variantLabelOf(a as { name: string }[], v as string[]));
      }
    }
  });
});

describe("linePriceOf — o servidor cobra o que a página de produto mostrou", () => {
  const PID = "p-1";
  const de = (v: unknown): unknown => ({ productVariations: { [PID]: v } });

  /** Variação + uma seleção válida (um valor de cada eixo). */
  const comSelecaoArb = (base: fc.Arbitrary<ProductVariations>): fc.Arbitrary<[ProductVariations, string[]]> =>
    base.chain((v) => fc.tuple(fc.constant(v), fc.tuple(...v.axes.map((a) => fc.constantFrom(...a.values)))));

  for (const [nome, gerador] of [["coerentes", variationsArb], ["incoerentes", variationsIncoerentesArb]] as const) {
    it(`seleção válida (Variação ${nome}): mesmo preço e mesma etiqueta que o domínio`, () => {
      assertProperty(
        fc.property(comSelecaoArb(gerador), precoBaseArb, ([v, valores], base) => {
          const custom = de(v);
          const normalizadas = normalizeVariations(custom, PID);
          // Os eixos gerados são sempre utilizáveis: há Variação ativas.
          expect(normalizadas).not.toBeNull();
          const comb = findCombination(normalizadas!, valores);
          const obtido = servidor.linePriceOf(custom, PID, variantKeyOf(valores), base);
          expect(obtido.ok).toBe(true);
          expect(obtido.price).toBe(effectivePrice(base, comb, normalizadas!.priceMode));
          expect(obtido.label).toBe(variantLabelOf(normalizadas!.axes, valores));
          expect(obtido.variantKey).toBe(variantKeyOf(valores));
        }),
      );
    });
  }

  it("Combinação inválida (valor fora do eixo, valores a mais ou a menos, sem chave): o servidor recusa", () => {
    assertProperty(
      fc.property(comSelecaoArb(variationsArb), precoBaseArb, fc.constantFrom("fora", "mais", "menos", "vazia"), ([v, valores], base, avaria) => {
        let chave: unknown;
        if (avaria === "fora") chave = variantKeyOf(["Valor inexistente", ...valores.slice(1)]);
        else if (avaria === "mais") chave = variantKeyOf([...valores, "Extra"]);
        else if (avaria === "menos") chave = valores.length > 1 ? variantKeyOf(valores.slice(1)) : "";
        else chave = undefined;
        expect(servidor.linePriceOf(de(v), PID, chave, base)).toEqual({ ok: false });
      }),
    );
  });

  it("Produto sem Variação ativas: preço base, qualquer que seja a chave que o carrinho guardou", () => {
    const semVariacoes: unknown[] = [
      {}, null, { productVariations: { outro: { enabled: true, axes: [{ name: "Cor", values: ["Azul"] }] } } },
      de({ enabled: false, axes: [{ name: "Cor", values: ["Azul"] }] }),
      de({ enabled: "true", axes: [{ name: "Cor", values: ["Azul"] }] }),
      de({ enabled: true, axes: [] }),
    ];
    assertProperty(
      fc.property(fc.constantFrom(...semVariacoes), precoBaseArb, fc.constantFrom<unknown>(undefined, "", `Azul${SEPARADOR}M`, 7), (custom, base, chave) => {
        const obtido = servidor.linePriceOf(custom, PID, chave, base);
        expect(obtido.ok).toBe(true);
        expect(obtido.price).toBe(effectivePrice(base, null, "substitui"));
        expect(obtido.label).toBe("");
      }),
    );
  });
});

/* -------------------------------- Entregas --------------------------------- */

describe("entregas — a lista de áreas e a taxa são as mesmas nos dois lados", () => {
  it("LUANDA_AREAS: a mesma lista, pela mesma ordem, em api/_shared.js, web/lib/areas.ts e no domínio", () => {
    expect([...servidor.LUANDA_AREAS]).toEqual([...LUANDA_AREAS]);
    expect([...areasWeb.LUANDA_AREAS]).toEqual([...LUANDA_AREAS]);
  });

  it("web/lib/areas.ts é o domínio: as funções que o checkout importa são as testadas aqui", () => {
    expect(areasWeb.deliveredAreas).toBe(deliveredAreas);
    expect(areasWeb.deliveryFeeFor).toBe(deliveryFeeFor);
  });

  it("deliveredAreasOf = deliveredAreas, para qualquer configuração gravada", () => {
    assertProperty(
      fc.property(entregaArb, (entrega) => {
        expect(areasWeb.deliveredAreas(entrega)).toEqual(servidor.deliveredAreasOf(entrega));
      }),
    );
  });

  it("deliveryFeeOf = deliveryFeeFor, para qualquer configuração, área e subtotal", () => {
    assertProperty(
      fc.property(entregaArb, areaArb, subtotalArb, (entrega, area, subtotal) => {
        const navegador = areasWeb.deliveryFeeFor(entrega, area as string | null, subtotal);
        expect(navegador).toEqual(servidor.deliveryFeeOf(entrega, area, subtotal));
      }),
    );
  });

  it("exemplos que o Dono configura: taxa por área, taxa única, entrega grátis e área por servir", () => {
    const porArea = { mode: "perArea", fees: { Talatona: 2500, Kilamba: 1500 }, freeAbove: 50_000 };
    const unica = { mode: "single", flatFee: 2000 };
    const casos: { entrega: unknown; area: string | null; subtotal: number; esperado: unknown }[] = [
      { entrega: porArea, area: "Talatona", subtotal: 10_000, esperado: { ok: true, fee: 2500 } },
      { entrega: porArea, area: "Talatona", subtotal: 50_000, esperado: { ok: true, fee: 0 } },
      { entrega: porArea, area: "Viana", subtotal: 10_000, esperado: { ok: false } },
      { entrega: porArea, area: null, subtotal: 10_000, esperado: { ok: false } },
      { entrega: unica, area: "Zango", subtotal: 1, esperado: { ok: true, fee: 2000 } },
      { entrega: undefined, area: null, subtotal: 10_000, esperado: { ok: true, fee: 0 } },
      { entrega: { mode: "perArea", fees: {} }, area: null, subtotal: 10_000, esperado: { ok: true, fee: 0 } },
    ];
    for (const { entrega, area, subtotal, esperado } of casos) {
      const rotulo = JSON.stringify({ entrega, area, subtotal });
      expect(deliveryFeeFor(entrega, area, subtotal), rotulo).toEqual(esperado);
      expect(servidor.deliveryFeeOf(entrega, area, subtotal), rotulo).toEqual(esperado);
    }
  });
});

/* -------------------------------- Descontos -------------------------------- */

describe("descontos — o valor descontado é o mesmo nos dois lados", () => {
  it("discountAmountOf = discountAmount, para qualquer código e total", () => {
    assertProperty(
      fc.property(codigoArb, totalArb, (codigo, total) => {
        const navegador = discountAmount(codigo as DiscountRule, total);
        expect(Object.is(navegador, servidor.discountAmountOf(codigo, total)), JSON.stringify({ codigo, total })).toBe(true);
      }),
    );
  });

  it("nunca negativo, nunca acima do total, sempre em Kz inteiros", () => {
    // Valores finitos ou que nem são números. Um valor infinito numa
    // percentagem sobre um total 0 dá `NaN` nos dois lados (0 × ∞) — a paridade
    // acima cobre-o; aqui interessa o que um código gravado pelo painel produz.
    const codigoGravadoArb = fc.record(
      {
        type: fc.constantFrom<unknown>("percent", "fixed", "PERCENT", undefined),
        value: fc.oneof(fc.double({ min: -1e6, max: 1e6, noNaN: true }), fc.constantFrom<unknown>(null, "abc", "250", undefined)),
      },
      { requiredKeys: [] },
    );
    assertProperty(
      fc.property(codigoGravadoArb, fc.integer({ min: 0, max: 5_000_000 }), (codigo, total) => {
        const d = discountAmount(codigo as DiscountRule, total);
        expect(Number.isInteger(d)).toBe(true);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(total);
      }),
    );
  });

  it("exemplos: percentagem arredondada, fixo limitado ao total, valores malformados a zero", () => {
    expect(discountAmount({ type: "percent", value: 10 }, 12_345)).toBe(1235);
    expect(discountAmount({ type: "fixed", value: 5000 }, 3000)).toBe(3000);
    expect(discountAmount({ type: "fixed", value: -50 }, 3000)).toBe(0);
    expect(discountAmount({ type: "percent", value: Number.NaN }, 3000)).toBe(0);
    expect(discountAmount({ type: "fixed", value: "1000" }, 3000)).toBe(1000);
    expect(discountAmount(null, 3000)).toBe(0);
    // O servidor dá exatamente o mesmo nos mesmos casos.
    expect(servidor.discountAmountOf({ type: "percent", value: 10 }, 12_345)).toBe(1235);
    expect(servidor.discountAmountOf({ type: "percent", value: Number.NaN }, 3000)).toBe(0);
  });
});

/* ------------------------- O pedido que o checkout envia ------------------------- */

describe("linhas do pedido — o servidor recebe exatamente o que o navegador envia", () => {
  it("os limites são os mesmos: linhas por encomenda e unidades por linha", () => {
    expect(MAX_ORDER_LINES).toBe(pagamentos.MAX_ORDER_LINES);
    expect(MAX_LINE_QUANTITY).toBe(pagamentos.MAX_LINE_QUANTITY);
  });

  it("requestedLines(orderRequestLines(carrinho)) devolve as mesmas linhas, depois de passar por JSON", () => {
    assertProperty(
      fc.property(fc.array(itemArb, { maxLength: 12 }), (carrinho) => {
        const enviadas = orderRequestLines(carrinho);
        const recebidas = pagamentos.requestedLines(JSON.parse(JSON.stringify(enviadas)));
        expect(recebidas).toEqual(enviadas);
      }),
    );
  });

  it("orderRequestLines junta e filtra as linhas como o servidor as juntaria", () => {
    assertProperty(
      fc.property(fc.array(itemArb, { maxLength: 12 }), (carrinho) => {
        // O servidor a receber o carrinho cru, com os nomes de campo do pedido.
        const cru = carrinho.map((i) => ({ id: i.productId, variantKey: i.variantKey, quantity: i.quantity }));
        expect(orderRequestLines(carrinho)).toEqual(pagamentos.requestedLines(cru));
      }),
    );
  });

  it("nenhuma linha leva preço nem nome: só id, variantKey (quando há) e quantidade", () => {
    assertProperty(
      fc.property(fc.array(itemArb, { maxLength: 12 }), (carrinho) => {
        for (const linha of orderRequestLines(carrinho)) {
          for (const chave of Object.keys(linha)) expect(["id", "variantKey", "quantity"]).toContain(chave);
        }
      }),
    );
  });
});

describe("dados do cliente — cleanCustomer devolve o que buyerCustomer envia", () => {
  it("os campos têm os nomes, a limpeza e os limites que o servidor espera", () => {
    assertProperty(
      fc.property(compradorArb, fc.boolean(), (comprador, physical) => {
        const enviado = buyerCustomer(comprador, { physical });
        expect(pagamentos.cleanCustomer(JSON.parse(JSON.stringify(enviado)))).toEqual(enviado);
        for (const chave of Object.keys(enviado)) {
          expect(["name", "phone", "email", "nif", "address", "area"]).toContain(chave);
        }
        // Os limites do servidor (`text(valor, máx)` em `cleanCustomer`).
        expect((enviado.name ?? "").length).toBeLessThanOrEqual(BUYER_LIMITS.name);
        expect((enviado.phone ?? "").length).toBeLessThanOrEqual(20);
        expect((enviado.email ?? "").length).toBeLessThanOrEqual(160);
        expect((enviado.nif ?? "").length).toBeLessThanOrEqual(20);
        expect((enviado.address ?? "").length).toBeLessThanOrEqual(300);
        expect((enviado.area ?? "").length).toBeLessThanOrEqual(60);
        if (!physical) {
          expect(enviado).not.toHaveProperty("address");
          expect(enviado).not.toHaveProperty("area");
        }
      }),
    );
  });

  it("a área segue com a entrega grátis — é com ela que o servidor calcula a taxa", () => {
    const entrega = { mode: "perArea", fees: { Talatona: 2500 }, freeAbove: 10_000 };
    const enviado = buyerCustomer({ name: "Maria", phone: "923456789", street: "Rua Direita", area: "Talatona" }, { physical: true });
    expect(enviado.area).toBe("Talatona");
    expect(servidor.deliveryFeeOf(entrega, pagamentos.cleanCustomer(enviado)["area"], 20_000)).toEqual({ ok: true, fee: 0 });
    expect(servidor.deliveryFeeOf(entrega, pagamentos.cleanCustomer({ ...enviado, area: undefined })["area"], 20_000)).toEqual({ ok: false });
  });
});
