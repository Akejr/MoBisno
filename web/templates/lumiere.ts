/**
 * Modelo "Lumière Chic" — luxo minimalista (beleza/cosmética). Tipografia
 * editorial (Playfair Display + Montserrat), superfícies creme, acentos dourado
 * e champanhe, nav em vidro e hero assimétrico. Liga-se aos dados reais e mantém
 * todos os hooks de edição/carrinho (`data-edit-*`, `data-cart-link`,
 * `data-search-btn`, `data-add-cart`, etc.), tal como os outros modelos.
 */
import { esc, formatKz } from "../lib/dom.js";
import { productSlugPath } from "../lib/slug.js";
import { perksItemsHtml } from "./perks.js";
import { blocksHtml } from "./blocks.js";
import { renderProductPage } from "./productPage.js";
import { cardAspectClass, gridColsClass, type ProductVariant } from "./productGrid.js";
import { platformHomeUrl, STORE_APEX } from "../lib/routing.js";
import { buildProductMessage, resolveWaPhone, waLink } from "../lib/whatsapp.js";
import { resolveSections, filterForCategoryPage, headerCategories, allProductsHref } from "./sectionsModel.js";
import { mobileMenuParts } from "./headers.js";
import { productGalleryHtml } from "./gallery.js";
import type { StoreTemplate, StoreRenderView, StoreCustomization } from "./types.js";
import type { StoreProductView } from "../../src/storefront/storeRenderer.js";

const CONTAINER = "w-full max-w-[1280px] mx-auto px-5 md:px-16";
const DEFAULT_PHONE = "+244 900 000 000";
const HERO_FALLBACK = "https://images.unsplash.com/photo-1596462502278-27bfdc403348?q=80&w=1600";

/** Estilo próprio do modelo (fontes + utilitários), injetado uma vez por render. */
const STYLE = `<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Montserrat:wght@300;400;500;600&display=swap');
  .lx-root{font-family:'Montserrat',sans-serif;color:#1c1b1b;background:#fcf9f8}
  .lx-root :is(h1,h2,h3),.lx-root .lx-serif{font-family:'Playfair Display',serif !important;font-weight:400}
  .lx-root .lx-body{font-family:'Montserrat',sans-serif}
  .lx-track{letter-spacing:.16em}
  .lx-glass{background:rgba(252,249,248,.82);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
  .lx-root .material-symbols-outlined{font-family:'Material Symbols Outlined' !important}
  .lx-noscroll{scrollbar-width:none;-ms-overflow-style:none}
  .lx-noscroll::-webkit-scrollbar{display:none}
</style>`;

let mbGridVariant: ProductVariant | undefined;
let mbLogoScale: number | undefined;

/* ------------------------------- Helpers ------------------------------- */

function storeIdentifier(view: StoreRenderView): string {
  return view.subdomain.split(".")[0] ?? view.subdomain;
}
function homeHref(view: StoreRenderView): string {
  return `#/loja/${encodeURIComponent(storeIdentifier(view))}`;
}
function productHref(view: StoreRenderView, p: StoreProductView): string {
  return `${homeHref(view)}/produto/${productSlugPath(p)}`;
}
function categoryHref(view: StoreRenderView, c: string): string {
  return `${homeHref(view)}/categoria/${encodeURIComponent(c)}`;
}
function cartHref(view: StoreRenderView): string {
  return `${homeHref(view)}/carrinho`;
}

function menuFor(view: StoreRenderView, custom?: StoreCustomization): string[] {
  mbLogoScale = custom?.logoScale;
  mbGridVariant = custom?.productGrid?.variant;
  return custom?.menu && custom.menu.length ? custom.menu : view.menu.items.map((i) => i.label);
}

function brandHtml(view: StoreRenderView): string {
  const b = view.header.brand;
  if (b.kind === "logo") {
    return `<img src="${esc(b.url)}" alt="${esc(b.alt)}" class="w-auto object-contain" style="height:${mbLogoScale ?? 34}px" />`;
  }
  return `<span class="lx-serif text-xl md:text-2xl" style="color:#1c1b1b;text-transform:uppercase;letter-spacing:.22em">${esc(view.storeName)}</span>`;
}

