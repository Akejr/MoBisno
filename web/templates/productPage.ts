/**
 * Páginas de produto por variantes — conteúdo principal (<main>) partilhado por
 * todos os modelos. Mantém os hooks da loja: `data-edit-product`, `data-qty`/
 * `data-qty-dec`/`data-qty-inc`, `data-add-cart`, `data-edit-whatsapp`,
 * `data-edit-perks`. O cabeçalho/rodapé são fornecidos pelo modelo.
 */
import { esc, formatKz } from "../lib/dom.js";
import { productSlugPath } from "../lib/slug.js";
import { perksItemsHtml } from "./perks.js";
import { buildProductMessage, resolveWaPhone, waLink } from "../lib/whatsapp.js";
import type { StoreRenderView, StoreCustomization, StoreProductView } from "./types.js";

export type ProductPageVariant = "classico" | "galeria" | "minimal";

export const PRODUCTPAGE_VARIANTS: { id: ProductPageVariant; label: string }[] = [
  { id: "classico", label: "Clássico" },
  { id: "galeria", label: "Galeria" },
  { id: "minimal", label: "Minimal" },
];

export interface ProductPageCtx { container: string; brand: string; }

function storeIdentifier(view: StoreRenderView): string { return view.subdomain.split(".")[0] ?? view.subdomain; }
function homeHref(view: StoreRenderView): string { return `#/loja/${encodeURIComponent(storeIdentifier(view))}`; }
function categoryHref(view: StoreRenderView, c: string): string { return `${homeHref(view)}/categoria/${encodeURIComponent(c)}`; }
function productHref(view: StoreRenderView, p: StoreProductView): string { return `${homeHref(view)}/produto/${productSlugPath(p)}`; }

function imgHtml(p: StoreProductView, cls: string): string {
  return p.imageUrl
    ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" class="${cls}" />`
    : `<div class="absolute inset-0 flex items-center justify-center bg-gray-100"><span class="material-symbols-outlined text-gray-300 text-6xl">image</span></div>`;
}

function qtyHtml(): string {
  return `<div class="flex items-center border border-gray-300 rounded-xl overflow-hidden">
    <button type="button" data-qty-dec class="w-10 h-10 flex items-center justify-center hover:bg-gray-100 text-gray-700"><span class="material-symbols-outlined text-[20px]">remove</span></button>
    <input data-qty type="text" inputmode="numeric" value="1" class="w-12 h-10 text-center outline-none border-x border-gray-300" />
    <button type="button" data-qty-inc class="w-10 h-10 flex items-center justify-center hover:bg-gray-100 text-gray-700"><span class="material-symbols-outlined text-[20px]">add</span></button>
  </div>`;
}

function actionsHtml(product: StoreProductView, ctx: ProductPageCtx, waHref: string): string {
  return `<div class="mt-8 flex flex-col sm:flex-row gap-3">
    <button type="button" data-add-cart="${esc(product.id)}" style="background:${ctx.brand};color:#fff" class="flex-1 inline-flex items-center justify-center gap-2 font-bold px-6 py-3.5 rounded-xl hover:opacity-90 transition-opacity">
      <span class="material-symbols-outlined text-[20px]">shopping_cart</span> Adicionar ao carrinho
    </button>
    <a href="${esc(waHref)}" data-edit-whatsapp target="_blank" rel="noopener" class="flex-1 inline-flex items-center justify-center gap-2 font-bold px-6 py-3.5 rounded-xl border border-gray-300 text-gray-900 hover:bg-gray-50 transition-colors">
      <span class="material-symbols-outlined text-[20px]">chat</span> Comprar via WhatsApp
    </a>
  </div>`;
}

function descHtml(product: StoreProductView): string {
  return product.description
    ? `<p class="mt-6 text-gray-600 leading-relaxed whitespace-pre-line">${esc(product.description)}</p>`
    : `<p class="mt-6 text-gray-400 italic">Sem descrição.</p>`;
}

