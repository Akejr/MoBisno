/**
 * Comissão da Plataforma sobre as vendas pagas por meios digitais.
 *
 * ## A regra, numa frase
 *
 * **A MôBisno cobra 5% de cada venda recebida por Multicaixa Express ou
 * Referência Bancária.** O dinheiro entra na conta da Plataforma no fornecedor
 * de pagamentos; o Dono levanta o resto — 95% — para a conta bancária da empresa
 * dele, já verificada.
 *
 * As vendas por **WhatsApp não têm comissão nenhuma**: o dinheiro nunca passa
 * pela Plataforma, é combinado entre o Dono e o cliente dele.
 *
 * ## Porque é que isto é um módulo
 *
 * A comissão aparece em cinco sítios — o que o checkout cobra, o que a
 * encomenda grava (`orders.fee` e `orders.net`), o saldo disponível para
 * levantar, o texto do painel e o do assistente. Enquanto foi um número
 * escrito à mão em cada um deles, bastou mudar de fornecedor para o painel
 * passar a mostrar uma percentagem que já não era cobrada.
 *
 * Espelhada em `api/_shared.js` (`PLATFORM_FEE_RATE`, `platformFeeOf`), porque
 * `api/` não pode importar de `src/`. `tests/fees.test.ts` compara os dois.
 */

/** Fração da venda que fica para a Plataforma. */
export const PLATFORM_FEE_RATE = 0.05;

/** A mesma comissão por extenso, para os textos. Nunca escrever «5%» à mão. */
export const PLATFORM_FEE_LABEL = `${Number((PLATFORM_FEE_RATE * 100).toFixed(2))}%`;

/** Arredonda a 2 casas (Kwanzas), sem o ruído da vírgula flutuante. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Valor em Kz utilizável, ou 0 — total: aceita qualquer entrada. */
function amount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Comissão da Plataforma sobre o total de uma venda digital, em Kz.
 *
 * Arredondada ao cêntimo e nunca superior ao total. Espelhada por
 * `platformFeeOf` em `api/_shared.js`.
 */
export function platformFee(total: unknown): number {
  const t = amount(total);
  return Math.min(t, round2(t * PLATFORM_FEE_RATE));
}

/** O que fica para o Dono: o total menos a comissão. */
export function netForOwner(total: unknown): number {
  const t = amount(total);
  return round2(t - platformFee(t));
}

/**
 * Comissão de uma venda, conforme o meio de pagamento.
 *
 * O WhatsApp não passa pela Plataforma: comissão zero. É a função que decide o
 * `fee` de uma encomenda, e por isso a que impede a Plataforma de descontar 5%
 * de dinheiro que nunca recebeu.
 */
export function feeForMethod(method: unknown, total: unknown): number {
  return method === "whatsapp" ? 0 : platformFee(total);
}
