/**
 * Cabeçalhos por variantes — partilhados por todos os modelos. A navegação é
 * FIXA (Início, Produtos, Categorias), igual em todos os modelos e não
 * editável. Mantêm os hooks essenciais: `data-edit-logo`, `data-search-btn`,
 * `data-cart-link`/`data-cart-count` e o dropdown de categorias (CSS
 * group-hover, sem JS). Cor de marca via `var(--brand)`.
 */
import { esc } from "../lib/dom.js";
import { headerCategories } from "./sectionsModel.js";
import type { StoreRenderView, StoreCustomization } from "./types.js";

export type HeaderVariant = "classico" | "centrado" | "promo" | "transparente";

export const HEADER_VARIANTS: { id: HeaderVariant; label: string }[] = [
  { id: "classico", label: "Clássico" },
  { id: "centrado", label: "Logo ao centro" },
  { id: "promo", label: "Com faixa promo" },
  { id: "transparente", label: "Transparente (sobre o hero)" },
];

export interface HeaderCtx { container: string; brand: string; }

function storeIdentifier(view: StoreRenderView): string { return view.subdomain.split(".")[0] ?? view.subdomain; }
function homeHref(view: StoreRenderView): string { return `#/loja/${encodeURIComponent(storeIdentifier(view))}`; }
function categoryHref(view: StoreRenderView, c: string): string { return `${homeHref(view)}/categoria/${encodeURIComponent(c)}`; }
function cartHref(view: StoreRenderView): string { return `${homeHref(view)}/carrinho`; }

function brandHtml(view: StoreRenderView, custom?: StoreCustomization): string {
  const b = view.header.brand;
  if (b.kind === "logo") {
    return `<img src="${esc(b.url)}" alt="${esc(b.alt)}" class="w-auto object-contain" style="height:${custom?.logoScale ?? 32}px" />`;
  }
  return `<span class="text-xl md:text-2xl font-black tracking-tight" style="color:inherit">${esc(view.storeName)}</span>`;
}

/**
 * Navegação fixa do cabeçalho (igual em todos os modelos): Início + Produtos.
 * O dropdown de categorias é acrescentado à parte. Não é editável.
 */
function menuLinks(view: StoreRenderView): string {
  const cls = "hover:opacity-70 cursor-pointer transition-opacity";
  return `<a href="${esc(homeHref(view))}" class="${cls}">Início</a>` +
    `<a href="${esc(homeHref(view))}#produtos" class="${cls}">Produtos</a>`;
}