function relatedHtml(view: StoreRenderView, product: StoreProductView, ctx: ProductPageCtx): string {
  const related = view.products.filter((p) => p.id !== product.id).slice(0, 4);
  if (!related.length) return "";
  const cards = related.map((p) => `<a href="${esc(productHref(view, p))}" class="group block">
    <div class="relative aspect-square bg-gray-50 overflow-hidden rounded-2xl border border-gray-100 mb-3">
      ${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />` : ""}
    </div>
    <h3 class="text-sm font-semibold text-gray-900 line-clamp-2">${esc(p.name)}</h3>
    <p class="pt-1 text-sm font-bold" style="color:${ctx.brand}">${esc(formatKz(p.price))}</p>
  </a>`).join("");
  return `<section class="mt-16">
    <h2 class="text-2xl md:text-3xl font-black tracking-tight mb-6 text-gray-900">Também pode gostar</h2>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8">${cards}</div>
  </section>`;
}

function breadcrumb(view: StoreRenderView, product: StoreProductView): string {
  const crumbCat = product.category
    ? `<a href="${esc(categoryHref(view, product.category))}" class="hover:text-gray-900">${esc(product.category)}</a><span class="material-symbols-outlined text-[16px]">chevron_right</span>`
    : "";
  return `<nav class="text-sm text-gray-500 mb-6 flex items-center gap-1.5 flex-wrap">
    <a href="${esc(homeHref(view))}" class="hover:text-gray-900">Início</a>
    <span class="material-symbols-outlined text-[16px]">chevron_right</span>
    ${crumbCat}
    <span class="text-gray-900 font-medium truncate">${esc(product.name)}</span>
  </nav>`;
}

/** Renderiza o <main> da página de produto na variante escolhida. */
export function renderProductPage(
  variant: ProductPageVariant | undefined,
  view: StoreRenderView,
  product: StoreProductView,
  custom: StoreCustomization | undefined,
  ctx: ProductPageCtx,
): string {
  const phone = resolveWaPhone(custom);
  const waMsg = buildProductMessage(custom?.whatsapp?.messageTemplate, product.name, formatKz(product.price));
  const waHref = waLink(phone, waMsg);
  const price = `<p class="mt-3 text-3xl font-bold" style="color:${ctx.brand}">${esc(formatKz(product.price))}</p>`;
  const perks = `<ul data-edit-perks class="mt-8 space-y-2 text-sm text-gray-600 border-t border-gray-100 pt-6">${perksItemsHtml(custom, ctx.brand)}</ul>`;

  if (variant === "minimal") {
    return `<main class="${ctx.container} py-8 md:py-12 flex-grow">
      ${breadcrumb(view, product)}
      <div class="max-w-2xl mx-auto text-center">
        <div class="relative aspect-square bg-gray-50 rounded-2xl overflow-hidden border border-gray-100 mb-8" data-edit-product="${esc(product.id)}">${imgHtml(product, "w-full h-full object-cover")}</div>
        <h1 class="text-3xl md:text-4xl font-black tracking-tight leading-tight">${esc(product.name)}</h1>
        ${price}
        <div class="text-gray-600">${descHtml(product)}</div>
        <div class="mt-8 flex items-center justify-center gap-4"><span class="text-sm font-medium text-gray-700">Quantidade</span>${qtyHtml()}</div>
        <div class="max-w-md mx-auto">${actionsHtml(product, ctx, waHref)}${perks}</div>
      </div>
      ${relatedHtml(view, product, ctx)}
    </main>`;
  }

  if (variant === "galeria") {
    return `<main class="${ctx.container} py-8 md:py-12 flex-grow">
      ${breadcrumb(view, product)}
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        <div class="lg:col-span-7 space-y-4" data-edit-product="${esc(product.id)}">
          <div class="relative aspect-[4/5] bg-gray-50 rounded-2xl overflow-hidden border border-gray-100">${imgHtml(product, "w-full h-full object-cover")}</div>
        </div>
        <div class="lg:col-span-5 lg:sticky lg:top-24 flex flex-col">
          <h1 class="text-3xl md:text-4xl font-black tracking-tight leading-tight">${esc(product.name)}</h1>
          ${price}
          ${descHtml(product)}
          <div class="mt-8 flex items-center gap-4"><span class="text-sm font-medium text-gray-700">Quantidade</span>${qtyHtml()}</div>
          ${actionsHtml(product, ctx, waHref)}
          ${perks}
        </div>
      </div>
      ${relatedHtml(view, product, ctx)}
    </main>`;
  }

  // "classico" (omissão).
  return `<main class="${ctx.container} py-6 md:py-10 flex-grow">
    ${breadcrumb(view, product)}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
      <div class="relative aspect-square bg-gray-50 rounded-2xl overflow-hidden border border-gray-100" data-edit-product="${esc(product.id)}">${imgHtml(product, "w-full h-full object-cover")}</div>
      <div class="flex flex-col">
        <h1 class="text-3xl md:text-4xl font-black tracking-tight leading-tight">${esc(product.name)}</h1>
        ${price}
        ${descHtml(product)}
        <div class="mt-8 flex items-center gap-4"><span class="text-sm font-medium text-gray-700">Quantidade</span>${qtyHtml()}</div>
        ${actionsHtml(product, ctx, waHref)}
        ${perks}
      </div>
    </div>
    ${relatedHtml(view, product, ctx)}
  </main>`;
}
