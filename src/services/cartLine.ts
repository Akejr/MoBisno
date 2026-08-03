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
