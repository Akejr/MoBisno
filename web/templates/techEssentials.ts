/**
 * Modelo "Tech Essentials" — minimalismo moderno para electrónica e informática.
 *
 * Reproduz o desenho de referência que o utilizador enviou para este modelo (um
 * `code.html` + `screen.png` por ecrã, como manda o `MODELO-GUIA.md`; os
 * ficheiros não ficaram no repositório): Inter em toda a hierarquia, tela
 * azul-gelo (`#f8f9ff`), tinta ardósia profunda (`#0b1c30`), azul eléctrico como
 * **única** cor de acção, cartões brancos de 1px com sombra difusa, e raios de
 * 4/8/12px. Muito espaço branco e a fotografia do produto a dominar.
 *
 * ## Porque é que as cores estão escritas e não vêm dos tokens Tailwind
 *
 * O `code.html` do desenho traz a sua própria configuração Tailwind e usa
 * classes como `bg-surface`, `text-on-surface` e `border-outline-variant`. O
 * `tailwind.config.js` **deste projeto** define exactamente os mesmos nomes com
 * valores completamente diferentes — uma paleta laranja e castanha
 * (`surface: #fff8f6`, `on-surface: #271812`, `primary: #a73a00`). Copiar as
 * classes do desenho daria uma loja laranja, sem um único erro de compilação.
 * Também não coincidem os espaçamentos (`margin-desktop` aqui é 32px, o desenho
 * quer 64px) nem existe `text-headline-sm`.
 *
 * Por isso os valores são explícitos, como em `beauty.ts` e `lumiere.ts`. Os
 * raios (4/8/12px) e as escalas de tipografia do desenho coincidem com os do
 * projeto e esses são usados pelas classes normais.
 *
 * A cor de acção é sempre `var(--brand)` / `var(--brand-ink)`
 * (`MODELO-GUIA.md` §0, regra 6): o Dono troca a cor da loja e o modelo
 * acompanha, com o azul eléctrico como omissão.
 */
import { esc, formatKz } from "../lib/dom.js";
import { productSlugPath, categorySlug } from "../lib/slug.js";
import { perksItemsHtml } from "./perks.js";
import { blocksHtml } from "./blocks.js";
import { renderHero } from "./heroes.js";
import { renderHeader, mobileMenuParts } from "./headers.js";
import { renderFooter } from "./footers.js";
import { renderProductPage } from "./productPage.js";
import { variationPickerHtml } from "./variationPicker.js";
import { cardAspectClass, gridColsClass, type ProductVariant } from "./productGrid.js";
import { platformHomeUrl, STORE_APEX, storeBasePath, storeHomePath } from "../lib/routing.js";
import { buildProductMessage, resolveWaPhone, waLink } from "../lib/whatsapp.js";
import { resolveSections, filterForCategoryPage, headerCategories, allProductsHref, listingProducts, categoryFilterLabels } from "./sectionsModel.js";
import { categoryFilterHtml } from "./categoryFilter.js";
import { productGalleryHtml } from "./gallery.js";
import type { BlockStyle } from "./blocks.js";
import type { StoreTemplate, StoreRenderView, StoreCustomization } from "./types.js";
import type { StoreProductView } from "../../src/storefront/storeRenderer.js";

const PER_ROW = 4;
const TWO_ROWS = 8;

/* ------------------------------ Paleta ------------------------------ */

const CANVAS = "#f8f9ff";        // tela (surface / background)
const GREY_BAND = "#f1f2f6";     // faixa das marcas: cinzento neutro, não azulado
const GREY_MARK = "#4b5563";     // marcas: cinzento bem mais escuro do que a faixa
const CARD = "#ffffff";          // nível 1 (cartões)
const TONE_LOW = "#eff4ff";      // faixa tonal clara
const TONE = "#e5eeff";          // faixa tonal (rodapé)
const TONE_HIGH = "#dce9ff";     // chip de destaque do hero
const INK = "#0b1c30";           // tinta principal
const INK_SOFT = "#45464d";      // tinta secundária
const LINE = "rgba(198,198,205,.5)";  // moldura de 1px (outline-variant a 50%)
const OUTLINE = "#76777d";       // moldura de botão secundário
const ACTION = "#0058be";        // azul eléctrico — cor de acção
const SHADOW_1 = "0 4px 20px rgba(15,23,42,.05)";
const SHADOW_2 = "0 10px 40px rgba(15,23,42,.12)";

/** Cor de acção da loja: a do Dono, com o azul do modelo por omissão. */
const BRAND = `var(--brand,${ACTION})`;
/** Tinta legível sobre a cor de acção. */
const BRAND_INK = "var(--brand-ink,#fff)";

/**
 * Contentor: 1280px, margens de 16px em telemóvel e 64px em computador, como
 * manda o desenho. `px-16` é 64px; o token `margin-desktop` do projeto é 32px e
 * daria metade.
 */
const CONTAINER = "w-full max-w-[1280px] mx-auto px-4 md:px-16";

const HERO_FALLBACK = "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=1600";
const DEFAULT_PHONE = "+244 900 000 000";
const DEFAULT_SUBTITLE = "Equipamento escolhido a dedo, com garantia e entrega em toda Angola. Compre com a confiança de quem conhece o que vende.";
const DEFAULT_CTA = "Ver produtos";

