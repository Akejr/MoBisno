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
import { buildProductMessage, resolveWaPhone, waLink } from "../lib/whatsapp.js";
import { resolveSections, filterForCategoryPage, headerCategories } from "./sectionsModel.js";
import type { StoreTemplate, StoreRenderView, StoreCustomization } from "./types.js";
import type { StoreProductView } from "../../src/storefront/storeRenderer.js";

const PER_ROW = 4;
const TWO_ROWS = 8;
const CONTAINER = "w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8";
const DEFAULT_SUBTITLE = "Produtos selecionados, entrega em toda Angola e checkout simples.";
const DEFAULT_CTA = "Ver produtos";
const DEFAULT_PHONE = "+244 900 000 000";
const DEFAULT_FEATURE_IMG = "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?q=80&w=1000";

/** Imagens de reserva para o arco (quando a loja ainda tem poucas fotos). */
const ARC_FALLBACK = [
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=400",
  "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=400",
  "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=80&w=400",
  "https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=400",
  "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?q=80&w=400",
  "https://images.unsplash.com/photo-1491553895911-0055eca6402d?q=80&w=400",
  "https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?q=80&w=400",
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=400",
];

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
  return custom?.menu && custom.menu.length ? custom.menu : view.menu.items.map((i) => i.label);
}

