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
  "Lojas e produtos ilimitados",
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
