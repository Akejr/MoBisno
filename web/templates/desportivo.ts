/**
 * Modelo "Desportivo" — adaptado do design DOT/Ekolo Sports.
 *
 * Liga-se aos dados reais (logótipo, banners, produtos) e à personalização do
 * dono (cores, textos, menus, contactos). Cores via variável CSS `--brand`.
 * Elementos editáveis levam atributos `data-edit*` usados pelo ecrã Personalizar
 * (inofensivos na loja publicada).
 */
import { esc, formatKz } from "../lib/dom.js";
import { productSlugPath } from "../lib/slug.js";
import { perksItemsHtml } from "./perks.js";
import { blocksHtml } from "./blocks.js";
import { renderHero } from "./heroes.js";
import { renderHeader } from "./headers.js";
import { renderFooter } from "./footers.js";
import { renderProductPage } from "./productPage.js";
import { cardAspectClass, gridColsClass, type ProductVariant } from "./productGrid.js";
import { platformHomeUrl } from "../lib/routing.js";
import { buildProductMessage, resolveWaPhone, waLink } from "../lib/whatsapp.js";
import { resolveSections, filterForCategoryPage, headerCategories } from "./sectionsModel.js";
import type { StoreTemplate, StoreRenderView, StoreCustomization } from "./types.js";
import type { StoreProductView } from "../../src/storefront/storeRenderer.js";

const PER_ROW = 4;
const TWO_ROWS = 8;

const BEBAS = "font-family:'Bebas Neue',sans-serif";
const CONTAINER = "w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8";
const HERO_FALLBACK = "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?q=80&w=2000";
const DEFAULT_SUBTITLE = "Produtos originais. Qualidade premium. Entrega em toda Angola.";
const DEFAULT_CTA = "COMPRAR AGORA";
const DEFAULT_PHONE = "+244 900 000 000";
/** Altura do logótipo do cabeçalho (definida em menuFor a cada render). */
let mbLogoScale: number | undefined;
/** Disposição dos produtos escolhida (definida em menuFor a cada render). */
let mbGridVariant: ProductVariant | undefined;

/** Aspeto do cartão de produto (omissão do modelo: quadrado). */
function cardAspect(): string {
  return cardAspectClass(mbGridVariant ?? "quadrado");
}

/** Identificador da loja a partir do subdomínio (`identificador.mobisno.store`). */
function storeIdentifier(view: StoreRenderView): string {
  return view.subdomain.split(".")[0] ?? view.subdomain;
}

/** URL (hash) da home da própria loja. */
function storeHomeHref(view: StoreRenderView): string {
  return `#/loja/${encodeURIComponent(storeIdentifier(view))}`;
}

/** URL da página de um produto da loja (`/produto/<categoria>/<nome>`). */
function productHref(view: StoreRenderView, p: StoreProductView): string {
  return `${storeHomeHref(view)}/produto/${productSlugPath(p)}`;
}

/** URL (hash) da página de uma categoria da loja. */
function categoryHref(view: StoreRenderView, category: string): string {
  return `${storeHomeHref(view)}/categoria/${encodeURIComponent(category)}`;
}

/** URL (hash) do carrinho da loja. */
function cartHref(view: StoreRenderView): string {
  return `${storeHomeHref(view)}/carrinho`;
}

/** Categorias distintas (não vazias) dos produtos da loja, por ordem de aparição. */
function categoriesOf(view: StoreRenderView): string[] {
  return headerCategories(view);
}

function brandHtml(view: StoreRenderView): string {
  const brand = view.header.brand;
  if (brand.kind === "logo") {
    return `<img src="${esc(brand.url)}" alt="${esc(brand.alt)}" class="w-auto object-contain" style="height:${mbLogoScale ?? 40}px" />`;
  }
  return `<span style="${BEBAS}" class="text-2xl md:text-3xl text-neutral-900 tracking-tight">${esc(view.storeName.toUpperCase())}</span>`;
}

