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
 * | `adminSnapshotArb`, `lojaModeloArb` | Propriedade 5 (`adminMetrics.property`) |
 * | `combinationArb`, `precoBaseArb`, `modoDePrecoArb` | Propriedade 2 (`variations.property`) |
 * | `variationsArb`, `variationsIncoerentesArb` | exemplos das Variação (`variations`) |
 */

import fc from "fast-check";
import type {
  ProductCombination,
  ProductVariationAxis,
  ProductVariations,
  VariationPriceMode,
} from "../src/models/domain.js";
import type { OrderExtras, OrderLine } from "../src/services/cartMessage.js";
import {
  ATTENTION_WINDOW_DAYS,
  MONTHS_IN_EVOLUTION,
  type AccountLike,
  type AdminMetricsInput,
  type ServiceTxLike,
  type StoreLike,
  type WithdrawalLike,
} from "../src/services/adminMetrics.js";

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

// ---------------------------------------------------------------------------
// Instantâneo do Painel_Admin (`src/services/adminMetrics.ts`)
// ---------------------------------------------------------------------------

const HORA_MS = 3_600_000;
const DIA_MS = 86_400_000;

/**
 * Instantâneo completo do Painel_Admin, tal como `businessHealth`,
 * `monthlyEvolution` e `attentionLists` o recebem.
 *
 * Estreita `AdminMetricsInput` em dois pontos, e ambos são deliberados:
 *
 *  - **`now` é obrigatório e é um número.** As três funções dependem do tempo
 *    (mês corrente, janela de {@link ATTENTION_WINDOW_DAYS} dias, evolução de
 *    {@link MONTHS_IN_EVOLUTION} meses). Um instantâneo sem momento de
 *    referência próprio faria a Propriedade 5 depender do calendário do dia em
 *    que corre — passaria hoje e falharia sozinha num 1 de janeiro;
 *  - **as cinco coleções estão sempre presentes.** A ausência delas é
 *    totalidade, coberta pelos exemplos da tarefa 12.6; o que a propriedade
 *    precisa é de dados a sério.
 */
export interface AdminSnapshot extends AdminMetricsInput {
  readonly now: number;
  readonly accounts: readonly AccountLike[];
  readonly stores: readonly StoreLike[];
  readonly withdrawals: readonly WithdrawalLike[];
  readonly transactions: readonly ServiceTxLike[];
  readonly productCounts: ReadonlyMap<string, number>;
}

/**
 * Momentos de referência fixos, escolhidos pelas fronteiras que o cálculo de
 * meses em UTC atravessa: meio de janeiro (a evolução de 6 meses passa para o
 * ano anterior), 29 de fevereiro de ano bissexto, último instante de um mês de
 * 31 dias, primeiro instante de um mês, e fim de ano.
 *
 * São constantes e não `fc.date()`: com uma data arbitrária, o gerador teria de
 * recalcular as janelas a cada amostra sem ganhar cobertura, e os
 * contra-exemplos deixariam de ser legíveis.
 */
const MOMENTOS_DE_REFERENCIA: readonly number[] = [
  Date.UTC(2024, 0, 15, 10, 0, 0),
  Date.UTC(2024, 1, 29, 23, 30, 0),
  Date.UTC(2024, 2, 31, 23, 59, 30),
  Date.UTC(2024, 6, 1, 0, 0, 10),
  Date.UTC(2024, 11, 31, 22, 0, 0),
  Date.UTC(2025, 5, 10, 12, 0, 0),
];

/** Data ISO, a forma em que as colunas `timestamptz` chegam do Supabase. */
function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Instante dentro do mês que fica `mesesAtras` meses antes do de referência,
 * em UTC — o mesmo fuso em que `adminMetrics` calcula as chaves de mês.
 *
 * No mês corrente o resultado é limitado ao momento de referência: uma data de
 * pagamento no futuro existiria em teoria, mas não acrescenta caso nenhum e
 * tornaria as amostras implausíveis.
 */
function instanteNoMes(nowMs: number, mesesAtras: number, dia: number, hora: number): number {
  const ref = new Date(nowMs);
  const ms = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - mesesAtras, 1 + dia, hora);
  return mesesAtras === 0 ? Math.min(ms, nowMs) : ms;
}

/**
 * Cadeias que não são datas utilizáveis. `Date.parse` devolve `NaN` para todas,
 * e o módulo tem de as tratar como data ausente em vez de lançar.
 */
const dataInvalidaArb: fc.Arbitrary<string> = fc.constantFrom(
  "",
  "   ",
  "não é data",
  "0000-13-45",
  "31/02/2024",
  "ontem",
  "NaN",
);

/** Data ISO num mês entre `minMeses` e `maxMeses` antes do de referência. */
function dataDeMesArb(nowMs: number, minMeses: number, maxMeses: number): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.integer({ min: minMeses, max: maxMeses }),
      fc.integer({ min: 0, max: 27 }),
      fc.integer({ min: 0, max: 23 }),
    )
    .map(([meses, dia, hora]) => iso(instanteNoMes(nowMs, meses, dia, hora)));
}

/** Data ISO anterior à janela da evolução mensal: entra em nenhum dos 6 meses. */
function dataAntigaArb(nowMs: number): fc.Arbitrary<string> {
  return dataDeMesArb(nowMs, MONTHS_IN_EVOLUTION, MONTHS_IN_EVOLUTION + 18);
}

