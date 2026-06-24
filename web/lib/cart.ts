/**
 * Carrinho de compras simples por loja, persistido em localStorage.
 *
 * É deliberadamente leve (sem dependências) e isolado por `storeId`, para que
 * cada loja publicada tenha o seu próprio carrinho no browser do cliente.
 */

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  imageUrl?: string;
  quantity: number;
}

function key(storeId: string): string {
  return `mb-cart:${storeId}`;
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

/** Adiciona (ou incrementa) um item no carrinho. Devolve o carrinho atualizado. */
export function addToCart(storeId: string, item: Omit<CartItem, "quantity">, quantity = 1): CartItem[] {
  const qty = Math.max(1, Math.floor(quantity) || 1);
  const items = getCart(storeId);
  const existing = items.find((i) => i.productId === item.productId);
  if (existing) existing.quantity += qty;
  else items.push({ ...item, quantity: qty });
  save(storeId, items);
  return items;
}

/** Define a quantidade de um item (remove se <= 0). */
export function setQuantity(storeId: string, productId: string, quantity: number): CartItem[] {
  let items = getCart(storeId);
  if (quantity <= 0) items = items.filter((i) => i.productId !== productId);
  else items = items.map((i) => (i.productId === productId ? { ...i, quantity: Math.floor(quantity) } : i));
  save(storeId, items);
  return items;
}

/** Remove um item do carrinho. */
export function removeFromCart(storeId: string, productId: string): CartItem[] {
  const items = getCart(storeId).filter((i) => i.productId !== productId);
  save(storeId, items);
  return items;
}

/** Número total de unidades no carrinho. */
export function cartCount(storeId: string): number {
  return getCart(storeId).reduce((n, i) => n + i.quantity, 0);
}

/** Valor total do carrinho. */
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