/** Quantas marcas a faixa mostra. Nem mais, nem menos: o desenho é uma fila de quatro. */
const BRAND_SLOTS = 4;

/**
 * Logótipo de marca de demonstração, como SVG embutido.
 *
 * São marcas **inventadas**: pôr o logótipo de um fabricante real numa
 * loja-modelo seria usar a marca de outra pessoa sem autorização. Cinzento
 * `#4b5563`, bem mais escuro do que a faixa.
 *
 * Vai em `data:` e não como ficheiro em `web/public/` porque a personalização é
 * JSON gravado na base de dados: um caminho relativo deixaria de resolver numa
 * loja servida por domínio próprio.
 */
function brandLogo(nome: string, simbolo: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 48" fill="none">`
    + `<g fill="${GREY_MARK}">${simbolo}</g>`
    + `<text x="56" y="31" font-family="Inter,Arial,sans-serif" font-size="19" font-weight="700" letter-spacing="2" fill="${GREY_MARK}">${nome}</text>`
    + `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * As quatro marcas por omissão do modelo.
 *
 * Vivem **aqui** e não no semeador. Estavam só na base de fábrica, e por isso
 * não apareciam na galeria de modelos nem na pré-visualização: `templatePreview`
 * desenha o modelo com uma personalização vazia, tal como uma loja acabada de
 * criar. Um valor por omissão do modelo é do modelo, como o título do hero e o
 * texto do rodapé.
 */
export function defaultTechBrands(): { imageUrl: string; name: string }[] {
  return [
    // Processador: quadrado com pinos.
    { name: "Nexa", imageUrl: brandLogo("NEXA", '<path d="M14 14h20v20H14zM19 19h10v10H19z" fill-rule="evenodd"/><path d="M22 8h4v6h-4zM22 34h4v6h-4zM8 22h6v4H8zM34 22h6v4h-6z"/>') },
    // Auscultadores: arco com duas almofadas.
    { name: "Aura", imageUrl: brandLogo("AURA", '<path d="M10 28v-4a14 14 0 0 1 28 0v4h-4v-4a10 10 0 0 0-20 0v4z"/><rect x="8" y="26" width="7" height="13" rx="3"/><rect x="33" y="26" width="7" height="13" rx="3"/>') },
    // Rede: três nós ligados.
    { name: "Synergy", imageUrl: brandLogo("SYNERGY", '<circle cx="24" cy="12" r="5"/><circle cx="12" cy="34" r="5"/><circle cx="36" cy="34" r="5"/><path d="M23 16h2l-10 16h-2zM23 16h2l10 16h-2zM14 31h20v2H14z"/>') },
    // Armazenamento: discos empilhados.
    { name: "Quantum", imageUrl: brandLogo("QUANTUM", '<ellipse cx="24" cy="13" rx="15" ry="5"/><path d="M9 19c0 2.8 6.7 5 15 5s15-2.2 15-5v6c0 2.8-6.7 5-15 5S9 27.8 9 25z"/><path d="M9 31c0 2.8 6.7 5 15 5s15-2.2 15-5v4c0 2.8-6.7 5-15 5S9 37.8 9 35z"/>') },
  ];
}

/**
 * Estilo próprio do modelo, injetado uma vez por render.
 *
 * O **hover é a cor de acção** em tudo o que é navegável — ligações do
 * cabeçalho, categorias, rodapé e «Ver tudo». Fica numa regra CSS e não numa
 * classe `hover:text-[…]` do Tailwind porque a cor é `var(--brand)`, que o
 * Tailwind não consegue interpolar num modificador de estado.
 */
const STYLE = `<style>
  .tx-root{background:${CANVAS};color:${INK};font-family:Inter,sans-serif}
  .tx-root .material-symbols-outlined{font-family:'Material Symbols Outlined' !important;font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24}
  .tx-card{background:${CARD};border:1px solid ${LINE};box-shadow:${SHADOW_1};transition:box-shadow .3s ease}
  .tx-card:hover{box-shadow:${SHADOW_2}}
  .tx-link{transition:color .2s ease}
  .tx-link:hover{color:${BRAND} !important}
  .tx-icon{transition:opacity .2s ease,color .2s ease}
  .tx-icon:hover{opacity:.75}
  .tx-menu-item:hover{background:${TONE_LOW};color:${BRAND} !important}
  .tx-outline{transition:border-color .2s ease,color .2s ease}
  .tx-outline:hover{border-color:${BRAND} !important;color:${BRAND} !important}
  .tx-brand-mark{filter:grayscale(1);opacity:.75;transition:filter .4s ease,opacity .4s ease}
  .tx-brands:hover .tx-brand-mark{filter:grayscale(1);opacity:1}
  .tx-noscroll{scrollbar-width:none;-ms-overflow-style:none}
  .tx-noscroll::-webkit-scrollbar{display:none}
  /* Pesquisa: cantos de 8px e moldura de 1px, como os controlos deste modelo. */
  .tx-root{--mb-search-radius:8px;--mb-search-h:44px;--mb-search-bg:${CARD};--mb-search-border:${LINE};--mb-search-ink:${INK};--mb-search-ph:rgba(11,28,48,.45)}
</style>`;

/** Altura do logótipo do cabeçalho (definida em menuFor a cada render). */
let mbLogoScale: number | undefined;
/** Disposição dos produtos escolhida (definida em menuFor a cada render). */
let mbGridVariant: ProductVariant | undefined;

/**
 * Desenho das secções acrescentadas, na linguagem deste modelo
 * (`MODELO-GUIA.md` §9.3). É isto que faz «Informação com foto», «Título e
 * texto», «Testemunhos» e «Localização» sairem com a tipografia, os cantos e a
 * paleta da home, em vez do desenho genérico.
 */
const BLOCK_STYLE: BlockStyle = {
  heading: "font-semibold tracking-tight",
  headingStyle: `color:${INK}`,
  body: "leading-relaxed",
  bodyStyle: `color:${INK_SOFT}`,
  surface: "border",
  surfaceStyle: `background:${CARD};border-color:${LINE};box-shadow:${SHADOW_1}`,
  radius: "rounded-lg",
  band: "",
  bandStyle: `background:${TONE_LOW};border-top:1px solid ${LINE};border-bottom:1px solid ${LINE}`,
};

/* ------------------------------- Helpers ------------------------------- */

function storeIdentifier(view: StoreRenderView): string {
  return view.subdomain.split(".")[0] ?? view.subdomain;
}
function storeBase(view: StoreRenderView): string {
  return storeBasePath(storeIdentifier(view));
}
function storeHomeHref(view: StoreRenderView): string {
  return storeHomePath(storeIdentifier(view));
}
function productHref(view: StoreRenderView, p: StoreProductView): string {
  return `${storeBase(view)}/produto/${productSlugPath(p)}`;
}
function categoryHref(view: StoreRenderView, category: string): string {
  return `${storeBase(view)}/categoria/${categorySlug(category)}`;
}
function cartHref(view: StoreRenderView): string {
  return `${storeBase(view)}/carrinho`;
}

function menuFor(view: StoreRenderView, custom?: StoreCustomization): string[] {
  mbLogoScale = custom?.logoScale;
  mbGridVariant = custom?.productGrid?.variant;
  return custom?.menu && custom.menu.length ? custom.menu : view.menu.items.map((i) => i.label);
}

/** Aspeto do cartão de produto (omissão do modelo: 4:3, como no desenho). */
function cardAspect(): string {
  return cardAspectClass(mbGridVariant ?? "quadrado");
}

function brandHtml(view: StoreRenderView): string {
  const b = view.header.brand;
  if (b.kind === "logo") {
    return `<img src="${esc(b.url)}" alt="${esc(b.alt)}" class="w-auto object-contain" style="height:${mbLogoScale ?? 32}px" />`;
  }
  return `<span class="text-headline-md font-bold tracking-tight" style="color:${INK}">${esc(view.storeName)}</span>`;
}

function footerBrandHtml(view: StoreRenderView, custom?: StoreCustomization): string {
  const url = custom?.footer?.logoUrl || (view.header.brand.kind === "logo" ? view.header.brand.url : null);
  if (url) return `<img src="${esc(url)}" alt="${esc(view.storeName)}" class="h-9 w-auto object-contain" />`;
  return `<span class="text-[20px] font-black tracking-tight" style="color:${INK}">${esc(view.storeName)}</span>`;
}

/* ------------------------------- Cabeçalho ------------------------------- */

function headerHtml(view: StoreRenderView, _labels: string[], custom?: StoreCustomization): string {
  if (custom?.header?.variant) return renderHeader(custom.header.variant, view, custom, { container: CONTAINER, brand: BRAND });
  const cats = headerCategories(view);
  const mnav = mobileMenuParts(view, CONTAINER);
  const linkCls = "tx-link text-body-md";
  const links =
    `<a href="${esc(storeHomeHref(view))}" class="${linkCls}" style="color:${INK_SOFT}">Início</a>` +
    `<a href="${esc(allProductsHref(view))}" class="${linkCls}" style="color:${INK_SOFT}">Produtos</a>`;
  const catsMenu = cats.length
    ? `<div class="relative group" data-categories-menu>
        <button type="button" class="tx-link text-body-md flex items-center gap-0.5" style="color:${INK_SOFT}">Categorias <span class="material-symbols-outlined text-[18px]">expand_more</span></button>
        <div class="absolute left-0 top-full pt-3 hidden group-hover:block z-50">
          <div class="rounded-lg py-2 min-w-[190px]" style="background:${CARD};border:1px solid ${LINE};box-shadow:${SHADOW_2}">
            ${cats.map((c) => `<a href="${esc(categoryHref(view, c))}" class="tx-menu-item block px-4 py-2 text-label-md transition-colors" style="color:${INK}">${esc(c)}</a>`).join("")}
          </div>
        </div>
      </div>`
    : "";
  return `
    <nav class="sticky top-0 z-50" style="background:${CANVAS};border-bottom:1px solid ${LINE};box-shadow:0 1px 2px rgba(15,23,42,.04)">
      ${mnav.head}
      <div class="${CONTAINER}">
        <div class="flex justify-between items-center gap-4 h-20">
          <div class="flex items-center gap-1 min-w-0">
            ${mnav.button}
            <a href="${esc(storeHomeHref(view))}" data-edit-logo class="flex items-center min-w-0">${brandHtml(view)}</a>
          </div>
          <div data-search-collapse class="hidden lg:flex items-center gap-6">${links}${catsMenu}</div>
          <div data-search-host class="flex items-center gap-3 shrink-0 min-w-0">
            <!-- A cor vai no PRÓPRIO glifo, não no botão: a regra da tinta global
                 acerta directamente no ícone, e uma cor herdada do botão perde
                 sempre para ela. Ver web/lib/ink.ts. -->
            <button type="button" data-search-btn aria-label="Pesquisar produtos" class="tx-icon p-1"><span class="material-symbols-outlined" style="color:${BRAND}">search</span></button>
            <a href="${esc(cartHref(view))}" data-cart-link aria-label="Carrinho" class="tx-icon relative inline-flex p-1">
              <span class="material-symbols-outlined" style="color:${BRAND}">shopping_cart</span>
              <span data-cart-count class="hidden absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center" style="background:${BRAND};color:${BRAND_INK}"></span>
            </a>
          </div>
        </div>
      </div>
      ${mnav.panel}
    </nav>`;
}

/* --------------------------------- Hero --------------------------------- */

function heroHtml(view: StoreRenderView, custom?: StoreCustomization): string {
  const title = custom?.hero?.title || "Tecnologia que trabalha para si.";
  const subtitle = custom?.hero?.subtitle || DEFAULT_SUBTITLE;
  const cta = custom?.hero?.ctaLabel || DEFAULT_CTA;
  const img = custom?.hero?.imageUrl || view.banners[0]?.imageUrl || HERO_FALLBACK;
  const target = custom?.hero?.ctaTarget?.trim();
  const href = target ? categoryHref(view, target) : "#produtos";
  return `
  <section class="${CONTAINER} py-12 md:py-20">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
      <div class="flex flex-col gap-6 z-10">
        <span class="text-label-sm uppercase tracking-widest w-fit px-3 py-1 rounded-full" style="background:${TONE_HIGH};color:${BRAND}">Nova geração</span>
        <h1 data-edit="hero.title" class="text-[36px] md:text-display-lg font-bold tracking-tight leading-[1.15]" style="color:${INK}">${esc(title)}</h1>
        <p data-edit="hero.subtitle" class="text-body-lg max-w-md" style="color:${INK_SOFT}">${esc(subtitle)}</p>
        <div class="flex flex-wrap gap-3 mt-1">
          <a href="${esc(href)}" data-hero-cta class="inline-flex items-center gap-2 text-label-md px-4 py-3 rounded transition-opacity hover:opacity-90" style="background:${BRAND};color:${BRAND_INK};box-shadow:${SHADOW_1}"><span data-edit="hero.ctaLabel">${esc(cta)}</span> <span class="material-symbols-outlined text-[18px]">arrow_forward</span></a>
          <a href="${esc(allProductsHref(view))}" class="tx-outline inline-flex items-center text-label-md px-4 py-3 rounded" style="border:1px solid ${OUTLINE};color:${INK}">Ver catálogo</a>
        </div>
      </div>
      <div data-edit-hero class="relative w-full aspect-[4/3] rounded-xl overflow-hidden" style="background:${TONE_LOW};box-shadow:${SHADOW_2}">
        <img src="${esc(img)}" alt="" class="object-cover w-full h-full absolute inset-0" />
      </div>
    </div>
  </section>`;
}

/**
 * As quatro marcas em vigor, sempre com quatro entradas.
 *
 * Cada lugar sem nada gravado cai no valor por omissão do modelo, e é isso que
 * põe logótipos verdadeiros na pré-visualização e numa loja acabada de criar. Um
 * lugar que o Dono esvaziou de propósito (objeto sem imagem **e** sem nome) fica
 * com a palavra «A sua marca», para ele saber onde carregar a dele.
 */
function brandList(custom?: StoreCustomization): { imageUrl?: string; name?: string }[] {
  const saved = custom?.techEssentials?.brands;
  /*
   * A distinção é entre «nunca configurado» e «configurado assim».
   *
   * Sem lista gravada — uma loja acabada de criar, ou a pré-visualização do
   * modelo — valem os quatro logótipos por omissão. Com lista gravada, vale o
   * que está lá: um lugar que o Dono esvaziou fica com «A sua marca», e não com
   * o logótipo de demonstração a reaparecer contra a vontade dele.
   */
  const base = Array.isArray(saved) && saved.length > 0 ? saved : defaultTechBrands();
  const out: { imageUrl?: string; name?: string }[] = [];
  for (let i = 0; i < BRAND_SLOTS; i++) out.push(base[i] ?? {});
  return out;
}

/**
 * Materializa as **quatro** marcas da faixa antes da baseline do editor
 * (`TemplateSections.materialize`, `MODELO-GUIA.md` §6.1).
 *
 * Sem isto, editar o nome de uma marca com `setPath` num array que não existe
 * criava um objeto `{0:…}` sem `.length`, o modelo voltava aos valores por
 * omissão e a edição desaparecia.
 *
 * Escreve **o que a faixa já mostra** — `brandList`, a mesma função que a
 * desenha —, por isso abrir o editor não muda nada no ecrã: sem lista gravada
 * ficam os quatro logótipos por omissão; com uma lista curta, os lugares que
 * faltam ficam vazios («A sua marca»), como na loja publicada. Uma lista que já
 * tem quatro entradas não é tocada, para o JSON gravado não mudar.
 *
 * Vivia no editor, atrás de um `store.templateId === "tech-essentials"`, com o
 * número de lugares repetido numa constante do editor.
 */
function materializeBrands(custom: StoreCustomization): void {
  const brands = custom.techEssentials?.brands;
  if (Array.isArray(brands) && brands.length === BRAND_SLOTS) return;
  const lista = brandList(custom);
  if (!custom.techEssentials) custom.techEssentials = {};
  custom.techEssentials.brands = lista;
}

/**
 * Faixa de marcas que a loja vende — a fila discreta abaixo do hero.
 *
 * São **sempre quatro**: o desenho é uma fila de quatro e menos do que isso
 * deixa-a desequilibrada. Cada uma mostra o logótipo que o Dono carregou ou,
 * sem imagem, o nome em palavra-marca — que é como a referência do modelo as
 * apresenta, em texto. Em repouso ficam a cinzento e translúcidas; ao passar o
 * rato na faixa recuperam a cor, como no desenho.
 *
 * Secção removível (`MODELO-GUIA.md` §7): `techEssentials.hideBrands` esconde-a,
 * e o editor volta a oferecê-la no lugar onde estava.
 */
function brandsSection(custom?: StoreCustomization): string {
  const brands = brandList(custom);
  const cards = brands.map((b, i) => {
    const name = (b.name ?? "").trim();
    const inner = b.imageUrl
      ? `<img src="${esc(b.imageUrl)}" alt="${esc(name || "Marca")}" class="max-h-10 w-auto object-contain" />`
      : `<span data-edit="techEssentials.brands.${i}.name" class="text-[20px] font-semibold tracking-widest uppercase" style="color:${GREY_MARK}">${esc(name || "A sua marca")}</span>`;
    return `<div data-tx-brand="${i}" class="tx-brand-mark flex items-center justify-center h-14 min-w-0">${inner}</div>`;
  }).join("");
  // Faixa cinzenta neutra, com as marcas num cinzento bem mais escuro: é uma
  // fila de apoio, não deve competir com o hero nem com os produtos.
  return `<section class="tx-brands py-12" data-tx-brands style="background:${GREY_BAND};border-top:1px solid ${LINE};border-bottom:1px solid ${LINE}">
    <div class="${CONTAINER}">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-12 items-center">${cards}</div>
    </div>
  </section>`;
}

/* ------------------------------- Produtos ------------------------------- */

function productCard(view: StoreRenderView, p: StoreProductView, opts: { hidden?: boolean } = {}): string {
  const img = p.imageUrl
    ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" class="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105" />`
    : `<div class="absolute inset-0 flex items-center justify-center" style="background:${TONE_LOW}"><span class="material-symbols-outlined text-4xl" style="color:${LINE}">image</span></div>`;
  const badge = p.featured
    ? `<span class="absolute top-3 left-3 z-10 text-label-sm px-2 py-[2px] rounded" style="background:${BRAND};color:${BRAND_INK}">Destaque</span>`
    : "";
  const hide = opts.hidden ? ` data-extra style="display:none"` : "";
  /*
   * O cartão é uma ligação para a página de produto, e o ícone do carrinho é a
   * afordância visual do desenho. Não é um `data-add-cart`: um produto com
   * Variação exige escolher a combinação antes de ir para o carrinho, e um botão
   * que adicionasse daqui ou falhava em silêncio ou adicionava a combinação
   * errada. A escolha faz-se na página de produto.
   */
  return `<a href="${esc(productHref(view, p))}" class="tx-card group rounded-lg overflow-hidden flex flex-col h-full" data-edit-product="${esc(p.id)}" data-product-category="${esc(p.category ?? "")}"${hide}>
    <div class="relative w-full ${cardAspect()} overflow-hidden" style="background:${TONE_LOW}">${img}${badge}</div>
    <div class="p-6 flex flex-col flex-grow">
      <h3 class="text-label-md font-semibold line-clamp-2" style="color:${INK}">${esc(p.name)}</h3>
      ${p.category ? `<p class="text-label-sm mt-1" style="color:${INK_SOFT}">${esc(p.category)}</p>` : ""}
      <div class="mt-auto pt-3 flex justify-between items-center gap-2">
        <span class="text-[20px] font-semibold" style="color:${INK}">${esc(formatKz(p.price))}</span>
        <span class="p-2 rounded transition-colors" style="background:${TONE};color:${INK}"><span class="material-symbols-outlined text-[20px]">arrow_forward</span></span>
      </div>
    </div>
  </a>`;
}

