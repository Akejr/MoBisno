/**
 * Modelo "Galeria" — hero com galeria em arco (cartões de imagens curvados
 * sobre o título), adaptado de ArcGalleryHero para o nosso stack (HTML/CSS,
 * sem React). Estética moderna e clara: Inter, cantos arredondados, sombras
 * suaves. A cor de destaque usa `var(--brand)` (editável), índigo por omissão.
 *
 * Liga-se aos dados reais (logótipo, banners, produtos, categorias) e mantém os
 * mesmos hooks (`data-cart-link`, `data-search-btn`, `data-edit-*`) dos outros
 * modelos, ficando compatível com o carrinho/pesquisa e com o editor.
 */
import { esc, formatKz } from "../lib/dom.js";
import { productSlugPath } from "../lib/slug.js";
import { perksItemsHtml } from "./perks.js";
import { blocksHtml } from "./blocks.js";
import { renderHero } from "./heroes.js";
import { renderHeader, mobileMenuParts } from "./headers.js";
import { renderFooter } from "./footers.js";
import { renderProductPage } from "./productPage.js";
import { cardAspectClass, gridColsClass, type ProductVariant } from "./productGrid.js";
import { platformHomeUrl, STORE_APEX } from "../lib/routing.js";
import { buildProductMessage, resolveWaPhone, waLink } from "../lib/whatsapp.js";
import { resolveSections, filterForCategoryPage, headerCategories } from "./sectionsModel.js";
import { productGalleryHtml } from "./gallery.js";
import type { StoreTemplate, StoreRenderView, StoreCustomization } from "./types.js";
import type { StoreProductView } from "../../src/storefront/storeRenderer.js";

const PER_ROW = 4;
const TWO_ROWS = 8;
const CONTAINER = "w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8";
const DEFAULT_PHONE = "+244 900 000 000";
/** Altura do logótipo do cabeçalho (definida em menuFor a cada render). */
let mbLogoScale: number | undefined;
/** Disposição dos produtos escolhida (definida em menuFor a cada render). */
let mbGridVariant: ProductVariant | undefined;

/** Aspeto do cartão de produto (omissão do modelo: quadrado). */
function cardAspect(): string {
  return cardAspectClass(mbGridVariant ?? "quadrado");
}

/* ------------------------------- Helpers ------------------------------- */

function storeIdentifier(view: StoreRenderView): string {
  return view.subdomain.split(".")[0] ?? view.subdomain;
}
function storeHomeHref(view: StoreRenderView): string {
  return `#/loja/${encodeURIComponent(storeIdentifier(view))}`;
}
function productHref(view: StoreRenderView, p: StoreProductView): string {
  return `${storeHomeHref(view)}/produto/${productSlugPath(p)}`;
}
function categoryHref(view: StoreRenderView, category: string): string {
  return `${storeHomeHref(view)}/categoria/${encodeURIComponent(category)}`;
}
function cartHref(view: StoreRenderView): string {
  return `${storeHomeHref(view)}/carrinho`;
}
function categoriesOf(view: StoreRenderView): string[] {
  return headerCategories(view);
}

function menuFor(view: StoreRenderView, custom?: StoreCustomization): string[] {
  mbLogoScale = custom?.logoScale;
  mbGridVariant = custom?.productGrid?.variant;
  return custom?.menu && custom.menu.length ? custom.menu : view.menu.items.map((i) => i.label);
}

function brandHtml(view: StoreRenderView): string {
  const brand = view.header.brand;
  if (brand.kind === "logo") {
    return `<img src="${esc(brand.url)}" alt="${esc(brand.alt)}" class="w-auto object-contain" style="height:${mbLogoScale ?? 32}px" />`;
  }
  return `<span class="text-xl md:text-2xl font-black tracking-tight text-gray-900">${esc(view.storeName)}</span>`;
}

