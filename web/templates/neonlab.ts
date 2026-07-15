/**
 * Modelo "NEON LAB" — techno-luxury escuro (eletrónica/áudio premium).
 * Base carvão (#121317), cartões #1C1C1E, acento cobalto (var(--brand,#2E5BFF)),
 * vidro (glassmorphism) e tipografia Sora (títulos) + Hanken Grotesk (corpo) +
 * Geist (labels técnicos, maiúsculas espaçadas). Grelha assimétrica.
 *
 * Cada componente adicional (informação com foto, texto, testemunhos,
 * localização) tem o SEU próprio desenho escuro — ver `neonBlocksHtml`.
 * Mantém todos os hooks de edição/carrinho/pesquisa dos outros modelos.
 */
import { esc, formatKz } from "../lib/dom.js";
import { productSlugPath } from "../lib/slug.js";
import { perksItemsHtml } from "./perks.js";
import { renderProductPage } from "./productPage.js";
import { productGalleryHtml } from "./gallery.js";
import { cardAspectClass, gridColsClass, type ProductVariant } from "./productGrid.js";
import { platformHomeUrl, STORE_APEX } from "../lib/routing.js";
import { buildProductMessage, resolveWaPhone, waLink } from "../lib/whatsapp.js";
import { resolveSections, filterForCategoryPage, headerCategories } from "./sectionsModel.js";
import { mobileMenuParts } from "./headers.js";
import type { ContentBlock, StoreTemplate, StoreRenderView, StoreCustomization } from "./types.js";
import type { StoreProductView } from "../../src/storefront/storeRenderer.js";

const CONTAINER = "w-full max-w-[1440px] mx-auto px-5 md:px-16";
const DEFAULT_PHONE = "+244 900 000 000";
const HERO_FALLBACK = "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1600";
const BRAND = "var(--brand,#2E5BFF)";

