/**
 * Modelo "Beauty" — adaptado do design WePink Angola ("The Olfactory Gallery").
 *
 * Estética de perfumaria de luxo: Noto Serif para títulos/preços, Manrope para
 * corpo, paleta alabastro/rosa, sem linhas (camadas tonais). A cor de destaque
 * usa `var(--brand)` (editável), com rosa #b71656 por omissão.
 *
 * Liga-se aos dados reais (logótipo, banners, produtos, categorias) e à
 * personalização do dono. Elementos editáveis levam `data-edit*` (inofensivos
 * na loja publicada).
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

const PER_ROW = 3;
const TWO_ROWS = 6;

const SERIF = "font-family:'Noto Serif',serif";
const CONTAINER = "w-full max-w-7xl mx-auto px-6";
const HERO_FALLBACK = "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?q=80&w=2000";
const DEFAULT_BRAND = "#b71656";
const DEFAULT_PHONE = "+244 900 000 000";
const DEFAULT_SUBTITLE = "Descubra fragrâncias exclusivas que capturam a sofisticação moderna. Agora em Angola.";
const DEFAULT_CTA = "Comprar agora";
/** Altura do logótipo do cabeçalho (definida em menuFor a cada render). */
let mbLogoScale: number | undefined;
/** Disposição dos produtos escolhida (definida em menuFor a cada render). */
let mbGridVariant: ProductVariant | undefined;

/** Aspeto do cartão de produto (omissão do modelo: alto 4:5). */
function cardAspect(): string {
  return cardAspectClass(mbGridVariant ?? "alto");
}

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
  const b = view.header.brand;
  if (b.kind === "logo") {
    return `<img src="${esc(b.url)}" alt="${esc(b.alt)}" class="w-auto object-contain" style="height:${mbLogoScale ?? 38}px" />`;
  }
  return `<span style="${SERIF};color:var(--brand,${DEFAULT_BRAND})" class="text-2xl font-bold tracking-tighter">${esc(view.storeName)}</span>`;
}

function footerBrandHtml(view: StoreRenderView, custom?: StoreCustomization): string {
  const url = custom?.footer?.logoUrl || (view.header.brand.kind === "logo" ? view.header.brand.url : null);
  if (url) return `<img src="${esc(url)}" alt="${esc(view.storeName)}" class="h-10 w-auto object-contain" />`;
  return `<span style="${SERIF};color:var(--brand,${DEFAULT_BRAND})" class="text-xl font-bold">${esc(view.storeName)}</span>`;
}

function headerHtml(view: StoreRenderView, _menuLabels: string[], custom?: StoreCustomization): string {
  if (custom?.header?.variant) return renderHeader(custom.header.variant, view, custom, { container: CONTAINER, brand: `var(--brand,${DEFAULT_BRAND})` });
  const linkCls = `text-[#524345] hover:text-[color:var(--brand,${DEFAULT_BRAND})] transition-colors font-medium tracking-widest text-xs uppercase`;
  const menu = `<a href="${esc(storeHomeHref(view))}" class="${linkCls}">Início</a>` +
    `<a href="${esc(storeHomeHref(view))}#produtos" class="${linkCls}">Produtos</a>`;
  const cats = categoriesOf(view);
  const mnav = mobileMenuParts(view, CONTAINER);
  const categoriesMenu = cats.length
    ? `<div class="relative group" data-categories-menu>
        <button type="button" class="flex items-center gap-0.5 text-[#524345] hover:text-[color:var(--brand,${DEFAULT_BRAND})] transition-colors font-medium tracking-widest text-xs uppercase">Categorias <span class="material-symbols-outlined text-[18px]">expand_more</span></button>
        <div class="absolute left-0 top-full pt-3 hidden group-hover:block z-50">
          <div class="bg-white rounded-xl py-2 min-w-[180px]" style="box-shadow:0 10px 40px rgba(28,27,27,.1)">
            ${cats.map((c) => `<a href="${esc(categoryHref(view, c))}" class="block px-4 py-2 text-sm text-[#524345] hover:bg-[#f6f3f2] transition-colors">${esc(c)}</a>`).join("")}
          </div>
        </div>
      </div>`
    : "";
  return `
    <nav class="sticky top-0 w-full z-50" style="background:rgba(252,249,248,.72);backdrop-filter:blur(20px)">
      ${mnav.head}
      <div class="${CONTAINER} flex justify-between items-center gap-3 py-4">
        <div class="flex items-center gap-1 min-w-0">
          ${mnav.button}
          <a href="${esc(storeHomeHref(view))}" data-edit-logo class="shrink-0">${brandHtml(view)}</a>
        </div>
        <div class="hidden lg:flex items-center gap-8">${menu}${categoriesMenu}</div>
        <div class="flex items-center gap-4 text-[#1c1b1b] shrink-0">
          <button type="button" data-search-btn class="hover:opacity-70 transition-opacity p-1"><span class="material-symbols-outlined">search</span></button>
          <a href="${esc(cartHref(view))}" data-cart-link class="relative inline-flex hover:opacity-70 transition-opacity p-1">
            <span class="material-symbols-outlined">shopping_bag</span>
            <span data-cart-count class="hidden absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center text-white" style="background:var(--brand,${DEFAULT_BRAND})"></span>
          </a>
        </div>
      </div>
      ${mnav.panel}
    </nav>`;
}

