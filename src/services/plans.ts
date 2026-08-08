/**
 * Subscrição da MôBisno (módulo de domínio puro e testável).
 *
 * Há **um só plano**, com dois ciclos de pagamento: mensal ou anual. Não há
 * escalões, não há limites de lojas nem de produtos, e não há funcionalidades
 * reservadas — quem paga tem tudo.
 *
 * PORQUÊ: os três escalões anteriores (Básico/Profissional/Empresarial) traziam
 * uma matriz de limites e funcionalidades que atravessava o painel, o checkout e
 * as funções serverless, e uma máquina de faturação com cinco ramos a interagir
 * (pago, plano agendado, teste grátis, atribuição permanente, expirado). Foi
 * dessa complexidade que nasceu a avaria em que uma loja com pagamentos ativos
 * recusava cobrar: o painel lia um plano e o servidor lia outro.
 *
 * Além disso, o escalão Básico desligava o Multicaixa Express — cobrava-se a
 * alguém para essa pessoa **não** poder receber pagamentos online, que é a
 * principal razão para usar a plataforma.
 *
 * O módulo não tem dependências de infraestrutura: a persistência (coluna
 * `plan_expires_at` em `profiles`) fica na raiz de composição.
 */

/**
 * Identificador do plano gravado na coluna `plan`. Há um só; o valor existe
 * para a coluna continuar a ter conteúdo legível e para a restrição da base de
 * dados o poder validar.
 */
export type PlanId = "pro";

/** O único plano. */
export const PLAN_ID: PlanId = "pro";

/** Nome apresentado ao Dono. */
export const PLAN_NAME = "MôBisno";

/** Ciclo de pagamento escolhido pelo Dono. */
export type BillingPeriod = "mensal" | "anual";

/** Ciclos na ordem de apresentação. */
export const BILLING_PERIODS: readonly BillingPeriod[] = ["mensal", "anual"];

/** Preço de cada ciclo, em Kwanzas. */
export const PRICE_KZ: Readonly<Record<BillingPeriod, number>> = {
  mensal: 11_000,
  anual: 120_000,
};

/** Duração de cada ciclo, em dias. */
export const PERIOD_DAYS: Readonly<Record<BillingPeriod, number>> = {
  mensal: 30,
  anual: 365,
};

/** Rótulo de cada ciclo. */
export const PERIOD_LABEL: Readonly<Record<BillingPeriod, string>> = {
  mensal: "Mensal",
  anual: "Anual",
};

/** O que a subscrição inclui, para a página de preços e para o painel. */
export const PLAN_HIGHLIGHTS: readonly string[] = [
  // O preço é por Loja publicada (ver `priceFor`): dizer «lojas ilimitadas» aqui
  // prometia de graça o que se paga por Loja. Criar é livre; publicar é que conta.
  "Uma loja online publicada",
  "Produtos ilimitados",
  "Checkout Multicaixa Express e referência bancária",
  "Checkout via WhatsApp",
  "Endereço próprio .sualoja.digital",
  "Editor visual, modelos prontos e logótipo por IA",
  "Códigos de desconto, stock, variações e avaliações",
];

/** Type guard de {@link BillingPeriod}. */
export function isBillingPeriod(value: unknown): value is BillingPeriod {
  return value === "mensal" || value === "anual";
}

/**
 * Ciclo a partir de um valor possivelmente inválido (corpo de pedido, coluna da
 * base de dados). Recorre a `mensal`, o mais barato — nunca cobrar a mais por
 * um valor que não se percebeu.
 */
export function asBillingPeriod(value: unknown): BillingPeriod {
  return isBillingPeriod(value) ? value : "mensal";
}

/** Preço do ciclo, em Kwanzas. */
export function priceOf(period: BillingPeriod): number {
  return PRICE_KZ[period];
}

/** Duração do ciclo, em dias. */
export function daysOf(period: BillingPeriod): number {
  return PERIOD_DAYS[period];
}

/**
 * Quanto o ciclo anual poupa face a doze meses avulsos, em Kwanzas.
 * Positivo enquanto o anual compensar; zero se deixar de compensar.
 */
export function yearlySavingKz(): number {
  return Math.max(0, PRICE_KZ.mensal * 12 - PRICE_KZ.anual);
}

/** Quantos meses o desconto anual equivale a oferecer (arredondado para baixo). */
export function yearlyFreeMonths(): number {
  return Math.floor(yearlySavingKz() / PRICE_KZ.mensal);
}

/* -------------------------------------------------------------------------- */
/* Preço por Loja publicada                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Lojas incluídas no preço de um ciclo.
 *
 * O preço é **por Loja publicada**: a subscrição paga uma, e cada Loja adicional
 * que o Dono queira online custa outro ciclo completo. Não há desconto de volume,
 * de propósito — «11.000 Kz por loja» explica-se numa frase, e uma tabela de
 * escalões foi exactamente o que esta plataforma acabou de deixar para trás.
 *
 * Uma Loja em rascunho **não conta**: só se paga o que está na web. É isso que
 * permite ao Dono despublicar uma Loja no ecrã de pagamento e ver a mensalidade
 * descer antes de pagar.
 */
export const STORES_INCLUDED = 1;

/**
 * Número de Lojas a cobrar: nunca menos do que as incluídas, e sempre um inteiro.
 *
 * Entradas absurdas (negativas, fracionárias, `NaN`, tipos errados) caem no
 * mínimo. A conta do que o Dono paga não pode depender de um valor que ninguém
 * validou — e um `NaN` aqui chegaria ao montante enviado ao serviço de pagamento.
 */
export function billableStores(publishedStores: unknown): number {
  const n = typeof publishedStores === "number" && Number.isFinite(publishedStores)
    ? Math.floor(publishedStores)
    : STORES_INCLUDED;
  return Math.max(STORES_INCLUDED, n);
}

/**
 * Preço de um ciclo para um número de Lojas publicadas.
 *
 * `priceFor("mensal", 3)` = três vezes a mensalidade. Com zero ou uma Loja é a
 * mensalidade simples, que é o comportamento de sempre — quem tem uma Loja não
 * nota diferença nenhuma nesta mudança.
 */
export function priceFor(period: BillingPeriod, publishedStores: unknown): number {
  return priceOf(period) * billableStores(publishedStores);
}

/**
 * Preço de **uma Loja adicional** durante o resto de um ciclo já pago
 * (proporcional aos dias que faltam).
 *
 * Sem isto, publicar a segunda Loja a meio do mês obrigava a pagar um ciclo novo
 * por tudo — a Loja que já estava paga incluída —, ou seja, a cobrar duas vezes
 * o mesmo. Com proporcionalidade, o Dono paga os dias que vai usar.
 *
 * Nunca devolve menos do que zero nem mais do que um ciclo completo: com mais
 * dias do que o ciclo (uma data de renovação empurrada para muito longe), paga um
 * ciclo. O valor é arredondado para o Kwanza, porque é o que vai na fatura.
 */
export function proratedStorePrice(period: BillingPeriod, daysRemaining: unknown): number {
  const total = daysOf(period);
  const dias = typeof daysRemaining === "number" && Number.isFinite(daysRemaining)
    ? Math.max(0, Math.min(total, Math.ceil(daysRemaining)))
    : total;
  return Math.round((priceOf(period) * dias) / total);
}