/* ------------------------------- Cabeçalho ------------------------------- */

function headerHtml(view: StoreRenderView): string {
  const cats = headerCategories(view);
  const mnav = mobileMenuParts(view, CONTAINER);
  const linkCls = "lx-body lx-track uppercase text-[12px] font-semibold hover:opacity-60 transition-opacity";
  const links =
    `<a href="${esc(homeHref(view))}" class="${linkCls}" style="color:#464742">Início</a>` +
    `<a href="${esc(allProductsHref(view))}" class="${linkCls}" style="color:#464742">Produtos</a>`;
  const catsMenu = cats.length
    ? `<div class="relative group" data-categories-menu>
        <button type="button" class="lx-body lx-track uppercase text-[12px] font-semibold flex items-center gap-0.5 hover:opacity-60 transition-opacity" style="color:#464742">Categorias <span class="material-symbols-outlined text-[16px]">expand_more</span></button>
        <div class="absolute left-0 top-full pt-3 hidden group-hover:block z-50">
          <div class="bg-white border border-black/5 rounded-sm shadow-xl py-2 min-w-[190px]">
            ${cats.map((c) => `<a href="${esc(categoryHref(view, c))}" class="block px-4 py-2 text-sm hover:bg-black/[.03] transition-colors lx-body" style="color:#1c1b1b">${esc(c)}</a>`).join("")}
          </div>
        </div>
      </div>`
    : "";
  const icons = `<div class="flex items-center gap-1 shrink-0">
      <button type="button" data-search-btn class="p-2 rounded-full hover:bg-black/5 transition-colors" style="color:#1c1b1b"><span class="material-symbols-outlined">search</span></button>
      <a href="${esc(cartHref(view))}" data-cart-link class="relative inline-flex p-2 rounded-full hover:bg-black/5 transition-colors" style="color:#1c1b1b">
        <span class="material-symbols-outlined">shopping_bag</span>
        <span data-cart-count class="hidden absolute top-0 right-0 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center text-white" style="background:var(--brand,#1c1b1b)"></span>
      </a>
    </div>`;
  return `
    <header class="sticky top-0 z-50 lx-glass border-b border-black/5">
      ${mnav.head}
      <div class="${CONTAINER}">
        <div class="flex items-center justify-between h-[76px] gap-4">
          <div class="flex items-center gap-1 min-w-0">
            ${mnav.button}
            <a href="${esc(homeHref(view))}" data-edit-logo class="flex items-center min-w-0">${brandHtml(view)}</a>
          </div>
          <nav class="hidden lg:flex items-center gap-8">${links}${catsMenu}</nav>
          ${icons}
        </div>
      </div>
      ${mnav.panel}
    </header>`;
}

/* --------------------------------- Hero --------------------------------- */

