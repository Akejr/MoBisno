/**
 * HTML das páginas públicas de uma loja — **uma só definição**, usada pelas
 * vistas da SPA (`storefront.ts`, `product.ts`, `category.ts`) e pela
 * pré-renderização no servidor (`web/ssr/entry.ts` → `api/_ssr/render.mjs`).
 *
 * ## Porque é que isto existe
 *
 * O servidor servia uma versão simplificada da loja (o bloco `.mb-ssr` de
 * `api/_seo.js`) e a SPA substituía-a, ao arrancar, pelo modelo verdadeiro: o
 * visitante via primeiro uma página «feia» e depois a loja. Agora o servidor
 * desenha o MESMO HTML que a SPA desenharia, e a SPA, ao ver que é igual
 * (impressão digital em `#app[data-ssr]`, comparada em `render()` de
 * `web/lib/dom.ts`), adota o DOM que já está no ecrã em vez de o reescrever.
 *
 * Para os dois lados não divergirem, tudo o que decide o HTML vive aqui: que
 * produto abre, que categoria resolve, e os passos que as vistas faziam ao DOM
 * **depois** de desenhar e cujo resultado se vê no primeiro ecrã (o seletor de
 * ordenação da listagem, os botões de um produto esgotado). Uma vista que
 * mudasse o HTML por conta própria quebrava a adoção — e o defeito voltava.
 *
 * Regras deste módulo: funções puras, sem DOM e sem rede. Lê `location` apenas
 * através dos ajudantes de `web/lib/routing.ts`, que o servidor substitui por um
 * `location` construído a partir do pedido.
 */
import { esc } from "../lib/dom.js";
import { storeHomePath } from "../lib/routing.js";
import { brandOf, readableInk } from "../lib/brand.js";
import { shippingFromCustom } from "../lib/seo.js";
import { productSlugPath, resolveCategoryLabel } from "../lib/slug.js";
import { getTemplate } from "../templates/registry.js";
import { headerCategories, filterForCategoryPage, ALL_LABEL, FEATURED_LABEL } from "../templates/sectionsModel.js";
import type { StoreRenderView, StoreProductView, StoreCustomization } from "../templates/types.js";
import type { Store } from "../../src/models/index.js";
import type { StoreSeoFacts } from "../../src/services/seo.js";
import { digitalPaymentsVisible } from "../../src/services/paymentVisibility.js";
import { scanHtml, applyEdits, type HtmlEdit, type ScanElement } from "../ssr/htmlScan.js";

/** Rótulo da faixa das páginas de uma loja por publicar, vistas pelo próprio Dono. */
export const STORE_DRAFT_LABEL = "Pré-visualização — esta loja ainda não está publicada";

/**
 * O que é verdade nesta loja, para as descrições geradas (`StoreSeoFacts`):
 * categorias, alguns produtos, se há entregas configuradas e se os pagamentos
 * digitais aparecem (`digitalPaymentsVisible` — a única decisão). O servidor
 * calcula os mesmos factos a partir das mesmas linhas (`api/prerender.js`).
 */
export function storeSeoFacts(view: StoreRenderView, custom: StoreCustomization, store: Store): StoreSeoFacts {
  return {
    categories: headerCategories(view).filter((c) => c !== FEATURED_LABEL),
    productNames: view.products.map((p) => p.name),
    delivery: shippingFromCustom(custom) !== null,
    digitalPayments: digitalPaymentsVisible(store),
  };
}

/* --------------------------------- Marca --------------------------------- */

/**
 * Cor de marca e cor de texto legível sobre ela — as duas variáveis que as
 * vistas escrevem em `#app` (`--brand`, `--brand-ink`) e que o servidor escreve
 * no HTML, para o primeiro ecrã já ter as cores da loja.
 */
export function storeBrand(view: StoreRenderView, custom: StoreCustomization): { brand: string; ink: string } {
  const brand = brandOf(custom, view.templateId);
  return { brand, ink: readableInk(brand) };
}

/* ------------------------------ Página inicial ----------------------------- */

/** HTML da página inicial da loja. */
export function storeHomeHtml(view: StoreRenderView, custom: StoreCustomization): string {
  return getTemplate(view.templateId).render(view, custom);
}