/**
 * Marca do rodapé. Por omissão usa o mesmo logótipo do cabeçalho; o dono pode
 * definir um logótipo específico do rodapé (ex.: versão clara) em
 * `custom.footer.logoUrl`. Sem logótipo, mostra o nome da loja em texto.
 */
function footerBrandHtml(view: StoreRenderView, custom?: StoreCustomization): string {
  const footerLogo = custom?.footer?.logoUrl;
  const headerLogo = view.header.brand.kind === "logo" ? view.header.brand.url : null;
  const url = footerLogo || headerLogo;
  if (url) {
    return `<img src="${esc(url)}" alt="${esc(view.storeName)}" class="h-9 md:h-10 w-auto object-contain" />`;
  }
  return `<span style="${BEBAS}" class="text-2xl text-white tracking-tight">${esc(view.storeName.toUpperCase())}</span>`;
}

/** Cabeçalho partilhado (home e página de produto). */
function headerHtml(view: StoreRenderView, menuLabels: string[], custom?: StoreCustomization): string {
  if (custom?.header?.variant) return renderHeader(custom.header.variant, view, custom, { container: CONTAINER, brand: "var(--brand,#DC2626)" });
  const menu = menuLabels
    .map((label, i) => `<a href="${storeHomeHref(view)}" data-edit-menu-item="${i}" class="hover:text-neutral-900 cursor-pointer transition-colors">${esc(label)}</a>`)
    .join("");
  const cats = categoriesOf(view);
  const categoriesMenu = cats.length
    ? `<div class="relative group" data-categories-menu>
        <button type="button" class="flex items-center gap-0.5 hover:text-neutral-900 transition-colors">Categorias <span class="material-symbols-outlined text-[18px]">expand_more</span></button>
        <div class="absolute left-0 top-full pt-2 hidden group-hover:block z-50">
          <div class="bg-white border border-neutral-100 rounded-lg shadow-lg py-2 min-w-[180px]">
            ${cats.map((c) => `<a href="${esc(categoryHref(view, c))}" class="block px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">${esc(c)}</a>`).join("")}
          </div>
        </div>
      </div>`
    : "";
  return `
    <header class="sticky top-0 z-50 bg-white border-b border-neutral-100">
      <div class="${CONTAINER}">
        <div class="relative flex items-center justify-between h-14 md:h-16">
          <nav data-edit-menu class="hidden lg:flex items-center gap-6 text-sm font-medium text-neutral-700">${menu}${categoriesMenu}</nav>
          <span class="material-symbols-outlined text-neutral-700 lg:hidden">menu</span>
          <a href="${esc(storeHomeHref(view))}" data-edit-logo class="absolute left-1/2 -translate-x-1/2">${brandHtml(view)}</a>
          <div class="flex items-center gap-3 text-neutral-700">
            <button type="button" data-search-btn class="hover:opacity-70 transition-opacity"><span class="material-symbols-outlined">search</span></button>
            <a href="${esc(cartHref(view))}" data-cart-link class="relative inline-flex">
              <span class="material-symbols-outlined">shopping_cart</span>
              <span data-cart-count class="hidden absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center text-white" style="background:var(--brand,#DC2626)"></span>
            </a>
          </div>
        </div>
      </div>
    </header>`;
}