/** Estilo próprio do modelo (fontes + utilitários escuros), injetado por render. */
const STYLE = `<style>
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700&family=Hanken+Grotesk:wght@400;500;600;700&family=Geist:wght@400;500;600&display=swap');
  .nl-root{font-family:'Hanken Grotesk',sans-serif;background:#121317;color:#e3e2e7}
  .nl-root :is(h1,h2,h3),.nl-display{font-family:'Sora',sans-serif}
  .nl-body{font-family:'Hanken Grotesk',sans-serif}
  .nl-label{font-family:'Geist',sans-serif;text-transform:uppercase;letter-spacing:.08em}
  .nl-mono{font-family:'Geist','Geist',monospace;font-variant-numeric:tabular-nums}
  .nl-glass{background:rgba(28,28,30,.6);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(142,145,146,.12)}
  .nl-glow{transition:box-shadow .3s ease}
  .nl-glow:hover{box-shadow:0 0 18px rgba(46,91,255,.5)}
  .nl-root .material-symbols-outlined{font-family:'Material Symbols Outlined' !important}
  .nl-noscroll{scrollbar-width:none;-ms-overflow-style:none}
  .nl-noscroll::-webkit-scrollbar{display:none}
  .nl-checkout :is(.bg-white){background:#1C1C1E !important}
  .nl-checkout :is(.bg-neutral-50,.bg-gray-50){background:#1a1b1f !important}
  .nl-checkout :is(.text-neutral-900,.text-neutral-800,.text-neutral-700){color:#e3e2e7 !important}
  .nl-checkout :is(.text-neutral-600,.text-neutral-500){color:#8e9192 !important}
  .nl-checkout :is(.text-neutral-400,.text-neutral-300){color:#5f5e5e !important}
  .nl-checkout :is(.border-neutral-100,.border-neutral-200,.border-neutral-300){border-color:#444748 !important}
  .nl-checkout input,.nl-checkout select,.nl-checkout textarea{background:#121317 !important;color:#e3e2e7 !important;border-color:#444748 !important}
  .nl-checkout .hover\\:bg-neutral-50:hover{background:rgba(255,255,255,.05) !important}
  .nl-checkout :is(.bg-neutral-100,.bg-neutral-200){background:#1e1f23 !important}
  .nl-checkout [data-method]{background:#1C1C1E !important;border-color:#444748 !important}
  .nl-checkout [data-method][style*="var(--brand)"]{border-color:var(--brand,#2E5BFF) !important;background:rgba(46,91,255,.12) !important}
  .nl-checkout #pay[disabled]{background:#292a2e !important;color:#8e9192 !important}
  .nl-checkout .divide-neutral-100 > * + *,.nl-checkout .divide-neutral-200\\/60 > * + *{border-color:rgba(68,71,72,.4) !important}
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
    return `<img src="${esc(b.url)}" alt="${esc(b.alt)}" class="w-auto object-contain" style="height:${mbLogoScale ?? 30}px" />`;
  }
  return `<span class="nl-display text-2xl font-bold tracking-tighter" style="color:#c8c6c5">${esc(view.storeName)}</span>`;
}

/* ------------------------------- Cabeçalho ------------------------------- */

function headerHtml(view: StoreRenderView): string {
  const cats = headerCategories(view);
  const mnav = mobileMenuParts(view, CONTAINER);
  const linkCls = "nl-body text-[13px] uppercase tracking-widest hover:text-[#e3e2e7] transition-colors";
  const links =
    `<a href="${esc(homeHref(view))}" class="nl-body text-[13px] uppercase tracking-widest pb-1 font-bold" style="color:#c8c6c5;border-bottom:2px solid var(--brand,#2E5BFF)">Início</a>` +
    `<a href="${esc(homeHref(view))}#produtos" class="${linkCls}" style="color:#c4c7c7">Produtos</a>`;
  const catsMenu = cats.length
    ? `<div class="relative group" data-categories-menu>
        <button type="button" class="${linkCls} flex items-center gap-0.5" style="color:#c4c7c7">Categorias <span class="material-symbols-outlined text-[16px]">expand_more</span></button>
        <div class="absolute left-0 top-full pt-3 hidden group-hover:block z-50">
          <div class="nl-glass rounded-lg py-2 min-w-[200px]">
            ${cats.map((c) => `<a href="${esc(categoryHref(view, c))}" class="block px-4 py-2 text-sm nl-body hover:bg-white/5 transition-colors" style="color:#e3e2e7">${esc(c)}</a>`).join("")}
          </div>
        </div>
      </div>`
    : "";
  const icons = `<div class="flex items-center gap-3 shrink-0">
      <button type="button" data-search-btn class="p-2 rounded-full hover:bg-white/10 transition-colors" style="color:#c4c7c7"><span class="material-symbols-outlined">search</span></button>
      <a href="${esc(cartHref(view))}" data-cart-link class="relative inline-flex items-center gap-2 nl-label text-[13px] px-5 py-2 rounded nl-glow" style="background:var(--brand,#2E5BFF);color:#fff">
        <span class="material-symbols-outlined text-[18px]">shopping_bag</span>
        <span class="hidden sm:inline">Cesto</span>
        <span data-cart-count class="hidden absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center" style="background:#fff;color:var(--brand,#2E5BFF)"></span>
      </a>
    </div>`;
  return `
    <header class="sticky top-0 z-50 nl-glass" style="background:rgba(18,19,23,.8)">
      ${mnav.head}
      <div class="${CONTAINER}">
        <div class="flex items-center justify-between h-20 gap-4">
          <div class="flex items-center gap-8 min-w-0">
            <div class="flex items-center gap-1 min-w-0">
              ${mnav.button}
              <a href="${esc(homeHref(view))}" data-edit-logo class="flex items-center min-w-0">${brandHtml(view)}</a>
            </div>
            <nav class="hidden lg:flex items-center gap-8">${links}${catsMenu}</nav>
          </div>
          ${icons}
        </div>
      </div>
      ${mnav.panel}
    </header>`;
}

/* --------------------------------- Hero --------------------------------- */

function heroHtml(view: StoreRenderView, custom?: StoreCustomization): string {
  const title = custom?.hero?.title || "PRECISÃO\nDE ENGENHARIA.";
  const subtitle = custom?.hero?.subtitle || "O auge da fidelidade acústica e do design técnico. Feito para o arquiteto exigente do som.";
  const cta = custom?.hero?.ctaLabel || "Explorar coleção";
  const img = custom?.hero?.imageUrl || view.banners[0]?.imageUrl || HERO_FALLBACK;
  const ctaTarget = custom?.hero?.ctaTarget?.trim();
  const ctaHref = ctaTarget ? categoryHref(view, ctaTarget) : "#produtos";
  const titleHtml = esc(title).replace(/\n/g, "<br/>");
  return `
  <section class="relative w-full overflow-hidden" style="min-height:min(82vh,780px);background:#1a1b1f">
    <div data-edit-hero class="absolute inset-0 z-0">
      <div class="w-full h-full bg-cover bg-center" style="background-image:url('${esc(img)}')"></div>
      <div class="absolute inset-0" style="background:linear-gradient(to right,#121317 10%,rgba(18,19,23,.82) 45%,transparent 90%)"></div>
    </div>
    <div class="relative z-10 ${CONTAINER} grid grid-cols-1 md:grid-cols-12 gap-8" style="min-height:min(82vh,780px)">
      <div class="md:col-span-7 lg:col-span-6 flex flex-col justify-center py-24">
        <h1 data-edit="hero.title" class="nl-display font-bold tracking-tighter mb-6" style="color:#e3e2e7;font-size:clamp(2.5rem,6.5vw,4.5rem);line-height:1.05">${titleHtml}</h1>
        <p data-edit="hero.subtitle" class="nl-body mb-10 max-w-md" style="color:#c4c7c7;font-size:1.125rem;line-height:1.7">${esc(subtitle)}</p>
        <a href="${esc(ctaHref)}" data-hero-cta class="nl-label inline-flex items-center justify-center gap-2 w-max text-[14px] px-8 py-4 rounded nl-glow" style="background:var(--brand,#2E5BFF);color:#fff"><span data-edit="hero.ctaLabel">${esc(cta)}</span></a>
      </div>
    </div>
  </section>`;
}

/* ------------------------------- Produtos ------------------------------- */

function cardAspect(): string {
  return cardAspectClass(mbGridVariant ?? "quadrado");
}

function productCard(view: StoreRenderView, p: StoreProductView, opts: { idx?: number; hidden?: boolean } = {}): string {
  const img = p.imageUrl
    ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" class="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" />`
    : `<div class="absolute inset-0 flex items-center justify-center" style="background:#292a2e"><span class="material-symbols-outlined text-4xl" style="color:#5f5e5e">headphones</span></div>`;
  const badge = p.category
    ? `<span class="nl-label text-[11px] px-2 py-1 rounded" style="background:#121317;color:#8e9192">${esc(p.category)}</span>`
    : "";
  const hide = opts.hidden ? ` data-extra style="display:none"` : "";
  // Assimetria editorial: descai a coluna do meio (idx % 3 === 1) em ecrãs grandes.
  const offset = (opts.idx ?? 0) % 3 === 1 ? " lg:translate-y-10" : "";
  return `<a href="${esc(productHref(view, p))}" class="group relative block rounded-lg overflow-hidden hover:-translate-y-2 transition-transform duration-500${offset}" style="background:#1C1C1E" data-edit-product="${esc(p.id)}"${hide}>
    <div class="relative ${cardAspect()} overflow-hidden" style="background:rgba(41,42,46,.35)">${img}
      <div class="absolute inset-0 pointer-events-none" style="background:linear-gradient(to top,rgba(18,19,23,.55),transparent 55%)"></div>
    </div>
    <div class="p-6">
      ${badge ? `<div class="flex gap-2 mb-3">${badge}</div>` : ""}
      <h3 class="nl-display text-xl mb-1" style="color:#e3e2e7">${esc(p.name)}</h3>
      <p class="nl-body text-sm" style="color:var(--brand,#2E5BFF)">${esc(formatKz(p.price))}</p>
    </div>
  </a>`;
}