function footerBrandHtml(view: StoreRenderView, custom?: StoreCustomization): string {
  const footerLogo = custom?.footer?.logoUrl;
  const headerLogo = view.header.brand.kind === "logo" ? view.header.brand.url : null;
  const url = footerLogo || headerLogo;
  if (url) return `<img src="${esc(url)}" alt="${esc(view.storeName)}" class="h-9 w-auto object-contain" />`;
  return `<span class="text-xl font-black tracking-tight text-gray-900">${esc(view.storeName)}</span>`;
}

/* ------------------------------- Cabeçalho ------------------------------- */

function headerHtml(view: StoreRenderView, _menuLabels: string[], custom?: StoreCustomization): string {
  if (custom?.header?.variant) return renderHeader(custom.header.variant, view, custom, { container: CONTAINER, brand: "var(--brand,#4f46e5)" });
  const linkCls = "hover:text-gray-900 cursor-pointer transition-colors";
  const menu = `<a href="${esc(storeHomeHref(view))}" class="${linkCls}">Início</a>` +
    `<a href="${esc(storeHomeHref(view))}#produtos" class="${linkCls}">Produtos</a>`;
  const cats = categoriesOf(view);
  const mnav = mobileMenuParts(view, CONTAINER);
  const categoriesMenu = cats.length
    ? `<div class="relative group" data-categories-menu>
        <button type="button" class="flex items-center gap-0.5 hover:text-gray-900 transition-colors">Categorias <span class="material-symbols-outlined text-[18px]">expand_more</span></button>
        <div class="absolute left-0 top-full pt-2 hidden group-hover:block z-50">
          <div class="bg-white border border-gray-100 rounded-xl shadow-lg py-2 min-w-[180px]">
            ${cats.map((c) => `<a href="${esc(categoryHref(view, c))}" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">${esc(c)}</a>`).join("")}
          </div>
        </div>
      </div>`
    : "";
  return `
    <header class="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
      ${mnav.head}
      <div class="${CONTAINER}">
        <div class="relative flex items-center justify-between gap-3 h-16">
          <div class="flex items-center gap-1 min-w-0">
            ${mnav.button}
            <a href="${esc(storeHomeHref(view))}" data-edit-logo class="flex items-center gap-2 min-w-0">${brandHtml(view)}</a>
          </div>
          <nav class="hidden lg:flex items-center gap-7 text-sm font-medium text-gray-600">${menu}${categoriesMenu}</nav>
          <div class="flex items-center gap-3 text-gray-700 shrink-0">
            <button type="button" data-search-btn class="hover:opacity-70 transition-opacity"><span class="material-symbols-outlined">search</span></button>
            <a href="${esc(cartHref(view))}" data-cart-link class="relative inline-flex">
              <span class="material-symbols-outlined">shopping_cart</span>
              <span data-cart-count class="hidden absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center text-white" style="background:var(--brand,#4f46e5)"></span>
            </a>
          </div>
        </div>
      </div>
      ${mnav.panel}
    </header>`;
}

/* ------------------------------- Produtos ------------------------------- */

function productCard(view: StoreRenderView, p: StoreProductView, opts: { hidden?: boolean } = {}): string {
  const img = p.imageUrl
    ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />`
    : `<div class="absolute inset-0 flex items-center justify-center bg-gray-100"><span class="material-symbols-outlined text-gray-400 text-4xl">image</span></div>`;
  const badge = p.featured
    ? `<span class="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider text-white px-2 py-0.5 rounded-full" style="background:var(--brand,#4f46e5)">Destaque</span>`
    : "";
  const hide = opts.hidden ? ` data-extra style="display:none"` : "";
  return `<a href="${esc(productHref(view, p))}" class="group block" data-edit-product="${esc(p.id)}"${hide}>
    <div class="relative ${cardAspect()} bg-gray-50 overflow-hidden rounded-2xl border border-gray-100 mb-3">${img}${badge}</div>
    <h3 class="text-sm font-semibold text-gray-900 line-clamp-2">${esc(p.name)}</h3>
    ${p.description ? `<p class="text-xs text-gray-500 line-clamp-1 mt-0.5">${esc(p.description)}</p>` : ""}
    <p class="pt-1 text-sm font-bold" style="color:var(--brand,#4f46e5)">${esc(formatKz(p.price))}</p>
  </a>`;
}