function categoriesDropdown(view: StoreRenderView): string {
  const cats = headerCategories(view);
  if (!cats.length) return "";
  return `<div class="relative group" data-categories-menu>
    <button type="button" class="flex items-center gap-0.5 hover:opacity-70 transition-opacity">Categorias <span class="material-symbols-outlined text-[18px]">expand_more</span></button>
    <div class="absolute left-0 top-full pt-2 hidden group-hover:block z-50">
      <div class="bg-white border border-gray-100 rounded-xl shadow-lg py-2 min-w-[180px]">
        ${cats.map((c) => `<a href="${esc(categoryHref(view, c))}" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">${esc(c)}</a>`).join("")}
      </div>
    </div>
  </div>`;
}

function searchBtn(): string {
  return `<button type="button" data-search-btn class="hover:opacity-70 transition-opacity"><span class="material-symbols-outlined">search</span></button>`;
}
function cartBtn(view: StoreRenderView, brand: string): string {
  return `<a href="${esc(cartHref(view))}" data-cart-link class="relative inline-flex hover:opacity-70 transition-opacity">
    <span class="material-symbols-outlined">shopping_cart</span>
    <span data-cart-count class="hidden absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center text-white" style="background:${brand}"></span>
  </a>`;
}

/**
 * Menu mobile sem JS (checkbox + CSS), para que funcione tanto no preview como
 * na loja publicada (onde `<script>` não corre mas `<style>` sim). Devolve:
 *  - `head`: o checkbox + o `<style>` de comportamento (colocar no topo do header);
 *  - `button`: o botão hambúrguer (`lg:hidden`, colocar junto ao logótipo);
 *  - `panel`: o painel deslizante com os links (colocar no fim do header).
 */
export function mobileMenuParts(view: StoreRenderView, container: string): { head: string; button: string; panel: string } {
  const cats = headerCategories(view);
  const linkCls = "block px-1 py-3 text-[15px] font-medium border-b border-black/5 hover:opacity-70 transition-opacity";
  const items = `<a href="${esc(homeHref(view))}" class="${linkCls}">Início</a>` +
    `<a href="${esc(homeHref(view))}#produtos" class="${linkCls}">Produtos</a>`;
  const catBlock = cats.length
    ? `<p class="px-1 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">Categorias</p>` +
      cats.map((c) => `<a href="${esc(categoryHref(view, c))}" class="${linkCls}">${esc(c)}</a>`).join("")
    : "";
  const head = `<input type="checkbox" id="mb-mnav" class="mb-mnav-cb" aria-hidden="true" /><style>.mb-mnav-cb{position:absolute;width:0;height:0;opacity:0;pointer-events:none}.mb-mnav-panel{display:none}@media(max-width:1023px){#mb-mnav:checked~.mb-mnav-panel{display:block}#mb-mnav:checked~* .mb-mnav-open{display:none}#mb-mnav:checked~* .mb-mnav-close{display:inline-block}}</style>`;
  const button = `<label for="mb-mnav" class="lg:hidden cursor-pointer inline-flex items-center justify-center w-9 h-9 -ml-1.5 rounded-full hover:bg-black/5 transition-colors shrink-0" aria-label="Abrir menu"><span class="material-symbols-outlined mb-mnav-open">menu</span><span class="material-symbols-outlined mb-mnav-close hidden">close</span></label>`;
  const panel = `<div class="mb-mnav-panel lg:hidden border-t border-black/5 bg-white/95 backdrop-blur text-gray-800"><nav class="${container} py-2 flex flex-col">${items}${catBlock}</nav></div>`;
  return { head, button, panel };
}

/** Renderiza o cabeçalho da variante escolhida. */
export function renderHeader(variant: HeaderVariant | undefined, view: StoreRenderView, custom: StoreCustomization | undefined, ctx: HeaderCtx): string {
  const logo = `<a href="${esc(homeHref(view))}" data-edit-logo class="flex items-center gap-2 min-w-0">${brandHtml(view, custom)}</a>`;
  const nav = (cls: string): string => `<nav class="${cls}">${menuLinks(view)}${categoriesDropdown(view)}</nav>`;
  const m = mobileMenuParts(view, ctx.container);
  const icons = `<div class="flex items-center gap-3 shrink-0">${searchBtn()}${cartBtn(view, ctx.brand)}</div>`;

  if (variant === "centrado") {
    return `<header class="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100 text-gray-700">
      ${m.head}
      <div class="${ctx.container}">
        <div class="grid grid-cols-3 items-center h-16">
          <div class="flex items-center gap-1 min-w-0">
            ${m.button}
            <nav class="hidden lg:flex items-center gap-6 text-sm font-medium">${menuLinks(view)}${categoriesDropdown(view)}</nav>
          </div>
          <div class="flex justify-center min-w-0">${logo}</div>
          <div class="flex items-center justify-end gap-3 shrink-0">${searchBtn()}${cartBtn(view, ctx.brand)}</div>
        </div>
      </div>
      ${m.panel}
    </header>`;
  }

  if (variant === "transparente") {
    // Sobreposto ao hero: fora do fluxo, transparente, texto claro.
    return `<header class="absolute top-0 inset-x-0 z-50 text-white">
      ${m.head}
      <div class="absolute inset-0 pointer-events-none" style="background:linear-gradient(to bottom, rgba(0,0,0,.35), transparent)"></div>
      <div class="relative ${ctx.container}">
        <div class="flex items-center justify-between gap-3 h-16">
          <div class="flex items-center gap-1 min-w-0">${m.button}${logo}</div>
          ${nav("hidden lg:flex items-center gap-7 text-sm font-medium")}
          ${icons}
        </div>
      </div>
      ${m.panel}
    </header>`;
  }

  if (variant === "promo") {
    const promo = esc(custom?.header?.promo || "Entrega em toda Angola • Compra via WhatsApp");
    return `<div>
      <div class="text-white text-center text-xs font-semibold py-2 px-4" style="background:${ctx.brand}"><span data-edit="header.promo">${promo}</span></div>
      <header class="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100 text-gray-700">
        ${m.head}
        <div class="${ctx.container}">
          <div class="relative flex items-center justify-between gap-3 h-16">
            <div class="flex items-center gap-1 min-w-0">${m.button}${logo}</div>
            ${nav("hidden lg:flex items-center gap-7 text-sm font-medium")}
            ${icons}
          </div>
        </div>
        ${m.panel}
      </header>
    </div>`;
  }

  // "classico" (omissão).
  return `<header class="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100 text-gray-700">
    ${m.head}
    <div class="${ctx.container}">
      <div class="relative flex items-center justify-between gap-3 h-16">
        <div class="flex items-center gap-1 min-w-0">${m.button}${logo}</div>
        ${nav("hidden lg:flex items-center gap-7 text-sm font-medium")}
        ${icons}
      </div>
    </div>
    ${m.panel}
  </header>`;
}
