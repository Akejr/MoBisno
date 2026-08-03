/**
 * Geradores (arbitrários) partilhados pelos testes de propriedade da spec
 * `melhorias-loja-e-admin`.
 *
 * **Este ficheiro não contém testes.** O nome deliberadamente não tem `.test.`,
 * por isso fica fora do padrão de recolha do `vitest`
 * (`tests/**\/*.test.ts`) e não acrescenta ficheiros de teste à contagem. É,
 * ainda assim, verificado pelo `tsc` — o `tsconfig.json` inclui `tests/**`.
 *
 * ## Regra de arrumação
 *
 * É o **único** sítio onde vivem geradores partilhados: nenhum ficheiro de
 * teste define os seus. Quem precisar de um gerador novo acrescenta-o aqui.
 *
 * ## Restrição arquitetural
 *
 * `tests/` compila com `lib: ["ES2022"]`, **sem DOM**. Este ficheiro importa
 * apenas de `src/` (domínio puro) e nunca de `web/`, onde há módulos que
 * dependem de `document`, `window` ou `localStorage`.
 *
 * ## Consumidores
 *
 * | Gerador | Testes que o consomem |
 * |---|---|
 * | `customizationArb` | Propriedade 1 (`paymentVisibility.property`), Propriedade 3 (`storeCustom.property`) |
 * | `orderLineArb`, `orderLinesArb`, `orderExtrasArb` | Propriedade 4 (`cartMessage.property`) |
 *
 * ## Crescimento previsto
 *
 * Duas tarefas posteriores estendem este ficheiro, e é para isso que as secções
 * estão separadas por título:
 *
 *  - `adminSnapshotArb` (Fase C) — conjunto arbitrário de contas, Lojas,
 *    levantamentos, transações de serviço e contagens de Produtos, para a
 *    Propriedade 5;
 *  - `variationsArb` e `combinationArb` (Fase D) — Variação e Combinação de
 *    Produto, para a Propriedade 2.
 *
 * Nenhum dos dois é implementado aqui: ficam para as tarefas 12.4 e 14.4.
 */

import fc from "fast-check";
import type { OrderExtras, OrderLine } from "../src/services/cartMessage.js";

// ---------------------------------------------------------------------------
// Blocos de base: valores hostis
// ---------------------------------------------------------------------------

/**
 * Valores que não são strings, para pôr em campos onde o código espera texto
 * (`footer.phone`, `whatsapp.phone`, `productPerks[].icon`/`text`).
 *
 * Inclui tipos errados **a sério** — números, objetos, arrays, `null`,
 * `undefined`, booleanos — e não apenas strings vazias, porque é exatamente
 * isto que fazia a Pagina_De_Produto abrir em branco: `.replace` num objeto e
 * `.trim` num número. A Propriedade 3 exige que `resolveWaPhone` e
 * `normalizePerks` nunca lancem para nenhum destes.
 */
const valorNaoStringArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.integer({ min: -1_000, max: 1_000 }),
  fc.double({ min: -1_000, max: 1_000, noNaN: true }),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.array(fc.string({ maxLength: 6 }), { maxLength: 3 }),
  fc.record({ phone: fc.string({ maxLength: 6 }) }),
);

/**
 * Valores que não são booleanos, para pôr em campos que o código compara com
 * `=== true` (`payments.onlineEnabled`, `__demoPayments`).
 *
 * Os interessantes são os **truthy que não são `true`** (`"true"`, `1`, `{}`,
 * `[]`): é neles que uma comparação com coerção (`!!`) divergiria da comparação
 * estrita que a regra exige.
 */
const valorNaoBooleanoArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom<unknown[]>("true", "false", "", "1", 1, 0, -1, null, undefined),
  fc.array(fc.boolean(), { maxLength: 2 }),
  fc.record({ onlineEnabled: fc.boolean() }),
);

/** Números de telefone plausíveis, tal como uma Loja real os grava. */
const telefonePlausivelArb: fc.Arbitrary<string> = fc.constantFrom(
  "+244 923 000 111",
  "923000111",
  "+244912345678",
  "244 900 111 222",
);

/**
 * Valor de um campo de telefone: plausível, texto arbitrário, vazio, só
 * espaços (que `asText` considera usável, por decisão documentada) ou de tipo
 * errado.
 */
const campoTelefoneArb: fc.Arbitrary<unknown> = fc.oneof(
  telefonePlausivelArb,
  fc.string({ maxLength: 20 }),
  fc.constantFrom("", "   ", "\t"),
  valorNaoStringArb,
);

// ---------------------------------------------------------------------------
// Personalização (`stores.customization`)
// ---------------------------------------------------------------------------

/**
 * `payments`: ausente (por `requiredKeys: []` no registo de topo), objeto com
 * `onlineEnabled` a `true`, a `false` ou de tipo errado, ou o próprio
 * `payments` de tipo errado.
 */