/** Rodapé partilhado (home e página de produto). */
function footerHtml(view: StoreRenderView, custom: StoreCustomization | undefined, menuLabels: string[]): string {
  if (custom?.footer?.variant) return renderFooter(custom.footer.variant, view, custom, { container: CONTAINER, brand: "var(--brand,#DC2626)" });
  const about = custom?.footer?.about || "A sua loja desportiva em Angola. Produtos originais e de qualidade premium.";
  const location = custom?.footer?.location || "Luanda, Angola";
  const phone = custom?.footer?.phone || DEFAULT_PHONE;
  const email = custom?.footer?.email || "geral@minhaloja.ao";
  return `
    <footer class="mb-dark bg-neutral-900 text-neutral-400 mt-auto">
      <div class="${CONTAINER} py-12 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div class="space-y-3">
          <div data-edit-footer-logo class="relative inline-block">${footerBrandHtml(view, custom)}</div>
          <p data-edit="footer.about" class="text-sm max-w-xs leading-relaxed">${esc(about)}</p>
        </div>
        <div>
          <h3 class="text-sm font-medium text-white mb-4">Loja</h3>
          <ul class="space-y-2.5 text-sm">${menuLabels.map((l) => `<li><a href="${esc(storeHomeHref(view))}" class="hover:text-white transition-colors cursor-pointer">${esc(l)}</a></li>`).join("")}</ul>
        </div>
        <div>
          <h3 class="text-sm font-medium text-white mb-4">Contacto</h3>
          <ul class="space-y-2.5 text-sm">
            <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">location_on</span> <span data-edit="footer.location">${esc(location)}</span></li>
            <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">call</span> <span data-edit="footer.phone">${esc(phone)}</span></li>
            <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">mail</span> <span data-edit="footer.email">${esc(email)}</span></li>
          </ul>
        </div>
      </div>
      <div class="border-t border-neutral-800">
        <div class="${CONTAINER} py-5 text-xs text-neutral-500 text-center">
          ${esc(view.subdomain)} · Loja criada com <a href="${platformHomeUrl()}" class="text-white">MôBisno</a>
        </div>
      </div>
    </footer>`;
}

