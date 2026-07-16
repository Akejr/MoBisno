/**
 * Modelo "FoodMart" — mercearia/supermercado online. Adaptação fiel do template
 * FoodMart (TemplatesJungle) para o nosso stack (Tailwind + hooks), em PT-PT,
 * com carrosséis animados (banner + categorias + produtos), cartões de produto
 * com quantidade e "Adicionar ao carrinho", secções editáveis e banners que o
 * cliente pode adicionar/remover. Tipografia Nunito (títulos) + Open Sans.
 */
import { esc, formatKz } from "../lib/dom.js";
import { productSlugPath } from "../lib/slug.js";
import { perksItemsHtml } from "./perks.js";
import { blocksHtml } from "./blocks.js";
import { productGalleryHtml } from "./gallery.js";
import { gridColsClass, type ProductVariant } from "./productGrid.js";
import { platformHomeUrl, STORE_APEX } from "../lib/routing.js";
import { buildProductMessage, resolveWaPhone, waLink } from "../lib/whatsapp.js";
import { resolveSections, filterForCategoryPage, headerCategories } from "./sectionsModel.js";
import { mobileMenuParts } from "./headers.js";
import type { StoreTemplate, StoreRenderView, StoreCustomization } from "./types.js";
import type { StoreProductView } from "../../src/storefront/storeRenderer.js";

const CONTAINER = "w-full max-w-[1320px] mx-auto px-4 md:px-8";
const DEFAULT_PHONE = "+244 900 000 000";
const PRIMARY = "var(--brand,#6995B1)";
const YELLOW = "#FFC43F";

const STYLE = `<style>
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800&family=Open+Sans:wght@400;600;700&display=swap');
  .fm-root{font-family:'Open Sans',sans-serif;color:#222;background:#fff}
  .fm-root :is(h1,h2,h3,h4,h5),.fm-head{font-family:'Nunito',sans-serif;font-weight:800}
  .fm-root .material-symbols-outlined{font-family:'Material Symbols Outlined' !important}
  .fm-title{position:relative;padding-bottom:.85rem}
  .fm-title::after{content:"";position:absolute;left:0;bottom:0;width:64px;height:3px;background:var(--brand,#6995B1)}
  .fm-product{background:#fff;border:1px solid #f0f0f0;border-radius:1rem;padding:1.1rem;position:relative;transition:box-shadow .35s ease, transform .35s ease}
  .fm-product:hover{box-shadow:0 22px 44px -20px rgba(0,0,0,.22);transform:translateY(-4px)}
  .fm-wish{position:absolute;top:.9rem;right:.9rem;width:38px;height:38px;border-radius:9999px;display:flex;align-items:center;justify-content:center;background:#fff;color:#9aa0a6;border:1px solid #eee;box-shadow:0 4px 12px rgba(0,0,0,.06);transition:.25s;z-index:5}
  .fm-wish:hover{background:var(--brand,#6995B1);color:#fff}
  .fm-wish .material-symbols-outlined{font-variation-settings:'FILL' 0}
  .fm-cat{display:block;text-align:center;padding:1.4rem 1rem;border-radius:1rem;background:#fff;border:1px solid #f0f0f0;transition:box-shadow .35s ease, transform .35s ease}
  .fm-cat:hover{box-shadow:0 18px 34px -20px rgba(0,0,0,.22);transform:translateY(-5px)}
  .fm-arrow{width:40px;height:40px;border-radius:9999px;display:inline-flex;align-items:center;justify-content:center;background:${YELLOW};color:#222;border:0;cursor:pointer;transition:.2s}
  .fm-arrow:hover{filter:brightness(.95)}
  .fm-noscroll{scrollbar-width:none;-ms-overflow-style:none}
  .fm-noscroll::-webkit-scrollbar{display:none}
  .fm-tag{display:inline-block;background:${YELLOW};color:#222;padding:.35rem .85rem;border-radius:.4rem;font-size:.8rem;font-weight:700}
  .fm-tag.sale{background:#dc3545;color:#fff}
  .fm-step{display:inline-flex;align-items:center;border:1px solid #eee;border-radius:.5rem;overflow:hidden}
  .fm-step button{width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:0;cursor:pointer}
  .fm-banner-slide{transition:opacity .6s ease}
  .fm-link{color:var(--brand,#6995B1);font-weight:700}
  /* Página de produto */
  .fm-pdp-stage{background:#f7f8f9;border:1px solid #f0f0f0;border-radius:1.5rem}
  .fm-pdp-perk{display:flex;align-items:center;gap:.65rem;background:#fff;border:1px solid #f0f0f0;border-radius:1rem;padding:.75rem .9rem}
  .fm-pdp-perk .material-symbols-outlined{color:${YELLOW};font-size:26px}
  .fm-qty{display:inline-flex;align-items:center;border:1px solid #e6e8ea;border-radius:.75rem;overflow:hidden}
  .fm-qty button{width:44px;height:48px;display:flex;align-items:center;justify-content:center;background:#fff;transition:.2s}
  .fm-qty button:hover{background:#f4f5f6}
  /* Checkout — personalidade FoodMart (Nunito, cantos suaves, acentos) */
  .fm-checkout{font-family:'Open Sans',sans-serif}
  .fm-checkout :is(h1,h2,h3,h4,h5),.fm-checkout .font-black,.fm-checkout .font-bold{font-family:'Nunito',sans-serif;color:#222}
  .fm-checkout .border-neutral-200{border-color:#f0f0f0 !important}
  .fm-checkout .rounded-2xl{border-radius:1.5rem}
  .fm-checkout .shadow-sm{box-shadow:0 18px 40px -28px rgba(0,0,0,.28) !important}
  .fm-checkout input,.fm-checkout select,.fm-checkout textarea{border-radius:.7rem}
  .fm-checkout [data-method]{border-radius:1rem}
  .fm-checkout #pay{border-radius:.85rem}
</style>`;