const PER_ROW = 3;
const TWO_ROWS = 6;

function sectionsArea(view: StoreRenderView, custom?: StoreCustomization): string {
  const gridCls = mbGridVariant ? gridColsClass(mbGridVariant) : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8";
  const sections = resolveSections(view, custom);
  const multi = sections.length > 1;
  const pink = inkFor(custom?.productsBg);
  const blocks = sections.map((sec, i) => {
    const items = multi ? sec.products.slice(0, PER_ROW) : sec.products;
    const cards = items.map((p, idx) => productCard(view, p, { idx, hidden: !multi && idx >= TWO_ROWS })).join("");
    const moreRight = multi
      ? `<a href="${esc(sec.moreHref)}" class="nl-label text-[12px] flex items-center gap-2 hover:opacity-70 transition-opacity" style="color:${pink.title}">Ver tudo <span class="material-symbols-outlined text-[16px]">arrow_forward</span></a>`
      : "";
    const moreBottom = (!multi && sec.products.length > TWO_ROWS)
      ? `<div class="text-center mt-14"><button type="button" data-load-more data-step="${TWO_ROWS}" class="nl-label text-[13px] px-8 py-3 rounded border hover:bg-black/5 transition-colors" style="border-color:${pink.line};color:${pink.title}">Ver mais</button></div>`
      : "";
    const empty = items.length === 0 ? `<p class="col-span-full py-8 text-center nl-body" style="color:${pink.muted}">Sem produtos nesta secção.</p>` : "";
    return `<section data-section data-edit-section="${i}" class="${i > 0 ? "mt-24" : ""}">
      <div data-edit-section-head class="flex flex-col md:flex-row justify-between md:items-end gap-4 mb-14">
        <div>
          <h2 class="nl-display text-3xl md:text-4xl mb-2" style="color:${pink.title}">${esc(sec.title)}</h2>
          <p class="nl-body text-sm" style="color:${pink.muted}">Instrumentos de absoluta clareza.</p>
        </div>
        ${moreRight}
      </div>
      <div data-section-grid data-edit-products class="${gridCls}">${cards}${empty}</div>
      ${moreBottom}
    </section>`;
  }).join("");
  return `<div data-edit-sections>${blocks}</div>`;
}