function footerHtml(view: StoreRenderView, custom: StoreCustomization | undefined, menuLabels: string[]): string {
  if (custom?.footer?.variant) return renderFooter(custom.footer.variant, view, custom, { container: CONTAINER, brand: `var(--brand,${DEFAULT_BRAND})` });
  const about = custom?.footer?.about || "Transformando a perfumaria em Angola com fragrâncias que elevam a autoestima e celebram a beleza.";
  const location = custom?.footer?.location || "Luanda, Angola";
  const phone = custom?.footer?.phone || DEFAULT_PHONE;
  const email = custom?.footer?.email || "geral@minhaloja.ao";
  return `
    <footer class="bg-[#f6f3f2] w-full pt-16 pb-8 mt-auto">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-10 ${CONTAINER}">
        <div class="space-y-5">
          <div data-edit-footer-logo class="relative inline-block">${footerBrandHtml(view, custom)}</div>
          <p data-edit="footer.about" class="text-[#685b5f] text-sm leading-relaxed max-w-xs">${esc(about)}</p>
        </div>
        <div class="flex flex-col gap-3">
          <h4 style="${SERIF};color:var(--brand,${DEFAULT_BRAND})" class="font-bold mb-2 uppercase tracking-widest text-xs">Loja</h4>
          ${menuLabels.map((l) => `<a href="${esc(storeHomeHref(view))}" class="text-[#685b5f] hover:text-[color:var(--brand,${DEFAULT_BRAND})] transition-colors text-sm">${esc(l)}</a>`).join("")}
        </div>
        <div class="flex flex-col gap-3">
          <h4 style="${SERIF};color:var(--brand,${DEFAULT_BRAND})" class="font-bold mb-2 uppercase tracking-widest text-xs">Contacto</h4>
          <span class="text-[#685b5f] text-sm flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">location_on</span> <span data-edit="footer.location">${esc(location)}</span></span>
          <span class="text-[#685b5f] text-sm flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">call</span> <span data-edit="footer.phone">${esc(phone)}</span></span>
          <span class="text-[#685b5f] text-sm flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">mail</span> <span data-edit="footer.email">${esc(email)}</span></span>
        </div>
      </div>
      <div class="${CONTAINER} mt-16 pt-8 text-center" style="border-top:1px solid rgba(214,194,196,.4)">
        <p class="text-[#685b5f] text-[10px] tracking-widest uppercase">${esc(storeIdentifier(view) + "." + STORE_APEX)} · Loja criada com <a href="${platformHomeUrl()}" style="color:var(--brand,${DEFAULT_BRAND})">MôBisno</a></p>
      </div>
    </footer>`;
}