const GRID_CLS = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6";

function sectionsArea(view: StoreRenderView, custom?: StoreCustomization): string {
  const gridCls = mbGridVariant ? gridColsClass(mbGridVariant) : GRID_CLS;
  const sections = resolveSections(view, custom);
  const multi = sections.length > 1;
  const blocks = sections.map((sec, i) => {
    const items = multi ? sec.products.slice(0, PER_ROW) : sec.products;
    const cards = items.map((p, idx) => productCard(view, p, { hidden: !multi && idx >= TWO_ROWS })).join("");
    const moreRight = multi
      ? `<a href="${esc(sec.moreHref)}" class="tx-link text-label-md flex items-center gap-1 hover:underline shrink-0" style="color:${BRAND}">Ver tudo <span class="material-symbols-outlined text-[16px]">arrow_forward</span></a>`
      : "";
    const moreBottom = (!multi && sec.products.length > TWO_ROWS)
      ? `<div class="text-center mt-12"><button type="button" data-load-more data-step="${TWO_ROWS}" class="tx-outline inline-flex items-center gap-1 text-label-md px-8 py-3 rounded" style="border:1px solid ${OUTLINE};color:${INK}">Ver mais <span class="material-symbols-outlined text-[18px]">expand_more</span></button></div>`
      : "";
    const empty = items.length === 0 ? `<p class="col-span-full py-8 text-center text-body-md" style="color:${INK_SOFT}">Sem produtos nesta secção.</p>` : "";
    return `<section data-section data-edit-section="${i}" class="${i > 0 ? "mt-20" : ""}">
      <div data-edit-section-head class="flex justify-between items-end gap-3 mb-12 pb-3" style="border-bottom:1px solid ${LINE}">
        <h2 class="text-headline-md tracking-tight truncate" style="color:${INK}">${esc(sec.title)}</h2>
        ${moreRight}
      </div>
      <div data-section-grid data-edit-products class="${gridCls}">${cards}${empty}</div>
      ${moreBottom}
    </section>`;
  }).join("");
  return `<div data-edit-sections>${blocks}</div>`;
}

