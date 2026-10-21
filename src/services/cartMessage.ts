/**
 * Composição da mensagem de WhatsApp de uma encomenda (R3.9–R3.12).
 *
 * É o **único** autor do texto: o Checkout (`web/views/checkout.ts`), a página
 * do Carrinho (`web/views/cart.ts`) e a Gaveta_Do_Carrinho
 * (`web/lib/cartDrawer.ts`) chamam todos esta função. O texto chegou a ser
 * escrito à mão em três sítios, e as cópias divergiram — a da página do
 * Carrinho deixava cair a Combinação de cada linha.
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
   * Etiqueta da Combinação, quando existe (R3.11), ex.: "Cor: Azul · Tamanho: M"
   * — a `variantLabel` que a Pagina_De_Produto grava no item do Carrinho. Vazia
   * ou só com espaços conta como ausente.
   */
  readonly variantLabel?: string | undefined;
}

/**
 * Dados do comprador, tal como o Checkout os recolheu. Só os campos com
 * conteúdo entram na mensagem.
 */
export interface OrderCustomer {
  readonly name?: string | undefined;
  readonly phone?: string | undefined;
  /** Morada numa linha (rua, número, ponto de referência). */
  readonly address?: string | undefined;
  readonly email?: string | undefined;
  readonly nif?: string | undefined;
}

/** Acrescentos à encomenda, presentes só quando o Checkout os tem (R3.12). */
export interface OrderExtras {
  /**
   * Área de entrega escolhida e respetivo valor. `fee` a 0 escreve «grátis» — e
   * a área continua lá: é por ela que o Dono sabe para onde vai a encomenda.
   */
  readonly delivery?: { readonly area: string; readonly fee: number } | undefined;
  readonly discount?: { readonly code: string; readonly amount: number } | undefined;
  /** Quem encomenda e para onde. Escrito depois do total, em bloco próprio. */
  readonly customer?: OrderCustomer | undefined;
}

/** Saudação de abertura da mensagem. */
const GREETING = "Olá! Gostaria de encomendar:";

/** Título do bloco com os dados do comprador. */
const CUSTOMER_TITLE = "Os meus dados:";

/** Rótulo de cada dado do comprador, pela ordem em que são escritos. */
const CUSTOMER_LABELS: readonly (readonly [keyof OrderCustomer, string])[] = [
  ["name", "Nome"],
  ["phone", "Telemóvel"],
  ["address", "Morada"],
  ["email", "Email"],
  ["nif", "NIF"],
];

/**
 * Texto de um campo do comprador numa só linha: aparado e com os espaços
 * interiores (incluindo mudanças de linha) reduzidos a um. Uma morada colada
 * com quebras de linha não parte o bloco em linhas soltas sem rótulo.
 */
function oneLine(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

/** Linhas «Rótulo: valor» dos dados do comprador com conteúdo. */
function customerLines(customer: OrderCustomer | undefined): string[] {
  if (!customer) return [];
  const out: string[] = [];
  for (const [key, label] of CUSTOMER_LABELS) {
    const value = oneLine(customer[key]);
    if (value) out.push(`${label}: ${value}`);
  }
  return out;
}

/**
 * Compõe a mensagem de WhatsApp de uma encomenda.
 *
 * Produz, por esta ordem: a saudação; uma linha por item com a quantidade, o
 * nome, a Combinação quando existe e o valor da linha (`price * quantity`); a
 * entrega e o desconto quando presentes em `extras`; o total; e, quando o
 * Checkout os recolheu, os dados do comprador num bloco próprio.
 *
 * ```
 * Olá! Gostaria de encomendar:
 * • 2x Camisola oficial — Cor: Azul · Tamanho: M (30 000,00 Kz)
 * • 1x Boné (8 000,00 Kz)
 * Entrega: Talatona (2 500,00 Kz)
 * Desconto (VERAO10): -3 500,00 Kz
 *
 * Total: 37 000,00 Kz
 *
 * Os meus dados:
 * Nome: Maria Silva
 * Telemóvel: +244923456789
 * Morada: Rua Direita, 12 (ponto de referência: junto à farmácia)
 * ```
 *
 * Sem dados do comprador (a Gaveta e a página do Carrinho), o total é a última
 * linha.
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
  const message = `${head.join("\n")}\n\nTotal: ${formatMoney(total)}`;

  const about = customerLines(extras?.customer);
  return about.length ? `${message}\n\n${CUSTOMER_TITLE}\n${about.join("\n")}` : message;
}
