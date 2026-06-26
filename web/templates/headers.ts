/**
 * Cabeçalhos por variantes — partilhados por todos os modelos. Mantêm os hooks
 * essenciais: `data-edit-logo`, `data-edit-menu`/`data-edit-menu-item`,
 * `data-search-btn`, `data-cart-link`/`data-cart-count` e o dropdown de
 * categorias (CSS group-hover, sem JS). Cor de marca via `var(--brand)`.
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

function menuLabels(view: StoreRenderView, custom?: StoreCustomization): string[] {
  return custom?.menu && custom.menu.length ? custom.menu : view.menu.items.map((i) => i.label);
}

function menuLinks(view: StoreRenderView, labels: string[]): string {
  return labels.map((label, i) => `<a href="${homeHref(view)}" data-edit-menu-item="${i}" class="hover:opacity-70 cursor-pointer transition-opacity">${esc(label)}</a>`).join("");
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

/** Renderiza o cabeçalho da variante escolhida. */
export function renderHeader(variant: HeaderVariant | undefined, view: StoreRenderView, custom: StoreCustomization | undefined, ctx: HeaderCtx): string {
  const labels = menuLabels(view, custom);
  const logo = `<a href="${esc(homeHref(view))}" data-edit-logo class="flex items-center gap-2 min-w-0">${brandHtml(view, custom)}</a>`;
  const nav = (cls: string): string => `<nav data-edit-menu class="${cls}">${menuLinks(view, labels)}${categoriesDropdown(view)}</nav>`;

  if (variant === "centrado") {
    return `<header class="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100 text-gray-700">
      <div class="${ctx.container}">
        <div class="grid grid-cols-3 items-center h-16">
          <nav data-edit-menu class="hidden lg:flex items-center gap-6 text-sm font-medium">${menuLinks(view, labels)}${categoriesDropdown(view)}</nav>
          <div class="flex justify-center">${logo}</div>
          <div class="flex items-center justify-end gap-3">${searchBtn()}${cartBtn(view, ctx.brand)}</div>
        </div>
      </div>
    </header>`;
  }

  if (variant === "transparente") {
    // Sobreposto ao hero: fora do fluxo, transparente, texto claro.
    return `<header class="absolute top-0 inset-x-0 z-50 text-white">
      <div class="absolute inset-0 pointer-events-none" style="background:linear-gradient(to bottom, rgba(0,0,0,.35), transparent)"></div>
      <div class="relative ${ctx.container}">
        <div class="flex items-center justify-between h-16">
          ${logo}
          ${nav("hidden lg:flex items-center gap-7 text-sm font-medium")}
          <div class="flex items-center gap-3">${searchBtn()}${cartBtn(view, ctx.brand)}</div>
        </div>
      </div>
    </header>`;
  }

  if (variant === "promo") {
    const promo = esc(custom?.header?.promo || "Entrega em toda Angola • Compra via WhatsApp");
    return `<div>
      <div class="text-white text-center text-xs font-semibold py-2 px-4" style="background:${ctx.brand}"><span data-edit="header.promo">${promo}</span></div>
      <header class="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100 text-gray-700">
        <div class="${ctx.container}">
          <div class="relative flex items-center justify-between h-16">
            ${logo}
            ${nav("hidden lg:flex items-center gap-7 text-sm font-medium")}
            <div class="flex items-center gap-3">${searchBtn()}${cartBtn(view, ctx.brand)}</div>
          </div>
        </div>
      </header>
    </div>`;
  }

  // "classico" (omissão).
  return `<header class="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100 text-gray-700">
    <div class="${ctx.container}">
      <div class="relative flex items-center justify-between h-16">
        ${logo}
        ${nav("hidden lg:flex items-center gap-7 text-sm font-medium")}
        <div class="flex items-center gap-3">${searchBtn()}${cartBtn(view, ctx.brand)}</div>
      </div>
    </div>
  </header>`;
}