/* --------------------------------- Produto -------------------------------- */

/**
 * Produto pedido no endereço: o caminho amigável `<categoria>/<nome>` ou, por
 * retrocompatibilidade, o `id`.
 */
export function findProduct(view: StoreRenderView, slugOrId: string): StoreProductView | null {
  const wanted = slugOrId.replace(/^\/+|\/+$/g, "").toLowerCase();
  return view.products.find((p) => productSlugPath(p).toLowerCase() === wanted)
    ?? view.products.find((p) => p.id === slugOrId)
    ?? null;
}

/** Conteúdo dos botões de compra de um produto esgotado. */
const SOLD_OUT_LABEL_HTML = `<span class="material-symbols-outlined text-[20px]">block</span> Esgotado`;

/** Estilo dos botões de compra de um produto esgotado. */
const SOLD_OUT_STYLE = "opacity:0.55;pointer-events:none;cursor:not-allowed";

/**
 * Botões de compra («Adicionar ao carrinho» e WhatsApp) de um produto esgotado:
 * desativados e com «Esgotado».
 *
 * Era a vista que o fazia, ao DOM, depois de desenhar — e por isso o primeiro
 * ecrã (e quem lê a página sem JavaScript) via «Adicionar ao carrinho» num
 * produto que não se pode comprar.
 */
function withSoldOutCtas(html: string): string {
  const edits: HtmlEdit[] = [];
  const isCta = (el: ScanElement): boolean => el.attrs.has("data-add-cart") || el.attrs.has("data-edit-whatsapp");
  scanHtml(html, {
    onClose(el, closeStart) {
      if (!isCta(el)) return;
      const style = el.attrSpans.get("style");
      if (style) {
        const current = el.attrs.get("style") ?? "";
        const sep = current.trim() === "" || current.trim().endsWith(";") ? "" : ";";
        edits.push({ from: style.valueStart, to: style.valueEnd, text: `${current}${sep}${SOLD_OUT_STYLE}` });
      }
      const extra = `${el.attrs.has("disabled") ? "" : ' disabled="true"'} aria-disabled="true"${style ? "" : ` style="${SOLD_OUT_STYLE}"`}`;
      edits.push({ from: el.insertAt, to: el.insertAt, text: extra });
      if (closeStart > el.openEnd) edits.push({ from: el.openEnd, to: closeStart, text: SOLD_OUT_LABEL_HTML });
    },
  });
  return applyEdits(html, edits);
}

/** HTML da página de um produto. */
export function productPageHtml(
  view: StoreRenderView,
  product: StoreProductView,
  custom: StoreCustomization,
  identifier: string,
): string {
  const template = getTemplate(view.templateId);
  const html = template.renderProduct
    ? template.renderProduct(view, product, custom)
    : `<div class="min-h-screen"><a href="${esc(storeHomePath(identifier))}">Voltar</a><h1>${esc(product.name)}</h1></div>`;
  return product.stock === 0 ? withSoldOutCtas(html) : html;
}

/**
 * Produto inexistente numa loja que existe. Distinto da
 * Pagina_Loja_Nao_Encontrada: aqui a loja abre, por isso a ligação volta à loja
 * — com caminho real, sem fragmento `#` (`SEO.md` §5.1).
 */
export function productNotFoundHtml(identifier: string): string {
  return `
  <div class="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
    <span class="material-symbols-outlined text-on-surface-variant" style="font-size:64px;" aria-hidden="true">production_quantity_limits</span>
    <h1 class="text-headline-lg text-on-surface">Produto não encontrado</h1>
    <a href="${esc(storeHomePath(identifier))}" class="bg-primary text-on-primary px-6 py-3 rounded-full mt-2">Voltar à loja</a>
  </div>`;
}

/* -------------------------------- Categoria -------------------------------- */

/** Um rótulo que significa «todos os produtos» (o do menu ou o das ligações antigas). */
export function isAllListingLabel(label: string): boolean {
  return label === ALL_LABEL || label === "Todos";
}