let mbGridVariant: ProductVariant | undefined;
let mbLogoScale: number | undefined;

/* ------------------------------- Helpers ------------------------------- */

function storeIdentifier(view: StoreRenderView): string { return view.subdomain.split(".")[0] ?? view.subdomain; }
function homeHref(view: StoreRenderView): string { return `#/loja/${encodeURIComponent(storeIdentifier(view))}`; }
function productHref(view: StoreRenderView, p: StoreProductView): string { return `${homeHref(view)}/produto/${productSlugPath(p)}`; }
function categoryHref(view: StoreRenderView, c: string): string { return `${homeHref(view)}/categoria/${encodeURIComponent(c)}`; }
function cartHref(view: StoreRenderView): string { return `${homeHref(view)}/carrinho`; }
function targetHref(view: StoreRenderView, target?: string): string {
  return target && target.trim() ? categoryHref(view, target) : `${homeHref(view)}#produtos`;
}

function menuFor(view: StoreRenderView, custom?: StoreCustomization): string[] {
  mbLogoScale = custom?.logoScale;
  mbGridVariant = custom?.productGrid?.variant;
  return custom?.menu && custom.menu.length ? custom.menu : view.menu.items.map((i) => i.label);
}

function brandHtml(view: StoreRenderView): string {
  const b = view.header.brand;
  if (b.kind === "logo") {
    return `<img src="${esc(b.url)}" alt="${esc(b.alt)}" class="w-auto object-contain" style="height:${mbLogoScale ?? 40}px" />`;
  }
  return `<span class="fp-brand fm-head text-2xl md:text-3xl" style="color:#222">${esc(view.storeName)}</span>`;
}

/* ------------------------------- Cabeçalho ------------------------------- */

/** Campo de pesquisa inline do cabeçalho — moderno (pílula com botão). */
function searchHost(_view: StoreRenderView): string {
  return `<div data-fm-search-host class="relative w-full">
    <div class="flex items-center gap-1 bg-white rounded-full border border-gray-200 shadow-sm focus-within:shadow-md focus-within:border-gray-300 transition-all pl-4 pr-1.5 py-1.5">
      <span class="material-symbols-outlined text-gray-400">search</span>
      <input data-fm-search type="text" placeholder="Pesquisar produtos…" class="flex-1 bg-transparent border-0 outline-none focus:ring-0 px-2 text-sm min-w-0" style="box-shadow:none" autocomplete="off" />
      <button type="button" data-fm-search-go class="fm-head text-white text-sm px-5 py-2 rounded-full shrink-0 hover:opacity-90 transition-opacity" style="background:var(--brand,#6995B1)">Pesquisar</button>
    </div>
    <div data-fm-search-results class="hidden absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-[60] max-h-[70vh] overflow-y-auto"></div>
  </div>`;
}