/**
 * Data de criação de uma conta ou de uma Loja: espalhada pelos meses da
 * evolução (para a série mensal de contas ter valores diferentes de zero),
 * mais antiga do que a janela, ausente e inválida.
 */
function createdAtArb(nowMs: number): fc.Arbitrary<string | null> {
  return fc.oneof(
    { arbitrary: dataDeMesArb(nowMs, 0, MONTHS_IN_EVOLUTION - 1), weight: 5 },
    { arbitrary: dataAntigaArb(nowMs), weight: 2 },
    { arbitrary: fc.constant(null), weight: 1 },
    { arbitrary: dataInvalidaArb, weight: 1 },
  );
}

/**
 * Data de pagamento de uma transação de serviço, correlacionada com o momento
 * de referência:
 *
 *  - **no mês corrente** (peso maior) — é a única categoria que entra na receita
 *    do mês, a primeira das seis métricas;
 *  - nos 5 meses anteriores — entra na evolução mensal, não na receita do mês;
 *  - mais antiga do que a janela — não entra em nenhuma das duas;
 *  - ausente e inválida — transação `paid` sem data utilizável, que o módulo
 *    ignora sem lançar.
 */
function paidAtArb(nowMs: number): fc.Arbitrary<string | null> {
  return fc.oneof(
    { arbitrary: dataDeMesArb(nowMs, 0, 0), weight: 5 },
    { arbitrary: dataDeMesArb(nowMs, 1, MONTHS_IN_EVOLUTION - 1), weight: 3 },
    { arbitrary: dataAntigaArb(nowMs), weight: 1 },
    { arbitrary: fc.constant(null), weight: 1 },
    { arbitrary: dataInvalidaArb, weight: 1 },
  );
}

/**
 * Montante gravado numa transação ou num levantamento. Inclui `0`, valores
 * positivos e **tipos errados** — `null`, `undefined`, texto numérico, texto que
 * não é número, negativos, `NaN` e `Infinity`. `asAmount` é total e limita tudo
 * isto a zero por baixo; sem estes valores, essa guarda ficava por exercitar.
 */
const montanteArb: fc.Arbitrary<number | string | null | undefined> = fc.oneof(
  { arbitrary: fc.integer({ min: 1, max: 5_000_000 }), weight: 5 },
  { arbitrary: fc.constant(0), weight: 2 },
  {
    arbitrary: fc.constantFrom<(number | string | null | undefined)[]>(
      null,
      undefined,
      "11000",
      "abc",
      "",
      -5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ),
    weight: 3,
  },
);

/** Emails de conta: plausíveis, ausentes e vazios (o `textOr` cai no substituto). */
const emailDeContaArb: fc.Arbitrary<string | null> = fc.oneof(
  { arbitrary: fc.constantFrom("ana@example.com", "bruno@example.com", "loja@example.co.ao"), weight: 5 },
  { arbitrary: fc.constantFrom<(string | null)[]>(null, "", "   "), weight: 2 },
);

/** Nomes de conta e de Loja plausíveis, ausentes e vazios. */
const nomePlausivelArb: fc.Arbitrary<string | null> = fc.oneof(
  { arbitrary: fc.constantFrom("Ana Silva", "Bruno Costa", "Ekolo Sports", "Boutique Lumière"), weight: 5 },
  { arbitrary: fc.constantFrom<(string | null)[]>(null, "", "  "), weight: 2 },
);

/** A parte da conta que decide plano, teste e exclusão do R7.8. */
type PerfilDeConta = Pick<AccountLike, "isAdmin" | "plan" | "planExpiresAt" | "nextPlan" | "trialEndsAt">;

/**
 * Perfis de conta, um por estado que `resolveBilling` distingue, para que as
 * métricas de conta não saiam todas a zero:
 *
 *  - **Administrador** — a exclusão do R7.8. Sem contas destas não se testa
 *    nada: é a fração de amostras em que a Propriedade 5 tem trabalho a fazer;
 *  - **assinatura em vigor** e **atribuição permanente** — as duas formas de
 *    contar em «assinaturas ativas»;
 *  - **teste a expirar** — `trialEndsAt` dentro da janela de
 *    {@link ATTENTION_WINDOW_DAYS} dias; alimenta a métrica e a lista, que
 *    partilham critério;
 *  - **teste longo** — fora da janela: conta como teste, não como aviso;
 *  - **expirada** e **básica** — `suspended`, que é a sexta métrica;
 *  - **dados sujos** — plano que não existe no catálogo e datas ilegíveis.
 */