function brandHtml(view: StoreRenderView): string {
  const brand = view.header.brand;
  if (brand.kind === "logo") {
    return `<img src="${esc(brand.url)}" alt="${esc(brand.alt)}" class="h-8 md:h-9 w-auto object-contain" />`;
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

function headerHtml(view: StoreRenderView, menuLabels: string[]): string {
  const menu = menuLabels
    .map((label, i) => `<a href="${storeHomeHref(view)}" data-edit-menu-item="${i}" class="hover:text-gray-900 cursor-pointer transition-colors">${esc(label)}</a>`)
    .join("");
  const cats = categoriesOf(view);
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
      <div class="${CONTAINER}">
        <div class="relative flex items-center justify-between h-16">
          <a href="${esc(storeHomeHref(view))}" data-edit-logo class="flex items-center gap-2 min-w-0">${brandHtml(view)}</a>
          <nav data-edit-menu class="hidden lg:flex items-center gap-7 text-sm font-medium text-gray-600">${menu}${categoriesMenu}</nav>
          <div class="flex items-center gap-3 text-gray-700">
            <button type="button" data-search-btn class="hover:opacity-70 transition-opacity"><span class="material-symbols-outlined">search</span></button>
            <a href="${esc(cartHref(view))}" data-cart-link class="relative inline-flex">
              <span class="material-symbols-outlined">shopping_cart</span>
              <span data-cart-count class="hidden absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center text-white" style="background:var(--brand,#4f46e5)"></span>
            </a>
          </div>
        </div>
      </div>
    </header>`;
}

/* --------------------------------- Hero --------------------------------- */

/** Imagens para o arco. Usa as definidas pelo dono (heroImages); caso contrário
 *  as fotos dos produtos/banners; por fim imagens de reserva. Sem ciclar, para
 *  o mapeamento 1:1 com o editor. */
function arcImages(view: StoreRenderView, custom?: StoreCustomization): string[] {
  const fromCustom = (custom?.heroImages ?? []).filter((u): u is string => !!u);
  if (fromCustom.length) return fromCustom.slice(0, 13);
  const fromProducts = view.products.map((p) => p.imageUrl).filter((u): u is string => !!u);
  const fromBanners = view.banners.map((b) => b.imageUrl);
  const base = [...fromProducts, ...fromBanners];
  return (base.length ? base : ARC_FALLBACK).slice(0, 13);
}

/** Hero com galeria em arco (cartões curvados) + título/subtítulo/CTA. */
function arcHero(view: StoreRenderView, custom?: StoreCustomization): string {
  const title = custom?.hero?.title || view.storeName;
  const subtitle = custom?.hero?.subtitle || DEFAULT_SUBTITLE;
  const cta = custom?.hero?.ctaLabel || DEFAULT_CTA;

  const imgs = arcImages(view, custom);
  const startAngle = 18;
  const endAngle = 162;
  const count = Math.max(imgs.length, 2);
  const step = (endAngle - startAngle) / (count - 1);

  const cards = imgs.map((src, i) => {
    const angle = startAngle + step * i;
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad).toFixed(4);
    const sin = Math.sin(rad).toFixed(4);
    const rot = (angle / 4 - 22).toFixed(2);
    return `<div class="mb-arc-card" data-edit-arc-item="${i}" style="left:calc(50% + (${cos} * var(--arc-r)));bottom:calc(${sin} * var(--arc-r));z-index:${count - i};animation-delay:${i * 80}ms">
      <div class="mb-arc-inner" style="transform:rotate(${rot}deg)">
        <img src="${esc(src)}" alt="" class="block w-full h-full object-cover" draggable="false" onerror="this.onerror=null;this.src='https://placehold.co/300x300/eef2ff/4f46e5?text=Foto'" />
      </div>
    </div>`;
  }).join("");

  return `
  <section class="relative overflow-hidden bg-white">
    <style>
      @keyframes mbArcIn{from{opacity:0;transform:translate(-50%,62%)}to{opacity:1;transform:translate(-50%,50%)}}
      @keyframes mbHeroIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
      .mb-arc{position:relative;width:100%;height:calc(var(--arc-r) + var(--arc-card));--arc-r:clamp(170px,40vw,440px);--arc-card:clamp(60px,10vw,112px)}
      .mb-arc-pivot{position:absolute;left:50%;bottom:0;transform:translateX(-50%)}
      .mb-arc-card{position:absolute;width:var(--arc-card);height:var(--arc-card);transform:translate(-50%,50%);opacity:0;animation:mbArcIn .8s ease-out forwards}
      .mb-arc-inner{width:100%;height:100%;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 14px 30px -12px rgba(0,0,0,.3);outline:1px solid rgba(0,0,0,.05);transition:transform .3s ease}
      .mb-arc-inner:hover{transform:scale(1.06) !important}
      .mb-hero-text{opacity:0;animation:mbHeroIn .8s ease-out forwards;animation-delay:.7s}
    </style>
    <div class="mb-arc" data-edit-arc>
      <div class="mb-arc-pivot">${cards}</div>
    </div>
    <div class="relative z-10 ${CONTAINER} text-center -mt-28 sm:-mt-36 lg:-mt-44 pb-14">
      <div class="mb-hero-text max-w-2xl mx-auto">
        <h1 data-edit="hero.title" class="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-gray-900 leading-[1.05]">${esc(title)}</h1>
        <p data-edit="hero.subtitle" class="mt-4 text-base md:text-lg text-gray-500 max-w-xl mx-auto">${esc(subtitle)}</p>
        <div class="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a href="#produtos" class="w-full sm:w-auto px-7 py-3 rounded-full text-white font-semibold shadow-lg hover:opacity-95 transition-opacity" style="background:var(--brand,#4f46e5)"><span data-edit="hero.ctaLabel">${esc(cta)}</span></a>
          <a href="${esc(cartHref(view))}" data-cart-link class="w-full sm:w-auto px-7 py-3 rounded-full border border-gray-300 text-gray-800 font-semibold hover:bg-gray-50 transition-colors">Ver carrinho</a>
        </div>
      </div>
    </div>
  </section>`;
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
    <div class="relative aspect-square bg-gray-50 overflow-hidden rounded-2xl border border-gray-100 mb-3">${img}${badge}</div>
    <h3 class="text-sm font-semibold text-gray-900 line-clamp-2">${esc(p.name)}</h3>
    ${p.description ? `<p class="text-xs text-gray-500 line-clamp-1 mt-0.5">${esc(p.description)}</p>` : ""}
    <p class="pt-1 text-sm font-bold" style="color:var(--brand,#4f46e5)">${esc(formatKz(p.price))}</p>
  </a>`;
}

const GRID_CLS = "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8";

function sectionsArea(view: StoreRenderView, custom?: StoreCustomization): string {
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
      <div data-section-grid data-edit-products class="${GRID_CLS}">${cards}${empty}</div>
      ${moreBottom}
    </section>`;
  }).join("");
  return `<div data-edit-sections>${blocks}</div>`;
}

/* -------------------------------- Rodapé -------------------------------- */

function footerHtml(view: StoreRenderView, custom: StoreCustomization | undefined, menuLabels: string[]): string {
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
          ${esc(view.subdomain)} · Loja criada com <a href="#/" style="color:var(--brand,#4f46e5)">MôBisno</a>
        </div>
      </div>
    </footer>`;
}

/* -------------------------------- Páginas -------------------------------- */

/** Secção editorial: foto à esquerda, título + subtítulo à direita. */
function featureSection(custom?: StoreCustomization): string {
  const f = custom?.feature ?? {};
  const img = f.imageUrl || DEFAULT_FEATURE_IMG;
  const title = f.title || "Qualidade que se vê e se sente";
  const subtitle = f.subtitle || "Selecionamos cada produto a pensar em si: materiais de confiança, entrega rápida em toda Angola e atendimento próximo pelo WhatsApp.";
  return `
  <section data-edit-feature class="bg-gray-50 border-t border-gray-100">
    <div class="${CONTAINER} py-14 md:py-20">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-14 items-center">
        <div data-edit-feature-image class="relative aspect-[4/3] rounded-3xl overflow-hidden border border-gray-100 shadow-sm">
          <img src="${esc(img)}" alt="" class="w-full h-full object-cover" onerror="this.onerror=null;this.src='https://placehold.co/800x600/eef2ff/4f46e5?text=Imagem'" />
        </div>
        <div>
          <span class="inline-block w-10 h-1.5 rounded-full mb-5" style="background:var(--brand,#4f46e5)"></span>
          <h2 data-edit="feature.title" class="text-3xl md:text-4xl font-black tracking-tight text-gray-900 leading-tight">${esc(title)}</h2>
          <p data-edit="feature.subtitle" class="mt-4 text-gray-500 text-lg leading-relaxed">${esc(subtitle)}</p>
        </div>
      </div>
    </div>
  </section>`;
}

function render(view: StoreRenderView, custom?: StoreCustomization): string {
  const menuLabels = menuFor(view, custom);
  return `
  <div class="min-h-screen flex flex-col bg-white text-gray-900 font-sans">
    ${headerHtml(view, menuLabels)}
    ${arcHero(view, custom)}
    <main id="produtos" class="${CONTAINER} py-10 md:py-14">
      ${sectionsArea(view, custom)}
    </main>
    <div data-feature-slot>${custom?.featureEnabled === false ? "" : featureSection(custom)}</div>
    ${footerHtml(view, custom, menuLabels)}
  </div>`;
}

function renderProduct(view: StoreRenderView, product: StoreProductView, custom?: StoreCustomization): string {
  const menuLabels = menuFor(view, custom);
  const phone = resolveWaPhone(custom);
  const img = product.imageUrl
    ? `<img src="${esc(product.imageUrl)}" alt="${esc(product.name)}" class="w-full h-full object-cover" />`
    : `<div class="absolute inset-0 flex items-center justify-center bg-gray-100"><span class="material-symbols-outlined text-gray-300 text-6xl">image</span></div>`;
  const waMsg = buildProductMessage(custom?.whatsapp?.messageTemplate, product.name, formatKz(product.price));
  const related = view.products.filter((p) => p.id !== product.id).slice(0, 4);
  const crumbCategory = product.category
    ? `<a href="${esc(categoryHref(view, product.category))}" class="hover:text-gray-900">${esc(product.category)}</a>
       <span class="material-symbols-outlined text-[16px]">chevron_right</span>`
    : "";

  return `
  <div class="min-h-screen flex flex-col bg-white text-gray-900 font-sans">
    ${headerHtml(view, menuLabels)}
    <main class="${CONTAINER} py-6 md:py-10 flex-grow">
      <nav class="text-sm text-gray-500 mb-6 flex items-center gap-1.5 flex-wrap">
        <a href="${esc(storeHomeHref(view))}" class="hover:text-gray-900">Início</a>
        <span class="material-symbols-outlined text-[16px]">chevron_right</span>
        ${crumbCategory}
        <span class="text-gray-900 font-medium truncate">${esc(product.name)}</span>
      </nav>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        <div class="group relative aspect-square bg-gray-50 rounded-2xl overflow-hidden border border-gray-100" data-edit-product="${esc(product.id)}">${img}</div>
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
          <ul class="mt-8 space-y-2 text-sm text-gray-600 border-t border-gray-100 pt-6">
            <li class="flex items-center gap-2"><span class="material-symbols-outlined text-[18px]" style="color:var(--brand,#4f46e5)">local_shipping</span> Entrega em toda Angola</li>
            <li class="flex items-center gap-2"><span class="material-symbols-outlined text-[18px]" style="color:var(--brand,#4f46e5)">verified</span> Produto original garantido</li>
            <li class="flex items-center gap-2"><span class="material-symbols-outlined text-[18px]" style="color:var(--brand,#4f46e5)">payments</span> Pagamento na entrega ou Multicaixa</li>
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
    ${headerHtml(view, menuLabels)}
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
};