/* ----------------------- Componentes/secções (escuros) ----------------------- */

const DEFAULT_INFO_IMG = "https://images.unsplash.com/photo-1550009158-9ebf69173e03?q=80&w=1200";

/** Uma cor de fundo é "escura"? (luminância). Vazio = branco (padrão) = claro. */
function isDarkBg(bg?: string): boolean {
  const h = (bg ?? "").trim().replace("#", "");
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 128;
}

/** Cores de texto conforme o fundo da secção (padrão = branco → texto escuro). */
function inkFor(bg?: string): { title: string; body: string; muted: string; chipBg: string; chipText: string; line: string } {
  return isDarkBg(bg)
    ? { title: "#e3e2e7", body: "#c4c7c7", muted: "#8e9192", chipBg: "#1C1C1E", chipText: "#c6c6c8", line: "rgba(68,71,72,.6)" }
    : { title: "#121317", body: "#52525b", muted: "#71717a", chipBg: "#f4f4f5", chipText: "#3f3f46", line: "rgba(0,0,0,.12)" };
}

/** Fundo da secção: padrão branco; o cliente pode mudar (incl. tons escuros). */
function bgStyle(bg?: string): string {
  return `background:${bg && bg.trim() ? esc(bg) : "#ffffff"};`;
}

/** Bloco "Informação com foto" — desenho NEON (assimétrico, chip sobre o título). */
function neonInfoBlock(b: Extract<ContentBlock, { type: "info" }>, i: number): string {
  const ink = inkFor(b.bg);
  const imgUrl = esc(b.imageUrl || DEFAULT_INFO_IMG);
  const left = b.imageSide !== "right";
  const badge = b.badge ?? "Tecnologia proprietária";
  const img = `<div class="md:col-span-6 ${left ? "order-1" : "order-1 md:order-2"}">
    <div data-edit-block-image="${i}" class="relative w-full aspect-[4/5] rounded-lg overflow-hidden" style="background:#1e1f23">
      <img src="${imgUrl}" alt="" class="w-full h-full object-cover" onerror="this.onerror=null;this.src='https://placehold.co/800x1000/1e1f23/8e9192?text=Imagem'" />
      <div class="absolute inset-0 pointer-events-none" style="box-shadow:inset 0 0 60px rgba(46,91,255,.08)"></div>
    </div>
  </div>`;
  const txt = `<div class="md:col-span-5 ${left ? "order-2 md:col-start-8" : "order-2 md:order-1 md:col-start-1"} flex flex-col justify-center">
    <span data-edit="blocks.${i}.badge" class="nl-label text-[11px] inline-block w-max px-3 py-1 rounded-sm mb-6" style="background:${ink.chipBg};color:${ink.chipText}">${esc(badge)}</span>
    <h2 data-edit="blocks.${i}.title" class="nl-display text-3xl md:text-4xl mb-6" style="color:${ink.title}">${esc(b.title ?? "")}</h2>
    <p data-edit="blocks.${i}.text" class="nl-body leading-relaxed whitespace-pre-line" style="color:${ink.body}">${esc(b.text ?? "")}</p>
  </div>`;
  return `<section data-edit-block="${i}" data-block-type="info" data-block-variant="${esc(b.variant ?? "lado")}" class="relative py-16 md:py-24" style="${bgStyle(b.bg)}">
    <div class="${CONTAINER}">
      <div class="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">${img}${txt}</div>
    </div>
  </section>`;
}