function perfilDeContaArb(nowMs: number): fc.Arbitrary<PerfilDeConta> {
  const futuro = (dias: number): string => iso(nowMs + dias * DIA_MS);
  const passado = (dias: number): string => iso(nowMs - dias * DIA_MS);
  const semAdmin = fc.constantFrom<(boolean | undefined)[]>(false, undefined);

  return fc.oneof(
    {
      // Administrador: excluído de todas as agregações (R7.8).
      arbitrary: fc.record<PerfilDeConta>({
        isAdmin: fc.constant(true),
        plan: fc.constantFrom("empresarial", "basico"),
        planExpiresAt: fc.constant(null),
        nextPlan: fc.constant(null),
        trialEndsAt: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 5 }).map(futuro)),
      }),
      weight: 4,
    },
    {
      // Assinatura paga em vigor (plano temporizado com data no futuro).
      arbitrary: fc.record<PerfilDeConta>({
        isAdmin: semAdmin,
        plan: fc.constantFrom("profissional", "empresarial"),
        planExpiresAt: fc.integer({ min: 1, max: 60 }).map(futuro),
        nextPlan: fc.constantFrom<(string | null)[]>(null, "empresarial", "profissional"),
        trialEndsAt: fc.constant(null),
      }),
      weight: 4,
    },
    {
      // Atribuição permanente: plano pago sem data de expiração.
      arbitrary: fc.record<PerfilDeConta>({
        isAdmin: semAdmin,
        plan: fc.constantFrom("profissional", "empresarial"),
        planExpiresAt: fc.constant(null),
        nextPlan: fc.constant(null),
        trialEndsAt: fc.constant(null),
      }),
      weight: 2,
    },
    {
      // Teste grátis a terminar dentro da janela de aviso.
      arbitrary: fc.record<PerfilDeConta>({
        isAdmin: semAdmin,
        plan: fc.constantFrom("basico", "profissional"),
        planExpiresAt: fc.constant(null),
        nextPlan: fc.constant(null),
        trialEndsAt: fc
          .integer({ min: 1, max: ATTENTION_WINDOW_DAYS * 24 })
          .map((horas) => iso(nowMs + horas * HORA_MS)),
      }),
      weight: 4,
    },
    {
      // Teste grátis com folga: conta como teste, não como aviso.
      arbitrary: fc.record<PerfilDeConta>({
        isAdmin: semAdmin,
        plan: fc.constant("basico"),
        planExpiresAt: fc.constant(null),
        nextPlan: fc.constant(null),
        trialEndsAt: fc.integer({ min: ATTENTION_WINDOW_DAYS + 1, max: 60 }).map(futuro),
      }),
      weight: 2,
    },
    {
      // Assinatura expirada, sem teste ativo: Loja suspensa.
      arbitrary: fc.record<PerfilDeConta>({
        isAdmin: semAdmin,
        plan: fc.constantFrom("profissional", "empresarial"),
        planExpiresAt: fc.integer({ min: 1, max: 120 }).map(passado),
        nextPlan: fc.constant(null),
        trialEndsAt: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 120 }).map(passado)),
      }),
      weight: 3,
    },
    {
      // Conta básica sem teste: também suspensa (sem acesso ativo).
      arbitrary: fc.record<PerfilDeConta>({
        isAdmin: semAdmin,
        plan: fc.constant("basico"),
        planExpiresAt: fc.constant(null),
        nextPlan: fc.constant(null),
        trialEndsAt: fc.constant(null),
      }),
      weight: 2,
    },
    {
      // Dados sujos: plano fora do catálogo e datas ilegíveis.
      arbitrary: fc.record<PerfilDeConta>({
        isAdmin: semAdmin,
        plan: fc.constantFrom<(string | null)[]>("premium", "", null, "PROFISSIONAL"),
        planExpiresAt: fc.oneof(dataInvalidaArb, fc.constant(null)),
        nextPlan: fc.constantFrom<(string | null)[]>(null, "premium"),
        trialEndsAt: fc.oneof(dataInvalidaArb, fc.constant(null)),
      }),
      weight: 2,
    },
  );
}

/**
 * Contas da Plataforma, com identificadores `conta-<i>` atribuídos por índice —
 * é o que garante identificadores únicos sem recorrer a filtros de rejeição.
 *
 * Nunca vazio: um instantâneo sem contas satisfaz a Propriedade 5
 * trivialmente e não prova nada.
 */
function contasArb(nowMs: number): fc.Arbitrary<AccountLike[]> {
  const contaArb = fc
    .tuple(
      perfilDeContaArb(nowMs),
      fc.record({
        email: emailDeContaArb,
        name: nomePlausivelArb,
        createdAt: createdAtArb(nowMs),
        storeCount: fc.integer({ min: 0, max: 5 }),
      }),
    )
    .map(([perfil, base]) => ({ ...base, ...perfil }));

  return fc
    .array(contaArb, { minLength: 1, maxLength: 7 })
    .map((contas) => contas.map((conta, i) => ({ id: `conta-${i}`, ...conta })));
}

/**
 * Personalização de uma **Loja_Modelo**: `__template` presente em todas as
 * formas plausíveis que o Semeador_De_Modelos e a base de dados produzem —
 * objeto com `id`/`name`, `true`, o identificador do modelo em texto, e um
 * número. Todas fazem `isLojaModelo` devolver `true`.
 */
const customizationDeLojaModeloArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.record({
    __template: fc.record({
      id: fc.constantFrom("lumiere", "vermelho-moderno"),
      name: fc.constantFrom("Lumière Chic", "Ekolo Sports"),
    }),
    __v: fc.integer({ min: 1, max: 9 }),
    __demoPayments: fc.constant(true),
  }),
  fc.record({ __template: fc.constant(true) }),
  fc.record({ __template: fc.constantFrom("lumiere", "foodmart") }),
  fc.record({ __template: fc.integer({ min: 1, max: 3 }) }),
);

/**
 * Personalização de uma Loja de cliente. O caso dominante é **ausente**, que é
 * o que `listStores()` devolve; os restantes são os que não podem ser
 * confundidos com uma Loja_Modelo: `{}`, `__basedOn` (copiado ao aplicar um
 * Modelo_De_Loja), `__template` a `false`/`null` (marca desligada) e valores que
 * nem são objetos.
 */
