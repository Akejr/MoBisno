/** Carrinho da loja — lista, quantidades, total e finalização via WhatsApp. */
import { render, $, esc, formatKz, fadeInImages, toast } from "../lib/dom.js";
import { storeBasePath, storeHomePath } from "../lib/routing.js";
import { loadStorefront } from "../lib/storeCache.js";
import { getCart, setQuantity, removeFromCart, findCartLine, cartTotal, updateCartBadge, type CartItem } from "../lib/cart.js";
import { rowKeyAttr, rowKeyOf } from "../lib/cartRowKey.js";
import { resolveWaPhone, waLink } from "../lib/whatsapp.js";
import { brandOf, readableInk } from "../lib/brand.js";
import { applyInk } from "../lib/ink.js";
import { applyFieldColors } from "../lib/fieldColors.js";
import { applyIconColor } from "../lib/iconColor.js";
import { applyTheme } from "../lib/theme.js";
import { storeNotFoundHtml } from "../templates/notFound.js";

function itemRow(it: CartItem): string {
  const thumb = it.imageUrl
    ? `<img src="${esc(it.imageUrl)}" class="w-16 h-16 rounded-lg object-cover border border-neutral-200" />`
    : `<div class="w-16 h-16 rounded-lg bg-neutral-100 flex items-center justify-center"><span class="material-symbols-outlined text-neutral-400">image</span></div>`;
  // Chave de linha (percent-encoded) em vez do `productId`: duas Combinação do
  // mesmo Produto são duas linhas independentes (R4.13).
  const rowKey = rowKeyAttr(it);
  // Etiqueta da Combinação escolhida (R4.14), truncada dentro do `min-w-0` para
  // não haver deslocamento horizontal a 360 px.
  const variant = it.variantLabel
    ? `<p class="text-sm text-neutral-600 truncate">${esc(it.variantLabel)}</p>`
    : "";
  return `<div class="flex items-center gap-3 py-4" data-row="${esc(rowKey)}">
    ${thumb}
    <div class="flex-1 min-w-0">
      <p class="font-medium text-neutral-900 truncate">${esc(it.name)}</p>
      ${variant}
      <p class="text-sm text-neutral-500">${esc(formatKz(it.price))}</p>
    </div>
    <div class="flex items-center border border-neutral-300 rounded-lg overflow-hidden">
      <button type="button" data-dec="${esc(rowKey)}" class="w-9 h-9 flex items-center justify-center hover:bg-neutral-100"><span class="material-symbols-outlined text-[18px]">remove</span></button>
      <span data-qtylabel class="w-9 text-center text-sm">${it.quantity}</span>
      <button type="button" data-inc="${esc(rowKey)}" class="w-9 h-9 flex items-center justify-center hover:bg-neutral-100"><span class="material-symbols-outlined text-[18px]">add</span></button>
    </div>
    <p class="w-28 text-right font-bold text-neutral-900 hidden sm:block">${esc(formatKz(it.price * it.quantity))}</p>
    <button type="button" data-remove="${esc(rowKey)}" class="text-neutral-400 hover:text-red-600 ml-1"><span class="material-symbols-outlined">delete</span></button>
  </div>`;
}

export async function renderCartPage(identifier: string): Promise<void> {
  const { result, view, custom } = await loadStorefront(identifier);
  if (view.kind !== "render" || result.kind !== "render") {
    render(storeNotFoundHtml(identifier));
    return;
  }

  const storeId = result.store.id;
  const brand = brandOf(custom, result.store.templateId);
  const homeHref = storeHomePath(identifier);
  const online = !!custom.payments?.onlineEnabled;
  const checkoutHref = `${storeBasePath(identifier)}/checkout`;

  function draw(): void {
    const items = getCart(storeId);
    const total = cartTotal(storeId);
    const body = items.length === 0
      ? `<div class="py-20 text-center text-neutral-500">
          <span class="material-symbols-outlined" style="font-size:56px;">shopping_cart</span>
          <p class="mt-3">O seu carrinho está vazio.</p>
          <a href="${esc(homeHref)}" class="inline-block mt-4 px-6 py-3 rounded-lg font-bold" style="background:var(--brand);color:var(--brand-ink,#fff)">Continuar a comprar</a>
        </div>`
      : `<div class="divide-y divide-neutral-100">${items.map(itemRow).join("")}</div>
         <div class="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-neutral-200 pt-6">
           <div class="text-lg">Total: <span class="font-bold text-2xl" style="color:var(--brand)">${esc(formatKz(total))}</span></div>
           <div class="flex gap-3">
             <a href="${esc(homeHref)}" class="px-5 py-3 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-50 font-medium">Continuar a comprar</a>
             ${online
               ? `<a href="${esc(checkoutHref)}" class="px-6 py-3 rounded-lg font-bold inline-flex items-center gap-2" style="background:var(--brand);color:var(--brand-ink,#fff)"><span class="material-symbols-outlined text-[20px]">bolt</span> Comprar agora</a>`
               : `<button id="checkout" class="px-6 py-3 rounded-lg font-bold inline-flex items-center gap-2" style="background:var(--brand);color:var(--brand-ink,#fff)"><span class="material-symbols-outlined text-[20px]">chat</span> Finalizar via WhatsApp</button>`}
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
    app.style.setProperty("--brand-ink", readableInk(brand));
    applyInk(app, custom);
    applyTheme(app, custom);
    applyFieldColors(app, custom);
    applyIconColor(app, custom);
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
      b.addEventListener("click", () => { changeQty(rowKeyOf(b.dataset.inc), +1); }));
    document.querySelectorAll<HTMLElement>("[data-dec]").forEach((b) =>
      b.addEventListener("click", () => { changeQty(rowKeyOf(b.dataset.dec), -1); }));
    document.querySelectorAll<HTMLElement>("[data-remove]").forEach((b) =>
      b.addEventListener("click", () => { removeFromCart(storeId, rowKeyOf(b.dataset.remove)); draw(); }));
  }

  /**
   * Altera a quantidade de **uma linha**, pela chave de linha. O `find` por
   * `productId` que aqui estava juntava duas Combinação do mesmo Produto na
   * primeira linha encontrada (R4.13).
   */
  function changeQty(lineKey: string, delta: number): void {
    const item = findCartLine(storeId, lineKey);
    if (!item) return;
    setQuantity(storeId, lineKey, item.quantity + delta);
    draw();
  }

  draw();
}