function headerHtml(view: StoreRenderView, custom?: StoreCustomization): string {
  const cats = headerCategories(view);
  const supportPhone = custom?.foodmart?.supportPhone || DEFAULT_PHONE;
  const mnav = mobileMenuParts(view, CONTAINER);
  const linkCls = "fm-head text-[15px] hover:text-[color:var(--brand,#6995B1)] transition-colors";
  const catsMenu = cats.length
    ? `<div class="relative group" data-categories-menu>
        <button type="button" class="${linkCls} flex items-center gap-1" style="color:#222">Categorias <span class="material-symbols-outlined text-[18px]">expand_more</span></button>
        <div class="absolute left-0 top-full pt-3 hidden group-hover:block z-50">
          <div class="bg-white border border-gray-100 rounded-xl shadow-xl py-2 min-w-[210px]">
            ${cats.map((c) => `<a href="${esc(categoryHref(view, c))}" class="block px-4 py-2 text-sm hover:bg-gray-50 transition-colors" style="color:#333">${esc(c)}</a>`).join("")}
          </div>
        </div>
      </div>`
    : "";
  return `
    <header class="fm-root">
      ${mnav.head}
      <div class="border-b border-gray-100">
        <div class="${CONTAINER} py-4 flex items-center gap-4 md:gap-8">
          <div class="flex items-center gap-1 min-w-0">
            ${mnav.button}
            <a href="${esc(homeHref(view))}" data-edit-logo class="flex items-center min-w-0">${brandHtml(view)}</a>
          </div>
          <div class="hidden md:block flex-1 min-w-0 max-w-2xl">${searchHost(view)}</div>
          <div class="flex items-center gap-4 md:gap-6 ml-auto">
            <div class="hidden xl:block text-right">
              <span class="text-xs text-gray-400">Apoio ao cliente</span>
              <p data-edit="foodmart.supportPhone" class="fm-head text-sm mb-0" style="color:#222">${esc(supportPhone)}</p>
            </div>
            <a href="${esc(cartHref(view))}" data-cart-link class="relative flex items-center gap-2" style="color:#222">
              <span class="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center"><span class="material-symbols-outlined">shopping_cart</span></span>
              <span class="hidden md:block text-left leading-tight"><span class="text-xs text-gray-400 block">O meu cesto</span><span class="fm-head text-sm">Ver cesto</span></span>
              <span data-cart-count class="hidden absolute -top-1 left-6 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center text-white" style="background:var(--brand,#6995B1)"></span>
            </a>
          </div>
        </div>
      </div>
      <div class="md:hidden border-b border-gray-100">
        <div class="${CONTAINER} py-3">${searchHost(view)}</div>
      </div>
      <div class="border-b border-gray-100">
        <div class="${CONTAINER} py-3 flex items-center gap-6">
          <nav class="flex items-center gap-2 md:gap-4 flex-wrap">
            <a href="${esc(homeHref(view))}" class="fm-head text-sm px-4 py-2 rounded-lg text-white" style="background:var(--brand,#6995B1)">Início</a>
            <a href="${esc(homeHref(view))}#produtos" class="${linkCls} px-3 py-2" style="color:#222">Produtos</a>
            ${catsMenu}
          </nav>
        </div>
      </div>
      ${mnav.panel}
    </header>`;
}

/* ------------------------------- Banners ------------------------------- */