function heroHtml(view: StoreRenderView, custom?: StoreCustomization): string {
  const title = custom?.hero?.title || "A essência do luxo silencioso.";
  const subtitle = custom?.hero?.subtitle || "Descubra a nossa coleção botânica, formulada com extratos raros para revelar o seu brilho natural.";
  const cta = custom?.hero?.ctaLabel || "Explorar coleção";
  const img = custom?.hero?.imageUrl || view.banners[0]?.imageUrl || HERO_FALLBACK;
  const ctaTarget = custom?.hero?.ctaTarget?.trim();
  const ctaHref = ctaTarget ? categoryHref(view, ctaTarget) : "#produtos";
  return `
  <section class="${CONTAINER} pt-12 md:pt-16 pb-16 md:pb-24">
    <div class="flex flex-col md:flex-row items-stretch gap-10 md:gap-12">
      <div class="flex-1 flex flex-col justify-center md:pr-8">
        <h1 data-edit="hero.title" class="lx-serif text-4xl md:text-6xl leading-[1.08] mb-6" style="color:#1c1b1b">${esc(title)}</h1>
        <p data-edit="hero.subtitle" class="lx-body text-lg font-light leading-relaxed mb-10 max-w-md" style="color:#464742">${esc(subtitle)}</p>
        <div class="flex items-center gap-6 flex-wrap">
          <a href="${esc(ctaHref)}" data-hero-cta class="lx-body lx-track uppercase text-[12px] font-semibold px-8 py-4 hover:opacity-90 transition-opacity" style="background:var(--brand,#1c1b1b);color:var(--brand-ink,#fff)"><span data-edit="hero.ctaLabel">${esc(cta)}</span></a>
          <a href="${esc(ctaHref)}" class="lx-body lx-track uppercase text-[12px] font-semibold underline underline-offset-8 decoration-1 hover:opacity-60 transition-opacity" style="color:#1c1b1b">Ver mais</a>
        </div>
      </div>
      <div class="flex-1 relative">
        <div data-edit-hero class="w-full h-[52vh] md:h-[78vh] overflow-hidden" style="background:#f6f3f2;box-shadow:0 30px 60px -15px rgba(28,27,27,.08);border-radius:2px">
          <img src="${esc(img)}" alt="" class="w-full h-full object-cover hover:scale-105 transition-transform duration-[1800ms] ease-out" />
        </div>
        <div class="absolute -bottom-6 -left-4 md:-left-10 bg-[#fcf9f8] p-6 md:p-8 hidden md:block w-60" style="box-shadow:0 20px 40px -10px rgba(28,27,27,.06)">
          <p class="lx-body lx-track uppercase text-[11px] mb-1" style="color:#464742">Em destaque</p>
          <p class="lx-serif text-2xl" style="color:#1c1b1b">${esc(view.storeName)}</p>
        </div>
      </div>
    </div>
  </section>`;
}

/* ------------------------------- Produtos ------------------------------- */

function cardAspect(): string {
  return cardAspectClass(mbGridVariant ?? "retrato");
}

function productCard(view: StoreRenderView, p: StoreProductView, opts: { hidden?: boolean } = {}): string {
  const img = p.imageUrl
    ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-in-out" />`
    : `<div class="absolute inset-0 flex items-center justify-center" style="background:#f9f7f2"><span class="material-symbols-outlined text-4xl" style="color:#c7c7bf">image</span></div>`;
  const badge = p.featured
    ? `<div class="absolute top-4 left-4 z-10 px-3 py-1 lx-body lx-track uppercase text-[11px]" style="background:#E5D3C0;color:#1c1b1b">Destaque</div>`
    : "";
  const hide = opts.hidden ? ` data-extra style="display:none"` : "";
  return `<a href="${esc(productHref(view, p))}" class="group block" data-edit-product="${esc(p.id)}"${hide}>
    <div class="relative ${cardAspect()} overflow-hidden mb-5" style="background:#f9f7f2;border-radius:2px">${img}${badge}</div>
    <div class="text-center">
      <h3 class="lx-serif text-xl mb-1" style="color:#1c1b1b">${esc(p.name)}</h3>
      ${p.category ? `<p class="lx-body lx-track uppercase text-[11px] mb-2" style="color:#464742">${esc(p.category)}</p>` : ""}
      <p class="lx-body text-sm" style="color:var(--brand,#1c1b1b)">${esc(formatKz(p.price))}</p>
    </div>
  </a>`;
}

const PER_ROW = 4;
const TWO_ROWS = 8;

