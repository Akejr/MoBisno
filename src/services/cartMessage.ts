/**
 * Composição da mensagem de WhatsApp de uma encomenda (R3.9–R3.12).
 *
 * Hoje o texto é escrito à mão em dois sítios — `web/lib/cartDrawer.ts` (só
 * itens e total) e `web/views/checkout.ts` (com área de entrega e desconto) — e
 * as duas cópias divergiram. Este módulo passa a ser o único autor do texto.
 *
 * Domínio puro: sem DOM, sem dependências. `formatMoney` é injetado — os
 * chamadores passam `formatKz` de `src/services/format.ts` — para o módulo ser
 * trivialmente testável e não arrastar formatação consigo.
 */

/** Linha de encomenda a compor na mensagem (visão mínima de um `CartItem`). */
export interface OrderLine {
  readonly name: string;
  readonly quantity: number;
  /** Preço efetivo unitário da linha. */
  readonly price: number;
  /**
   * Etiqueta da Combinação, quando existe (R3.11), ex.: "Cor: Azul · Tamanho: M".
   *
   * Nesta fase o campo **nunca vem preenchido**: as Combinação são a Fase D
   * (R4). O suporte está aqui para que a etiqueta apareça sem alterar este
   * ficheiro quando essa fase entrar.
   */
  readonly variantLabel?: string | undefined;
}

/** Acrescentos à encomenda, presentes só quando o Checkout os tem (R3.12). */
export interface OrderExtras {
  /** Área de entrega escolhida e respetivo valor. `fee` a 0 escreve «grátis». */
  readonly delivery?: { readonly area: string; readonly fee: number } | undefined;
  readonly discount?: { readonly code: string; readonly amount: number } | undefined;
}

/** Saudação de abertura da mensagem — o texto que já existe hoje nos dois sítios. */
const GREETING = "Olá! Gostaria de encomendar:";

/**
 * Compõe a mensagem de WhatsApp de uma encomenda.
 *
 * Produz, por esta ordem: a saudação; uma linha por item com a quantidade, o
 * nome, a Combinação quando existe e o valor da linha (`price * quantity`); a
 * entrega e o desconto quando presentes em `extras`; e o total, sempre na
 * última linha.
 *
 * ```
 * Olá! Gostaria de encomendar:
 * • 2x Camisola oficial — Cor: Azul · Tamanho: M (30 000,00 Kz)
 * • 1x Boné (8 000,00 Kz)
 * Entrega: Talatona (2 500,00 Kz)
 * Desconto (VERAO10): -3 500,00 Kz
 *
 * Total: 37 000,00 Kz
 * ```
 *
 * O total é a soma dos valores das linhas, mais a entrega e menos o desconto
 * quando presentes, limitado a 0 por baixo (como o Checkout já faz).
 */
export function buildCartWhatsAppMessage(
  lines: readonly OrderLine[],
  formatMoney: (v: number) => string,
  extras?: OrderExtras,
): string {
  const itemLines = lines.map((l) => {
    const label = l.variantLabel && l.variantLabel.trim() ? ` — ${l.variantLabel.trim()}` : "";
    return `• ${l.quantity}x ${l.name}${label} (${formatMoney(l.price * l.quantity)})`;
  });

  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

  const delivery = extras?.delivery;
  const deliveryLine = delivery
    ? `Entrega: ${delivery.area}${delivery.fee > 0 ? ` (${formatMoney(delivery.fee)})` : " (grátis)"}`
    : null;

  const discount = extras?.discount;
  const discountLine = discount
    ? `Desconto (${discount.code}): -${formatMoney(discount.amount)}`
    : null;

  const total = Math.max(0, subtotal + (delivery?.fee ?? 0) - (discount?.amount ?? 0));

  const head = [GREETING, ...itemLines, deliveryLine, discountLine].filter(
    (l): l is string => l !== null,
  );
  return `${head.join("\n")}\n\nTotal: ${formatMoney(total)}`;
}
