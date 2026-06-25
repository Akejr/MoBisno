/** Carrinho da loja — lista, quantidades, total e finalização via WhatsApp. */
import { render, $, esc, formatKz, fadeInImages, toast } from "../lib/dom.js";
import { loadStorefront } from "../lib/storeCache.js";
import { getCart, setQuantity, removeFromCart, cartTotal, updateCartBadge, type CartItem } from "../lib/cart.js";
import { resolveWaPhone, waLink } from "../lib/whatsapp.js";
import { brandOf } from "../lib/brand.js";
import { applyInk } from "../lib/ink.js";

function itemRow(it: CartItem): string {
  const thumb = it.imageUrl
    ? `<img src="${esc(it.imageUrl)}" class="w-16 h-16 rounded-lg object-cover border border-neutral-200" />`
    : `<div class="w-16 h-16 rounded-lg bg-neutral-100 flex items-center justify-center"><span class="material-symbols-outlined text-neutral-400">image</span></div>`;
  return `<div class="flex items-center gap-3 py-4" data-row="${esc(it.productId)}">
    ${thumb}
    <div class="flex-1 min-w-0">
      <p class="font-medium text-neutral-900 truncate">${esc(it.name)}</p>
      <p class="text-sm text-neutral-500">${esc(formatKz(it.price))}</p>
    </div>
    <div class="flex items-center border border-neutral-300 rounded-lg overflow-hidden">
      <button type="button" data-dec="${esc(it.productId)}" class="w-9 h-9 flex items-center justify-center hover:bg-neutral-100"><span class="material-symbols-outlined text-[18px]">remove</span></button>
      <span data-qtylabel class="w-9 text-center text-sm">${it.quantity}</span>
      <button type="button" data-inc="${esc(it.productId)}" class="w-9 h-9 flex items-center justify-center hover:bg-neutral-100"><span class="material-symbols-outlined text-[18px]">add</span></button>
    </div>
    <p class="w-28 text-right font-bold text-neutral-900 hidden sm:block">${esc(formatKz(it.price * it.quantity))}</p>
    <button type="button" data-remove="${esc(it.productId)}" class="text-neutral-400 hover:text-red-600 ml-1"><span class="material-symbols-outlined">delete</span></button>
  </div>`;
}

export async function renderCartPage(identifier: string): Promise<void> {
  const { result, view, custom } = await loadStorefront(identifier);
  if (view.kind !== "render" || result.kind !== "render") {
    render(`<div class="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
      <span class="material-symbols-outlined text-on-surface-variant" style="font-size:64px;">storefront</span>
      <h1 class="text-headline-lg text-on-surface">Loja não encontrada</h1>
      <a href="#/" class="bg-primary text-on-primary px-6 py-3 rounded-full mt-2">Voltar ao início</a></div>`);
    return;
  }

  const storeId = result.store.id;
  const brand = brandOf(custom, result.store.templateId);
  const homeHref = `#/loja/${encodeURIComponent(identifier)}`;

  function draw(): void {
    const items = getCart(storeId);
    const total = cartTotal(storeId);
    const body = items.length === 0
      ? `<div class="py-20 text-center text-neutral-500">
          <span class="material-symbols-outlined" style="font-size:56px;">shopping_cart</span>
          <p class="mt-3">O seu carrinho está vazio.</p>
          <a href="${esc(homeHref)}" class="inline-block mt-4 px-6 py-3 rounded-lg text-white font-bold" style="background:var(--brand)">Continuar a comprar</a>
        </div>`
      : `<div class="divide-y divide-neutral-100">${items.map(itemRow).join("")}</div>
         <div class="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-neutral-200 pt-6">
           <div class="text-lg">Total: <span class="font-bold text-2xl" style="color:var(--brand)">${esc(formatKz(total))}</span></div>
           <div class="flex gap-3">
             <a href="${esc(homeHref)}" class="px-5 py-3 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-50 font-medium">Continuar a comprar</a>
             <button id="checkout" class="px-6 py-3 rounded-lg text-white font-bold inline-flex items-center gap-2" style="background:var(--brand)"><span class="material-symbols-outlined text-[20px]">chat</span> Finalizar via WhatsApp</button>
           </div>
         </div>`;

    const app = render(`
      <div class="min-h-screen flex flex-col bg-white text-neutral-900">
        <header class="sticky top-0 z-50 bg-white border-b border-neutral-100">
          <div class="w-full max-w-[900px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <a href="${esc(homeHref)}" class="flex items-center gap-1 text-neutral-600 hover:text-neutral-900"><span class="material-symbols-outlined">arrow_back</span> Voltar à loja</a>
            <span class="font-bold truncate">${esc(view.kind === "render" ? view.storeName : "")}</span>
          </div>
        </header>
        <main class="w-full max-w-[900px] mx-auto px-4 sm:px-6 py-8 flex-grow">
          <h1 class="text-3xl font-bold mb-6">Carrinho</h1>
          ${body}
        </main>
      </div>`);
    app.style.setProperty("--brand", brand);
    applyInk(app, custom);
    fadeInImages(app);
    bind();
    updateCartBadge(storeId);
  }

  function bind(): void {
    $("#checkout")?.addEventListener("click", () => {
      const items = getCart(storeId);
      if (items.length === 0) return;
      const lines = items.map((i) => `• ${i.quantity}x ${i.name} (${formatKz(i.price * i.quantity)})`).join("\n");
      const msg = `Olá! Gostaria de encomendar:\n${lines}\n\nTotal: ${formatKz(cartTotal(storeId))}`;
      window.open(waLink(resolveWaPhone(custom), msg), "_blank", "noopener");
      toast("A abrir o WhatsApp para finalizar…");
    });

    document.querySelectorAll<HTMLElement>("[data-inc]").forEach((b) =>
      b.addEventListener("click", () => { changeQty(b.dataset.inc!, +1); }));
    document.querySelectorAll<HTMLElement>("[data-dec]").forEach((b) =>
      b.addEventListener("click", () => { changeQty(b.dataset.dec!, -1); }));
    document.querySelectorAll<HTMLElement>("[data-remove]").forEach((b) =>
      b.addEventListener("click", () => { removeFromCart(storeId, b.dataset.remove!); draw(); }));
  }

  function changeQty(productId: string, delta: number): void {
    const item = getCart(storeId).find((i) => i.productId === productId);
    if (!item) return;
    setQuantity(storeId, productId, item.quantity + delta);
    draw();
  }

  draw();
}
