/**
 * Carrinho da loja — lista, quantidades, total e finalização.
 *
 * A finalização segue a decisão única de `digitalPaymentsVisible(store)`
 * (`src/services/paymentVisibility.ts`): com pagamentos digitais, «Comprar
 * agora» leva ao checkout; sem eles, «Finalizar via WhatsApp» envia a
 * encomenda por mensagem. O texto dessa mensagem é composto por
 * `buildCartWhatsAppMessage` — o mesmo autor do checkout e da gaveta —, que
 * escreve a Combinação de cada linha (antes este ficheiro tinha a sua própria
 * cópia do texto e deixava-a cair).
 */
import { render, $, esc, formatKz, fadeInImages } from "../lib/dom.js";
import { storeBasePath, storeHomePath } from "../lib/routing.js";
import { loadStorefront } from "../lib/storeCache.js";
import {
  getCart, setQuantity, removeFromCart, findCartLine, cartTotal, updateCartBadge, announce, type CartItem,
} from "../lib/cart.js";
import { rowKeyAttr, rowKeyOf } from "../lib/cartRowKey.js";
import { resolveWaPhone, waLink } from "../lib/whatsapp.js";
import { brandOf, readableInk } from "../lib/brand.js";
import { applyInk } from "../lib/ink.js";
import { applyFieldColors } from "../lib/fieldColors.js";
import { applyIconColor } from "../lib/iconColor.js";
import { applyTheme } from "../lib/theme.js";
import { trackStoreEvent } from "../supabase/analytics.js";
import { digitalPaymentsVisible } from "../../src/services/paymentVisibility.js";
import { recordWhatsappOrder } from "../supabase/whatsappOrders.js";
import { buildCartWhatsAppMessage } from "../../src/services/cartMessage.js";
import { storeNotFoundHtml } from "../templates/notFound.js";

/** Tempo durante o qual um segundo toque em «Finalizar via WhatsApp» é ignorado. */
const WHATSAPP_COOLDOWN_MS = 2500;

/** Nome da linha para os rótulos acessíveis: o Produto e, quando existe, a Combinação. */
function lineName(it: Pick<CartItem, "name" | "variantLabel">): string {
  return it.variantLabel && it.variantLabel.trim() ? `${it.name} (${it.variantLabel.trim()})` : it.name;
}