function productCard(view: StoreRenderView, p: StoreProductView, opts: { offset?: boolean; hidden?: boolean } = {}): string {
  const img = p.imageUrl
    ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />`
    : `<div class="absolute inset-0 flex items-center justify-center bg-[#f0eded]"><span class="material-symbols-outlined text-[#d6c2c4] text-5xl">image</span></div>`;
  const badge = p.featured
    ? `<div class="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded text-[10px] font-bold tracking-widest" style="color:var(--brand,${DEFAULT_BRAND})">DESTAQUE</div>`
    : "";
  const hide = opts.hidden ? ` data-extra style="display:none"` : "";
  return `<a href="${esc(productHref(view, p))}" data-edit-product="${esc(p.id)}" class="group block relative ${opts.offset ? "md:mt-8" : ""}"${hide}>
    <div class="${cardAspect()} bg-white overflow-hidden rounded-xl mb-5 relative">${img}${badge}</div>
    <div class="flex justify-between items-start gap-3">
      <div class="min-w-0">
        <h3 style="${SERIF}" class="text-xl text-[#1c1b1b] group-hover:text-[color:var(--brand,${DEFAULT_BRAND})] transition-colors truncate">${esc(p.name)}</h3>
        <p class="text-sm text-[#685b5f] mb-2 truncate">${p.description ? esc(p.description) : (p.category ? esc(p.category) : "&nbsp;")}</p>
        <p style="${SERIF};color:var(--brand,${DEFAULT_BRAND})" class="text-2xl">${esc(formatKz(p.price))}</p>
      </div>
      <span class="shrink-0 bg-[#f0dee3] text-[#6e6165] p-3 rounded-xl transition-colors"><span class="material-symbols-outlined">add_shopping_cart</span></span>
    </div>
  </a>`;
}

const GRID_CLS = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-16";

/** Área de secções de produtos (uma ou várias secções por categoria). */
function sectionsArea(view: StoreRenderView, custom?: StoreCustomization): string {
  const gridCls = mbGridVariant ? gridColsClass(mbGridVariant) : GRID_CLS;
  const sections = resolveSections(view, custom);
  const multi = sections.length > 1;
  const blocks = sections.map((sec, i) => {
    const items = multi ? sec.products.slice(0, PER_ROW) : sec.products;
    const cards = items.map((p, idx) => productCard(view, p, { offset: !multi && idx % 3 === 1, hidden: !multi && idx >= TWO_ROWS })).join("");
    const moreRight = multi
      ? `<a href="${esc(sec.moreHref)}" class="text-sm font-bold flex items-center gap-1 hover:opacity-80 shrink-0" style="color:var(--brand,${DEFAULT_BRAND})">Ver mais <span class="material-symbols-outlined text-[18px]">arrow_forward</span></a>`
      : "";
    const moreBottom = (!multi && sec.products.length > TWO_ROWS)
      ? `<div class="text-center mt-12"><button type="button" data-load-more data-step="${TWO_ROWS}" class="inline-flex items-center gap-1 font-bold px-10 py-4 rounded-lg transition-all hover:opacity-90" style="background:var(--brand,${DEFAULT_BRAND});color:#fff">Ver mais <span class="material-symbols-outlined text-[18px]">expand_more</span></button></div>`
      : "";
    const empty = items.length === 0 ? `<p class="text-[#685b5f] col-span-full py-8 text-center">Sem produtos nesta secção.</p>` : "";
    return `<section data-section data-edit-section="${i}" class="${i > 0 ? "mt-16" : ""}">
      <div data-edit-section-head class="flex items-end justify-between gap-3 mb-10">
        <div class="min-w-0">
          <h2 style="${SERIF}" class="text-3xl md:text-4xl text-[#1c1b1b] truncate">${esc(sec.title)}</h2>
        </div>
        ${moreRight}
      </div>
      <div data-section-grid data-edit-products class="${gridCls}">${cards}${empty}</div>
      ${moreBottom}
    </section>`;
  }).join("");
  return `<div data-edit-sections>${blocks}</div>`;
}

function render(view: StoreRenderView, custom?: StoreCustomization): string {
  const menuLabels = menuFor(view, custom);
  const title = custom?.hero?.title || "A Essência da Elegância";
  const subtitle = custom?.hero?.subtitle || DEFAULT_SUBTITLE;
  const cta = custom?.hero?.ctaLabel || DEFAULT_CTA;
  const heroImg = custom?.hero?.imageUrl || view.banners[0]?.imageUrl || HERO_FALLBACK;

  const nativeHero = `
    <!-- Hero -->
    <section data-edit-hero class="relative min-h-[60vh] md:h-[620px] flex items-center overflow-hidden bg-[#f6f3f2]">
      <img src="${esc(heroImg)}" alt="" class="absolute inset-0 w-full h-full object-cover" />
      <div class="absolute inset-0" style="background:linear-gradient(to right, rgba(252,249,248,.92), rgba(252,249,248,.35), transparent)"></div>
      <div class="relative z-10 ${CONTAINER}">
        <div class="max-w-xl py-16">
          <span class="inline-block font-medium tracking-[0.2em] uppercase text-xs mb-4" style="color:var(--brand,${DEFAULT_BRAND})">Nova Coleção</span>
          <h1 data-edit="hero.title" style="${SERIF};color:var(--brand,${DEFAULT_BRAND})" class="text-5xl md:text-7xl leading-tight mb-6 tracking-tighter">${esc(title)}</h1>
          <p data-edit="hero.subtitle" class="text-[#524345] text-lg md:text-xl mb-10 max-w-md leading-relaxed">${esc(subtitle)}</p>
          <a href="#produtos" style="background:var(--brand,${DEFAULT_BRAND});color:#fff" class="inline-flex items-center gap-2 px-10 py-4 rounded-lg font-bold tracking-wide hover:opacity-90 transition-all active:scale-95">
            <span data-edit="hero.ctaLabel">${esc(cta)}</span> <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
          </a>
        </div>
      </div>
    </section>`;

  const hero = custom?.hero?.variant
    ? renderHero(custom.hero.variant, view, custom, { container: CONTAINER, brand: `var(--brand,${DEFAULT_BRAND})` }, "split")
    : nativeHero;

  return `
  <div class="relative min-h-screen flex flex-col bg-[#fcf9f8] text-[#1c1b1b] overflow-x-hidden" style="font-family:'Manrope',sans-serif">
    ${headerHtml(view, menuLabels, custom)}

    ${hero}

    <!-- Galeria de produtos -->
    <section id="produtos" class="py-20 ${CONTAINER} flex-grow">
      ${sectionsArea(view, custom)}
    </section>

    <!-- CTA tonal -->
    <section class="py-24 bg-[#f6f3f2]">
      <div class="max-w-4xl mx-auto px-6 text-center">
        <h2 style="${SERIF};color:var(--brand,${DEFAULT_BRAND})" class="text-4xl md:text-5xl mb-6 tracking-tight">Pronta para encontrar a sua assinatura?</h2>
        <p class="text-[#524345] text-lg mb-10 max-w-2xl mx-auto leading-relaxed">Pagamentos seguros e entregas em toda Luanda. Atendimento próximo e dedicado.</p>
        <a href="#produtos" style="background:var(--brand,${DEFAULT_BRAND});color:#fff" class="inline-block px-12 py-5 rounded-lg font-bold hover:opacity-90 transition-all">Ver todos os produtos</a>
      </div>
    </section>

    ${blocksHtml(custom, { container: CONTAINER, brand: `var(--brand,${DEFAULT_BRAND})` })}

    ${footerHtml(view, custom, menuLabels)}
  </div>`;
}

function renderProduct(view: StoreRenderView, product: StoreProductView, custom?: StoreCustomization): string {
  const menuLabels = menuFor(view, custom);
  if (custom?.productPage?.variant) {
    return `
  <div class="min-h-screen flex flex-col bg-[#fcf9f8] text-[#1c1b1b]" style="font-family:'Manrope',sans-serif">
    ${headerHtml(view, menuLabels, custom)}
    ${renderProductPage(custom.productPage.variant, view, product, custom, { container: CONTAINER, brand: `var(--brand,${DEFAULT_BRAND})` })}
    ${footerHtml(view, custom, menuLabels)}
  </div>`;
  }
  const phone = resolveWaPhone(custom);
  const waMsg = buildProductMessage(custom?.whatsapp?.messageTemplate, product.name, formatKz(product.price));
  const crumbCategory = product.category
    ? `<a href="${esc(categoryHref(view, product.category))}" class="hover:text-[color:var(--brand,${DEFAULT_BRAND})] transition-colors">${esc(product.category)}</a>
       <span class="material-symbols-outlined text-[14px]">chevron_right</span>`
    : "";
  const related = view.products.filter((p) => p.id !== product.id).slice(0, 3);

  return `
  <div class="min-h-screen flex flex-col bg-[#fcf9f8] text-[#1c1b1b]" style="font-family:'Manrope',sans-serif">
    ${headerHtml(view, menuLabels, custom)}

    <main class="${CONTAINER} pt-10 pb-20 flex-grow">
      <nav class="mb-10">
        <ol class="flex items-center gap-2 text-xs tracking-widest text-[#685b5f] uppercase flex-wrap">
          <li><a href="${esc(storeHomeHref(view))}" class="hover:text-[color:var(--brand,${DEFAULT_BRAND})]">Início</a></li>
          <li><span class="material-symbols-outlined text-[14px]">chevron_right</span></li>
          ${crumbCategory ? `<li>${crumbCategory}</li>` : ""}
          <li class="text-[#1c1b1b] font-semibold">${esc(product.name)}</li>
        </ol>
      </nav>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start">
        <div class="lg:col-span-7">
          ${productGalleryHtml(product, custom, { stageClass: "aspect-[4/5] bg-[#f6f3f2] overflow-hidden rounded-xl", imgClass: "w-full h-full object-cover transition-transform duration-700 hover:scale-105", brand: `var(--brand,${DEFAULT_BRAND})` })}
        </div>

        <div class="lg:col-span-5 lg:sticky lg:top-28">
          <div class="space-y-8">
            <div>
              <h1 style="${SERIF};color:var(--brand,${DEFAULT_BRAND})" class="text-5xl md:text-6xl mb-3 leading-tight">${esc(product.name)}</h1>
              <p style="${SERIF}" class="text-2xl text-[#1c1b1b]">${esc(formatKz(product.price))}</p>
            </div>

            ${product.description
              ? `<div class="space-y-3"><h3 class="text-xs tracking-widest uppercase text-[#685b5f] font-bold">Descrição</h3><p class="text-[#524345] leading-relaxed text-lg font-light whitespace-pre-line">${esc(product.description)}</p></div>`
              : ""}

            <div class="flex items-center gap-4">
              <span class="text-xs tracking-widest uppercase text-[#685b5f] font-bold">Quantidade</span>
              <div class="flex items-center rounded-lg overflow-hidden bg-[#f0dee3]">
                <button type="button" data-qty-dec class="w-10 h-10 flex items-center justify-center text-[#6e6165] hover:bg-[#e0ccd2]"><span class="material-symbols-outlined text-[20px]">remove</span></button>
                <input data-qty type="text" inputmode="numeric" value="1" class="w-12 h-10 text-center bg-transparent outline-none text-[#1c1b1b]" />
                <button type="button" data-qty-inc class="w-10 h-10 flex items-center justify-center text-[#6e6165] hover:bg-[#e0ccd2]"><span class="material-symbols-outlined text-[20px]">add</span></button>
              </div>
            </div>

            <div class="flex flex-col gap-3">
              <button type="button" data-add-cart="${esc(product.id)}" style="background:linear-gradient(135deg, var(--brand,${DEFAULT_BRAND}) 0%, #ffa0b6 100%);color:#fff" class="w-full py-5 rounded-lg font-bold text-sm tracking-[0.2em] uppercase transition-all hover:opacity-90 active:scale-[0.98] flex items-center justify-center gap-3">
                <span class="material-symbols-outlined text-xl">shopping_cart</span> Adicionar ao carrinho
              </button>
              <a href="${esc(waLink(phone, waMsg))}" data-edit-whatsapp target="_blank" rel="noopener" class="relative w-full py-4 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors" style="background:#f0dee3;color:#6e6165">
                <span class="material-symbols-outlined text-[20px]">chat</span> Comprar via WhatsApp
              </a>
            </div>

            <div class="mt-4 p-6 bg-[#f6f3f2] rounded-xl space-y-3">
              <div class="flex items-center gap-3" style="color:var(--brand,${DEFAULT_BRAND})">
                <span class="material-symbols-outlined">payments</span>
                <h3 style="${SERIF}" class="font-bold">Pagamento & Entrega</h3>
              </div>
              <ul data-edit-perks class="text-sm text-[#524345] space-y-2">
                ${perksItemsHtml(custom, `var(--brand,${DEFAULT_BRAND})`)}
              </ul>
            </div>
          </div>
        </div>
      </div>

      ${related.length
        ? `<section class="mt-28">
            <h2 style="${SERIF}" class="text-3xl text-[#1c1b1b] mb-10">Também pode gostar</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-16">${related.map((p) => productCard(view, p)).join("")}</div>
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
    ? `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-16">${items.map((p, i) => productCard(view, p, { offset: i % 3 === 1 })).join("")}</div>`
    : `<div class="py-20 text-center text-[#685b5f]"><span class="material-symbols-outlined" style="font-size:48px;">category</span><p class="mt-2">Ainda não há produtos nesta categoria.</p></div>`;
  return `
  <div class="min-h-screen flex flex-col bg-[#fcf9f8] text-[#1c1b1b]" style="font-family:'Manrope',sans-serif">
    ${headerHtml(view, menuLabels, custom)}
    <main class="${CONTAINER} pt-10 pb-20 flex-grow">
      <nav class="mb-8 flex items-center gap-2 text-xs tracking-widest text-[#685b5f] uppercase">
        <a href="${esc(storeHomeHref(view))}" class="hover:text-[color:var(--brand,${DEFAULT_BRAND})]">Início</a>
        <span class="material-symbols-outlined text-[14px]">chevron_right</span>
        <span class="text-[#1c1b1b] font-semibold">${esc(category)}</span>
      </nav>
      <div class="mb-12">
        <h1 style="${SERIF};color:var(--brand,${DEFAULT_BRAND})" class="text-4xl md:text-5xl tracking-tight">${esc(category)}</h1>
        <p class="text-[#685b5f] mt-2">${items.length} produto(s)</p>
      </div>
      ${grid}
    </main>
    ${footerHtml(view, custom, menuLabels)}
  </div>`;
}

export const beautyTemplate: StoreTemplate = {
  id: "beauty",
  name: "Beauty",
  previewUrl: "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?q=80&w=600",
  ready: true,
  defaultBrand: DEFAULT_BRAND,
  render,
  renderProduct,
  renderCategory,
  renderCheckout,
};

function renderCheckout(view: StoreRenderView, innerHtml: string, custom?: StoreCustomization): string {
  const menuLabels = menuFor(view, custom);
  return `
  <div class="min-h-screen flex flex-col bg-[#fcf9f8] text-[#1c1b1b]" style="font-family:'Manrope',sans-serif">
    ${headerHtml(view, menuLabels, custom)}
    <main class="${CONTAINER} py-8 md:py-12 flex-grow">${innerHtml}</main>
    ${footerHtml(view, custom, menuLabels)}
  </div>`;
}