/** Bloco "Título e texto" — centrado com acento cobalto. */
function neonTextBlock(b: Extract<ContentBlock, { type: "text" }>, i: number): string {
  const ink = inkFor(b.bg);
  return `<section data-edit-block="${i}" data-block-type="text" data-block-variant="${esc(b.variant ?? "centrado")}" class="relative py-16 md:py-24" style="${bgStyle(b.bg)}">
    <div class="${CONTAINER}">
      <div class="max-w-3xl mx-auto text-center">
        <span class="inline-block w-10 h-0.5 mb-6" style="background:var(--brand,#2E5BFF)"></span>
        <h2 data-edit="blocks.${i}.title" class="nl-display text-2xl md:text-4xl mb-5" style="color:${ink.title}">${esc(b.title ?? "")}</h2>
        <p data-edit="blocks.${i}.text" class="nl-body text-lg leading-relaxed whitespace-pre-line" style="color:${ink.body}">${esc(b.text ?? "")}</p>
      </div>
    </div>
  </section>`;
}

/** Bloco "Localização" — mapa escuro + painel em vidro. */
function neonLocationBlock(b: Extract<ContentBlock, { type: "location" }>, i: number): string {
  const address = (b.address ?? "").trim() || "Luanda, Angola";
  const src = typeof b.lat === "number" && typeof b.lng === "number"
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${b.lng - 0.008},${b.lat - 0.008},${b.lng + 0.008},${b.lat + 0.008}&layer=mapnik&marker=${b.lat},${b.lng}`
    : `https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=14&output=embed`;
  return `<section data-edit-block="${i}" data-block-type="location" data-block-variant="${esc(b.variant ?? "classico")}" class="relative w-full" style="${bgStyle(b.bg)}">
    <div class="relative" style="height:520px;border-top:1px solid rgba(68,71,72,.4);border-bottom:1px solid rgba(68,71,72,.4)">
      <iframe title="Mapa" src="${esc(src)}" class="w-full h-full" style="border:0;filter:grayscale(1) invert(.92) contrast(.9)" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
      <div class="absolute inset-0 pointer-events-none" style="background:linear-gradient(to top,#121317,transparent 40%)"></div>
      <div class="absolute bottom-10 left-5 md:left-16 nl-glass p-8 max-w-sm rounded-xl">
        <h3 data-edit="blocks.${i}.title" class="nl-display text-2xl mb-2" style="color:#e3e2e7">${esc(b.title ?? "Onde estamos")}</h3>
        <p class="nl-body" style="color:#c4c7c7"><span data-edit-loc-address data-edit="blocks.${i}.address">${esc(address)}</span></p>
      </div>
    </div>
  </section>`;
}

/** Região de blocos (com os hooks do editor). Cada tipo tem o desenho NEON. */
function neonBlocksHtml(custom?: StoreCustomization): string {
  const blocks = custom?.blocks ?? [];
  const html = blocks.map((b, i) => {
    switch (b.type) {
      case "info": return neonInfoBlock(b, i);
      case "text": return neonTextBlock(b, i);
      case "location": return neonLocationBlock(b, i);
      default: return ""; // testemunhos não fazem parte deste modelo
    }
  }).join("");
  return `<div data-edit-blocks>${html}</div>`;
}

/* -------------------------------- Rodapé -------------------------------- */

function footerBrandHtml(view: StoreRenderView, custom?: StoreCustomization): string {
  const url = custom?.footer?.logoUrl || (view.header.brand.kind === "logo" ? view.header.brand.url : null);
  if (url) return `<img src="${esc(url)}" alt="${esc(view.storeName)}" class="h-8 w-auto object-contain" />`;
  return `<span class="nl-display text-2xl font-bold tracking-tighter" style="color:#e3e2e7">${esc(view.storeName)}</span>`;
}

function footerHtml(view: StoreRenderView, custom?: StoreCustomization): string {
  const about = custom?.footer?.about || "Engenharia de precisão. Instrumentos de áudio de alta fidelidade, concebidos para os exigentes.";
  const location = custom?.footer?.location || "Luanda, Angola";
  const phone = custom?.footer?.phone || DEFAULT_PHONE;
  const email = custom?.footer?.email || "geral@minhaloja.ao";
  return `
    <footer class="mt-auto w-full" style="background:#0d0e12;border-top:1px solid rgba(68,71,72,.4)">
      <div class="${CONTAINER} py-16 grid grid-cols-1 md:grid-cols-12 gap-10">
        <div class="md:col-span-5">
          <div data-edit-footer-logo class="relative inline-block mb-5">${footerBrandHtml(view, custom)}</div>
          <p data-edit="footer.about" class="nl-body max-w-xs leading-relaxed" style="color:#8e9192">${esc(about)}</p>
        </div>
        <div class="md:col-span-3">
          <h3 class="nl-label text-[12px] mb-5" style="color:#c8c6c5">Explorar</h3>
          <ul class="space-y-3 nl-body text-sm">
            <li><a href="${esc(homeHref(view))}" class="hover:text-white transition-colors" style="color:#8e9192">Início</a></li>
            <li><a href="${esc(homeHref(view))}#produtos" class="hover:text-white transition-colors" style="color:#8e9192">Produtos</a></li>
          </ul>
        </div>
        <div class="md:col-span-4">
          <h3 class="nl-label text-[12px] mb-5" style="color:#c8c6c5">Contacto</h3>
          <ul class="space-y-3 nl-body text-sm" style="color:#8e9192">
            <li><span data-edit="footer.location">${esc(location)}</span></li>
            <li><span data-edit="footer.phone">${esc(phone)}</span></li>
            <li><span data-edit="footer.email">${esc(email)}</span></li>
          </ul>
        </div>
      </div>
      <div style="border-top:1px solid rgba(68,71,72,.3)">
        <div class="${CONTAINER} py-6 nl-label text-[11px] text-center" style="color:#5f5e5e">
          ${esc(storeIdentifier(view) + "." + STORE_APEX)} · Loja criada com <a href="${platformHomeUrl()}" style="color:var(--brand,#2E5BFF)">MôBisno</a>
        </div>
      </div>
    </footer>`;
}

/* -------------------------------- Páginas -------------------------------- */

function render(view: StoreRenderView, custom?: StoreCustomization): string {
  menuFor(view, custom);
  return `${STYLE}
  <div class="nl-root relative min-h-screen flex flex-col overflow-x-hidden">
    ${headerHtml(view)}
    ${heroHtml(view, custom)}
    <main id="produtos" data-edit-products-bg style="background:${esc(custom?.productsBg && custom.productsBg.trim() ? custom.productsBg : "#ffffff")}">
      <div class="${CONTAINER} py-20 md:py-28">
        ${sectionsArea(view, custom)}
      </div>
    </main>
    ${neonBlocksHtml(custom)}
    ${footerHtml(view, custom)}
  </div>`;
}

function renderProduct(view: StoreRenderView, product: StoreProductView, custom?: StoreCustomization): string {
  menuFor(view, custom);
  if (custom?.productPage?.variant) {
    return `${STYLE}<div class="nl-root min-h-screen flex flex-col overflow-x-hidden">
      ${headerHtml(view)}
      ${renderProductPage(custom.productPage.variant, view, product, custom, { container: CONTAINER, brand: BRAND })}
      ${footerHtml(view, custom)}
    </div>`;
  }
  const phone = resolveWaPhone(custom);
  const waMsg = buildProductMessage(custom?.whatsapp?.messageTemplate, product.name, formatKz(product.price));
  const related = view.products.filter((p) => p.id !== product.id).slice(0, 3);
  return `${STYLE}
  <div class="nl-root min-h-screen flex flex-col overflow-x-hidden">
    ${headerHtml(view)}
    <main class="${CONTAINER} pt-12 md:pt-16 pb-24 flex-grow">
      <nav class="nl-label text-[12px] mb-10 flex items-center gap-2 flex-wrap" style="color:#8e9192">
        <a href="${esc(homeHref(view))}" class="hover:text-white transition-colors">Início</a>
        <span class="material-symbols-outlined text-[14px]">chevron_right</span>
        ${product.category ? `<a href="${esc(categoryHref(view, product.category))}" class="hover:text-white transition-colors">${esc(product.category)}</a><span class="material-symbols-outlined text-[14px]">chevron_right</span>` : ""}
        <span style="color:#e3e2e7">${esc(product.name)}</span>
      </nav>
      <div class="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-start">
        <div class="md:col-span-8">
          ${productGalleryHtml(product, custom, { stageClass: "w-full rounded-lg overflow-hidden", stageStyle: "background:#1e1f23;height:min(70vh,620px)", imgClass: "w-full h-full object-cover opacity-90 hover:opacity-100 transition-opacity duration-700", brand: BRAND, thumbsClass: "mt-6 grid grid-cols-4 gap-4" })}
        </div>
        <div class="md:col-span-4">
          <div class="sticky top-28 space-y-8">
            <div>
              ${product.category ? `<div class="inline-block px-3 py-1 rounded-sm nl-label text-[11px] mb-4" style="background:#1C1C1E;color:#c6c6c8">${esc(product.category)}</div>` : ""}
              <h1 class="nl-display text-3xl md:text-4xl mb-3" style="color:#e3e2e7">${esc(product.name)}</h1>
              ${product.description
                ? `<p class="nl-body leading-relaxed whitespace-pre-line" style="color:#c4c7c7">${esc(product.description)}</p>`
                : `<p class="nl-body italic" style="color:#8e9192">Sem descrição.</p>`}
            </div>
            <ul data-edit-perks class="space-y-3 pt-6" style="border-top:1px solid rgba(68,71,72,.4)">
              ${perksItemsHtml(custom, BRAND)}
            </ul>
            <div class="pt-4" style="border-top:1px solid rgba(68,71,72,.4)">
              <span class="block nl-display text-3xl mb-6" style="color:#e3e2e7">${esc(formatKz(product.price))}</span>
              <div class="flex items-center gap-4 mb-5">
                <span class="nl-label text-[12px]" style="color:#c4c7c7">Quantidade</span>
                <div class="flex items-center rounded" style="border:1px solid #444748">
                  <button type="button" data-qty-dec class="w-10 h-10 flex items-center justify-center hover:bg-white/5" style="color:#e3e2e7"><span class="material-symbols-outlined text-[20px]">remove</span></button>
                  <input data-qty type="text" inputmode="numeric" value="1" class="w-12 h-10 text-center outline-none bg-transparent nl-mono" style="color:#e3e2e7;border-left:1px solid #444748;border-right:1px solid #444748" />
                  <button type="button" data-qty-inc class="w-10 h-10 flex items-center justify-center hover:bg-white/5" style="color:#e3e2e7"><span class="material-symbols-outlined text-[20px]">add</span></button>
                </div>
              </div>
              <button type="button" data-add-cart="${esc(product.id)}" class="w-full nl-label text-[14px] inline-flex items-center justify-center gap-2 px-8 py-4 rounded-lg nl-glow" style="background:var(--brand,#2E5BFF);color:#fff"><span class="material-symbols-outlined text-[18px]">bolt</span> Adquirir unidade</button>
              <a href="${esc(waLink(phone, waMsg))}" data-edit-whatsapp target="_blank" rel="noopener" class="w-full mt-3 nl-label text-[13px] inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-lg transition-colors hover:bg-white/5" style="border:1px solid #444748;color:#e3e2e7"><span class="material-symbols-outlined text-[18px]">chat</span> WhatsApp</a>
            </div>
          </div>
        </div>
      </div>
      ${related.length
        ? `<section data-related class="mt-28 pt-16" style="border-top:1px solid rgba(68,71,72,.2)">
            <h2 class="nl-display text-2xl md:text-3xl mb-12 text-center" style="color:#e3e2e7">Também pode gostar</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">${related.map((p, idx) => productCard(view, p, { idx })).join("")}</div>
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
    ? `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">${items.map((p, idx) => productCard(view, p, { idx })).join("")}</div>`
    : `<div class="py-16 text-center nl-body" style="color:#8e9192"><span class="material-symbols-outlined" style="font-size:48px">category</span><p class="mt-2">Ainda não há produtos nesta categoria.</p></div>`;
  return `${STYLE}
  <div class="nl-root min-h-screen flex flex-col overflow-x-hidden">
    ${headerHtml(view)}
    <main class="${CONTAINER} pt-12 md:pt-16 pb-24 flex-grow">
      <nav class="nl-label text-[12px] mb-10 flex items-center gap-2" style="color:#8e9192">
        <a href="${esc(homeHref(view))}" class="hover:text-white transition-colors">Início</a>
        <span class="material-symbols-outlined text-[14px]">chevron_right</span>
        <span style="color:#e3e2e7">${esc(category)}</span>
      </nav>
      <div class="flex items-end gap-3 mb-12">
        <h1 class="nl-display text-4xl md:text-5xl" style="color:#e3e2e7">${esc(category)}</h1>
        <span class="nl-body text-sm" style="color:#8e9192">${items.length} produto(s)</span>
      </div>
      ${grid}
    </main>
    ${footerHtml(view, custom)}
  </div>`;
}

function renderCheckout(view: StoreRenderView, innerHtml: string, custom?: StoreCustomization): string {
  menuFor(view, custom);
  return `${STYLE}
  <div class="nl-root min-h-screen flex flex-col overflow-x-hidden">
    ${headerHtml(view)}
    <main class="${CONTAINER} py-12 md:py-16 flex-grow"><div class="nl-checkout">${innerHtml}</div></main>
    ${footerHtml(view, custom)}
  </div>`;
}

export const neonlabTemplate: StoreTemplate = {
  id: "neonlab",
  name: "Neon Lab",
  previewUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=600",
  ready: true,
  defaultBrand: "#2E5BFF",
  render,
  renderProduct,
  renderCategory,
  renderCheckout,
};