function sectionsArea(view: StoreRenderView, custom?: StoreCustomization): string {
  const gridCls = mbGridVariant ? gridColsClass(mbGridVariant) : "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 md:gap-8";
  const sections = resolveSections(view, custom);
  const multi = sections.length > 1;
  const blocks = sections.map((sec, i) => {
    const items = multi ? sec.products.slice(0, PER_ROW) : sec.products;
    const cards = items.map((p, idx) => productCard(view, p, { hidden: !multi && idx >= TWO_ROWS })).join("");
    const moreRight = multi
      ? `<a href="${esc(sec.moreHref)}" class="lx-body lx-track uppercase text-[12px] font-semibold hover:opacity-60 transition-opacity" style="color:#1c1b1b">Ver tudo</a>`
      : "";
    const moreBottom = (!multi && sec.products.length > TWO_ROWS)
      ? `<div class="text-center mt-12"><button type="button" data-load-more data-step="${TWO_ROWS}" class="lx-body lx-track uppercase text-[12px] font-semibold border px-8 py-3 hover:bg-black/[.03] transition-colors" style="border-color:rgba(28,27,27,.3);color:#1c1b1b">Ver mais</button></div>`
      : "";
    const empty = items.length === 0 ? `<p class="col-span-full py-8 text-center lx-body" style="color:#777871">Sem produtos nesta secção.</p>` : "";
    return `<section data-section data-edit-section="${i}" class="${i > 0 ? "mt-20" : ""}">
      <div data-edit-section-head class="flex items-end justify-between gap-3 mb-10">
        <h2 class="lx-serif text-3xl md:text-4xl" style="color:#1c1b1b">${esc(sec.title)}</h2>
        ${moreRight}
      </div>
      <div data-section-grid data-edit-products class="${gridCls}">${cards}${empty}</div>
      ${moreBottom}
    </section>`;
  }).join("");
  return `<div data-edit-sections>${blocks}</div>`;
}

/* -------------------------------- Rodapé -------------------------------- */

function footerBrandHtml(view: StoreRenderView, custom?: StoreCustomization): string {
  const footerLogo = custom?.footer?.logoUrl;
  const headerLogo = view.header.brand.kind === "logo" ? view.header.brand.url : null;
  const url = footerLogo || headerLogo;
  if (url) return `<img src="${esc(url)}" alt="${esc(view.storeName)}" class="h-9 w-auto object-contain" />`;
  return `<span class="lx-serif text-2xl" style="color:#1c1b1b;text-transform:uppercase;letter-spacing:.22em">${esc(view.storeName)}</span>`;
}

function footerHtml(view: StoreRenderView, custom: StoreCustomization | undefined, labels: string[]): string {
  const about = custom?.footer?.about || "Elevamos o ritual da beleza através do luxo minimalista e de botânicos potentes.";
  const location = custom?.footer?.location || "Luanda, Angola";
  const phone = custom?.footer?.phone || DEFAULT_PHONE;
  const email = custom?.footer?.email || "geral@minhaloja.ao";
  return `
    <footer class="mt-auto" style="background:#f6f3f2">
      <div class="${CONTAINER} py-16 md:py-24 grid grid-cols-1 md:grid-cols-4 gap-10">
        <div class="md:col-span-1">
          <div data-edit-footer-logo class="relative inline-block mb-5">${footerBrandHtml(view, custom)}</div>
          <p data-edit="footer.about" class="lx-body font-light leading-relaxed max-w-xs" style="color:#464742">${esc(about)}</p>
        </div>
        <div>
          <h3 class="lx-body lx-track uppercase text-[12px] font-semibold mb-5" style="color:#1c1b1b">Explorar</h3>
          <ul class="space-y-3">${labels.map((l) => `<li><a href="${esc(homeHref(view))}" class="lx-body hover:opacity-60 transition-opacity" style="color:#464742">${esc(l)}</a></li>`).join("")}</ul>
        </div>
        <div>
          <h3 class="lx-body lx-track uppercase text-[12px] font-semibold mb-5" style="color:#1c1b1b">Contacto</h3>
          <ul class="space-y-3">
            <li class="lx-body" style="color:#464742"><span data-edit="footer.location">${esc(location)}</span></li>
            <li class="lx-body" style="color:#464742"><span data-edit="footer.phone">${esc(phone)}</span></li>
            <li class="lx-body" style="color:#464742"><span data-edit="footer.email">${esc(email)}</span></li>
          </ul>
        </div>
        <div>
          <h3 class="lx-body lx-track uppercase text-[12px] font-semibold mb-5" style="color:#1c1b1b">O Atelier</h3>
          <p class="lx-body font-light mb-3" style="color:#464742">Junte-se ao círculo para pré-visualizações exclusivas.</p>
        </div>
      </div>
      <div class="border-t border-black/5">
        <div class="${CONTAINER} py-6 lx-body lx-track uppercase text-[11px] text-center" style="color:#777871">
          ${esc(storeIdentifier(view) + "." + STORE_APEX)} · Loja criada com <a href="${platformHomeUrl()}" style="color:var(--brand,#1c1b1b)">MôBisno</a>
        </div>
      </div>
    </footer>`;
}