const customizationDeLojaNormalArb: fc.Arbitrary<unknown> = fc.oneof(
  { arbitrary: fc.constant(undefined), weight: 6 },
  { arbitrary: fc.constant({}), weight: 1 },
  { arbitrary: fc.record({ __basedOn: fc.constantFrom("vermelho-moderno", "lumiere") }), weight: 2 },
  { arbitrary: fc.record({ __template: fc.constantFrom<(boolean | null)[]>(false, null) }), weight: 1 },
  { arbitrary: fc.constantFrom<unknown[]>(null, 0, "texto", [1, 2]), weight: 1 },
);

/** Estado da Loja: `"Publicada"` (a métrica), outros estados, ausente e vazio. */
const estadoDeLojaArb: fc.Arbitrary<string | null | undefined> = fc.oneof(
  { arbitrary: fc.constant("Publicada"), weight: 4 },
  { arbitrary: fc.constantFrom("Rascunho", "Pausada", "Suspensa"), weight: 3 },
  { arbitrary: fc.constantFrom<(string | null | undefined)[]>(null, undefined, "", "   ", "publicada"), weight: 1 },
);

/**
 * Lojas do instantâneo, com identificadores `loja-<i>`.
 *
 * Três correlações deliberadas com as contas já geradas:
 *
 *  - `ownerId` aponta na maior parte dos casos para uma conta que **existe** no
 *    instantâneo, senão nenhuma métrica que dependa de `resolveBilling` (Lojas
 *    suspensas) teria valor diferente de zero;
 *  - uma fatia aponta de propósito para uma **conta de Administrador**, quando o
 *    instantâneo tem alguma: é a exclusão do R7.8 aplicada à Loja, e sem estes
 *    casos não se testa nada;
 *  - o resto aponta para nada (`conta-inexistente`) ou não tem dono, porque
 *    `listAccounts()` pode não cobrir todos os donos.
 *
 * Cerca de três em cada dez Lojas são **Loja_Modelo**, o outro lado da exclusão.
 */
function lojasArb(nowMs: number, contas: readonly AccountLike[]): fc.Arbitrary<StoreLike[]> {
  const idsDeContas = contas.map((conta) => conta.id);
  const idsDeAdmin = contas.filter((conta) => conta.isAdmin === true).map((conta) => conta.id);
  const donoAdminArb: fc.Arbitrary<string> =
    idsDeAdmin.length > 0 ? fc.constantFrom(...idsDeAdmin) : fc.constant("conta-inexistente");

  const ownerIdArb: fc.Arbitrary<string | null | undefined> = fc.oneof(
    { arbitrary: fc.constantFrom(...idsDeContas), weight: 6 },
    { arbitrary: donoAdminArb, weight: 3 },
    { arbitrary: fc.constant("conta-inexistente"), weight: 1 },
    { arbitrary: fc.constantFrom<(string | null | undefined)[]>(null, undefined), weight: 1 },
  );

  const lojaArb = fc.record({
    name: nomePlausivelArb,
    ownerId: ownerIdArb,
    ownerEmail: emailDeContaArb,
    ownerName: nomePlausivelArb,
    state: estadoDeLojaArb,
    identifier: fc.constantFrom("ekolo", "lumiere-chic", "loja-teste"),
    createdAt: createdAtArb(nowMs),
    customization: fc.oneof(
      { arbitrary: customizationDeLojaModeloArb, weight: 3 },
      { arbitrary: customizationDeLojaNormalArb, weight: 7 },
    ),
  });

  return fc
    .array(lojaArb, { minLength: 1, maxLength: 8 })
    .map((lojas) => lojas.map((loja, i) => ({ id: `loja-${i}`, ...loja })));
}

/**
 * Levantamentos, com identificadores `lev-<i>`.
 *
 * `storeId` aponta sobretudo para Lojas que **existem** no instantâneo — sem
 * isso a lista de levantamentos por aprovar sairia sempre vazia, porque o
 * módulo só conta levantamentos de uma Loja elegível. Uma fatia aponta para
 * nada, para exercitar essa exclusão.
 *
 * O estado `requested` tem peso extra: é o único que entra na lista. As
 * variantes `"REQUESTED"` e `"  requested  "` estão lá porque `asStatus`
 * normaliza maiúsculas e espaços, e essa normalização tem de ser exercitada.
 */
function levantamentosArb(nowMs: number, lojas: readonly StoreLike[]): fc.Arbitrary<WithdrawalLike[]> {
  const idsDeLojas = lojas.map((loja) => loja.id);

  const levantamentoArb = fc.record({
    storeId: fc.oneof(
      { arbitrary: fc.constantFrom(...idsDeLojas), weight: 6 },
      { arbitrary: fc.constant("loja-inexistente"), weight: 1 },
      { arbitrary: fc.constantFrom<(string | null | undefined)[]>(null, undefined), weight: 1 },
    ),
    storeName: nomePlausivelArb,
    ownerEmail: emailDeContaArb,
    amount: montanteArb,
    status: fc.oneof(
      { arbitrary: fc.constant("requested"), weight: 4 },
      { arbitrary: fc.constantFrom("approved", "paid", "rejected"), weight: 3 },
      { arbitrary: fc.constantFrom("REQUESTED", "  requested  "), weight: 1 },
      { arbitrary: fc.constantFrom<(string | null | undefined)[]>(null, undefined, ""), weight: 1 },
    ),
    createdAt: createdAtArb(nowMs),
  });

  return fc
    .array(levantamentoArb, { maxLength: 6 })
    .map((levs) => levs.map((lev, i) => ({ id: `lev-${i}`, ...lev })));
}

