/**
 * Mini-carrinho em painel deslizante (dropdown) para desktop. No mobile, o
 * clique no ícone do carrinho navega para a página dedicada.
 */
import { esc, formatKz, toast } from "./dom.js";
import { getCart, setQuantity, removeFromCart, cartTotal, updateCartBadge, type CartItem } from "./cart.js";
import { resolveWaPhone, waLink } from "./whatsapp.js";
import { loadStorefront } from "./storeCache.js";
import { brandOf, readableInk } from "./brand.js";
import { applyInk } from "./ink.js";
import { applyIconColor } from "./iconColor.js";
import { applyTheme } from "./theme.js";

let mounted = false;

function isMobile(): boolean {
  return window.matchMedia("(max-width: 767px)").matches;
}

/** Injeta (uma vez) o tema escuro do mini-carrinho para modelos escuros (ex.: Neon Lab). */
function ensureCartDarkStyle(): void {
  if (document.getElementById("mb-cart-dark-style")) return;
  const st = document.createElement("style");
  st.id = "mb-cart-dark-style";
  st.textContent = `
    #mb-cart-drawer.nl-dark [data-panel]{background:#121317 !important;color:#e3e2e7}
    #mb-cart-drawer.nl-dark :is(.text-neutral-900){color:#e3e2e7 !important}
    #mb-cart-drawer.nl-dark :is(.text-neutral-600,.text-neutral-500){color:#8e9192 !important}
    #mb-cart-drawer.nl-dark :is(.text-neutral-400){color:#5f5e5e !important}
    #mb-cart-drawer.nl-dark :is(.bg-neutral-100){background:#1e1f23 !important}
    #mb-cart-drawer.nl-dark :is(.border-neutral-100,.border-neutral-200,.border-neutral-300){border-color:#444748 !important}
    #mb-cart-drawer.nl-dark .hover\\:bg-neutral-100:hover{background:rgba(255,255,255,.06) !important}
    #mb-cart-drawer.nl-dark .hover\\:text-neutral-900:hover{color:#e3e2e7 !important}
    #mb-cart-drawer.nl-dark .divide-neutral-100 > * + *{border-color:rgba(68,71,72,.4) !important}
  `;
  document.head.appendChild(st);
}