function itemRow(it: CartItem): string {
  const thumb = it.imageUrl
    ? `<img src="${esc(it.imageUrl)}" alt="" class="w-16 h-16 rounded-lg object-cover border border-neutral-200" />`
    : `<div class="w-16 h-16 rounded-lg bg-neutral-100 flex items-center justify-center"><span class="material-symbols-outlined text-neutral-400" aria-hidden="true">image</span></div>`;
  // Chave de linha (percent-encoded) em vez do `productId`: duas Combinação do
  // mesmo Produto são duas linhas independentes (R4.13).
  const rowKey = rowKeyAttr(it);
  // Etiqueta da Combinação escolhida (R4.14), truncada dentro do `min-w-0` para
  // não haver deslocamento horizontal a 360 px.
  const variant = it.variantLabel
    ? `<p class="text-sm text-neutral-600 truncate">${esc(it.variantLabel)}</p>`
    : "";
  const who = lineName(it);
  return `<div class="flex items-center gap-3 py-4" data-row="${esc(rowKey)}">
    ${thumb}
    <div class="flex-1 min-w-0">
      <p class="font-medium text-neutral-900 truncate">${esc(it.name)}</p>
      ${variant}
      <p class="text-sm text-neutral-600">${esc(formatKz(it.price))}</p>
    </div>
    <div role="group" aria-label="${esc(`Quantidade de ${who}`)}" class="flex items-center border border-neutral-400 rounded-lg overflow-hidden">
      <button type="button" data-dec="${esc(rowKey)}" aria-label="${esc(`Diminuir a quantidade de ${who}`)}" class="w-9 h-9 flex items-center justify-center hover:bg-neutral-100"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">remove</span></button>
      <span data-qtylabel class="w-9 text-center text-sm">${esc(it.quantity)}</span>
      <button type="button" data-inc="${esc(rowKey)}" aria-label="${esc(`Aumentar a quantidade de ${who}`)}" class="w-9 h-9 flex items-center justify-center hover:bg-neutral-100"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">add</span></button>
    </div>
    <p class="w-28 text-right font-bold text-neutral-900 hidden sm:block">${esc(formatKz(it.price * it.quantity))}</p>
    <button type="button" data-remove="${esc(rowKey)}" aria-label="${esc(`Remover ${who} do carrinho`)}" class="text-neutral-500 hover:text-red-700 ml-1"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button>
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
  // Decisão única (src/services/paymentVisibility.ts): loja aprovada pela
  // MôBisno e fornecedor de pagamentos ligado.
  const online = digitalPaymentsVisible(result.store);
  const checkoutHref = `${storeBasePath(identifier)}/checkout`;
  /** Encomenda por WhatsApp acabada de abrir — recusa o toque duplo. */
  let sending = false;

  function draw(): void {
    const items = getCart(storeId);
    const total = cartTotal(storeId);
    const body = items.length === 0
      ? `<div class="py-20 text-center text-neutral-600">
          <span class="material-symbols-outlined" aria-hidden="true" style="font-size:56px;">shopping_cart</span>
          <p class="mt-3">O seu carrinho está vazio.</p>
          <a href="${esc(homeHref)}" class="inline-block mt-4 px-6 py-3 rounded-lg font-bold" style="background:var(--brand);color:var(--brand-ink,#fff)">Continuar a comprar</a>
        </div>`
      : `<div class="divide-y divide-neutral-100">${items.map(itemRow).join("")}</div>
         <div class="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-neutral-200 pt-6">
           <div class="text-lg">Total: <span class="font-bold text-2xl" style="color:var(--brand)">${esc(formatKz(total))}</span></div>
           <div class="flex flex-wrap gap-3">
             <a href="${esc(homeHref)}" class="px-5 py-3 rounded-lg border border-neutral-400 text-neutral-800 hover:bg-neutral-50 font-medium">Continuar a comprar</a>
             ${online
               ? `<a href="${esc(checkoutHref)}" class="px-6 py-3 rounded-lg font-bold inline-flex items-center gap-2" style="background:var(--brand);color:var(--brand-ink,#fff)"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">bolt</span> Comprar agora</a>`
               : `<button id="checkout" type="button" class="px-6 py-3 rounded-lg font-bold inline-flex items-center gap-2" style="background:var(--brand);color:var(--brand-ink,#fff)"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">chat</span> Finalizar via WhatsApp</button>`}
           </div>
         </div>`;

    const app = render(`
      <div class="min-h-screen flex flex-col bg-white text-neutral-900">
        <header class="sticky top-0 z-50 bg-white border-b border-neutral-100">
          <div class="w-full max-w-[900px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <a href="${esc(homeHref)}" class="flex items-center gap-1 text-neutral-700 hover:text-neutral-900"><span class="material-symbols-outlined" aria-hidden="true">arrow_back</span> Voltar à loja</a>
            <span class="font-bold truncate">${esc(view.kind === "render" ? view.storeName : "")}</span>
          </div>
        </header>
        <main class="w-full max-w-[900px] mx-auto px-4 sm:px-6 py-8 flex-grow">
          <h1 id="cart-title" tabindex="-1" class="text-3xl font-bold mb-6 outline-none">Carrinho</h1>
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
      if (sending) return;
      const items = getCart(storeId);
      if (items.length === 0) return;
      sending = true;
      window.setTimeout(() => { sending = false; }, WHATSAPP_COOLDOWN_MS);
      // Autor único do texto (src/services/cartMessage.ts): cada linha leva a
      // Combinação escolhida. Sem `extras`: a entrega, o desconto e os dados do
      // comprador são recolhidos no checkout.
      const msg = buildCartWhatsAppMessage(items, formatKz);
      window.open(waLink(resolveWaPhone(custom), msg), "_blank", "noopener");
      void trackStoreEvent(storeId, "whatsapp_order");
      // Fica registada para o Dono a ver no painel, mesmo que a mensagem nunca
      // chegue a ser enviada. Não esperamos pelo resultado.
      void recordWhatsappOrder({
        storeId,
        items: items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, variantLabel: i.variantLabel })),
        subtotal: cartTotal(storeId),
        total: cartTotal(storeId),
        origin: "carrinho",
      });
      // Sem aviso flutuante: o WhatsApp abre por cima, e o leitor de ecrã ouve isto.
      announce("A abrir o WhatsApp para finalizar a encomenda.");
    });

    document.querySelectorAll<HTMLElement>("[data-inc]").forEach((b) =>
      b.addEventListener("click", () => { changeQty(rowKeyOf(b.dataset.inc), +1, "data-inc"); }));
    document.querySelectorAll<HTMLElement>("[data-dec]").forEach((b) =>
      b.addEventListener("click", () => { changeQty(rowKeyOf(b.dataset.dec), -1, "data-dec"); }));
    document.querySelectorAll<HTMLElement>("[data-remove]").forEach((b) =>
      b.addEventListener("click", () => { remove(rowKeyOf(b.dataset.remove)); }));
  }

  /**
   * Devolve o foco ao mesmo botão da mesma linha depois de redesenhar — o
   * carrinho é redesenhado inteiro a cada alteração e, sem isto, quem usa o
   * teclado voltava ao início da página a cada «+». Se a linha desapareceu, o
   * foco vai para o título do carrinho.
   */
  function refocus(attr: string, lineKey: string): void {
    const target = Array.from(document.querySelectorAll<HTMLElement>(`[${attr}]`))
      .find((el) => rowKeyOf(el.getAttribute(attr)) === lineKey);
    (target ?? document.getElementById("cart-title"))?.focus();
  }

  /**
   * Altera a quantidade de **uma linha**, pela chave de linha. O `find` por
   * `productId` que aqui estava juntava duas Combinação do mesmo Produto na
   * primeira linha encontrada (R4.13).
   */
  function changeQty(lineKey: string, delta: number, attr: string): void {
    const item = findCartLine(storeId, lineKey);
    if (!item) return;
    const next = item.quantity + delta;
    setQuantity(storeId, lineKey, next);
    draw();
    refocus(attr, lineKey);
    announce(next > 0 ? `Quantidade de ${lineName(item)}: ${next}.` : `${lineName(item)} saiu do carrinho.`);
  }

  function remove(lineKey: string): void {
    const item = findCartLine(storeId, lineKey);
    removeFromCart(storeId, lineKey);
    draw();
    document.getElementById("cart-title")?.focus();
    if (item) announce(`${lineName(item)} saiu do carrinho.`);
  }

  draw();
}