/**
 * Transações de serviço, com identificadores `tx-<i>`.
 *
 * Correlações com as contas: `ownerId` aponta sobretudo para contas que
 * existem, uma fatia para uma **conta de Administrador** (excluída pelo R7.8) e
 * o resto para nada.
 *
 * `status` privilegia `paid`, o único que gera receita, e cobre os três estados
 * por resolver (`open`, `failed`, `expired`) mais `cancelled`. `service`
 * privilegia `plan`, o único que conta para a conversão de teste para pago;
 * `"PLAN"` e `" plan "` estão lá porque essa comparação **não** normaliza, ao
 * contrário da de `status`.
 */
function transacoesArb(nowMs: number, contas: readonly AccountLike[]): fc.Arbitrary<ServiceTxLike[]> {
  const idsDeContas = contas.map((conta) => conta.id);
  const idsDeAdmin = contas.filter((conta) => conta.isAdmin === true).map((conta) => conta.id);
  const donoAdminArb: fc.Arbitrary<string> =
    idsDeAdmin.length > 0 ? fc.constantFrom(...idsDeAdmin) : fc.constant("conta-inexistente");

  const transacaoArb = fc.record({
    service: fc.oneof(
      { arbitrary: fc.constant("plan"), weight: 5 },
      { arbitrary: fc.constantFrom("sms", "logo"), weight: 3 },
      { arbitrary: fc.constantFrom<(string | null | undefined)[]>("PLAN", " plan ", null, undefined), weight: 1 },
    ),
    description: fc.constantFrom("Plano Profissional", "Créditos de SMS", "Logótipo por IA", ""),
    ownerId: fc.oneof(
      { arbitrary: fc.constantFrom(...idsDeContas), weight: 6 },
      { arbitrary: donoAdminArb, weight: 3 },
      { arbitrary: fc.constant("conta-inexistente"), weight: 1 },
      { arbitrary: fc.constantFrom<(string | null | undefined)[]>(null, undefined), weight: 1 },
    ),
    ownerEmail: emailDeContaArb,
    ownerName: nomePlausivelArb,
    storeName: nomePlausivelArb,
    amount: montanteArb,
    method: fc.constantFrom("multicaixa", "referencia", "manual"),
    status: fc.oneof(
      { arbitrary: fc.constant("paid"), weight: 5 },
      { arbitrary: fc.constantFrom("open", "failed", "expired"), weight: 4 },
      { arbitrary: fc.constant("cancelled"), weight: 1 },
      { arbitrary: fc.constantFrom<(string | null | undefined)[]>(null, undefined, "PAID"), weight: 1 },
    ),
    createdAt: createdAtArb(nowMs),
    paidAt: paidAtArb(nowMs),
  });

  return fc
    .array(transacaoArb, { maxLength: 8 })
    .map((txs) => txs.map((tx, i) => ({ id: `tx-${i}`, ...tx })));
}

/**
 * Contagens de Produtos por Loja, num `Map` **real** — o tipo é
 * `ReadonlyMap<string, number>` e o módulo chama `counts.get(...)`.
 *
 * Cada Loja do instantâneo cai numa de quatro categorias: ausente do `Map`,
 * zero, contagem positiva, ou contagem inválida (negativa, fracionária, `NaN`).
 * Ausente e zero são o mesmo para a lista «Lojas sem Produtos», e é isso que se
 * quer confirmar. Metade das amostras leva ainda uma entrada órfã, de uma Loja
 * que não está no instantâneo.
 */
function contagensDeProdutosArb(lojas: readonly StoreLike[]): fc.Arbitrary<ReadonlyMap<string, number>> {
  const total = lojas.length;
  const contagemArb: fc.Arbitrary<number | null> = fc.oneof(
    { arbitrary: fc.constant(null), weight: 3 },
    { arbitrary: fc.constant(0), weight: 3 },
    { arbitrary: fc.integer({ min: 1, max: 200 }), weight: 4 },
    { arbitrary: fc.constantFrom(-2, 0.4, 3.7, Number.NaN), weight: 1 },
  );

  return fc
    .tuple(fc.array(contagemArb, { minLength: total, maxLength: total }), fc.boolean())
    .map(([contagens, comOrfa]) => {
      const mapa = new Map<string, number>();
      contagens.forEach((contagem, i) => {
        const loja = lojas[i];
        if (contagem !== null && loja !== undefined) mapa.set(loja.id, contagem);
      });
      if (comOrfa) mapa.set("loja-inexistente", 7);
      return mapa;
    });
}

/**
 * Instantâneo arbitrário do Painel_Admin, para a Propriedade 5.
 *
 * Gerado em cadeia a partir do **momento de referência**, e é essa a decisão
 * central deste gerador: `now` fica dentro do próprio instantâneo e todas as
 * datas são calculadas a partir dele — datas de pagamento dentro e fora do mês
 * corrente, fins de teste dentro e fora da janela de
 * {@link ATTENTION_WINDOW_DAYS} dias, datas de criação espalhadas pelos
 * {@link MONTHS_IN_EVOLUTION} meses da evolução e mais antigas. Sem isto, as
 * métricas dependeriam do calendário do dia em que o teste corre.
 *
 * As referências são coerentes por construção, e é por isso que as contas são
 * geradas primeiro, as Lojas a seguir (com `ownerId` de contas existentes,
 * incluindo de Administrador) e os levantamentos e transações no fim (com
 * `storeId`/`ownerId` de Lojas e contas existentes). Uma fatia de cada aponta
 * deliberadamente para nada.
 */