/* --------------------------- Secções editoriais --------------------------- */

/** Lê um valor de texto da customização por caminho (com fallback). */
function cx(custom: StoreCustomization | undefined, path: string, fallback: string): string {
  const parts = path.split(".");
  let o: unknown = custom;
  for (const p of parts) {
    if (o == null || typeof o !== "object") return fallback;
    o = (o as Record<string, unknown>)[p];
  }
  return typeof o === "string" && o.trim() ? o : fallback;
}

/** Testemunhos em destaque (home) — carrossel com pontos e setas funcionais. */
function testimonialSection(custom?: StoreCustomization): string {
  const list = custom?.testimonials && custom.testimonials.length
    ? custom.testimonials
    : [{ quote: "A textura é uma experiência de calma no meu ritual diário. Verdadeiramente transformadora.", author: "Amélia R.", role: "Cliente verificada" }];

  const slides = list.map((t, i) => `
    <div data-lx-slide="${i}" class="${i === 0 ? "" : "hidden"}">
      <p data-edit="testimonials.${i}.quote" class="lx-serif text-2xl md:text-3xl leading-relaxed max-w-3xl mx-auto" style="color:#1c1b1b">${esc(t.quote ?? "")}</p>
      <div class="mt-8">
        <p data-edit="testimonials.${i}.author" class="lx-body lx-track uppercase text-[12px] font-semibold mb-1" style="color:#1c1b1b">${esc(t.author ?? "")}</p>
        <p data-edit="testimonials.${i}.role" class="lx-body text-sm" style="color:#464742">${esc(t.role || "Cliente verificada")}</p>
      </div>
    </div>`).join("");

  const dots = list.map((_, i) =>
    `<button type="button" data-lx-dot="${i}" aria-label="Testemunho ${i + 1}" class="w-2 h-2 rounded-full transition-colors" style="background:${i === 0 ? "#5e5e5b" : "#c8c6c2"}"></button>`).join("");

  const arrows = list.length > 1
    ? `<button type="button" data-lx-prev aria-label="Anterior" class="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center hover:opacity-60 transition-opacity" style="color:#1c1b1b"><span class="material-symbols-outlined">chevron_left</span></button>
       <button type="button" data-lx-next aria-label="Seguinte" class="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center hover:opacity-60 transition-opacity" style="color:#1c1b1b"><span class="material-symbols-outlined">chevron_right</span></button>`
    : "";

  return `
  <section style="background:#f6f3f2" class="py-20 md:py-28" data-lx-testi>
    <div class="${CONTAINER} text-center relative">
      <span class="material-symbols-outlined text-4xl mb-6" style="color:#c8c6c2">format_quote</span>
      <div data-lx-testi-track>${slides}</div>
      <div class="flex justify-center gap-3 mt-12" data-lx-dots>${dots}</div>
      ${arrows}
    </div>
  </section>`;
}

/** URL de mapa (com pin) para uma loja: por coordenadas ou por morada. */
function boutiqueMapSrc(b: { address?: string; lat?: number; lng?: number }): string {
  if (typeof b.lat === "number" && typeof b.lng === "number") {
    const d = 0.008;
    const bbox = `${b.lng - d},${b.lat - d},${b.lng + d},${b.lat + d}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${b.lat},${b.lng}`;
  }
  const addr = (b.address ?? "").trim() || "Luanda, Angola";
  return `https://maps.google.com/maps?q=${encodeURIComponent(addr)}&z=15&output=embed`;
}

