/**
 * Mini-carrinho em painel deslizante (dropdown) para desktop. No mobile, o
 * clique no ícone do carrinho navega para a página dedicada.
 *
 * É um diálogo modal: o foco entra no painel ao abrir, fica preso nele com o
 * Tab, `Escape` fecha, e ao fechar o foco volta ao ícone que o abriu.
 */
import { esc, formatKz } from "./dom.js";
import {
  getCart, setQuantity, removeFromCart, findCartLine, cartTotal, updateCartBadge, announce, type CartItem,
} from "./cart.js";
import { rowKeyAttr, rowKeyOf } from "./cartRowKey.js";
import { resolveWaPhone, waLink } from "./whatsapp.js";
import { digitalPaymentsVisible } from "../../src/services/paymentVisibility.js";
import { recordWhatsappOrder } from "../supabase/whatsappOrders.js";
import { buildCartWhatsAppMessage } from "../../src/services/cartMessage.js";
import { trackStoreEvent } from "../supabase/analytics.js";
import { loadStorefront } from "./storeCache.js";
import { brandOf, readableInk } from "./brand.js";
import { applyInk } from "./ink.js";
import { applyIconColor } from "./iconColor.js";
import { applyTheme } from "./theme.js";
import { currentStoreIdentifier, storeBasePath } from "./routing.js";

let mounted = false;

/** Desliga a gaveta aberta (teclado incluído) antes de abrir outra. */
let detachOpen: (() => void) | null = null;

/** Tempo durante o qual um segundo toque em «Comprar pelo WhatsApp» é ignorado. */
const WHATSAPP_COOLDOWN_MS = 2500;

/** Elementos que recebem foco com o Tab dentro do painel. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isMobile(): boolean {
  return window.matchMedia("(max-width: 767px)").matches;
}

/**
 * Extrai o identificador da loja a partir do href do ícone do carrinho.
 * Aceita `/loja/<id>/carrinho` (domínio principal), `/carrinho` (subdomínio,
 * onde o host identifica a loja) e o formato antigo com `#`.
 */