/* -------------------------------- Rodapé -------------------------------- */

function footerHtml(view: StoreRenderView, custom: StoreCustomization | undefined, labels: string[]): string {
  if (custom?.footer?.variant) return renderFooter(custom.footer.variant, view, custom, { container: CONTAINER, brand: BRAND });
  const about = custom?.footer?.about || "Equipamento electrónico para quem trabalha e joga a sério. Garantia, apoio e entrega em toda Angola.";
  const location = custom?.footer?.location || "Luanda, Angola";
  const phone = custom?.footer?.phone || DEFAULT_PHONE;
  const email = custom?.footer?.email || "geral@minhaloja.ao";
  return `
    <footer class="mt-20 w-full" style="background:${TONE};border-top:1px solid ${LINE}">
      <div class="${CONTAINER} py-20 flex flex-col md:flex-row justify-between gap-8">
        <div class="flex flex-col gap-3 max-w-sm">
          <div data-edit-footer-logo class="relative inline-block">${footerBrandHtml(view, custom)}</div>
          <p data-edit="footer.about" class="text-label-md leading-relaxed mt-1" style="color:${INK_SOFT}">${esc(about)}</p>
        </div>
        <div class="flex flex-col gap-3">
          <span class="text-label-sm uppercase tracking-wider mb-1" style="color:${INK}">Loja</span>
          <ul class="flex flex-col gap-3">${labels.map((l) => `<li><a href="${esc(storeHomeHref(view))}" class="tx-link text-label-md" style="color:${INK_SOFT}">${esc(l)}</a></li>`).join("")}</ul>
        </div>
        <div class="flex flex-col gap-3">
          <span class="text-label-sm uppercase tracking-wider mb-1" style="color:${INK}">Contacto</span>
          <ul class="flex flex-col gap-3 text-label-md" style="color:${INK_SOFT}">
            <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">location_on</span> <span data-edit="footer.location">${esc(location)}</span></li>
            <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">call</span> <span data-edit="footer.phone">${esc(phone)}</span></li>
            <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">mail</span> <span data-edit="footer.email">${esc(email)}</span></li>
          </ul>
        </div>
      </div>
      <div style="border-top:1px solid ${LINE}">
        <div class="${CONTAINER} py-6 text-label-sm text-center" style="color:${INK_SOFT}">
          ${esc(storeIdentifier(view) + "." + STORE_APEX)} · Loja criada com <a href="${platformHomeUrl()}" style="color:${BRAND}">MôBisno</a>
        </div>
      </div>
    </footer>`;
}