const paymentsArb: fc.Arbitrary<unknown> = fc.oneof(
  {
    arbitrary: fc.record(
      {
        onlineEnabled: fc.oneof(
          // `true` com peso extra: é o único valor que ativa a regra, e sem
          // peso ficariam poucos casos ativos em 100 iterações.
          { arbitrary: fc.constant(true), weight: 3 },
          { arbitrary: fc.constant(false), weight: 2 },
          { arbitrary: valorNaoBooleanoArb, weight: 3 },
        ),
        multicaixa: fc.boolean(),
        reference: fc.boolean(),
      },
      { requiredKeys: [] },
    ),
    weight: 3,
  },
  { arbitrary: valorNaoStringArb, weight: 1 },
);

/**
 * `__demoPayments`: a marca de demonstração. Gera `true`, `false` e tipos
 * errados; a **ausência** vem de `requiredKeys: []`. Os três casos que a
 * Propriedade 1 precisa de distinguir.
 */
const demoPaymentsArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.boolean(),
  valorNaoBooleanoArb,
);

/**
 * `__basedOn` e `__template`: as duas marcas que a regra de pagamento **deixou
 * de ler**. Estão aqui precisamente para o teste confirmar que acrescentá-las
 * ou removê-las não muda nada. `__basedOn` é copiado para a Loja do cliente ao
 * aplicar um Modelo_De_Loja — é essa a origem da avaria que o R3 corrige.
 */
const marcaDeModeloArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom("vermelho-moderno", "neonlab", "foodmart", "lumiere"),
  fc.boolean(),
  valorNaoStringArb,
);

/** Uma entrada de `productPerks`: bem formada ou malformada de várias maneiras. */
const perkEntryArb: fc.Arbitrary<unknown> = fc.oneof(
  // Bem formada.
  fc.record({
    icon: fc.constantFrom("local_shipping", "verified", "payments", "lock"),
    text: fc.string({ minLength: 1, maxLength: 40 }),
  }),
  // Falta um dos dois campos, ou os campos têm tipo errado.
  fc.record(
    {
      icon: fc.oneof(fc.string({ maxLength: 20 }), valorNaoStringArb),
      text: fc.oneof(fc.string({ maxLength: 40 }), valorNaoStringArb),
    },
    { requiredKeys: [] },
  ),
  // Texto que só tem espaços em branco: aceite pelo `asText`, rejeitado pelo
  // filtro de `normalizePerks`.
  fc.record({ icon: fc.constant("verified"), text: fc.constantFrom(" ", "   ", "\n") }),
  // A entrada nem é um objeto.
  valorNaoStringArb,
);

/** `productPerks`: lista (possivelmente malformada) ou nem lista é. */
const productPerksArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.array(perkEntryArb, { maxLength: 5 }),
  valorNaoStringArb,
);

/** `footer`: o que interessa é `phone`; os restantes campos são ruído realista. */
const footerArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.record(
    {
      phone: campoTelefoneArb,
      email: fc.oneof(fc.string({ maxLength: 20 }), valorNaoStringArb),
      extraTitle: fc.string({ maxLength: 20 }),
      extraText: fc.string({ maxLength: 40 }),
    },
    { requiredKeys: [] },
  ),
  valorNaoStringArb,
);

/** `whatsapp`: primeiro passo da cascata de `resolveWaPhone`. */
const whatsappArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.record({ phone: campoTelefoneArb }, { requiredKeys: [] }),
  valorNaoStringArb,
);

/**
 * Personalização arbitrária de uma Loja.
 *
 * Todos os campos são opcionais (`requiredKeys: []`), pelo que o gerador cobre
 * desde `{}` até uma Personalização com todos os campos preenchidos com
 * valores hostis. Casos cobertos, campo a campo:
 *
 *  - `payments` ausente, de tipo errado, ou com `onlineEnabled` a `true`, a
 *    `false` ou de tipo errado (`"true"`, `1`, `{}`, `[]`, `null`, `undefined`);
 *  - `__demoPayments` presente (`true`/`false`), ausente e de tipo errado;
 *  - `__basedOn` e `__template` presentes e ausentes — a regra de pagamento
 *    tem de ser insensível a ambos;
 *  - `footer.phone` e `whatsapp.phone` plausíveis, vazios, só com espaços e de
 *    tipo errado (número, objeto, array, `null`, `undefined`, booleano);
 *  - `productPerks` bem formada, malformada (entradas sem `icon`/`text`, com
 *    tipos errados, ou que nem são objetos) e não-lista.
 *
 * Gera **sempre um objeto**. Os valores crus fora do domínio de um objeto
 * (`null`, `undefined`, número, string, array) são acrescentados pelo teste da
 * Propriedade 3, que é o único que os exige.
 */