function identifierFromHref(href: string): string | null {
  const m = href.match(/(?:^|#)\/loja\/([^/]+)\/carrinho/);
  if (m) return decodeURIComponent(m[1]);
  return /(?:^|#)\/carrinho$/.test(href) ? currentStoreIdentifier() : null;
}

/** Nome da linha para os rótulos acessíveis: o Produto e, quando existe, a Combinação. */
function lineName(it: Pick<CartItem, "name" | "variantLabel">): string {
  return it.variantLabel && it.variantLabel.trim() ? `${it.name} (${it.variantLabel.trim()})` : it.name;
}

function itemRow(it: CartItem): string {
  const thumb = it.imageUrl
    ? `<img src="${esc(it.imageUrl)}" alt="" class="w-14 h-14 rounded-lg object-cover border border-neutral-200" />`
    : `<div class="w-14 h-14 rounded-lg bg-neutral-100 flex items-center justify-center"><span class="material-symbols-outlined text-neutral-400" aria-hidden="true">image</span></div>`;
  // Identidade da linha, não do Produto (R4.13): duas Combinação do mesmo
  // Produto são duas linhas com quantidade própria, logo os atributos levam a
  // chave de linha (percent-encoded por `rowKeyAttr`), nunca o `productId`.
  const rowKey = rowKeyAttr(it);
  // Etiqueta da Combinação escolhida (R4.14). `truncate` dentro do `min-w-0`
  // mantém a linha sem deslocamento horizontal a 360 px.
  const variant = it.variantLabel
    ? `<p class="text-xs text-neutral-600 truncate">${esc(it.variantLabel)}</p>`
    : "";
  const who = lineName(it);
  return `<div class="flex items-center gap-3 py-3" data-row="${esc(rowKey)}">
    ${thumb}
    <div class="flex-1 min-w-0">
      <p class="font-medium text-neutral-900 text-sm truncate">${esc(it.name)}</p>
      ${variant}
      <p class="text-xs text-neutral-600">${esc(formatKz(it.price))}</p>
      <div role="group" aria-label="${esc(`Quantidade de ${who}`)}" class="flex items-center mt-1 border border-neutral-400 rounded-md w-fit">
        <button type="button" data-dec="${esc(rowKey)}" aria-label="${esc(`Diminuir a quantidade de ${who}`)}" class="w-7 h-7 flex items-center justify-center hover:bg-neutral-100"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">remove</span></button>
        <span class="w-7 text-center text-sm">${esc(it.quantity)}</span>
        <button type="button" data-inc="${esc(rowKey)}" aria-label="${esc(`Aumentar a quantidade de ${who}`)}" class="w-7 h-7 flex items-center justify-center hover:bg-neutral-100"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">add</span></button>
      </div>
    </div>
    <button type="button" data-remove="${esc(rowKey)}" aria-label="${esc(`Remover ${who} do carrinho`)}" class="text-neutral-500 hover:text-red-700"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">delete</span></button>
  </div>`;
}

export async function openCartDrawer(identifier: string): Promise<void> {
  // Quem abriu a gaveta recebe o foco de volta ao fechar.
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const loaded = await loadStorefront(identifier);
  if (loaded.result.kind !== "render") return;
  const storeId = loaded.result.store.id;
  const custom = loaded.custom;
  const templateId = loaded.result.store.templateId;
  const brand = brandOf(custom, templateId);
  const checkoutHref = `${storeBasePath(identifier)}/checkout`;
  // Decisão ÚNICA (src/services/paymentVisibility.ts): «Comprar agora» só numa
  // loja aprovada pela MôBisno, com o fornecedor de pagamentos ligado.
  const showCheckout = digitalPaymentsVisible(loaded.result.store);
  /** Encomenda por WhatsApp acabada de abrir — recusa o toque duplo. */
  let sending = false;

  // Remove instância anterior, se existir (com o seu ouvinte de teclado).
  detachOpen?.();
  document.getElementById("mb-cart-drawer")?.remove();

  const host = document.createElement("div");
  host.id = "mb-cart-drawer";
  host.className = "fixed inset-0 z-[180]";
  host.innerHTML = `
    <div data-overlay class="absolute inset-0 bg-black/40 opacity-0 transition-opacity duration-200"></div>
    <aside data-panel role="dialog" aria-modal="true" aria-labelledby="mb-cart-title" class="absolute top-0 right-0 h-full w-full max-w-sm bg-white shadow-2xl flex flex-col translate-x-full transition-transform duration-200 ease-out">
      <div class="flex items-center justify-between px-5 h-14 border-b border-neutral-100 shrink-0">
        <h2 id="mb-cart-title" class="font-bold text-neutral-900 flex items-center gap-2"><span class="material-symbols-outlined" aria-hidden="true">shopping_cart</span> Carrinho</h2>
        <button type="button" data-close aria-label="Fechar carrinho" class="text-neutral-600 hover:text-neutral-900"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>
      </div>
      <div data-body class="flex-1 overflow-y-auto px-5"></div>
      <div data-foot class="border-t border-neutral-100 p-5 shrink-0"></div>
    </aside>`;
  document.body.appendChild(host);
  host.style.setProperty("--brand", brand);
  host.style.setProperty("--brand-ink", readableInk(brand));
  // Aplica a identidade do modelo (tema: fontes + cantos) e a cor de texto,
  // para o carrinho manter a mesma UI do site (consistência).
  applyInk(host, custom);
  applyTheme(host, custom);
  applyIconColor(host, custom);
  // Os temas próprios do mini-carrinho para «Neon Lab» e «FoodMart» saíram com
  // os modelos: nenhuma Loja é servida com esses ids desde a remoção do registo.

  const overlay = host.querySelector<HTMLElement>("[data-overlay]")!;
  const panel = host.querySelector<HTMLElement>("[data-panel]")!;
  const body = host.querySelector<HTMLElement>("[data-body]")!;
  const foot = host.querySelector<HTMLElement>("[data-foot]")!;
  const closeBtn = host.querySelector<HTMLElement>("[data-close]")!;

  requestAnimationFrame(() => {
    overlay.style.opacity = "1";
    panel.style.transform = "translateX(0)";
    closeBtn.focus();
  });

  /** `Escape` fecha; o Tab dá a volta dentro do painel (diálogo modal). */
  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab") return;
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !panel.contains(active))) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && (active === last || !panel.contains(active))) { e.preventDefault(); first?.focus(); }
  }
  document.addEventListener("keydown", onKey);

  let closed = false;
  function detach(): void {
    document.removeEventListener("keydown", onKey);
    if (detachOpen === detach) detachOpen = null;
  }
  detachOpen = detach;

  function close(): void {
    if (closed) return;
    closed = true;
    detach();
    overlay.style.opacity = "0";
    panel.style.transform = "translateX(100%)";
    window.setTimeout(() => host.remove(), 220);
    if (opener && document.contains(opener)) opener.focus();
  }
  overlay.addEventListener("click", close);
  closeBtn.addEventListener("click", close);

  function draw(): void {
    const items = getCart(storeId);
    if (items.length === 0) {
      body.innerHTML = `<div class="py-16 text-center text-neutral-600">
        <span class="material-symbols-outlined" aria-hidden="true" style="font-size:48px;">shopping_cart</span>
        <p class="mt-2 text-sm">O carrinho está vazio.</p>
      </div>`;
      // A gaveta abre por cima da loja: continuar a comprar é fechá-la.
      foot.innerHTML = `<button type="button" data-continue class="block w-full text-center text-sm font-medium text-neutral-700 hover:text-neutral-900 underline">Continuar a comprar</button>`;
    } else {
      body.innerHTML = `<div class="divide-y divide-neutral-100">${items.map(itemRow).join("")}</div>`;
      foot.innerHTML = `
        <div class="flex items-center justify-between mb-3">
          <span class="text-neutral-700">Total</span>
          <span class="font-bold text-xl" style="color:var(--brand)">${esc(formatKz(cartTotal(storeId)))}</span>
        </div>
        ${showCheckout
          ? `<a href="${esc(checkoutHref)}" data-go class="w-full py-3 rounded-lg font-bold inline-flex items-center justify-center gap-2" style="background:var(--brand);color:var(--brand-ink,#fff)"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">bolt</span> Comprar agora</a>`
          : `<button type="button" data-checkout class="w-full py-3 rounded-lg font-bold inline-flex items-center justify-center gap-2" style="background:var(--brand);color:var(--brand-ink,#fff)"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">chat</span> Comprar pelo WhatsApp</button>`}`;
    }
    bindRows();
    updateCartBadge(storeId);
  }

  function bindRows(): void {
    body.querySelectorAll<HTMLElement>("[data-inc]").forEach((b) =>
      b.addEventListener("click", () => changeQty(rowKeyOf(b.dataset.inc), +1, "data-inc")));
    body.querySelectorAll<HTMLElement>("[data-dec]").forEach((b) =>
      b.addEventListener("click", () => changeQty(rowKeyOf(b.dataset.dec), -1, "data-dec")));
    body.querySelectorAll<HTMLElement>("[data-remove]").forEach((b) =>
      b.addEventListener("click", () => remove(rowKeyOf(b.dataset.remove))));
    foot.querySelector("[data-checkout]")?.addEventListener("click", () => {
      if (sending) return;
      const items = getCart(storeId);
      if (!items.length) return;
      sending = true;
      window.setTimeout(() => { sending = false; }, WHATSAPP_COOLDOWN_MS);
      // Autor único do texto (src/services/cartMessage.ts). Sem `extras`: a área
      // de entrega, o desconto e os dados do comprador são do Checkout.
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
        origin: "gaveta",
      });
      // Sem aviso flutuante: o WhatsApp abre por cima, e o leitor de ecrã ouve isto.
      announce("A abrir o WhatsApp para finalizar a encomenda.");
    });
    foot.querySelector("[data-go]")?.addEventListener("click", close);
    foot.querySelector("[data-continue]")?.addEventListener("click", close);
  }

  /**
   * Devolve o foco ao mesmo botão da mesma linha depois de redesenhar; se a
   * linha desapareceu, ao botão de fechar — o foco nunca sai do diálogo.
   */
  function refocus(attr: string, lineKey: string): void {
    const target = Array.from(body.querySelectorAll<HTMLElement>(`[${attr}]`))
      .find((el) => rowKeyOf(el.getAttribute(attr)) === lineKey);
    (target ?? closeBtn).focus();
  }

  /**
   * Altera a quantidade de **uma linha**. O `find` por `productId` que aqui
   * estava colapsava duas Combinação do mesmo Produto na primeira linha
   * encontrada; `findCartLine` procura pela chave de linha (R4.13).
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
    closeBtn.focus();
    if (item) announce(`${lineName(item)} saiu do carrinho.`);
  }

  draw();
}

/** Liga o comportamento do ícone de carrinho (dropdown no desktop, página no mobile). */
export function mountCartUI(): void {
  if (mounted) return;
  mounted = true;
  document.addEventListener("click", (e) => {
    const link = (e.target as HTMLElement).closest<HTMLAnchorElement>("[data-cart-link]");
    if (!link) return;
    // No editor (preview), não fazer nada.
    if (location.pathname.startsWith("/personalizar")) { e.preventDefault(); return; }
    // No mobile, deixa navegar para a página dedicada.
    if (isMobile()) return;
    const href = link.getAttribute("href") ?? "";
    const identifier = identifierFromHref(href);
    if (!identifier) return;
    e.preventDefault();
    void openCartDrawer(identifier);
  });
}
