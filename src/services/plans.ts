/**
 * Subscrição da MôBisno (módulo de domínio puro e testável).
 *
 * **Um só plano, um só preço: 10.000 Kz por mês, com tudo incluído.** Lojas e
 * produtos ilimitados, todas as funcionalidades, nenhum escalão, nenhum ciclo
 * anual, nenhum preço por loja.
 *
 * ## Porque é tão pouco
 *
 * Este módulo já teve três escalões, depois dois ciclos (mensal e anual), depois
 * preço por loja publicada com proporcionalidade. Cada versão trouxe uma regra
 * que atravessava o painel, o checkout, as funções serverless, a base de dados e
 * o assistente — e cada uma deixou pelo caminho uma divergência entre o que o
 * ecrã dizia e o que o servidor cobrava. A última deixava o Dono sem forma de
 * pagar uma segunda loja. Um preço é uma frase: «10.000 Kz por mês, tudo
 * incluído».
 *
 * Criar a loja, personalizá-la e pré-visualizá-la é grátis e sem prazo; a
 * subscrição serve para a **publicar**.
 *
 * O preço está espelhado em `api/_shared.js` (`PLAN_PRICE_KZ`), porque o servidor
 * não pode importar de `src/`. `tests/planParity.test.ts` compara os dois.
 */
import { STORE_APEX } from "./domains.js";

/**
 * Identificador do plano gravado na coluna `profiles.plan`. Há um só; o valor
 * existe para a coluna continuar a ter conteúdo legível e para a restrição da
 * base de dados o poder validar.
 */
export type PlanId = "pro";

/** O único plano. */
export const PLAN_ID: PlanId = "pro";

/** Nome apresentado ao Dono. */
export const PLAN_NAME = "MôBisno";

/** Preço da subscrição, em Kwanzas, por cada período de {@link PLAN_PERIOD_DAYS} dias. */
export const PLAN_PRICE_KZ = 10_000;

/** Duração de um período pago, em dias. */
export const PLAN_PERIOD_DAYS = 30;

/**
 * O que a subscrição inclui, para a página de preços, o painel e o assistente.
 *
 * Diz só o que existe hoje. As funcionalidades «Em breve» (SMS, domínio próprio,
 * pixels de marketing) ficam de fora de propósito: anunciá-las aqui como
 * incluídas era prometer o que o Dono não consegue ligar.
 */
export const PLAN_HIGHLIGHTS: readonly string[] = [
  "Lojas e produtos ilimitados",
  "Checkout por WhatsApp em todas as lojas",
  "Multicaixa Express e Referência Bancária para empresas verificadas",
  `Endereço próprio nomedaloja.${STORE_APEX}`,
  "Editor visual e modelos prontos",
  "Taxas de entrega, códigos de desconto, stock, variações e avaliações",
];