/* -------------------------------- Páginas -------------------------------- */

function render(view: StoreRenderView, custom?: StoreCustomization): string {
  const labels = menuFor(view, custom);
  const hero = custom?.hero?.variant
    ? renderHero(custom.hero.variant, view, custom, { container: CONTAINER, brand: BRAND }, "split")
    : heroHtml(view, custom);
  return `${STYLE}
  <div class="tx-root relative min-h-screen flex flex-col overflow-x-hidden">
    ${headerHtml(view, labels, custom)}
    ${hero}
    <div data-tx-slot="brands">${custom?.techEssentials?.hideBrands ? "" : brandsSection(custom)}</div>
    <main id="produtos" class="${CONTAINER} py-20 flex-grow">
      ${sectionsArea(view, custom)}
    </main>
    ${blocksHtml(custom, { container: CONTAINER, brand: BRAND, style: BLOCK_STYLE })}
    ${footerHtml(view, custom, labels)}
  </div>`;
}

/**
 * Página de produto na UI da home: galeria à esquerda, ficha à direita, chips de
 * Variação com os cantos de 4px do modelo, quantidade na moldura de 1px, e a
 * mesma grelha de cartões nos produtos relacionados.
 */
function renderProduct(view: StoreRenderView, product: StoreProductView, custom?: StoreCustomization): string {
  const labels = menuFor(view, custom);
  if (custom?.productPage?.variant) {
    return `${STYLE}<div class="tx-root min-h-screen flex flex-col overflow-x-hidden">
      ${headerHtml(view, labels, custom)}
      ${renderProductPage(custom.productPage.variant, view, product, custom, { container: CONTAINER, brand: BRAND })}
      ${footerHtml(view, custom, labels)}
    </div>`;
  }
  const phone = resolveWaPhone(custom);
  const waMsg = buildProductMessage(custom?.whatsapp?.messageTemplate, product.name, formatKz(product.price));
  const related = view.products.filter((p) => p.id !== product.id).slice(0, 4);
  const crumbCategory = product.category
    ? `<a href="${esc(categoryHref(view, product.category))}" class="hover:opacity-70">${esc(product.category)}</a>
       <span class="material-symbols-outlined text-[16px]">chevron_right</span>`
    : "";

  return `${STYLE}
  <div class="tx-root min-h-screen flex flex-col overflow-x-hidden">
    ${headerHtml(view, labels, custom)}
    <main class="${CONTAINER} py-12 md:py-20 flex-grow">
      <nav class="text-label-md mb-8 flex items-center gap-1.5 flex-wrap" style="color:${INK_SOFT}">
        <a href="${esc(storeHomeHref(view))}" class="hover:opacity-70">Início</a>
        <span class="material-symbols-outlined text-[16px]">chevron_right</span>
        ${crumbCategory}
        <span class="font-semibold truncate" style="color:${INK}">${esc(product.name)}</span>
      </nav>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 items-start">
        ${productGalleryHtml(product, custom, {
          stageClass: "aspect-[4/3] rounded-xl overflow-hidden",
          stageStyle: `background:${TONE_LOW};box-shadow:${SHADOW_2}`,
          imgClass: "w-full h-full object-cover",
          brand: BRAND,
          thumbsClass: "mt-3 grid grid-cols-5 gap-2",
        })}

        <div class="flex flex-col md:sticky md:top-28">
          ${product.featured ? `<span class="w-fit text-label-sm px-3 py-1 rounded-full mb-4" style="background:${TONE_HIGH};color:${BRAND}">Destaque</span>` : ""}
          <h1 class="text-[28px] md:text-headline-lg font-semibold tracking-tight leading-tight" style="color:${INK}">${esc(product.name)}</h1>
          <p data-product-price class="mt-3 text-display-lg" style="color:${INK}">${esc(formatKz(product.price))}</p>

          ${product.description
            ? `<p class="mt-6 text-body-md leading-relaxed whitespace-pre-line" style="color:${INK_SOFT}">${esc(product.description)}</p>`
            : `<p class="mt-6 text-body-md italic" style="color:${INK_SOFT}">Sem descrição.</p>`}

          <!-- Variações: chips de 4px e moldura de 1px, como os controlos do modelo (MODELO-GUIA §0.2) -->
          ${variationPickerHtml(product, custom, {
            labelClass: "text-label-md font-semibold",
            labelStyle: `color:${INK}`,
            valueClass: "inline-flex items-center gap-1.5 px-4 py-2.5 rounded text-label-md transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            valueStyle: `border:1px solid ${LINE};background:${CARD};color:${INK}`,
            selectedStyle: `background:${BRAND};color:${BRAND_INK};border-color:${BRAND}`,
            noteClass: "text-label-md",
            rootClass: "flex flex-col gap-4 mt-8 min-w-0",
          })}

          <div class="mt-8 flex items-center gap-4">
            <span class="text-label-md font-semibold" style="color:${INK}">Quantidade</span>
            <div class="flex items-center rounded overflow-hidden" style="border:1px solid ${LINE};background:${CARD}">
              <button type="button" data-qty-dec class="w-10 h-10 flex items-center justify-center transition-colors" style="color:${INK}"><span class="material-symbols-outlined text-[20px]">remove</span></button>
              <input data-qty type="text" inputmode="numeric" value="1" class="w-12 h-10 text-center outline-none bg-transparent" style="border-left:1px solid ${LINE};border-right:1px solid ${LINE};color:${INK}" />
              <button type="button" data-qty-inc class="w-10 h-10 flex items-center justify-center transition-colors" style="color:${INK}"><span class="material-symbols-outlined text-[20px]">add</span></button>
            </div>
          </div>

          <div class="mt-8 flex flex-col sm:flex-row gap-3">
            <button type="button" data-add-cart="${esc(product.id)}" class="flex-1 inline-flex items-center justify-center gap-2 text-label-md px-6 py-3.5 rounded transition-opacity hover:opacity-90" style="background:${BRAND};color:${BRAND_INK};box-shadow:${SHADOW_1}">
              <span class="material-symbols-outlined text-[20px]">shopping_cart</span> Adicionar ao carrinho
            </button>
            <a href="${esc(waLink(phone, waMsg))}" data-edit-whatsapp target="_blank" rel="noopener" class="tx-outline flex-1 inline-flex items-center justify-center gap-2 text-label-md px-6 py-3.5 rounded" style="border:1px solid ${OUTLINE};color:${INK}">
              <span class="material-symbols-outlined text-[20px]">chat</span> Comprar por WhatsApp
            </a>
          </div>

          <ul data-edit-perks class="mt-8 pt-6 space-y-2 text-label-md" style="color:${INK_SOFT};border-top:1px solid ${LINE}">
            ${perksItemsHtml(custom, BRAND)}
          </ul>
        </div>
      </div>

      ${related.length
        ? `<section data-related class="mt-20">
            <div class="flex justify-between items-end gap-3 mb-12 pb-3" style="border-bottom:1px solid ${LINE}">
              <h2 class="text-headline-md tracking-tight" style="color:${INK}">Também pode gostar</h2>
            </div>
            <div class="${GRID_CLS}">${related.map((p) => productCard(view, p)).join("")}</div>
          </section>`
        : ""}
    </main>
    ${footerHtml(view, custom, labels)}
  </div>`;
}

