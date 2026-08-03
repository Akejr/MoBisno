/**
 * Transporte da chave de linha do Carrinho dentro de um atributo HTML (R4.13).
 *
 * ## O problema
 *
 * Desde as Variação, a identidade de uma linha é a chave de
 * `src/services/cartLine.ts`: `"<productId>|<variantKey ?? "">"`. Quando há
 * Combinação, a `variantKey` junta os valores com **U+001F** (UNIT SEPARATOR).
 * Essa chave tem de chegar do HTML renderizado (`innerHTML`) ao manipulador de
 * clique através de `dataset`, e `esc` de `web/lib/dom.ts` **não** trata
 * caracteres de controlo: escapa `& < > " '` e deixa passar tudo o resto.
 *
 * Pela norma do HTML, um U+001F cru num valor de atributo é um erro de análise
 * («control-character-in-input-stream») que o analisador **recupera**,
 * preservando o carácter — logo o ida-e-volta funcionaria. Mas é um erro de
 * análise mesmo assim, invisível em inspeção, e este repositório não tem
 * ambiente de DOM nos testes (`vitest` corre em Node, sem `jsdom`), por isso
 * esse ida-e-volta **não é verificável aqui**.
 *
 * ## A escolha
 *
 * Em vez de depender da recuperação de erros do analisador, a chave viaja
 * **percent-encoded**: `encodeURIComponent` transforma U+001F em `%1F` e `|` em
 * `%7C`. O valor do atributo fica em ASCII imprimível, sem nenhum carácter que
 * `esc` altere e sem nenhum carácter de controlo. `rowKeyOf` desfaz a
 * codificação à leitura, devolvendo a chave exacta que `cartLineKey` produziu —
 * é essa chave que segue para `setQuantity`/`removeFromCart`.
 *
 * O `'` é o único dos cinco caracteres de `esc` que `encodeURIComponent` **não**
 * codifica (`&`, `<`, `>` e `"` já vão a `%26`, `%3C`, `%3E`, `%22`). Um valor
 * de Variação como «L'Été» chegaria ao HTML como `&#39;` e só voltaria a `'` por
 * obra da descodificação de entidades do analisador — a mesma dependência que
 * este módulo existe para evitar. Daí o `%27` explícito.
 *
 * Ao contrário de um índice de linha, a chave não fica desatualizada: se o
 * Carrinho mudou noutro separador entretanto, uma chave que já não existe
 * simplesmente não encontra linha (nada acontece), enquanto um índice apontaria
 * para a linha errada e alteraria o item errado em silêncio.
 *
 * `encodeURIComponent`/`decodeURIComponent` são puros e o ida-e-volta é
 * verificável sem DOM.
 */

import { lineKeyOf, type CartItem } from "./cart.js";

/**
 * Valor a colocar num atributo `data-*` para identificar a linha de um item.
 * Resultado sempre em ASCII imprimível, seguro para `esc` e para `dataset`.
 */
export function rowKeyAttr(item: Pick<CartItem, "productId" | "variantKey">): string {
  return encodeURIComponent(lineKeyOf(item)).replace(/'/g, "%27");
}

/**
 * Chave de linha lida de um atributo `data-*`. Devolve a chave tal como
 * `cartLineKey` a produziu.
 *
 * Total: um valor ausente dá `""` (nenhuma linha corresponde) e um valor
 * malformado é devolvido como está, em vez de lançar — `decodeURIComponent`
 * lança `URIError` em sequências `%` inválidas, e uma gaveta de carrinho não se
 * parte por causa de HTML manipulado à mão.
 */
export function rowKeyOf(attrValue: string | null | undefined): string {
  if (!attrValue) return "";
  try {
    return decodeURIComponent(attrValue);
  } catch {
    return attrValue;
  }
}