export const customizationArb: fc.Arbitrary<Record<string, unknown>> = fc
  .record(
    {
      payments: paymentsArb,
      __demoPayments: demoPaymentsArb,
      __basedOn: marcaDeModeloArb,
      __template: marcaDeModeloArb,
      __v: fc.integer({ min: 0, max: 9 }),
      footer: footerArb,
      whatsapp: whatsappArb,
      productPerks: productPerksArb,
      // Ruído: campo que nenhum dos módulos puros lê. Está aqui para que os
      // testes não passem por acidente ao assumir uma Personalização mínima.
      storeName: fc.string({ maxLength: 20 }),
    },
    { requiredKeys: [] },
  )
  .map((custom) => ({ ...custom }) as Record<string, unknown>);

// ---------------------------------------------------------------------------
// Linhas de encomenda (`src/services/cartMessage.ts`)
// ---------------------------------------------------------------------------

/** Nomes de Produto plausíveis, para as mensagens geradas parecerem reais. */
const nomeDeProdutoArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(
    "Camisola oficial",
    "Boné",
    "Ténis de corrida",
    "Calções de treino",
    "Meias (par)",
  ),
  // Texto arbitrário não vazio: apanha acentos, símbolos e pontuação que
  // poderiam colidir com os separadores da mensagem.
  fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim() !== ""),
);

/**
 * Etiqueta de Combinação. Cobre os dois lados de R3.11: etiquetas legíveis, e
 * valores que `buildCartWhatsAppMessage` ignora (vazio, só espaços).
 */
const variantLabelArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(
    "Cor: Azul · Tamanho: M",
    "Cor: Preto · Tamanho: L",
    "Sabor: Manga",
  ),
  fc.constantFrom("", "   "),
  fc.string({ maxLength: 25 }),
);

/**
 * Linha de encomenda arbitrária.
 *
 * `quantity` é sempre ≥ 1 (uma linha de Carrinho com quantidade 0 não existe) e
 * `price` é um inteiro não negativo — os preços em Kz são inteiros, e usar
 * inteiros mantém o valor da linha (`price * quantity`) exatamente
 * representável, para o teste poder procurar o texto formatado na mensagem.
 *
 * `variantLabel` é gerado **com e sem** valor: o campo existe desde a Fase A,
 * mas só a Fase D o preenche na aplicação, e a Propriedade 4 cobre os dois
 * casos.
 */
export const orderLineArb: fc.Arbitrary<OrderLine> = fc.record(
  {
    name: nomeDeProdutoArb,
    quantity: fc.integer({ min: 1, max: 20 }),
    price: fc.integer({ min: 0, max: 5_000_000 }),
    variantLabel: variantLabelArb,
  },
  { requiredKeys: ["name", "quantity", "price"] },
);

/**
 * Carrinho **não vazio**: entre 1 e 8 linhas de encomenda.
 *
 * O limite superior é pequeno de propósito — a Propriedade 4 verifica cada
 * linha da mensagem, e carrinhos maiores só tornam os contra-exemplos ilegíveis
 * sem cobrir nada de novo. Linhas repetidas (mesmo nome, quantidade e preço)
 * são possíveis e desejáveis: o Carrinho real permite-as.
 */
export const orderLinesArb: fc.Arbitrary<OrderLine[]> = fc.array(orderLineArb, {
  minLength: 1,
  maxLength: 8,
});

/** Áreas de entrega plausíveis, como uma Loja de Luanda as configura. */
const areaDeEntregaArb: fc.Arbitrary<string> = fc.constantFrom(
  "Talatona",
  "Kilamba",
  "Maianga",
  "Viana",
);

/** Códigos de desconto plausíveis. */
const codigoDeDescontoArb: fc.Arbitrary<string> = fc.constantFrom(
  "VERAO10",
  "NATAL25",
  "BEMVINDO",
);

/**
 * Acrescentos da encomenda, **incluindo a ausência de acrescentos**
 * (`undefined`, o caso da Gaveta_Do_Carrinho).
 *
 * `delivery.fee` inclui 0 (entrega grátis) e `discount.amount` chega a valores
 * altos de propósito: é o que força o limite inferior do total a 0 a ser
 * exercitado, em vez de ficar por testar.
 */
export const orderExtrasArb: fc.Arbitrary<OrderExtras | undefined> = fc.option(
  fc.record(
    {
      delivery: fc.record({
        area: areaDeEntregaArb,
        fee: fc.integer({ min: 0, max: 50_000 }),
      }),
      discount: fc.record({
        code: codigoDeDescontoArb,
        amount: fc.integer({ min: 0, max: 20_000_000 }),
      }),
    },
    { requiredKeys: [] },
  ),
  { nil: undefined },
);