const GRID_CLS = "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8";

function sectionsArea(view: StoreRenderView, custom?: StoreCustomization): string {
  const gridCls = mbGridVariant ? gridColsClass(mbGridVariant) : GRID_CLS;
  const sections = resolveSections(view, custom);
  const multi = sections.length > 1;
  const blocks = sections.map((sec, i) => {
    const items = multi ? sec.products.slice(0, PER_ROW) : sec.products;
    const cards = items.map((p, idx) => productCard(view, p, { hidden: !multi && idx >= TWO_ROWS })).join("");
    const moreRight = multi
      ? `<a href="${esc(sec.moreHref)}" class="text-sm font-bold flex items-center gap-1 hover:opacity-80" style="color:var(--brand,#4f46e5)">Ver mais <span class="material-symbols-outlined text-[18px]">arrow_forward</span></a>`
      : "";
    const moreBottom = (!multi && sec.products.length > TWO_ROWS)
      ? `<div class="text-center mt-10"><button type="button" data-load-more data-step="${TWO_ROWS}" class="inline-flex items-center gap-1 border-2 font-bold px-8 py-3 rounded-full transition-colors" style="border-color:var(--brand,#4f46e5);color:var(--brand,#4f46e5)">Ver mais <span class="material-symbols-outlined text-[18px]">expand_more</span></button></div>`
      : "";
    const empty = items.length === 0 ? `<p class="text-gray-400 col-span-full py-8 text-center">Sem produtos nesta secção.</p>` : "";
    return `<section data-section data-edit-section="${i}" class="${i > 0 ? "mt-14" : ""}">
      <div data-edit-section-head class="flex items-center justify-between gap-3 mb-6">
        <h2 class="text-2xl md:text-3xl font-black tracking-tight text-gray-900 truncate">${esc(sec.title)}</h2>
        ${moreRight}
      </div>
      <div data-section-grid data-edit-products class="${gridCls}">${cards}${empty}</div>
      ${moreBottom}
    </section>`;
  }).join("");
  return `<div data-edit-sections>${blocks}</div>`;
}

/* -------------------------------- Rodapé -------------------------------- */

function footerHtml(view: StoreRenderView, custom: StoreCustomization | undefined, menuLabels: string[]): string {
  if (custom?.footer?.variant) return renderFooter(custom.footer.variant, view, custom, { container: CONTAINER, brand: "var(--brand,#4f46e5)" });
  const about = custom?.footer?.about || "A sua loja online em Angola. Produtos selecionados e entrega rápida.";
  const location = custom?.footer?.location || "Luanda, Angola";
  const phone = custom?.footer?.phone || DEFAULT_PHONE;
  const email = custom?.footer?.email || "geral@minhaloja.ao";
  return `
    <footer class="bg-gray-50 border-t border-gray-100 mt-auto">
      <div class="${CONTAINER} py-12 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div class="space-y-3">
          <div data-edit-footer-logo class="relative inline-block">${footerBrandHtml(view, custom)}</div>
          <p data-edit="footer.about" class="text-sm text-gray-500 max-w-xs leading-relaxed">${esc(about)}</p>
        </div>
        <div>
          <h3 class="text-sm font-bold text-gray-900 mb-4">Loja</h3>
          <ul class="space-y-2.5 text-sm">${menuLabels.map((l) => `<li><a href="${esc(storeHomeHref(view))}" class="text-gray-500 hover:text-gray-900 transition-colors cursor-pointer">${esc(l)}</a></li>`).join("")}</ul>
        </div>
        <div>
          <h3 class="text-sm font-bold text-gray-900 mb-4">Contacto</h3>
          <ul class="space-y-2.5 text-sm text-gray-500">
            <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">location_on</span> <span data-edit="footer.location">${esc(location)}</span></li>
            <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">call</span> <span data-edit="footer.phone">${esc(phone)}</span></li>
            <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">mail</span> <span data-edit="footer.email">${esc(email)}</span></li>
          </ul>
        </div>
      </div>
      <div class="border-t border-gray-100">
        <div class="${CONTAINER} py-5 text-xs text-gray-400 text-center">
          ${esc(storeIdentifier(view) + "." + STORE_APEX)} · Loja criada com <a href="${platformHomeUrl()}" style="color:var(--brand,#4f46e5)">MôBisno</a>
        </div>
      </div>
    </footer>`;
}

