/**
 * Helpers partilhados pelos Modelos de loja: marca (logótipo ou identidade de
 * substituição), banners (por ordem de adição) e grelha de produtos. Cada
 * Modelo pode usar estes blocos ou compor o seu próprio HTML.
 */
import { esc, formatKz } from "../lib/dom.js";
import type { StoreRenderView } from "../../src/storefront/storeRenderer.js";

/** Marca apresentada no cabeçalho/menus: logótipo (Asset) ou fallback. */
export function brandMarkHtml(brand: StoreRenderView["header"]["brand"], heightClass = "h-10"): string {
  if (brand.kind === "logo") {
    return `<img src="${esc(brand.url)}" alt="${esc(brand.alt)}" class="${heightClass} w-auto object-contain" />`;
  }
  return `<span class="text-headline-md font-bold" style="color:${esc(brand.identity.backgroundColor)}">${esc(brand.identity.label)}</span>`;
}

/** Lista de banners (imagens) pela ordem de adição. `imgClass` controla o aspeto. */
export function bannersHtml(banners: StoreRenderView["banners"], imgClass: string): string {
  if (banners.length === 0) return "";
  return banners.map((b) => `<img src="${esc(b.imageUrl)}" alt="banner" class="${imgClass}" />`).join("");
}

/** Cartão de um produto. */
export function productCardHtml(p: StoreRenderView["products"][number]): string {
  return `<div class="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden flex flex-col shadow-sm">
    <div class="aspect-square bg-surface-container-low flex items-center justify-center overflow-hidden">
      ${p.imageUrl ? `<img src="${esc(p.imageUrl)}" class="w-full h-full object-cover" alt="${esc(p.name)}" />` : `<span class="material-symbols-outlined text-on-surface-variant text-4xl">image</span>`}
    </div>
    <div class="p-4 flex flex-col gap-1 flex-grow">
      <h3 class="font-medium text-on-surface truncate">${esc(p.name)}</h3>
      <p class="text-label-sm text-on-surface-variant flex-grow line-clamp-2">${esc(p.description)}</p>
      <p class="text-primary font-bold mt-2">${esc(formatKz(p.price))}</p>
    </div>
  </div>`;
}

/** Grelha de produtos disponíveis (ou mensagem de vazio). */
export function productsGridHtml(products: StoreRenderView["products"], gridClass = "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-gutter"): string {
  if (products.length === 0) {
    return `<p class="text-on-surface-variant col-span-full text-center py-12">Esta loja ainda não tem produtos disponíveis.</p>`;
  }
  return `<div class="${gridClass}">${products.map(productCardHtml).join("")}</div>`;
}

/** Itens de menu. */
export function menuItemsHtml(items: StoreRenderView["menu"]["items"]): string {
  return items.map((i) => `<span class="hover:text-primary cursor-pointer">${esc(i.label)}</span>`).join("");
}
