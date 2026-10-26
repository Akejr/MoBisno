/**
 * Subscrição da MôBisno (módulo de domínio puro e testável).
 *
 * **Cada loja tem a sua subscrição: 10.000 Kz por mês, com tudo incluído.**
 * Quem tem duas lojas online paga duas. Produtos ilimitados, todas as
 * funcionalidades, nenhum escalão, nenhum ciclo anual.
 *
 * ## Porque é assim
 *
 * Este módulo já teve três escalões, depois dois ciclos (mensal e anual), depois
 * preço por loja publicada com proporcionalidade, depois um só preço por conta.
 * A proporcionalidade é que deixava o Dono sem forma de pagar uma segunda loja.
 * A regra agora não tem contas a fazer: cada loja paga os seus 30 dias e tem a
 * sua data de fim (`stores.plan_expires_at`, migração 0025). Pagar a segunda
 * loja não mexe na primeira.
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
 * A unidade do preço, como se escreve a seguir a ele («10.000 Kz/mês por
 * loja»): cada loja paga a sua subscrição.
 */
export const PLAN_UNIT_LABEL = "por loja";

/**
 * O que a subscrição inclui, para a página de preços, o painel e o assistente.
 *
 * Diz só o que existe hoje. As funcionalidades «Em breve» (SMS, domínio próprio,
 * pixels de marketing) ficam de fora de propósito: anunciá-las aqui como
 * incluídas era prometer o que o Dono não consegue ligar.
 */
export const PLAN_HIGHLIGHTS: readonly string[] = [
  "Produtos ilimitados",
  "Checkout por WhatsApp",
  "Multicaixa Express e Referência Bancária para empresas verificadas",
  `Endereço próprio nomedaloja.${STORE_APEX}`,
  "Editor visual e modelos prontos",
  "Taxas de entrega, códigos de desconto, stock, variações e avaliações",
];