/** Extrai o identificador da loja a partir de um href `#/loja/<id>/carrinho`. */
function identifierFromHref(href: string): string | null {
  const m = href.match(/#\/loja\/([^/]+)\/carrinho/);
  return m ? decodeURIComponent(m[1]) : null;
}

function itemRow(it: CartItem): string {
  const thumb = it.imageUrl
    ? `<img src="${esc(it.imageUrl)}" class="w-14 h-14 rounded-lg object-cover border border-neutral-200" />`
    : `<div class="w-14 h-14 rounded-lg bg-neutral-100 flex items-center justify-center"><span class="material-symbols-outlined text-neutral-400">image</span></div>`;
  return `<div class="flex items-center gap-3 py-3" data-row="${esc(it.productId)}">
    ${thumb}
    <div class="flex-1 min-w-0">
      <p class="font-medium text-neutral-900 text-sm truncate">${esc(it.name)}</p>
      <p class="text-xs text-neutral-500">${esc(formatKz(it.price))}</p>
      <div class="flex items-center mt-1 border border-neutral-300 rounded-md w-fit">
        <button type="button" data-dec="${esc(it.productId)}" class="w-7 h-7 flex items-center justify-center hover:bg-neutral-100"><span class="material-symbols-outlined text-[16px]">remove</span></button>
        <span class="w-7 text-center text-sm">${it.quantity}</span>
        <button type="button" data-inc="${esc(it.productId)}" class="w-7 h-7 flex items-center justify-center hover:bg-neutral-100"><span class="material-symbols-outlined text-[16px]">add</span></button>
      </div>
    </div>
    <button type="button" data-remove="${esc(it.productId)}" class="text-neutral-400 hover:text-red-600"><span class="material-symbols-outlined text-[20px]">delete</span></button>
  </div>`;
}

export async function openCartDrawer(identifier: string): Promise<void> {
  const loaded = await loadStorefront(identifier);
  if (loaded.result.kind !== "render") return;
  const storeId = loaded.result.store.id;
  const custom = loaded.custom;
  const templateId = loaded.result.store.templateId;
  const brand = brandOf(custom, templateId);
  const cartPageHref = `#/loja/${encodeURIComponent(identifier)}/carrinho`;
  const checkoutHref = `#/loja/${encodeURIComponent(identifier)}/checkout`;
  const online = !!custom.payments?.onlineEnabled;
  // Loja baseada num modelo (ou a própria loja-modelo): mostra "Comprar agora"
  // (leva ao checkout com os métodos visíveis), mesmo sem pagamentos ativos.
  const isModel = !!((custom as { __basedOn?: string }).__basedOn || (custom as { __template?: unknown }).__template);
  const showCheckout = online || isModel;
  const darkTheme = templateId === "neonlab";

  // Remove instância anterior, se existir.
  document.getElementById("mb-cart-drawer")?.remove();

  const host = document.createElement("div");
  host.id = "mb-cart-drawer";
  host.className = "fixed inset-0 z-[180]";
  host.innerHTML = `
    <div data-overlay class="absolute inset-0 bg-black/40 opacity-0 transition-opacity duration-200"></div>
    <aside data-panel class="absolute top-0 right-0 h-full w-full max-w-sm bg-white shadow-2xl flex flex-col translate-x-full transition-transform duration-200 ease-out">
      <div class="flex items-center justify-between px-5 h-14 border-b border-neutral-100 shrink-0">
        <h3 class="font-bold text-neutral-900 flex items-center gap-2"><span class="material-symbols-outlined">shopping_cart</span> Carrinho</h3>
        <button data-close class="text-neutral-500 hover:text-neutral-900"><span class="material-symbols-outlined">close</span></button>
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
  if (darkTheme) { ensureCartDarkStyle(); host.classList.add("nl-dark"); }

  const overlay = host.querySelector<HTMLElement>("[data-overlay]")!;
  const panel = host.querySelector<HTMLElement>("[data-panel]")!;
  const body = host.querySelector<HTMLElement>("[data-body]")!;
  const foot = host.querySelector<HTMLElement>("[data-foot]")!;

  requestAnimationFrame(() => {
    overlay.style.opacity = "1";
    panel.style.transform = "translateX(0)";
  });

  function close(): void {
    overlay.style.opacity = "0";
    panel.style.transform = "translateX(100%)";
    window.setTimeout(() => host.remove(), 220);
  }
  overlay.addEventListener("click", close);
  host.querySelector("[data-close]")!.addEventListener("click", close);

  function draw(): void {
    const items = getCart(storeId);
    if (items.length === 0) {
      body.innerHTML = `<div class="py-16 text-center text-neutral-500">
        <span class="material-symbols-outlined" style="font-size:48px;">shopping_cart</span>
        <p class="mt-2 text-sm">O carrinho está vazio.</p>
      </div>`;
      foot.innerHTML = `<a href="${esc(cartPageHref)}" data-go class="block text-center text-sm text-neutral-500 hover:text-neutral-900">Continuar a comprar</a>`;
    } else {
      body.innerHTML = `<div class="divide-y divide-neutral-100">${items.map(itemRow).join("")}</div>`;
      foot.innerHTML = `
        <div class="flex items-center justify-between mb-3">
          <span class="text-neutral-600">Total</span>
          <span class="font-bold text-xl" style="color:var(--brand)">${esc(formatKz(cartTotal(storeId)))}</span>
        </div>
        ${showCheckout
          ? `<a href="${esc(checkoutHref)}" data-go class="w-full py-3 rounded-lg font-bold inline-flex items-center justify-center gap-2" style="background:var(--brand);color:var(--brand-ink,#fff)"><span class="material-symbols-outlined text-[20px]">bolt</span> Comprar agora</a>`
          : `<button data-checkout class="w-full py-3 rounded-lg font-bold inline-flex items-center justify-center gap-2" style="background:var(--brand);color:var(--brand-ink,#fff)"><span class="material-symbols-outlined text-[20px]">chat</span> Finalizar via WhatsApp</button>`}`;
    }
    bindRows();
    updateCartBadge(storeId);
  }

  function bindRows(): void {
    body.querySelectorAll<HTMLElement>("[data-inc]").forEach((b) =>
      b.addEventListener("click", () => changeQty(b.dataset.inc!, +1)));
    body.querySelectorAll<HTMLElement>("[data-dec]").forEach((b) =>
      b.addEventListener("click", () => changeQty(b.dataset.dec!, -1)));
    body.querySelectorAll<HTMLElement>("[data-remove]").forEach((b) =>
      b.addEventListener("click", () => { removeFromCart(storeId, b.dataset.remove!); draw(); }));
    foot.querySelector("[data-checkout]")?.addEventListener("click", () => {
      const items = getCart(storeId);
      if (!items.length) return;
      const lines = items.map((i) => `• ${i.quantity}x ${i.name} (${formatKz(i.price * i.quantity)})`).join("\n");
      const msg = `Olá! Gostaria de encomendar:\n${lines}\n\nTotal: ${formatKz(cartTotal(storeId))}`;
      window.open(waLink(resolveWaPhone(custom), msg), "_blank", "noopener");
      toast("A abrir o WhatsApp para finalizar…");
    });
    foot.querySelector("[data-go]")?.addEventListener("click", close);
  }

  function changeQty(productId: string, delta: number): void {
    const item = getCart(storeId).find((i) => i.productId === productId);
    if (!item) return;
    setQuantity(storeId, productId, item.quantity + delta);
    draw();
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