/** Página de listagem: mesma grelha, com a barra de filtros que filtra na página (§9.2). */
function renderCategory(view: StoreRenderView, category: string, custom?: StoreCustomization): string {
  const labels = menuFor(view, custom);
  const items = filterForCategoryPage(view, category);
  const cards = listingProducts(view, category);
  const grid = cards.length
    ? `<div class="${GRID_CLS}">${cards.map((p) => productCard(view, p)).join("")}</div>`
    : `<div class="py-16 text-center" style="color:${INK_SOFT}">
        <span class="material-symbols-outlined" style="font-size:48px">category</span>
        <p class="mt-2 text-body-md">Ainda não há produtos nesta categoria.</p>
       </div>`;
  const filters = categoryFilterHtml(categoryFilterLabels(view, category), category, {
    chipClass: "text-label-md px-4 py-2 rounded-full whitespace-nowrap transition-colors",
    chipStyle: `border:1px solid ${LINE};color:${INK_SOFT};background:${CARD}`,
    rootClass: "flex flex-wrap items-center gap-2 mb-12 min-w-0",
  });
  return `${STYLE}
  <div class="tx-root min-h-screen flex flex-col overflow-x-hidden">
    ${headerHtml(view, labels, custom)}
    <main class="${CONTAINER} py-12 md:py-20 flex-grow">
      <nav class="text-label-md mb-8 flex items-center gap-1.5" style="color:${INK_SOFT}">
        <a href="${esc(storeHomeHref(view))}" class="hover:opacity-70">Início</a>
        <span class="material-symbols-outlined text-[16px]">chevron_right</span>
        <span class="font-semibold" style="color:${INK}">${esc(category)}</span>
      </nav>
      <div class="flex items-end gap-3 mb-8 pb-3" style="border-bottom:1px solid ${LINE}">
        <h1 data-cat-title class="text-[28px] md:text-headline-lg font-semibold tracking-tight" style="color:${INK}">${esc(category)}</h1>
        <span data-cat-count class="text-label-md" style="color:${INK_SOFT}">${items.length} produto(s)</span>
      </div>
      ${filters}
      ${grid}
    </main>
    ${footerHtml(view, custom, labels)}
  </div>`;
}