export const adminSnapshotArb: fc.Arbitrary<AdminSnapshot> = fc
  .constantFrom(...MOMENTOS_DE_REFERENCIA)
  .chain((now) =>
    contasArb(now).chain((accounts) =>
      lojasArb(now, accounts).chain((stores) =>
        fc
          .record({
            withdrawals: levantamentosArb(now, stores),
            transactions: transacoesArb(now, accounts),
            productCounts: contagensDeProdutosArb(stores),
          })
          .map(({ withdrawals, transactions, productCounts }) => ({
            now,
            accounts,
            stores,
            withdrawals,
            transactions,
            productCounts,
          })),
      ),
    ),
  );

/**
 * Uma **Loja_Modelo** isolada, para a Propriedade 5 a acrescentar a um
 * instantâneo e confirmar que nenhuma métrica e nenhuma lista se movem.
 *
 * O identificador leva o prefixo `modelo-`, que não colide com os `loja-<i>` do
 * instantâneo. O `ownerId` aponta de propósito para `conta-0` ou `conta-1` — que
 * na maior parte dos instantâneos **existem** e são elegíveis: uma Loja_Modelo
 * com dono conhecido é o caso que apanharia uma exclusão feita pela ordem
 * errada (dono primeiro, marca de modelo depois).
 */
export const lojaModeloArb: fc.Arbitrary<StoreLike> = fc
  .record({
    sufixo: fc.integer({ min: 0, max: 9_999 }),
    name: fc.constantFrom("Lumière Chic", "Ekolo Sports", "Modelo de demonstração"),
    ownerId: fc.constantFrom<(string | null | undefined)[]>("conta-0", "conta-1", "conta-inexistente", null, undefined),
    ownerEmail: emailDeContaArb,
    state: estadoDeLojaArb,
    createdAt: fc.constantFrom<(string | null)[]>(
      iso(Date.UTC(2024, 0, 5, 9, 0, 0)),
      iso(Date.UTC(2025, 4, 20, 15, 0, 0)),
      null,
    ),
    customization: customizationDeLojaModeloArb,
  })
  .map(({ sufixo, ...loja }) => ({ id: `modelo-${sufixo}`, identifier: `modelo-${sufixo}`, ...loja }));

// ---------------------------------------------------------------------------
// Variação de Produto (`src/services/variations.ts`)
// ---------------------------------------------------------------------------

/**
 * Limite superior dos preços plausíveis, em Kz — o mesmo de `orderLineArb`,
 * para as duas famílias de geradores falarem da mesma escala de dinheiro.
 *
 * Serve de referência aos preços de Combinação **negativos**: um desconto por
 * versão maior do que qualquer preço base plausível é o único que faz o limite
 * inferior a 0 de `effectivePrice` ser realmente atingido no modo «acresce».
 */
export const PRECO_BASE_MAX = 5_000_000;

/**
 * Preço base de um Produto (`product.price`), para acompanhar
 * {@link combinationArb} na Propriedade 2.
 *
 * Inteiro não negativo: os preços em Kz são inteiros, e manter a aritmética em
 * inteiros deixa `base + price` exatamente representável — sem isso a
 * comparação do modo «acresce» teria de tolerar erro de vírgula flutuante e
 * deixaria de dizer alguma coisa. Inclui `0`, o preço base de um Produto que só
 * tem preço por Combinação.
 */
export const precoBaseArb: fc.Arbitrary<number> = fc.oneof(
  { arbitrary: fc.integer({ min: 1, max: PRECO_BASE_MAX }), weight: 6 },
  { arbitrary: fc.constant(0), weight: 2 },
);

/**
 * Preço de uma Combinação, com os quatro casos do R4.6/R4.7/R4.8 **em pesos
 * explícitos** em vez de um `fc.option` sem peso:
 *
 *  - **ausente** (~25 %) — a Combinação não define preço e vale o preço base
 *    (R4.8). É o caso que distingue «sem preço» de «preço 0»;
 *  - **`0`** (~17 %) — preço definido e nulo. No modo «substitui» dá preço 0, o
 *    que é diferente de cair no preço base;
 *  - **positivo** (~25 %) — o caso corrente de R4.6 e R4.7;
 *  - **negativo até `-PRECO_BASE_MAX`** (~17 %) e **negativo de magnitude
 *    superior a qualquer preço base** (~17 %) — desconto por versão. A segunda
 *    fatia existe porque só ela garante `base + price < 0` para **todo** o preço
 *    base gerado, e é aí que o limite inferior a 0 de `effectivePrice` deixa de
 *    ser teórico.
 *
 * Só números **finitos**: `NaN` e `Infinity` passam a barreira de tipos, mas
 * `asFinite` trata-os como preço ausente. Gerá-los aqui faria a Propriedade 2
 * testar o descarte em vez da aritmética; são caso de exemplo (tarefa 14.6).
 */
const precoDeCombinacaoArb: fc.Arbitrary<number | undefined> = fc.oneof(
  { arbitrary: fc.constant<number | undefined>(undefined), weight: 3 },
  { arbitrary: fc.constant(0), weight: 2 },
  { arbitrary: fc.integer({ min: 1, max: PRECO_BASE_MAX }), weight: 3 },
  { arbitrary: fc.integer({ min: -PRECO_BASE_MAX, max: -1 }), weight: 2 },
  {
    arbitrary: fc.integer({ min: -3 * PRECO_BASE_MAX, max: -PRECO_BASE_MAX - 1 }),
    weight: 2,
  },
);