function defaultBanners(): NonNullable<NonNullable<StoreCustomization["foodmart"]>["banners"]> {
  return [
    { tag: "100% natural", title: "Sumos & Smoothies Frescos", subtitle: "Feitos com fruta selecionada, entregues à sua porta em Luanda.", ctaLabel: "Comprar agora", imageUrl: "https://images.unsplash.com/photo-1622597467836-f3285f2131b8?q=80&w=800" },
    { tag: "Novidade", title: "Mercearia fresca todos os dias", subtitle: "Os melhores produtos, ao melhor preço.", ctaLabel: "Ver coleção", imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=800" },
  ];
}

function bannerBlocks(view: StoreRenderView, custom?: StoreCustomization): string {
  const banners = custom?.foodmart?.banners && custom.foodmart.banners.length ? custom.foodmart.banners : defaultBanners();
  const ads = custom?.foodmart?.ads ?? [
    { tag: "20% desconto", title: "Frutas & Vegetais", imageUrl: "https://images.unsplash.com/photo-1610832958506-aa56368176cf?q=80&w=600", bg: "#eaf5ea" },
    { tag: "15% desconto", title: "Pães & Padaria", imageUrl: "https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=600", bg: "#fdeaea" },
  ];

  const slides = banners.map((b, i) => `
    <div data-fm-slide class="fm-banner-slide absolute inset-0" style="opacity:${i === 0 ? 1 : 0}">
      <div class="relative h-full flex flex-col justify-center px-8 md:px-14 py-10">
        <div class="max-w-[54%] md:max-w-[50%] z-10">
          <span data-edit="foodmart.banners.${i}.tag" class="fm-tag mb-5">${esc(b.tag ?? "")}</span>
          <h2 data-edit="foodmart.banners.${i}.title" class="fm-head text-2xl md:text-3xl xl:text-4xl mb-3 leading-[1.15]" style="color:#222">${esc(b.title ?? "")}</h2>
          <p data-edit="foodmart.banners.${i}.subtitle" class="text-gray-600 text-sm md:text-base mb-6 max-w-sm">${esc(b.subtitle ?? "")}</p>
          <a href="${esc(targetHref(view, b.ctaTarget))}" data-fm-banner-cta="${i}" class="inline-flex items-center gap-2 fm-head text-sm uppercase tracking-wide border-2 border-gray-900 rounded-lg px-6 py-3 hover:bg-gray-900 hover:text-white transition-colors" style="color:#222"><span data-edit="foodmart.banners.${i}.ctaLabel">${esc(b.ctaLabel ?? "Comprar agora")}</span></a>
        </div>
        ${b.imageUrl ? `<img src="${esc(b.imageUrl)}" alt="" class="hidden md:block absolute right-0 top-0 h-full w-[46%] object-cover" style="mask-image:linear-gradient(to left,#000 70%,transparent);-webkit-mask-image:linear-gradient(to left,#000 70%,transparent)" onerror="this.style.display='none'" />` : ""}
      </div>
    </div>`).join("");

  const dots = banners.length > 1
    ? `<div class="absolute bottom-5 left-8 md:left-14 flex gap-2 z-20">${banners.map(() => `<button type="button" data-fm-dot class="w-2.5 h-2.5 rounded-full" style="background:var(--brand,#6995B1);opacity:.45"></button>`).join("")}</div>`
    : "";
  const arrows = "";

  const adBlock = (a: NonNullable<typeof ads>[number], i: number): string => {
    const tagStyle = a.tagBg ? `background:${esc(a.tagBg)};color:#fff` : "";
    return `
    <div data-fm-ad="${i}" class="relative rounded-3xl overflow-hidden flex items-center min-h-[188px]" style="background:${esc(a.bg ?? "#eef1f3")}">
      <div class="p-7 pr-24 z-10">
        <span data-edit="foodmart.ads.${i}.tag" class="fm-tag sale w-max mb-3" style="${tagStyle}">${esc(a.tag ?? "")}</span>
        <h3 data-edit="foodmart.ads.${i}.title" class="fm-head text-xl md:text-2xl mb-3 leading-tight" style="color:#222">${esc(a.title ?? "")}</h3>
        <a href="${esc(targetHref(view, a.ctaTarget))}" data-fm-ad-cta="${i}" class="fm-link inline-flex items-center gap-1"><span data-edit="foodmart.ads.${i}.ctaLabel">${esc(a.ctaLabel ?? "Comprar")}</span> <span class="material-symbols-outlined text-[18px]">${esc(a.ctaIcon ?? "arrow_forward")}</span></a>
      </div>
      ${a.imageUrl ? `<img src="${esc(a.imageUrl)}" alt="" class="absolute right-0 bottom-0 h-full w-[45%] object-cover" style="mask-image:linear-gradient(to left,#000 60%,transparent);-webkit-mask-image:linear-gradient(to left,#000 60%,transparent)" onerror="this.style.display='none'" />` : ""}
    </div>`;
  };

  return `
  <section class="${CONTAINER} py-6">
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div data-fm-banner class="lg:col-span-2 relative rounded-3xl overflow-hidden min-h-[420px] md:min-h-[480px]" style="background:linear-gradient(120deg,#eef7fb,#f7f4ee)">
        ${slides}${dots}${arrows}
      </div>
      <div class="grid grid-rows-2 gap-5">
        ${ads.map((a, i) => adBlock(a, i)).join("")}
      </div>
    </div>
  </section>`;
}

/* ---------------------------- Categorias ---------------------------- */

const CAT_ICONS = ["nutrition", "bakery_dining", "local_bar", "wine_bar", "egg", "grocery", "kitchen", "icecream"];

function categoryGrid(view: StoreRenderView, custom?: StoreCustomization): string {
  const cats = headerCategories(view);
  if (!cats.length) return "";
  const icons = custom?.categoryIcons ?? {};
  const items = cats.map((c, i) => `
    <a href="${esc(categoryHref(view, c))}" class="fm-cat flex-1 min-w-[150px]" data-fm-cat="${esc(c)}">
      <span class="material-symbols-outlined text-4xl mb-3 fm-cat-icon" style="color:var(--brand,#6995B1)">${esc(icons[c] || CAT_ICONS[i % CAT_ICONS.length])}</span>
      <h3 class="fm-head text-base" style="color:#222">${esc(c)}</h3>
    </a>`).join("");
  return `
  <section class="${CONTAINER} py-8">
    <div class="mb-8">
      <h2 class="fm-title fm-head text-2xl md:text-3xl" style="color:#222">Categorias</h2>
    </div>
    <div data-fm-categories class="flex flex-wrap gap-4 md:gap-5">${items}</div>
  </section>`;
}

/* ------------------------------- Produtos ------------------------------- */

function productCard(view: StoreRenderView, p: StoreProductView, opts: { hidden?: boolean; slide?: boolean } = {}): string {
  const img = p.imageUrl
    ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onerror="this.onerror=null;this.src='https://placehold.co/400x400/f2f4f5/9aa0a6?text=Produto'" />`
    : `<span class="material-symbols-outlined text-5xl text-gray-300">grocery</span>`;
  const badge = p.featured ? `<span class="absolute top-4 left-4 z-10 text-white text-xs font-bold px-2.5 py-1 rounded" style="background:#3fb95a">Destaque</span>` : "";
  const hide = opts.hidden ? ` data-extra style="display:none"` : "";
  const wrapCls = opts.slide ? "fm-product group shrink-0 w-[230px] snap-start" : "fm-product group";
  return `<div class="${wrapCls}" data-edit-product="${esc(p.id)}"${hide}>
    ${badge}
    <button type="button" class="fm-wish" title="Favorito"><span class="material-symbols-outlined text-[20px]">favorite</span></button>
    <a href="${esc(productHref(view, p))}" class="block"><figure class="h-48 rounded-xl overflow-hidden bg-[#f7f8f9] flex items-center justify-center mb-4">${img}</figure></a>
    <a href="${esc(productHref(view, p))}" class="block"><h3 class="fm-head text-[15px] leading-snug mb-1.5 line-clamp-2" style="color:#222">${esc(p.name)}</h3></a>
    <div class="flex items-center gap-3 text-sm mb-2">
      <span class="text-gray-400 uppercase text-xs tracking-wide">${p.category ? esc(p.category) : "1 Un"}</span>
      <span class="inline-flex items-center gap-1 text-gray-500"><span class="material-symbols-outlined text-[16px]" style="color:#FFC43F;font-variation-settings:'FILL' 1">star</span> 4.5</span>
    </div>
    <span class="fm-head text-xl block mb-3" style="color:#222">${esc(formatKz(p.price))}</span>
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center border border-gray-200 rounded-lg overflow-hidden">
        <button type="button" class="w-8 h-8 flex items-center justify-center hover:bg-gray-50" style="color:#dc3545"><span class="material-symbols-outlined text-[16px]">remove</span></button>
        <span class="w-8 text-center text-sm border-x border-gray-200 leading-8">1</span>
        <button type="button" class="w-8 h-8 flex items-center justify-center hover:bg-gray-50" style="color:#198754"><span class="material-symbols-outlined text-[16px]">add</span></button>
      </div>
      <button type="button" data-add-cart="${esc(p.id)}" class="inline-flex items-center gap-1 text-sm font-semibold hover:text-[color:var(--brand,#6995B1)] transition-colors" style="color:#222">Adicionar <span class="material-symbols-outlined text-[18px]">shopping_cart</span></button>
    </div>
  </div>`;
}

const TWO_ROWS = 10;

function sectionsArea(view: StoreRenderView, custom?: StoreCustomization): string {
  const gridCls = mbGridVariant ? gridColsClass(mbGridVariant) : "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5";
  const sections = resolveSections(view, custom);
  const multi = sections.length > 1;
  const blocks = sections.map((sec, i) => {
    const items = multi ? sec.products.slice(0, 5) : sec.products;
    const cards = items.map((p, idx) => productCard(view, p, { hidden: !multi && idx >= TWO_ROWS })).join("");
    const moreRight = multi
      ? `<a href="${esc(sec.moreHref)}" class="fm-link text-sm">Ver todos →</a>`
      : "";
    const moreBottom = (!multi && sec.products.length > TWO_ROWS)
      ? `<div class="text-center mt-10"><button type="button" data-load-more data-step="${TWO_ROWS}" class="fm-head text-sm px-8 py-3 rounded-lg text-white" style="background:var(--brand,#6995B1)">Ver mais produtos</button></div>`
      : "";
    const empty = items.length === 0 ? `<p class="col-span-full py-8 text-center text-gray-400">Sem produtos nesta secção.</p>` : "";
    return `<section data-section data-edit-section="${i}" class="${CONTAINER} py-8 ${i > 0 ? "" : ""}">
      <div data-edit-section-head class="flex flex-wrap items-center justify-between gap-3 mb-8">
        <h2 class="fm-title fm-head text-2xl md:text-3xl" style="color:#222">${esc(sec.title)}</h2>
        ${moreRight}
      </div>
      <div data-section-grid data-edit-products class="${gridCls}">${cards}${empty}</div>
      ${moreBottom}
    </section>`;
  }).join("");
  return `<div id="produtos" data-edit-sections>${blocks}</div>`;
}

/** Carrossel "Mais populares" — produtos em faixa horizontal com setas. */
function popularCarousel(view: StoreRenderView): string {
  const items = view.products.slice(0, 10);
  if (items.length < 3) return "";
  return `
  <section class="${CONTAINER} py-8" data-fm-carousel>
    <div class="flex items-center justify-between mb-8">
      <h2 class="fm-title fm-head text-2xl md:text-3xl" style="color:#222">Mais populares</h2>
      <div class="flex gap-2">
        <button type="button" data-fm-cprev class="fm-arrow"><span class="material-symbols-outlined">chevron_left</span></button>
        <button type="button" data-fm-cnext class="fm-arrow"><span class="material-symbols-outlined">chevron_right</span></button>
      </div>
    </div>
    <div data-fm-track class="fm-noscroll flex gap-5 overflow-x-auto snap-x pb-2">
      ${items.map((p) => productCard(view, p, { slide: true })).join("")}
    </div>
  </section>`;
}

/** Faixa promocional editável (desconto). */
function promoSection(view: StoreRenderView, custom?: StoreCustomization): string {
  if (custom?.foodmart?.promo?.enabled === false) return "";
  const title = custom?.foodmart?.promo?.title || "25% de desconto na primeira compra";
  const text = custom?.foodmart?.promo?.text || "Subscreva a nossa newsletter e receba as melhores ofertas de mercearia, todas as semanas.";
  const ctaLabel = custom?.foodmart?.promo?.ctaLabel || "Ver produtos";
  const ctaIcon = custom?.foodmart?.promo?.ctaIcon || "arrow_forward";
  return `
  <section data-fm-promo class="${CONTAINER} py-10">
    <div class="rounded-[2rem] p-8 md:p-14 grid md:grid-cols-2 gap-8 items-center" style="background:#eef1f3">
      <div>
        <h2 data-edit="foodmart.promo.title" class="fm-head text-3xl md:text-4xl mb-4 leading-tight" style="color:#222">${esc(title)}</h2>
        <p data-edit="foodmart.promo.text" class="text-gray-600 max-w-md">${esc(text)}</p>
      </div>
      <div class="md:text-right">
        <a href="${esc(targetHref(view, custom?.foodmart?.promo?.ctaTarget))}" data-fm-promo-cta class="inline-flex items-center gap-2 fm-head text-white px-8 py-4 rounded-xl hover:opacity-90 transition-opacity" style="background:#222"><span data-edit="foodmart.promo.ctaLabel">${esc(ctaLabel)}</span> <span class="material-symbols-outlined text-[20px]">${esc(ctaIcon)}</span></a>
      </div>
    </div>
  </section>`;
}

/** Garantias por omissão (usadas quando o dono ainda não editou). */
export function foodmartDefaultFeatures(): NonNullable<NonNullable<StoreCustomization["foodmart"]>["features"]> {
  return [
    { icon: "local_shipping", title: "Entrega grátis", text: "Em encomendas acima do valor definido." },
    { icon: "verified_user", title: "Pagamento seguro", text: "Multicaixa Express, Referência e WhatsApp." },
    { icon: "workspace_premium", title: "Garantia de qualidade", text: "Produtos frescos e selecionados." },
    { icon: "savings", title: "Poupança garantida", text: "Os melhores preços do mercado." },
    { icon: "redeem", title: "Ofertas diárias", text: "Descontos novos todos os dias." },
  ];
}

/** Faixa de garantias (5 cartões editáveis: ícone, textos e cor do ícone). */
function featuresRow(custom?: StoreCustomization): string {
  const feats = custom?.foodmart?.features && custom.foodmart.features.length
    ? custom.foodmart.features
    : foodmartDefaultFeatures();
  const iconColor = custom?.foodmart?.featuresIconColor || "#222";
  return `
  <section data-fm-features class="${CONTAINER} py-10">
    <div class="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-6">
      ${feats.map((f, i) => `<div class="flex items-start gap-3" data-fm-feature="${i}">
        <span class="material-symbols-outlined text-3xl shrink-0 fm-feature-icon" style="color:${esc(iconColor)}">${esc(f.icon ?? "check_circle")}</span>
        <div><h5 data-edit="foodmart.features.${i}.title" class="fm-head text-base mb-1" style="color:#222">${esc(f.title ?? "")}</h5><p data-edit="foodmart.features.${i}.text" class="text-sm text-gray-500">${esc(f.text ?? "")}</p></div>
      </div>`).join("")}
    </div>
  </section>`;
}

/* -------------------------------- Rodapé -------------------------------- */

function footerHtml(view: StoreRenderView, custom?: StoreCustomization): string {
  const about = custom?.footer?.about || "A sua mercearia online em Angola. Produtos frescos, entrega rápida e os melhores preços.";
  const location = custom?.footer?.location || "Luanda, Angola";
  const phone = custom?.footer?.phone || DEFAULT_PHONE;
  const email = custom?.footer?.email || "geral@minhaloja.ao";
  return `
    <footer class="mt-auto" style="background:#f7f8f9">
      <div class="${CONTAINER} py-14 grid grid-cols-1 md:grid-cols-3 gap-10">
        <div>
          <div data-edit-footer-logo class="relative inline-block mb-4">${brandHtml(view)}</div>
          <p data-edit="footer.about" class="text-sm text-gray-500 leading-relaxed max-w-xs">${esc(about)}</p>
        </div>
        <div>
          <h5 class="fm-head text-base mb-4" style="color:#222">Loja</h5>
          <ul class="space-y-2.5 text-sm">
            <li><a href="${esc(homeHref(view))}" class="text-gray-500 hover:text-gray-900">Início</a></li>
            <li><a href="${esc(homeHref(view))}#produtos" class="text-gray-500 hover:text-gray-900">Produtos</a></li>
          </ul>
        </div>
        <div>
          <h5 class="fm-head text-base mb-4" style="color:#222">Contacto</h5>
          <ul class="space-y-2.5 text-sm text-gray-500">
            <li class="flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">location_on</span> <span data-edit="footer.location">${esc(location)}</span></li>
            <li class="flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">call</span> <span data-edit="footer.phone">${esc(phone)}</span></li>
            <li class="flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">mail</span> <span data-edit="footer.email">${esc(email)}</span></li>
          </ul>
        </div>
      </div>
      <div class="border-t border-gray-200">
        <div class="${CONTAINER} py-5 text-xs text-gray-400 text-center">
          ${esc(storeIdentifier(view) + "." + STORE_APEX)} · Loja criada com <a href="${platformHomeUrl()}" class="fm-link">MôBisno</a>
        </div>
      </div>
    </footer>`;
}

/* -------------------------------- Páginas -------------------------------- */

function render(view: StoreRenderView, custom?: StoreCustomization): string {
  menuFor(view, custom);
  return `${STYLE}
  <div class="fm-root relative min-h-screen flex flex-col overflow-x-hidden">
    ${headerHtml(view, custom)}
    ${bannerBlocks(view, custom)}
    ${categoryGrid(view, custom)}
    ${sectionsArea(view, custom)}
    ${popularCarousel(view)}
    ${promoSection(view, custom)}
    ${blocksHtml(custom, { container: CONTAINER, brand: PRIMARY, variant: "default" })}
    ${featuresRow(custom)}
    ${footerHtml(view, custom)}
  </div>`;
}

function renderProduct(view: StoreRenderView, product: StoreProductView, custom?: StoreCustomization): string {
  menuFor(view, custom);
  const phone = resolveWaPhone(custom);
  const waMsg = buildProductMessage(custom?.whatsapp?.messageTemplate, product.name, formatKz(product.price));
  const related = view.products.filter((p) => p.id !== product.id).slice(0, 10);
  const perks = [
    { icon: "local_shipping", text: "Entrega rápida em Luanda" },
    { icon: "verified_user", text: "Pagamento 100% seguro" },
    { icon: "spa", text: "Produtos frescos e selecionados" },
  ];
  return `${STYLE}
  <div class="fm-root min-h-screen flex flex-col overflow-x-hidden">
    ${headerHtml(view, custom)}
    <main class="${CONTAINER} py-8 md:py-10 flex-grow">
      <nav class="text-sm mb-7 flex items-center gap-1.5 flex-wrap text-gray-400">
        <a href="${esc(homeHref(view))}" class="hover:text-gray-900">Início</a>
        <span class="material-symbols-outlined text-[16px]">chevron_right</span>
        ${product.category ? `<a href="${esc(categoryHref(view, product.category))}" class="hover:text-gray-900">${esc(product.category)}</a><span class="material-symbols-outlined text-[16px]">chevron_right</span>` : ""}
        <span style="color:#222">${esc(product.name)}</span>
      </nav>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
        ${productGalleryHtml(product, custom, { stageClass: "fm-pdp-stage aspect-square overflow-hidden flex items-center justify-center", imgClass: "max-h-full w-auto object-contain p-8", brand: PRIMARY })}
        <div class="flex flex-col lg:sticky lg:top-6">
          <div class="flex items-center gap-3 mb-3">
            ${product.category ? `<span class="fm-tag w-max">${esc(product.category)}</span>` : ""}
            ${product.featured ? `<span class="text-white text-xs font-bold px-2.5 py-1 rounded" style="background:#3fb95a">Destaque</span>` : ""}
          </div>
          <h1 class="fm-head text-3xl md:text-4xl mb-3 leading-tight" style="color:#222">${esc(product.name)}</h1>
          <div class="flex items-center gap-2 mb-5">
            <span class="inline-flex items-center gap-0.5" style="color:${YELLOW}">
              <span class="material-symbols-outlined text-[18px]" style="font-variation-settings:'FILL' 1">star</span>
              <span class="material-symbols-outlined text-[18px]" style="font-variation-settings:'FILL' 1">star</span>
              <span class="material-symbols-outlined text-[18px]" style="font-variation-settings:'FILL' 1">star</span>
              <span class="material-symbols-outlined text-[18px]" style="font-variation-settings:'FILL' 1">star</span>
              <span class="material-symbols-outlined text-[18px]">star_half</span>
            </span>
            <span class="text-sm text-gray-400">4.8 · 126 avaliações</span>
          </div>
          <div class="flex items-baseline gap-3 mb-6">
            <span class="fm-head text-4xl" style="color:var(--brand,#6995B1)">${esc(formatKz(product.price))}</span>
            <span class="text-xs text-gray-400 uppercase tracking-wide">IVA incluído</span>
          </div>
          ${product.description ? `<p class="text-gray-600 leading-relaxed mb-7 whitespace-pre-line">${esc(product.description)}</p>` : `<p class="text-gray-400 italic mb-7">Sem descrição.</p>`}
          <div class="flex flex-col sm:flex-row items-stretch gap-3 mb-6">
            <div class="fm-qty self-start sm:self-auto">
              <button type="button" data-qty-dec style="color:#dc3545"><span class="material-symbols-outlined text-[20px]">remove</span></button>
              <input data-qty type="text" inputmode="numeric" value="1" class="w-14 h-12 text-center outline-none border-x border-gray-200 fm-head" />
              <button type="button" data-qty-inc style="color:#198754"><span class="material-symbols-outlined text-[20px]">add</span></button>
            </div>
            <button type="button" data-add-cart="${esc(product.id)}" class="flex-1 inline-flex items-center justify-center gap-2 fm-head text-white px-6 py-3.5 rounded-xl hover:opacity-90 transition-opacity" style="background:var(--brand,#6995B1)"><span class="material-symbols-outlined text-[20px]">shopping_cart</span> Adicionar ao carrinho</button>
          </div>
          <a href="${esc(waLink(phone, waMsg))}" data-edit-whatsapp target="_blank" rel="noopener" class="inline-flex items-center justify-center gap-2 fm-head px-6 py-3.5 rounded-xl border-2 border-gray-900 hover:bg-gray-900 hover:text-white transition-colors mb-7" style="color:#222"><span class="material-symbols-outlined text-[20px]">chat</span> Comprar via WhatsApp</a>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-7">
            ${perks.map((p) => `<div class="fm-pdp-perk"><span class="material-symbols-outlined">${p.icon}</span><span class="text-sm text-gray-600 leading-snug">${p.text}</span></div>`).join("")}
          </div>
          <ul data-edit-perks class="space-y-2 text-sm text-gray-600 border-t border-gray-100 pt-6">
            ${perksItemsHtml(custom, PRIMARY)}
          </ul>
        </div>
      </div>
      ${related.length >= 3
        ? `<section data-related data-fm-carousel class="mt-16">
            <div class="flex items-center justify-between mb-8">
              <h2 class="fm-title fm-head text-2xl md:text-3xl" style="color:#222">Também pode gostar</h2>
              <div class="flex gap-2">
                <button type="button" data-fm-cprev class="fm-arrow"><span class="material-symbols-outlined">chevron_left</span></button>
                <button type="button" data-fm-cnext class="fm-arrow"><span class="material-symbols-outlined">chevron_right</span></button>
              </div>
            </div>
            <div data-fm-track class="fm-noscroll flex gap-5 overflow-x-auto snap-x pb-2">${related.map((p) => productCard(view, p, { slide: true })).join("")}</div>
          </section>`
        : ""}
    </main>
    ${footerHtml(view, custom)}
  </div>`;
}

function renderCategory(view: StoreRenderView, category: string, custom?: StoreCustomization): string {
  menuFor(view, custom);
  const items = filterForCategoryPage(view, category);
  const grid = items.length
    ? `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">${items.map((p) => productCard(view, p)).join("")}</div>`
    : `<div class="py-16 text-center text-gray-400"><span class="material-symbols-outlined" style="font-size:48px">grocery</span><p class="mt-2">Ainda não há produtos nesta categoria.</p></div>`;
  return `${STYLE}
  <div class="fm-root min-h-screen flex flex-col overflow-x-hidden">
    ${headerHtml(view, custom)}
    <main class="${CONTAINER} py-10 flex-grow">
      <nav class="text-sm mb-8 flex items-center gap-1.5 text-gray-400">
        <a href="${esc(homeHref(view))}" class="hover:text-gray-900">Início</a>
        <span class="material-symbols-outlined text-[16px]">chevron_right</span>
        <span style="color:#222">${esc(category)}</span>
      </nav>
      <div class="flex items-end gap-3 mb-8">
        <h1 class="fm-head text-3xl md:text-4xl" style="color:#222">${esc(category)}</h1>
        <span class="text-sm text-gray-400">${items.length} produto(s)</span>
      </div>
      ${grid}
    </main>
    ${footerHtml(view, custom)}
  </div>`;
}

function renderCheckout(view: StoreRenderView, innerHtml: string, custom?: StoreCustomization): string {
  menuFor(view, custom);
  return `${STYLE}
  <div class="fm-root min-h-screen flex flex-col overflow-x-hidden">
    ${headerHtml(view, custom)}
    <main class="${CONTAINER} py-8 md:py-10 flex-grow">
      <div class="mb-8">
        <h1 class="fm-title fm-head text-2xl md:text-3xl" style="color:#222">Finalizar compra</h1>
      </div>
      <div class="fm-checkout">${innerHtml}</div>
    </main>
    ${footerHtml(view, custom)}
  </div>`;
}

export const foodmartTemplate: StoreTemplate = {
  id: "foodmart",
  name: "FoodMart",
  previewUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=600",
  ready: true,
  defaultBrand: "#6995B1",
  render,
  renderProduct,
  renderCategory,
  renderCheckout,
};