/** Checkout dentro do cromo do modelo, para o carrinho não «mudar de cara». */
function renderCheckout(view: StoreRenderView, innerHtml: string, custom?: StoreCustomization): string {
  const labels = menuFor(view, custom);
  return `${STYLE}
  <div class="tx-root min-h-screen flex flex-col overflow-x-hidden">
    ${headerHtml(view, labels, custom)}
    <main class="${CONTAINER} py-12 md:py-20 flex-grow">${innerHtml}</main>
    ${footerHtml(view, custom, labels)}
  </div>`;
}

export const techEssentialsTemplate: StoreTemplate = {
  id: "tech-essentials",
  name: "Tech Essentials",
  previewUrl: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=600",
  ready: true,
  defaultBrand: ACTION,
  /**
   * Este modelo não traz testemunhos nem mapa próprios, por isso aceita as
   * quatro secções acrescentáveis (`MODELO-GUIA.md` §9.3). As variantes são as
   * que assentam na composição da home: fotografia ao lado do texto, título
   * centrado no espaço branco, testemunhos em cartões de nível 1, e o mapa no
   * cartão de texto mais mapa.
   *
   * Fundos: as faixas tonais azul-gelo e azul claro do próprio modelo e o
   * cinzento neutro da faixa de marcas — nunca o creme de outro modelo, que era
   * o que o editor lhe dava quando a lista vivia lá.
   *
   * `materialize` prepara a faixa de marcas (sempre quatro) para edição.
   */
  sections: {
    variants: { info: "lado", text: "centrado", testimonials: "cards", location: "cartao" },
    style: BLOCK_STYLE,
    backgrounds: [
      { label: "Azul-gelo", value: TONE_LOW },
      { label: "Azul claro", value: TONE },
      { label: "Cinzento", value: GREY_BAND },
    ],
    materialize: materializeBrands,
  },
  render,
  renderProduct,
  renderCategory,
  renderCheckout,
};