/**
 * Stock de uma Combinação, com os **três estados** do R4.11/R4.12 em pesos
 * explícitos: **ausente** (~30 %, não controlado, sempre disponível), **`0`**
 * (~30 %, esgotado) e **positivo** (~40 %, disponível).
 *
 * `0` e ausente não são equivalentes, e é por isso que a ausência tem peso
 * próprio em vez de vir de um `fc.option`: com pesos ao acaso, um dos dois
 * estados ficaria sub-representado e a diferença entre eles passaria por testar.
 */
const stockDeCombinacaoArb: fc.Arbitrary<number | undefined> = fc.oneof(
  { arbitrary: fc.constant<number | undefined>(undefined), weight: 3 },
  { arbitrary: fc.constant(0), weight: 3 },
  { arbitrary: fc.integer({ min: 1, max: 500 }), weight: 4 },
);

/**
 * Monta uma Combinação escrevendo `price` e `stock` **só quando existem**.
 *
 * `{ values, price: undefined }` e `{ values }` são objetos diferentes: o
 * primeiro tem a chave `price` presente com valor `undefined`, e um teste que
 * compare Combinação por igualdade estrutural (ou que conte chaves) distingue-os.
 * A forma gravada na Personalização é a segunda, e é essa que o gerador produz.
 */
function criarCombinacao(
  values: readonly string[],
  price: number | undefined,
  stock: number | undefined,
): ProductCombination {
  const combination: ProductCombination = { values: [...values] };
  if (price !== undefined) combination.price = price;
  if (stock !== undefined) combination.stock = stock;
  return combination;
}

/**
 * Valores de eixo plausíveis, tal como um Dono os escreve no
 * Formulario_De_Produto.
 *
 * Deliberadamente curtos e legíveis: os valores entram na chave da Combinação e
 * na etiqueta da linha de Carrinho, e um contra-exemplo com texto arbitrário
 * cheio de acentos e caracteres de controlo seria ilegível sem cobrir nada de
 * novo — a robustez a texto hostil é de `normalizeVariations`, e essa vive nos
 * exemplos (tarefa 14.6) e em {@link variationsIncoerentesArb}.
 */
const valorDeEixoArb: fc.Arbitrary<string> = fc.constantFrom(
  "Preto",
  "Branco",
  "Azul",
  "S",
  "M",
  "L",
  "Manga",
  "Tamanho único",
);

/**
 * Combinação arbitrária de um Produto, para a **Propriedade 2**.
 *
 * `values` tem entre 1 e 3 valores, o que corresponde a um Produto de 1 a 3
 * eixos. Não é validada contra eixo nenhum, e isso é intencional:
 * `effectivePrice` e `combinationAvailable` só leem `price` e `stock`, pelo que
 * a Propriedade 2 não precisa de eixos. Quem precisar de Variação **coerentes**,
 * com a invariante posicional garantida, usa {@link variationsArb}.
 *
 * A cobertura que importa está em {@link precoDeCombinacaoArb} (preço ausente,
 * `0`, positivo e negativo, incluindo negativos que ultrapassam qualquer preço
 * base plausível) e em {@link stockDeCombinacaoArb} (stock ausente, `0` e
 * positivo).
 */
export const combinationArb: fc.Arbitrary<ProductCombination> = fc
  .tuple(
    fc.array(valorDeEixoArb, { minLength: 1, maxLength: 3 }),
    precoDeCombinacaoArb,
    stockDeCombinacaoArb,
  )
  .map(([values, price, stock]) => criarCombinacao(values, price, stock));

/**
 * Modo de preço de um Produto: os **dois** valores do R4.4, sem pesos.
 *
 * São os dois ramos da aritmética de `effectivePrice` — «substitui» devolve o
 * preço da Combinação (R4.6), «acresce» devolve a soma (R4.7) — e nenhum deles é
 * mais provável do que o outro numa Loja real. Valores fora deste par
 * (`undefined`, texto desconhecido, tipos errados) caem todos em «substitui» por
 * `asPriceMode`, o que é descarte e não aritmética: é caso de exemplo (tarefa
 * 14.6), não de propriedade.
 */
export const modoDePrecoArb: fc.Arbitrary<VariationPriceMode> = fc.constantFrom<
  VariationPriceMode[]
>("substitui", "acresce");

/** Um eixo do catálogo de eixos possíveis, com o seu conjunto de valores. */
interface EixoPossivel {
  readonly name: string;
  readonly values: readonly string[];
}

/**
 * Catálogo de eixos a partir do qual {@link variationsArb} escolhe. Os nomes
 * são **distintos entre si**, o que dispensa filtros de rejeição para garantir
 * eixos sem nomes repetidos.
 */
const EIXOS_POSSIVEIS: readonly EixoPossivel[] = [
  { name: "Cor", values: ["Preto", "Branco", "Azul", "Vermelho"] },
  { name: "Tamanho", values: ["S", "M", "L", "XL"] },
  { name: "Sabor", values: ["Manga", "Baunilha", "Café"] },
];

/**
 * Produto cartesiano dos valores dos eixos, na ordem dos eixos.
 *
 * É uma reimplementação de três linhas do que `combinationsOf` faz, e é de
 * propósito: um gerador que chamasse a função em teste herdaria os seus defeitos
 * e a propriedade passaria a comparar o módulo consigo mesmo.
 */
