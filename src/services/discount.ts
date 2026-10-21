/**
 * Códigos de desconto — o valor que um código desconta numa encomenda.
 *
 * Domínio puro: sem Supabase, sem DOM. Existe para a regra ter **um** autor do
 * lado do navegador e poder ser comparada com o espelho do servidor.
 *
 * ## Porque saiu de `web/supabase/discounts.ts`
 *
 * O servidor recalcula o desconto antes de cobrar (`discountAmountOf` em
 * `api/_shared.js`) e o checkout tem de mostrar ao comprador **o mesmo** valor:
 * se os dois divergirem, o total que ele viu não é o que o servidor calcula e o
 * pagamento acaba em `PRICE_CHANGED`. `web/supabase/discounts.ts` importa o
 * cliente do Supabase, que lê variáveis de ambiente do navegador, e por isso não
 * pode ser importado num teste — a regra ficava sem guarda de paridade. Aqui é
 * comparada por `tests/serverOrder.test.ts`.
 *
 * A validação de um código (existe, está ativo, não caducou, não esgotou)
 * continua a ser do servidor: `validateDiscount` em `web/supabase/discounts.ts`
 * (função `public.validate_discount`) no checkout e `findDiscount` em
 * `api/_payments.js` no momento de cobrar.
 */

/** Tipo de desconto: percentagem do total ou valor fixo em Kwanzas. */
export type DiscountType = "percent" | "fixed";

/**
 * O que o cálculo lê de um código: o tipo e o valor.
 *
 * Os campos são `unknown` de propósito: o cálculo é total — qualquer valor
 * gravado, mesmo malformado, dá um número — e por isso aceita tanto o
 * `ValidDiscount` do checkout como uma linha crua da base de dados.
 */
export interface DiscountRule {
  readonly type?: unknown;
  readonly value?: unknown;
}

/** Objeto onde faça sentido ler campos, ou `null`. Mesma regra de `asVariationRecord` no servidor. */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Valor do desconto, em Kwanzas inteiros, para um total — nunca superior a ele
 * e nunca negativo.
 *
 * - `"percent"`: `total × valor / 100`;
 * - qualquer outro tipo: o próprio valor (desconto fixo);
 * - valor que não seja número utilizável conta como `0`.
 *
 * O `total` é o **subtotal mais a entrega**, tal como o servidor o passa
 * (`priceStoreOrder` em `api/_payments.js`): o desconto incide sobre o que o
 * comprador paga, não só sobre os artigos.
 *
 * Espelhado à letra por `discountAmountOf` em `api/_shared.js` — alterar nos
 * dois sítios; `tests/serverOrder.test.ts` falha se divergirem.
 */
export function discountAmount(code: DiscountRule | null | undefined, total: number): number {
  const value = Number(asRecord(code)?.["value"]) || 0;
  const raw = code?.type === "percent" ? (total * value) / 100 : value;
  return Math.max(0, Math.min(total, Math.round(raw)));
}

/**
 * Código tal como o servidor o procura: sem espaços nas pontas e em
 * maiúsculas (`validate_discount` e `findDiscount` fazem o mesmo).
 */
export function normalizeDiscountCode(code: string | null | undefined): string {
  return typeof code === "string" ? code.trim().toUpperCase() : "";
}
