/**
 * Identidade de uma linha de Carrinho (R4.13, R4.14).
 *
 * O Carrinho passa a ser chaveado por linha, e não por Produto: duas Combinação
 * distintas do mesmo Produto são duas linhas independentes, com quantidade
 * própria. Este módulo é o único autor dessa chave.
 *
 * Domínio puro: sem DOM, sem `localStorage`, sem dependências. `web/lib/cart.ts`
 * — que depende de `localStorage` e por isso fica fora do programa de testes —
 * consome-o para chavear o estado.
 *
 * É também daqui que saem as **linhas pedidas ao servidor** num pagamento
 * digital (`orderRequestLines`): a mesma identidade de linha, com a quantidade
 * e sem preço — o servidor calcula o montante a partir da base de dados.
 */

/**
 * Separador entre o Produto e a Combinação dentro da chave de linha.
 *
 * **Não confundir com o separador de `variantKeyOf`** em
 * `src/services/variations.ts`, que é U+001F e junta os *valores* de uma
 * Combinação («Azul» + U+001F + «M»). São dois separadores em dois níveis:
 *
 * - nível interior (U+001F, `variations.ts`): valores → `variantKey`;
 * - nível exterior (`"|"`, este módulo): `productId` + `variantKey` → chave de linha.
 *
 * Manter os dois distintos é o que impede a `variantKey` já formada de se
 * confundir com a fronteira entre Produto e Combinação.
 */
const LINE_SEP = "|";

/** Identidade de uma linha de Carrinho: Produto + Combinação escolhida. */
export interface CartLineIdentity {
  readonly productId: string;
  /** Chave estável da Combinação, ou `undefined` para Produto sem Variação. */
  readonly variantKey?: string | undefined;
}

/**
 * Chave de igualdade de uma linha. Duas linhas são a mesma linha se e só se
 * `cartLineKey` coincide.
 *
 * Para Produto sem Variação devolve `"<id>|"` — com o separador presente e a
 * parte da Combinação vazia. **Esta forma é deliberada e não pode mudar:** há
 * carrinhos gravados agora em `localStorage`, em telemóveis de Clientes reais,
 * com itens sem `variantKey`. É `"<productId>|"` que faz um desses itens
 * legados continuar a ser encontrado depois do deploy, sem migração de dados e
 * sem o Cliente perder o carrinho.
 *
 * ```
 * cartLineKey({ productId: "p1" })                       === "p1|"
 * cartLineKey({ productId: "p1", variantKey: "Azul␟M" }) === "p1|Azul␟M"
 * cartLineKey({ productId: "p1", variantKey: "Azul␟L" }) === "p1|Azul␟L"
 * ```
 *
 * Total e determinística: nunca lança e a mesma identidade dá sempre a mesma
 * chave. A unicidade assume que `productId` não contém `"|"` — os `id` são UUID
 * de `crypto.randomUUID()`, cujo alfabeto é apenas hexadecimal e `"-"`.
 */
export function cartLineKey(line: CartLineIdentity): string {
  return `${line.productId}${LINE_SEP}${line.variantKey ?? ""}`;
}

/* ------------------------- Linhas pedidas ao servidor ------------------------- */

/**
 * `variantKey` utilizável, ou `undefined`: só texto com conteúdo conta como
 * Combinação escolhida.
 *
 * É a regra de `lineKeyOf` em `web/lib/cart.ts` e de `asVariantKey` em
 * `api/_shared.js`. Um item legado de `localStorage` (sem o campo) e um item com
 * a chave manipulada à mão dão os dois `undefined` — e a linha segue como
 * seguia antes das Variação.
 */
export function usableVariantKey(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Número máximo de linhas de uma encomenda digital. Espelha `MAX_ORDER_LINES`
 * de `api/_payments.js`: o servidor **descarta em silêncio** as linhas a mais, e
 * cobraria a encomenda sem elas — por isso o checkout recusa antes de enviar.
 */
export const MAX_ORDER_LINES = 100;

/**
 * Quantidade máxima por linha. Espelha `MAX_LINE_QUANTITY` de
 * `api/_payments.js`, que também descarta em silêncio a linha que a excede.
 */
export const MAX_LINE_QUANTITY = 999;

/**
 * Linha de uma encomenda tal como o navegador a pede a `/api/payment`: o
 * Produto, a Combinação e a quantidade. **Nunca o preço** — o servidor lê-o da
 * base de dados (`priceStoreOrder` em `api/_payments.js`).
 */
export interface OrderRequestLine {
  readonly id: string;
  readonly variantKey?: string;
  readonly quantity: number;
}

/** O mínimo de um item de Carrinho que a encomenda lê. */
export interface OrderRequestSource {
  readonly productId: string;
  readonly variantKey?: unknown;
  readonly quantity: number;
}

/**
 * Linhas a enviar ao servidor a partir do Carrinho.
 *
 * Mesmas regras de `requestedLines` em `api/_payments.js`, para o servidor
 * receber exatamente o que o comprador viu: `id` aparado, quantidade inteira
 * positiva, `variantKey` só quando utilizável, e linhas da **mesma** Combinação
 * do mesmo Produto somadas numa só (a chave é `cartLineKey`). A ordem é a do
 * Carrinho. Os limites (`MAX_ORDER_LINES`, `MAX_LINE_QUANTITY`) **não** são
 * aplicados aqui — quem chama verifica-os com `exceedsOrderLimits` e recusa,
 * em vez de cortar a encomenda sem o comprador saber.
 */
export function orderRequestLines(items: readonly OrderRequestSource[]): OrderRequestLine[] {
  const out = new Map<string, { id: string; variantKey?: string; quantity: number }>();
  for (const item of items) {
    const id = typeof item?.productId === "string" ? item.productId.trim() : "";
    const quantity = Number(item?.quantity);
    if (!id || !Number.isInteger(quantity) || quantity <= 0) continue;
    const variantKey = usableVariantKey(item.variantKey);
    const key = cartLineKey({ productId: id, variantKey });
    const prev = out.get(key);
    if (prev) prev.quantity += quantity;
    else out.set(key, variantKey === undefined ? { id, quantity } : { id, variantKey, quantity });
  }
  return [...out.values()];
}

/** A encomenda excede os limites do servidor (linhas a mais ou quantidade a mais numa linha)? */
export function exceedsOrderLimits(lines: readonly OrderRequestLine[]): boolean {
  return lines.length > MAX_ORDER_LINES || lines.some((l) => l.quantity > MAX_LINE_QUANTITY);
}