function produtoCartesiano(axes: readonly ProductVariationAxis[]): string[][] {
  let resultado: string[][] = [[]];
  for (const axis of axes) {
    const proximo: string[][] = [];
    for (const prefixo of resultado) {
      for (const value of axis.values) proximo.push([...prefixo, value]);
    }
    resultado = proximo;
  }
  return resultado;
}

/** Um subconjunto não vazio dos valores de cada eixo escolhido, sem duplicados. */
function valoresDosEixosArb(eixos: readonly EixoPossivel[]): fc.Arbitrary<string[][]> {
  return fc.tuple(...eixos.map((eixo) => fc.subarray([...eixo.values], { minLength: 1 })));
}

/**
 * Variação **coerentes** de um Produto: 1 a 3 eixos com nomes distintos, cada um
 * com 1 a 4 valores sem duplicados, `priceMode` nos dois valores possíveis, e
 * `combinations` que respeitam a **invariante posicional** — um valor por eixo,
 * na ordem de `axes`, e `values[i]` sempre um dos valores de `axes[i]`.
 *
 * A coerência é construída, não filtrada: as Combinação são um subconjunto do
 * produto cartesiano dos valores já escolhidos. É o ponto central deste gerador.
 * Uma Variação com `values` de comprimento errado é lixo que
 * `normalizeVariations` descarta, e um teste alimentado com lixo verifica o
 * descarte em vez da aritmética das Variação. Os casos incoerentes existem, mas
 * em separado: {@link variationsIncoerentesArb}.
 *
 * Duas escolhas deliberadas:
 *
 *  - **`enabled` é sempre `true`.** Só `true` ativa as Variação (R4.1); com
 *    `false`, `normalizeVariations` devolve `null` e o Produto corre o
 *    comportamento de hoje (R4.16). Esse é um caso único e enumerável — um
 *    exemplo (tarefa 14.6), não uma propriedade;
 *  - **`combinations` pode ser vazia.** É um estado legítimo: uma seleção sem
 *    Combinação gravada vale o preço base e está disponível. Sub-representá-la
 *    esconderia o caso mais provável numa Loja recém-configurada.
 */
export const variationsArb: fc.Arbitrary<ProductVariations> = fc
  .subarray([...EIXOS_POSSIVEIS], { minLength: 1 })
  .chain((eixos) =>
    valoresDosEixosArb(eixos).chain((valores) => {
      const axes: ProductVariationAxis[] = eixos.map((eixo, i) => ({
        name: eixo.name,
        values: [...(valores[i] ?? [])],
      }));
      return fc.subarray(produtoCartesiano(axes)).chain((escolhidas) =>
        fc
          .tuple(
            modoDePrecoArb,
            fc.array(fc.tuple(precoDeCombinacaoArb, stockDeCombinacaoArb), {
              minLength: escolhidas.length,
              maxLength: escolhidas.length,
            }),
          )
          .map(([priceMode, precosEStocks]) => ({
            enabled: true,
            priceMode,
            axes,
            combinations: escolhidas.map((values, i) =>
              criarCombinacao(values, precosEStocks[i]?.[0], precosEStocks[i]?.[1]),
            ),
          })),
      );
    }),
  );

/**
 * Variação **incoerentes**: as mesmas de {@link variationsArb}, com a invariante
 * posicional quebrada de uma das quatro maneiras que a Personalização editada à
 * mão produz.
 *
 *  - `"valor-a-mais"` e `"valor-a-menos"` — `values.length !== axes.length`, o
 *    que acontece a todas as Combinação gravadas quando o Dono acrescenta ou
 *    remove um eixo inteiro;
 *  - `"valor-fora-do-eixo"` — `values[0]` deixou de ser um valor de `axes[0]`,
 *    que é o que sobra de uma Combinação depois de o Dono remover esse valor do
 *    eixo (R4.19);
 *  - `"combinacao-duplicada"` — a mesma Combinação duas vezes na lista, de que
 *    só a primeira sobrevive.
 *
 * **Não é para a Propriedade 2.** Serve a quem quiser exercitar o descarte de
 * `normalizeVariations` e a preservação de `syncCombinations` — e está separado
 * precisamente para que nenhum teste de aritmética de preços seja alimentado
 * com dados que o módulo descarta antes de chegar à aritmética.
 */
export const variationsIncoerentesArb: fc.Arbitrary<ProductVariations> = fc
  .tuple(
    variationsArb.filter((v) => v.combinations.length > 0),
    fc.constantFrom(
      "valor-a-mais",
      "valor-a-menos",
      "valor-fora-do-eixo",
      "combinacao-duplicada",
    ),
  )
  .map(([v, corrupcao]) => {
    const combinations = v.combinations.map((comb) => ({ ...comb, values: [...comb.values] }));
    if (corrupcao === "valor-a-mais") {
      for (const comb of combinations) comb.values.push("Valor a mais");
    } else if (corrupcao === "valor-a-menos") {
      for (const comb of combinations) comb.values.pop();
    } else if (corrupcao === "valor-fora-do-eixo") {
      for (const comb of combinations) comb.values[0] = "Valor inexistente";
    } else {
      const primeira = combinations[0];
      if (primeira !== undefined) combinations.push({ ...primeira, values: [...primeira.values] });
    }
    return { ...v, combinations };
  });