function productCard(view: StoreRenderView, p: StoreProductView, opts: { hidden?: boolean } = {}): string {
  const img = p.imageUrl
    ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />`
    : `<div class="absolute inset-0 flex items-center justify-center bg-neutral-100"><span class="material-symbols-outlined text-neutral-400 text-4xl">image</span></div>`;
  const badge = p.featured
    ? `<span class="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider text-white px-2 py-0.5 rounded" style="background:var(--brand,#DC2626)">Destaque</span>`
    : "";
  const hide = opts.hidden ? ` data-extra style="display:none"` : "";
  return `<a href="${esc(productHref(view, p))}" class="group relative block" data-edit-product="${esc(p.id)}"${hide}>
    <div class="relative ${cardAspect()} bg-neutral-50 overflow-hidden mb-3 rounded-sm">${img}${badge}</div>
    <h3 class="text-sm font-medium text-neutral-900 line-clamp-2">${esc(p.name)}</h3>
    ${p.description ? `<p class="text-xs text-neutral-500 line-clamp-1">${esc(p.description)}</p>` : ""}
    <p class="pt-1 text-sm font-bold text-neutral-900">${esc(formatKz(p.price))}</p>
  </a>`;
}

const GRID_CLS = "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8";

/** Área de secções de produtos (uma ou várias secções por categoria). */
function sectionsArea(view: StoreRenderView, custom?: StoreCustomization): string {
  const gridCls = mbGridVariant ? gridColsClass(mbGridVariant) : GRID_CLS;
  const sections = resolveSections(view, custom);
  const multi = sections.length > 1;
  const blocks = sections.map((sec, i) => {
    const items = multi ? sec.products.slice(0, PER_ROW) : sec.products;
    const cards = items.map((p, idx) => productCard(view, p, { hidden: !multi && idx >= TWO_ROWS })).join("");
    const moreRight = multi
      ? `<a href="${esc(sec.moreHref)}" class="text-sm font-bold flex items-center gap-1 hover:opacity-80" style="color:var(--brand,#DC2626)">Ver mais <span class="material-symbols-outlined text-[18px]">arrow_forward</span></a>`
      : "";
    const moreBottom = (!multi && sec.products.length > TWO_ROWS)
      ? `<div class="text-center mt-10"><button type="button" data-load-more data-step="${TWO_ROWS}" class="inline-flex items-center gap-1 border-2 border-neutral-900 text-neutral-900 font-bold px-8 py-3 rounded-lg hover:bg-neutral-900 hover:text-white transition-colors">Ver mais <span class="material-symbols-outlined text-[18px]">expand_more</span></button></div>`
      : "";
    const empty = items.length === 0 ? `<p class="text-neutral-400 col-span-full py-8 text-center">Sem produtos nesta secção.</p>` : "";
    return `<section data-section data-edit-section="${i}" class="${i > 0 ? "mt-14" : ""}">
      <div data-edit-section-head class="flex items-center justify-between gap-3 mb-6">
        <div class="flex items-center gap-3 min-w-0">
          <span style="background:var(--brand,#DC2626)" class="inline-block w-8 h-1.5 rounded-full shrink-0"></span>
          <h2 style="${BEBAS}" class="text-3xl md:text-4xl text-neutral-900 tracking-tight truncate">${esc(sec.title.toUpperCase())}</h2>
        </div>
        ${moreRight}
      </div>
      <div data-section-grid data-edit-products class="${gridCls}">${cards}${empty}</div>
      ${moreBottom}
    </section>`;
  }).join("");
  return `<div data-edit-sections>${blocks}</div>`;
}

function menuFor(view: StoreRenderView, custom?: StoreCustomization): string[] {
  mbLogoScale = custom?.logoScale;
  mbGridVariant = custom?.productGrid?.variant;
  return custom?.menu && custom.menu.length ? custom.menu : view.menu.items.map((i) => i.label);
}

/** Página inicial da loja. */
function render(view: StoreRenderView, custom?: StoreCustomization): string {
  const menuLabels = menuFor(view, custom);

  const title = custom?.hero?.title || view.storeName.toUpperCase();
  const subtitle = custom?.hero?.subtitle || DEFAULT_SUBTITLE;
  const cta = custom?.hero?.ctaLabel || DEFAULT_CTA;
  const heroImg = custom?.hero?.imageUrl || view.banners[0]?.imageUrl || HERO_FALLBACK;
  const extraBanners = custom?.hero?.imageUrl ? view.banners : view.banners.slice(1);

  const nativeHero = `
    <!-- Hero -->
    <section data-edit-hero class="mb-dark text-white relative h-[420px] md:h-[520px] overflow-hidden bg-neutral-900">
      <img src="${esc(heroImg)}" alt="" class="absolute inset-0 w-full h-full object-cover" />
      <div class="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent"></div>
      <div class="relative h-full ${CONTAINER} flex items-center">
        <div class="max-w-xl">
          <h1 data-edit="hero.title" style="${BEBAS}" class="text-5xl md:text-7xl text-white leading-[0.95] tracking-tight mb-4">${esc(title)}</h1>
          <p data-edit="hero.subtitle" class="text-base md:text-lg text-white/80 mb-8 max-w-md">${esc(subtitle)}</p>
          <a href="#produtos" style="background:var(--brand,#DC2626);color:#fff" class="inline-flex items-center gap-2 hover:opacity-90 font-medium px-8 py-3 rounded-lg transition-opacity">
            <span data-edit="hero.ctaLabel">${esc(cta)}</span> <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
          </a>
        </div>
      </div>
    </section>`;

  const hero = custom?.hero?.variant
    ? renderHero(custom.hero.variant, view, custom, { container: CONTAINER, brand: "var(--brand,#DC2626)" }, "imagem")
    : nativeHero;

  return `
  <div class="relative min-h-screen flex flex-col bg-white text-neutral-900 overflow-x-hidden">
    ${headerHtml(view, menuLabels, custom)}

    ${hero}

    ${extraBanners.length
      ? `<section class="${CONTAINER} mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          ${extraBanners.map((b) => `<img src="${esc(b.imageUrl)}" alt="banner" class="w-full h-40 md:h-52 object-cover rounded-lg" />`).join("")}
        </section>`
      : ""}

    <!-- Produtos -->
    <main id="produtos" class="${CONTAINER} py-12 md:py-16 flex-grow">
      ${sectionsArea(view, custom)}
    </main>
    ${blocksHtml(custom, { container: CONTAINER, brand: "var(--brand,#DC2626)" })}

    ${footerHtml(view, custom, menuLabels)}
  </div>`;
}

/** Página individual de produto (detalhe + compra). */
function renderProduct(view: StoreRenderView, product: StoreProductView, custom?: StoreCustomization): string {
  const menuLabels = menuFor(view, custom);
  if (custom?.productPage?.variant) {
    return `
  <div class="min-h-screen flex flex-col bg-white text-neutral-900">
    ${headerHtml(view, menuLabels, custom)}
    ${renderProductPage(custom.productPage.variant, view, product, custom, { container: CONTAINER, brand: "var(--brand,#DC2626)" })}
    ${footerHtml(view, custom, menuLabels)}
  </div>`;
  }
  const phone = resolveWaPhone(custom);
  const img = product.imageUrl
    ? `<img src="${esc(product.imageUrl)}" alt="${esc(product.name)}" class="w-full h-full object-cover" />`
    : `<div class="absolute inset-0 flex items-center justify-center bg-neutral-100"><span class="material-symbols-outlined text-neutral-300 text-6xl">image</span></div>`;

  const waMsg = buildProductMessage(custom?.whatsapp?.messageTemplate, product.name, formatKz(product.price));
  const related = view.products.filter((p) => p.id !== product.id).slice(0, 4);

  // Migalhas: Início › [Categoria ›] Produto.
  const crumbCategory = product.category
    ? `<a href="${esc(categoryHref(view, product.category))}" class="hover:text-neutral-900">${esc(product.category)}</a>
       <span class="material-symbols-outlined text-[16px]">chevron_right</span>`
    : "";

  return `
  <div class="min-h-screen flex flex-col bg-white text-neutral-900">
    ${headerHtml(view, menuLabels, custom)}

    <main class="${CONTAINER} py-6 md:py-10 flex-grow">
      <!-- Migalhas -->
      <nav class="text-sm text-neutral-500 mb-6 flex items-center gap-1.5 flex-wrap">
        <a href="${esc(storeHomeHref(view))}" class="hover:text-neutral-900">Início</a>
        <span class="material-symbols-outlined text-[16px]">chevron_right</span>
        ${crumbCategory}
        <span class="text-neutral-900 font-medium truncate">${esc(product.name)}</span>
      </nav>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        <!-- Imagem -->
        <div class="group relative aspect-square bg-neutral-50 rounded-xl overflow-hidden" data-edit-product="${esc(product.id)}">${img}</div>

        <!-- Detalhe -->
        <div class="flex flex-col">
          <h1 style="${BEBAS}" class="text-4xl md:text-5xl tracking-tight leading-tight">${esc(product.name)}</h1>
          <p class="mt-3 text-3xl font-bold" style="color:var(--brand,#DC2626)">${esc(formatKz(product.price))}</p>

          ${product.description
            ? `<p class="mt-6 text-neutral-600 leading-relaxed whitespace-pre-line">${esc(product.description)}</p>`
            : `<p class="mt-6 text-neutral-400 italic">Sem descrição.</p>`}

          <!-- Quantidade -->
          <div class="mt-8 flex items-center gap-4">
            <span class="text-sm font-medium text-neutral-700">Quantidade</span>
            <div class="flex items-center border border-neutral-300 rounded-lg overflow-hidden">
              <button type="button" data-qty-dec class="w-10 h-10 flex items-center justify-center hover:bg-neutral-100 text-neutral-700"><span class="material-symbols-outlined text-[20px]">remove</span></button>
              <input data-qty type="text" inputmode="numeric" value="1" class="w-12 h-10 text-center outline-none border-x border-neutral-300" />
              <button type="button" data-qty-inc class="w-10 h-10 flex items-center justify-center hover:bg-neutral-100 text-neutral-700"><span class="material-symbols-outlined text-[20px]">add</span></button>
            </div>
          </div>

          <!-- Ações -->
          <div class="mt-8 flex flex-col sm:flex-row gap-3">
            <button type="button" data-add-cart="${esc(product.id)}" style="background:var(--brand,#DC2626);color:#fff" class="flex-1 inline-flex items-center justify-center gap-2 font-bold px-6 py-3.5 rounded-lg hover:opacity-90 transition-opacity">
              <span class="material-symbols-outlined text-[20px]">shopping_cart</span> Adicionar ao carrinho
            </button>
            <a href="${esc(waLink(phone, waMsg))}" data-edit-whatsapp target="_blank" rel="noopener" class="relative flex-1 inline-flex items-center justify-center gap-2 font-bold px-6 py-3.5 rounded-lg border border-neutral-300 text-neutral-900 hover:bg-neutral-50 transition-colors">
              <span class="material-symbols-outlined text-[20px]">chat</span> Comprar via WhatsApp
            </a>
          </div>

          <!-- Garantias -->
          <ul data-edit-perks class="mt-8 space-y-2 text-sm text-neutral-600 border-t border-neutral-100 pt-6">
            ${perksItemsHtml(custom, "var(--brand,#DC2626)")}
          </ul>
        </div>
      </div>

      ${related.length
        ? `<section class="mt-16">
            <div class="flex items-center gap-3 mb-6">
              <span style="background:var(--brand,#DC2626)" class="inline-block w-8 h-1.5 rounded-full"></span>
              <h2 style="${BEBAS}" class="text-2xl md:text-3xl tracking-tight">TAMBÉM PODE GOSTAR</h2>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8">${related.map((p) => productCard(view, p)).join("")}</div>
          </section>`
        : ""}
    </main>

    ${footerHtml(view, custom, menuLabels)}
  </div>`;
}

/** Página de uma categoria (mesma UI, só produtos dessa categoria). */
function renderCategory(view: StoreRenderView, category: string, custom?: StoreCustomization): string {
  const menuLabels = menuFor(view, custom);
  const items = filterForCategoryPage(view, category);
  const grid = items.length
    ? `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">${items.map((p) => productCard(view, p)).join("")}</div>`
    : `<div class="py-16 text-center text-neutral-500">
        <span class="material-symbols-outlined" style="font-size:48px;">category</span>
        <p class="mt-2">Ainda não há produtos nesta categoria.</p>
       </div>`;
  return `
  <div class="min-h-screen flex flex-col bg-white text-neutral-900">
    ${headerHtml(view, menuLabels, custom)}
    <main class="${CONTAINER} py-8 md:py-12 flex-grow">
      <nav class="text-sm text-neutral-500 mb-6 flex items-center gap-1.5">
        <a href="${esc(storeHomeHref(view))}" class="hover:text-neutral-900">Início</a>
        <span class="material-symbols-outlined text-[16px]">chevron_right</span>
        <span class="text-neutral-900 font-medium">${esc(category)}</span>
      </nav>
      <div class="flex items-center gap-3 mb-8">
        <span style="background:var(--brand,#DC2626)" class="inline-block w-8 h-1.5 rounded-full"></span>
        <h1 style="${BEBAS}" class="text-3xl md:text-4xl tracking-tight uppercase">${esc(category)}</h1>
        <span class="text-sm text-neutral-400">${items.length} produto(s)</span>
      </div>
      ${grid}
    </main>
    ${footerHtml(view, custom, menuLabels)}
  </div>`;
}

export const desportivoTemplate: StoreTemplate = {
  id: "desportivo",
  name: "Desportivo",
  previewUrl: "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?q=80&w=600",
  ready: true,
  defaultBrand: "#DC2626",
  render,
  renderProduct,
  renderCategory,
};