/** Secção "As nossas lojas": um mapa com pin por cada loja (ou um único mapa). */
function boutiquesSection(custom?: StoreCustomization): string {
  const title = cx(custom, "lumiere.boutiquesTitle", "As nossas lojas");
  const list = custom?.lumiere?.boutiques ?? [];

  if (list.length) {
    const gridCls = list.length === 1
      ? "grid grid-cols-1 max-w-3xl mx-auto"
      : "grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10";
    const cards = list.map((b, i) => {
      const name = (b.name ?? "").trim();
      const address = (b.address ?? "").trim() || "Luanda, Angola";
      return `<div data-boutique="${i}" class="flex flex-col">
        <div class="w-full overflow-hidden rounded-xl" style="box-shadow:0 24px 50px -20px rgba(28,27,27,.12)">
          <iframe title="Mapa ${esc(name || address)}" src="${esc(boutiqueMapSrc(b))}" class="w-full block" style="height:300px;border:0" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
        </div>
        <div class="text-center mt-4">
          <p data-edit="lumiere.boutiques.${i}.name" class="lx-serif text-xl mb-1" style="color:#1c1b1b">${esc(name)}</p>
          <address data-edit="lumiere.boutiques.${i}.address" class="not-italic lx-body text-sm" style="color:#464742">${esc(address)}</address>
        </div>
      </div>`;
    }).join("");
    return `
  <section class="${CONTAINER} py-20 md:py-28" data-lx-boutiques>
    <h2 data-edit="lumiere.boutiquesTitle" class="lx-serif text-3xl md:text-4xl text-center mb-12" style="color:#1c1b1b">${esc(title)}</h2>
    <div class="${gridCls}" data-boutiques-grid>${cards}</div>
  </section>`;
  }

  // Sem pontos definidos: mapa único a partir da morada do rodapé.
  const location = cx(custom, "footer.location", "Luanda, Angola");
  const mapSrc = `https://maps.google.com/maps?q=${encodeURIComponent(location)}&z=14&output=embed`;
  return `
  <section class="${CONTAINER} py-20 md:py-28" data-lx-boutiques>
    <h2 data-edit="lumiere.boutiquesTitle" class="lx-serif text-3xl md:text-4xl text-center mb-12" style="color:#1c1b1b">${esc(title)}</h2>
    <div class="flex flex-col items-center gap-8" data-boutiques-grid>
      <div class="w-full max-w-3xl overflow-hidden rounded-xl" style="box-shadow:0 30px 60px -15px rgba(28,27,27,.08)">
        <iframe title="Mapa das lojas" src="${esc(mapSrc)}" class="w-full block" style="height:380px;border:0" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
      </div>
      <div class="text-center">
        <p class="lx-body lx-track uppercase text-[12px] font-semibold mb-2" style="color:#1c1b1b">Visite-nos</p>
        <address data-edit="footer.location" class="not-italic lx-body text-lg" style="color:#464742">${esc(location)}</address>
      </div>
    </div>
  </section>`;
}

/** Galeria da página de produto: uma foto = uma imagem; várias = miniaturas. */
function productGallery(_view: StoreRenderView, product: StoreProductView, custom?: StoreCustomization): string {
  return productGalleryHtml(product, custom, {
    stageClass: "aspect-[4/5] overflow-hidden",
    stageStyle: "background:#f6f3f2;border-radius:2px",
    imgClass: "object-cover w-full h-full transition-transform duration-700 hover:scale-105",
    brand: "var(--brand,#1c1b1b)",
    thumbsClass: "mt-3 grid grid-cols-5 gap-2",
  });
}

/* -------------------------------- Páginas -------------------------------- */