/**
 * Rótulo do endereço canónico de uma listagem. `/categoria/todos` (ligações
 * «Ver todos» das secções) e `/categoria/produtos` são a mesma página: o
 * canónico é sempre o segundo, o que o `sitemap.xml` anuncia.
 */
export function categoryCanonicalLabel(label: string): string {
  return isAllListingLabel(label) ? ALL_LABEL : label;
}

/** Categoria pedida no endereço, resolvida para o rótulo real da loja. */
export interface ResolvedCategory {
  /** Rótulo a desenhar (o próprio endereço quando não corresponde a nada). */
  label: string;
  /** O endereço corresponde a uma listagem que existe. */
  known: boolean;
  /** A listagem tem produtos — só então é indexável. */
  hasItems: boolean;
}

/**
 * Resolve o slug (ou o rótulo antigo, percent-encoded) da URL para o rótulo
 * real. Inclui os rótulos especiais («Produtos», «Destaques», «Todos»), para que
 * `/categoria/produtos`, `/categoria/destaques` e `/categoria/todos` resolvam.
 */
export function resolveCategory(view: StoreRenderView, slugOrLabel: string): ResolvedCategory {
  const known = [ALL_LABEL, FEATURED_LABEL, "Todos", ...headerCategories(view)];
  const label = resolveCategoryLabel(slugOrLabel, known);
  if (label === null) return { label: slugOrLabel, known: false, hasItems: false };
  return { label, known: true, hasItems: filterForCategoryPage(view, label).length > 0 };
}

/** Seletor de ordenação da listagem (os quatro modos que a vista sabe aplicar). */
const SORT_SELECT = `<select data-listing-sort aria-label="Ordenar produtos" class="text-sm rounded-full pl-4 pr-9 py-2 appearance-none cursor-pointer outline-none" style="border:1px solid rgba(128,128,128,.32);background:transparent;color:inherit">
      <option value="rel">Ordenar: Relevância</option>
      <option value="preco-asc">Preço: mais baixo</option>
      <option value="preco-desc">Preço: mais alto</option>
      <option value="nome">Nome (A–Z)</option>
    </select>
    <span class="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[18px]" style="opacity:.6" aria-hidden="true">expand_more</span>`;

/**
 * Acrescenta o seletor de ordenação à listagem, no sítio onde a vista o punha:
 * dentro da barra de filtros do modelo (à direita), ou numa linha própria acima
 * da grelha quando não há barra. Sem pelo menos dois cartões não há nada a
 * ordenar e o HTML sai igual.
 *
 * Fazia-o a vista, ao DOM, depois de desenhar: o seletor aparecia a meio do
 * arranque e empurrava a grelha para baixo.
 */
export function withListingSort(html: string): string {
  const found: { cards: number; gridStart: number; bar: ScanElement | null; barClose: number } = {
    cards: 0, gridStart: -1, bar: null, barClose: -1,
  };
  scanHtml(html, {
    onOpen(el, stack) {
      if (el.attrs.has("data-edit-product")) {
        found.cards += 1;
        if (found.cards === 1) found.gridStart = stack.length ? stack[stack.length - 1]!.start : -1;
      }
      if (!found.bar && el.attrs.has("data-cat-filter-bar")) found.bar = el;
    },
    onClose(el, closeStart) {
      if (el === found.bar && found.barClose === -1) found.barClose = closeStart;
    },
  });
  if (found.cards < 2) return html;
  if (found.bar && found.barClose !== -1) {
    const at = found.barClose;
    return applyEdits(html, [{ from: at, to: at, text: `<div class="ml-auto relative" data-listing-sort-box>${SORT_SELECT}</div>` }]);
  }
  if (found.gridStart === -1) return html;
  const at = found.gridStart;
  return applyEdits(html, [{ from: at, to: at, text: `<div class="flex justify-end mb-6" data-listing-sort-box><div class="relative">${SORT_SELECT}</div></div>` }]);
}

/** HTML da página de uma listagem (categoria, «Destaques» ou todos os produtos). */
export function categoryPageHtml(view: StoreRenderView, label: string, custom: StoreCustomization): string {
  const template = getTemplate(view.templateId);
  const html = template.renderCategory
    ? template.renderCategory(view, label, custom)
    : template.render(view, custom);
  return withListingSort(html);
}