/* -------------------------------- Páginas -------------------------------- */

function render(view: StoreRenderView, custom?: StoreCustomization): string {
  const menuLabels = menuFor(view, custom);
  return `
  <div class="relative min-h-screen flex flex-col bg-white text-gray-900 font-sans overflow-x-hidden">
    ${headerHtml(view, menuLabels, custom)}
    ${renderHero(custom?.hero?.variant, view, custom, { container: CONTAINER, brand: "var(--brand,#4f46e5)" }, "arco")}
    <main id="produtos" class="${CONTAINER} py-10 md:py-14">
      ${sectionsArea(view, custom)}
    </main>
    ${blocksHtml(custom, { container: CONTAINER, brand: "var(--brand,#4f46e5)", variant: "galeria" })}
    ${footerHtml(view, custom, menuLabels)}
  </div>`;
}

function renderProduct(view: StoreRenderView, product: StoreProductView, custom?: StoreCustomization): string {
  const menuLabels = menuFor(view, custom);
  if (custom?.productPage?.variant) {
    return `
  <div class="min-h-screen flex flex-col bg-white text-gray-900 font-sans">
    ${headerHtml(view, menuLabels, custom)}
    ${renderProductPage(custom.productPage.variant, view, product, custom, { container: CONTAINER, brand: "var(--brand,#4f46e5)" })}
    ${footerHtml(view, custom, menuLabels)}
  </div>`;
  }
  const phone = resolveWaPhone(custom);
  const waMsg = buildProductMessage(custom?.whatsapp?.messageTemplate, product.name, formatKz(product.price));
  const related = view.products.filter((p) => p.id !== product.id).slice(0, 4);
  const crumbCategory = product.category
    ? `<a href="${esc(categoryHref(view, product.category))}" class="hover:text-gray-900">${esc(product.category)}</a>
       <span class="material-symbols-outlined text-[16px]">chevron_right</span>`
    : "";

  return `
  <div class="min-h-screen flex flex-col bg-white text-gray-900 font-sans">
    ${headerHtml(view, menuLabels, custom)}
    <main class="${CONTAINER} py-6 md:py-10 flex-grow">
      <nav class="text-sm text-gray-500 mb-6 flex items-center gap-1.5 flex-wrap">
        <a href="${esc(storeHomeHref(view))}" class="hover:text-gray-900">Início</a>
        <span class="material-symbols-outlined text-[16px]">chevron_right</span>
        ${crumbCategory}
        <span class="text-gray-900 font-medium truncate">${esc(product.name)}</span>
      </nav>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        ${productGalleryHtml(product, custom, { stageClass: "aspect-square bg-gray-50 rounded-2xl overflow-hidden border border-gray-100", imgClass: "w-full h-full object-cover", brand: "var(--brand,#4f46e5)" })}
        <div class="flex flex-col">
          <h1 class="text-3xl md:text-4xl font-black tracking-tight leading-tight">${esc(product.name)}</h1>
          <p class="mt-3 text-3xl font-bold" style="color:var(--brand,#4f46e5)">${esc(formatKz(product.price))}</p>
          ${product.description
            ? `<p class="mt-6 text-gray-600 leading-relaxed whitespace-pre-line">${esc(product.description)}</p>`
            : `<p class="mt-6 text-gray-400 italic">Sem descrição.</p>`}
          <div class="mt-8 flex items-center gap-4">
            <span class="text-sm font-medium text-gray-700">Quantidade</span>
            <div class="flex items-center border border-gray-300 rounded-xl overflow-hidden">
              <button type="button" data-qty-dec class="w-10 h-10 flex items-center justify-center hover:bg-gray-100 text-gray-700"><span class="material-symbols-outlined text-[20px]">remove</span></button>
              <input data-qty type="text" inputmode="numeric" value="1" class="w-12 h-10 text-center outline-none border-x border-gray-300" />
              <button type="button" data-qty-inc class="w-10 h-10 flex items-center justify-center hover:bg-gray-100 text-gray-700"><span class="material-symbols-outlined text-[20px]">add</span></button>
            </div>
          </div>
          <div class="mt-8 flex flex-col sm:flex-row gap-3">
            <button type="button" data-add-cart="${esc(product.id)}" style="background:var(--brand,#4f46e5);color:#fff" class="flex-1 inline-flex items-center justify-center gap-2 font-bold px-6 py-3.5 rounded-xl hover:opacity-90 transition-opacity">
              <span class="material-symbols-outlined text-[20px]">shopping_cart</span> Adicionar ao carrinho
            </button>
            <a href="${esc(waLink(phone, waMsg))}" data-edit-whatsapp target="_blank" rel="noopener" class="flex-1 inline-flex items-center justify-center gap-2 font-bold px-6 py-3.5 rounded-xl border border-gray-300 text-gray-900 hover:bg-gray-50 transition-colors">
              <span class="material-symbols-outlined text-[20px]">chat</span> Comprar via WhatsApp
            </a>
          </div>
          <ul data-edit-perks class="mt-8 space-y-2 text-sm text-gray-600 border-t border-gray-100 pt-6">
            ${perksItemsHtml(custom, "var(--brand,#4f46e5)")}
          </ul>
        </div>
      </div>
      ${related.length
        ? `<section class="mt-16">
            <h2 class="text-2xl md:text-3xl font-black tracking-tight mb-6">Também pode gostar</h2>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8">${related.map((p) => productCard(view, p)).join("")}</div>
          </section>`
        : ""}
    </main>
    ${footerHtml(view, custom, menuLabels)}
  </div>`;
}