function render(view: StoreRenderView, custom?: StoreCustomization): string {
  const labels = menuFor(view, custom);
  return `${STYLE}
  <div class="lx-root relative min-h-screen flex flex-col overflow-x-hidden">
    ${headerHtml(view)}
    ${heroHtml(view, custom)}
    <main id="produtos" class="${CONTAINER} pb-20 md:pb-28">
      ${sectionsArea(view, custom)}
    </main>
    ${blocksHtml(custom, { container: CONTAINER, brand: "var(--brand,#1c1b1b)", variant: "galeria" })}
    <div data-lumiere-slot="testimonials">${custom?.lumiere?.hideTestimonials ? "" : testimonialSection(custom)}</div>
    <div data-lumiere-slot="boutiques">${custom?.lumiere?.hideBoutiques ? "" : boutiquesSection(custom)}</div>
    ${footerHtml(view, custom, labels)}
  </div>`;
}

function renderProduct(view: StoreRenderView, product: StoreProductView, custom?: StoreCustomization): string {
  const labels = menuFor(view, custom);
  if (custom?.productPage?.variant) {
    return `${STYLE}<div class="lx-root min-h-screen flex flex-col overflow-x-hidden">
      ${headerHtml(view)}
      ${renderProductPage(custom.productPage.variant, view, product, custom, { container: CONTAINER, brand: "var(--brand,#1c1b1b)" })}
      ${footerHtml(view, custom, labels)}
    </div>`;
  }
  const phone = resolveWaPhone(custom);
  const waMsg = buildProductMessage(custom?.whatsapp?.messageTemplate, product.name, formatKz(product.price));
  const related = view.products.filter((p) => p.id !== product.id).slice(0, 4);
  const badge = product.featured ? `<span class="inline-block px-3 py-1 lx-body lx-track uppercase text-[11px] mb-4" style="background:#E5D3C0;color:#1c1b1b">Destaque</span>` : "";

  return `${STYLE}
  <div class="lx-root min-h-screen flex flex-col overflow-x-hidden">
    ${headerHtml(view)}
    <main class="${CONTAINER} pt-10 md:pt-16 pb-20 flex-grow">
      <nav class="lx-body text-sm mb-8 flex items-center gap-1.5 flex-wrap" style="color:#777871">
        <a href="${esc(homeHref(view))}" class="hover:opacity-60">Início</a>
        <span class="material-symbols-outlined text-[16px]">chevron_right</span>
        ${product.category ? `<a href="${esc(categoryHref(view, product.category))}" class="hover:opacity-60">${esc(product.category)}</a><span class="material-symbols-outlined text-[16px]">chevron_right</span>` : ""}
        <span style="color:#1c1b1b">${esc(product.name)}</span>
      </nav>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-20 items-start">
        ${productGallery(view, product, custom)}
        <div class="flex flex-col md:sticky md:top-28 md:px-2">
          ${badge}
          <h1 class="lx-serif text-4xl md:text-5xl mb-3" style="color:#1c1b1b">${esc(product.name)}</h1>
          <p class="lx-serif text-2xl mb-6" style="color:var(--brand,#1c1b1b)">${esc(formatKz(product.price))}</p>
          ${product.description
            ? `<p class="lx-body font-light leading-relaxed mb-8 whitespace-pre-line" style="color:#464742">${esc(product.description)}</p>`
            : `<p class="lx-body italic mb-8" style="color:#777871">Sem descrição.</p>`}
          <div class="flex items-center gap-4 mb-8">
            <span class="lx-body lx-track uppercase text-[12px] font-semibold" style="color:#1c1b1b">Quantidade</span>
            <div class="flex items-center border" style="border-color:rgba(28,27,27,.2)">
              <button type="button" data-qty-dec class="w-10 h-10 flex items-center justify-center hover:bg-black/5" style="color:#1c1b1b"><span class="material-symbols-outlined text-[20px]">remove</span></button>
              <input data-qty type="text" inputmode="numeric" value="1" class="w-12 h-10 text-center outline-none border-x lx-body" style="border-color:rgba(28,27,27,.2);background:transparent" />
              <button type="button" data-qty-inc class="w-10 h-10 flex items-center justify-center hover:bg-black/5" style="color:#1c1b1b"><span class="material-symbols-outlined text-[20px]">add</span></button>
            </div>
          </div>
          <div class="flex flex-col sm:flex-row gap-3">
            <button type="button" data-add-cart="${esc(product.id)}" class="flex-1 inline-flex items-center justify-center gap-2 lx-body lx-track uppercase text-[12px] font-semibold px-6 py-4 hover:opacity-90 transition-opacity" style="background:var(--brand,#1c1b1b);color:var(--brand-ink,#fff)"><span class="material-symbols-outlined text-[18px]">shopping_bag</span> Adicionar ao carrinho</button>
            <a href="${esc(waLink(phone, waMsg))}" data-edit-whatsapp target="_blank" rel="noopener" class="flex-1 inline-flex items-center justify-center gap-2 lx-body lx-track uppercase text-[12px] font-semibold px-6 py-4 border hover:bg-black/[.03] transition-colors" style="border-color:#1c1b1b;color:#1c1b1b"><span class="material-symbols-outlined text-[18px]">chat</span> WhatsApp</a>
          </div>
          <ul data-edit-perks class="mt-8 space-y-2 lx-body text-sm border-t pt-6" style="color:#464742;border-color:rgba(28,27,27,.1)">
            ${perksItemsHtml(custom, "var(--brand,#1c1b1b)")}
          </ul>
        </div>
      </div>
      ${related.length
        ? `<section data-related class="mt-24">
            <h2 class="lx-serif text-3xl md:text-4xl mb-10 text-center" style="color:#1c1b1b">Também pode gostar</h2>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">${related.map((p) => productCard(view, p)).join("")}</div>
          </section>`
        : ""}
    </main>
    ${footerHtml(view, custom, labels)}
  </div>`;
}

