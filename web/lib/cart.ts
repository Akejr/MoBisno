/**
 * Carrinho de compras simples por loja, persistido em localStorage.
 *
 * É deliberadamente leve (sem dependências de DOM) e isolado por `storeId`, para
 * que cada loja publicada tenha o seu próprio carrinho no browser do cliente.
 *
 * ## Estado chaveado por linha, não por Produto (R4.13, R4.14)
 *
 * Desde as Variação de Produto, o carrinho é chaveado pela **chave de linha** de
 * `src/services/cartLine.ts` (`"<productId>|<variantKey ?? "">"`) e **não** pelo
 * `productId`. Duas Combinação distintas do mesmo Produto são duas linhas
 * independentes, com quantidade própria.
 *
 * Consequência para quem chama: `setQuantity` e `removeFromCart` recebem uma
 * **chave de linha** no segundo parâmetro, não um `productId`. Quem passar um
 * `productId` cru deixa de encontrar a linha, porque a chave de um item sem
 * Combinação é `"<productId>|"` — com o separador. Use sempre
 * `cartLineKey(item)` (reexportado aqui) para produzir esse argumento.
 *
 * ## Compatibilidade com carrinhos legados (sem migração)
 *
 * Há carrinhos gravados **agora** em `localStorage`, em telemóveis de clientes
 * reais, com itens **sem** `variantKey`. Não existe migração: a compatibilidade
 * sai da forma da chave. Um item legado `{ productId: "p1", … }` produz
 * `"p1|"`, exactamente a mesma chave que um item novo sem Combinação produziria,
 * por isso continua a ser encontrado, somado e removível depois do deploy.
 * Nenhuma função abaixo lê ou escreve o formato guardado de outra maneira, e
 * nenhuma compara por `productId`.
 *
 * ## Nota de verificação
 *
 * Este ficheiro depende de `localStorage` e fica fora do programa de testes
 * automatizados. A validação é `npm run web:build` mais os testes de
 * `src/services/cartLine.ts`, que é onde vive a regra da chave. Por isso o
 * código aqui é deliberadamente literal: uma única função (`lineKeyOf`) decide a
 * identidade de uma linha, e todas as outras a usam.
 */

import { cartLineKey, type CartLineIdentity } from "../../src/services/cartLine.js";

export { cartLineKey };
export type { CartLineIdentity };

export interface CartItem {
  productId: string;
  name: string;
  /**
   * Preço **efetivo** da linha, por unidade: já inclui a resolução da Combinação
   * feita por `effectivePrice` na Pagina_De_Produto (R4.15). Para Produto sem
   * Variação é o preço base do Produto, como sempre foi (R4.16).
   */
  price: number;
  imageUrl?: string;
  quantity: number;
  /**
   * Chave estável da Combinação escolhida, de `variantKeyOf`. Ausente em Produto
   * sem Variação e em todos os itens legados já gravados.
   */
  variantKey?: string;
  /**
   * Etiqueta legível da Combinação, de `variantLabelOf` (ex.: «Azul · M»), para
   * apresentar na linha do carrinho e na mensagem de WhatsApp (R4.14, R3.11).
   * Nunca é usada para identificar a linha.
   */
  variantLabel?: string;
}

function key(storeId: string): string {
  return `mb-cart:${storeId}`;
}

/**
 * Chave de linha de um item do carrinho. É o **único** sítio onde a identidade
 * de uma linha é decidida.
 *
 * Um `variantKey` que não seja string usável (item legado, ou JSON manipulado à
 * mão em `localStorage`) é tratado como ausente, o que devolve `"<productId>|"`
 * — a chave dos carrinhos legados.
 */
export function lineKeyOf(item: Pick<CartItem, "productId" | "variantKey">): string {
  const variantKey = typeof item.variantKey === "string" && item.variantKey !== "" ? item.variantKey : undefined;
  return cartLineKey({ productId: item.productId, variantKey });
}

/** Lê o carrinho da loja. */
export function getCart(storeId: string): CartItem[] {
  try {
    const raw = localStorage.getItem(key(storeId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(storeId: string, items: CartItem[]): void {
  localStorage.setItem(key(storeId), JSON.stringify(items));
}

/**
 * Procura a linha com a chave dada. Devolve `undefined` se não existir.
 *
 * Existe para que quem precisa da quantidade atual de uma linha não tenha de
 * filtrar o carrinho por `productId` — o que colapsaria duas Combinação do mesmo
 * Produto numa só linha, em silêncio.
 */
export function findCartLine(storeId: string, lineKey: string): CartItem | undefined {
  return getCart(storeId).find((i) => lineKeyOf(i) === lineKey);
}

/**
 * Adiciona um item ao carrinho, ou soma a quantidade à linha da **mesma**
 * Combinação (R4.13). Combinação diferente do mesmo Produto cria linha nova.
 * Devolve o carrinho atualizado.
 */
export function addToCart(storeId: string, item: Omit<CartItem, "quantity">, quantity = 1): CartItem[] {
  const qty = Math.max(1, Math.floor(quantity) || 1);
  const items = getCart(storeId);
  const lineKey = lineKeyOf(item);
  const existing = items.find((i) => lineKeyOf(i) === lineKey);
  if (existing) existing.quantity += qty;
  else items.push({ ...item, quantity: qty });
  save(storeId, items);
  return items;
}

/**
 * Define a quantidade de uma linha (remove se <= 0).
 *
 * O segundo parâmetro é uma **chave de linha** de `cartLineKey`, não um
 * `productId`.
 */
export function setQuantity(storeId: string, lineKey: string, quantity: number): CartItem[] {
  let items = getCart(storeId);
  if (quantity <= 0) items = items.filter((i) => lineKeyOf(i) !== lineKey);
  else items = items.map((i) => (lineKeyOf(i) === lineKey ? { ...i, quantity: Math.floor(quantity) } : i));
  save(storeId, items);
  return items;
}

/**
 * Remove uma linha do carrinho.
 *
 * O segundo parâmetro é uma **chave de linha** de `cartLineKey`, não um
 * `productId`. Remover «o Produto todo» é remover cada uma das suas linhas.
 */
export function removeFromCart(storeId: string, lineKey: string): CartItem[] {
  const items = getCart(storeId).filter((i) => lineKeyOf(i) !== lineKey);
  save(storeId, items);
  return items;
}

/** Esvazia o carrinho da loja. */
export function clearCart(storeId: string): void {
  save(storeId, []);
}

/** Número total de unidades no carrinho, somando todas as linhas. */
export function cartCount(storeId: string): number {
  return getCart(storeId).reduce((n, i) => n + i.quantity, 0);
}

/**
 * Valor total do carrinho. `i.price` é o preço efetivo da linha, por isso a
 * soma continua a ser `preço × quantidade` de cada linha (R4.15).
 */
export function cartTotal(storeId: string): number {
  return getCart(storeId).reduce((sum, i) => sum + i.price * i.quantity, 0);
}

/** Atualiza os contadores de carrinho ([data-cart-count]) presentes no DOM. */
export function updateCartBadge(storeId: string): void {
  const n = cartCount(storeId);
  document.querySelectorAll<HTMLElement>("[data-cart-count]").forEach((el) => {
    el.textContent = String(n);
    el.classList.toggle("hidden", n === 0);
  });
}