function renderCategory(view: StoreRenderView, category: string, custom?: StoreCustomization): string {
  const menuLabels = menuFor(view, custom);
  const items = filterForCategoryPage(view, category);
  const grid = items.length
    ? `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">${items.map((p) => productCard(view, p)).join("")}</div>`
    : `<div class="py-16 text-center text-gray-500">
        <span class="material-symbols-outlined" style="font-size:48px;">category</span>
        <p class="mt-2">Ainda não há produtos nesta categoria.</p>
       </div>`;
  return `
  <div class="min-h-screen flex flex-col bg-white text-gray-900 font-sans">
    ${headerHtml(view, menuLabels, custom)}
    <main class="${CONTAINER} py-8 md:py-12 flex-grow">
      <nav class="text-sm text-gray-500 mb-6 flex items-center gap-1.5">
        <a href="${esc(storeHomeHref(view))}" class="hover:text-gray-900">Início</a>
        <span class="material-symbols-outlined text-[16px]">chevron_right</span>
        <span class="text-gray-900 font-medium">${esc(category)}</span>
      </nav>
      <div class="flex items-center gap-3 mb-8">
        <h1 class="text-3xl md:text-4xl font-black tracking-tight">${esc(category)}</h1>
        <span class="text-sm text-gray-400">${items.length} produto(s)</span>
      </div>
      ${grid}
    </main>
    ${footerHtml(view, custom, menuLabels)}
  </div>`;
}

export const galeriaTemplate: StoreTemplate = {
  id: "galeria",
  name: "Galeria",
  previewUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=600",
  ready: true,
  defaultBrand: "#4f46e5",
  render,
  renderProduct,
  renderCategory,
  renderCheckout,
};

function renderCheckout(view: StoreRenderView, innerHtml: string, custom?: StoreCustomization): string {
  const menuLabels = menuFor(view, custom);
  return `
  <div class="min-h-screen flex flex-col bg-white text-gray-900 font-sans">
    ${headerHtml(view, menuLabels, custom)}
    <main class="${CONTAINER} py-8 md:py-12 flex-grow">${innerHtml}</main>
    ${footerHtml(view, custom, menuLabels)}
  </div>`;
}