function renderCategory(view: StoreRenderView, category: string, custom?: StoreCustomization): string {
  const labels = menuFor(view, custom);
  const items = filterForCategoryPage(view, category);
  const grid = items.length
    ? `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 md:gap-8">${items.map((p) => productCard(view, p)).join("")}</div>`
    : `<div class="py-16 text-center lx-body" style="color:#777871"><span class="material-symbols-outlined" style="font-size:48px">category</span><p class="mt-2">Ainda não há produtos nesta categoria.</p></div>`;
  return `${STYLE}
  <div class="lx-root min-h-screen flex flex-col">
    ${headerHtml(view)}
    <main class="${CONTAINER} pt-10 md:pt-14 pb-20 flex-grow">
      <nav class="lx-body text-sm mb-8 flex items-center gap-1.5" style="color:#777871">
        <a href="${esc(homeHref(view))}" class="hover:opacity-60">Início</a>
        <span class="material-symbols-outlined text-[16px]">chevron_right</span>
        <span style="color:#1c1b1b">${esc(category)}</span>
      </nav>
      <div class="flex items-end gap-3 mb-10">
        <h1 class="lx-serif text-4xl md:text-5xl" style="color:#1c1b1b">${esc(category)}</h1>
        <span class="lx-body text-sm" style="color:#777871">${items.length} produto(s)</span>
      </div>
      ${grid}
    </main>
    ${footerHtml(view, custom, labels)}
  </div>`;
}

function renderCheckout(view: StoreRenderView, innerHtml: string, custom?: StoreCustomization): string {
  const labels = menuFor(view, custom);
  return `${STYLE}
  <div class="lx-root min-h-screen flex flex-col">
    ${headerHtml(view)}
    <main class="${CONTAINER} py-10 md:py-16 flex-grow">${innerHtml}</main>
    ${footerHtml(view, custom, labels)}
  </div>`;
}

export const lumiereTemplate: StoreTemplate = {
  id: "lumiere",
  name: "Lumière Chic",
  previewUrl: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?q=80&w=600",
  ready: true,
  defaultBrand: "#1c1b1b",
  render,
  renderProduct,
  renderCategory,
  renderCheckout,
};
