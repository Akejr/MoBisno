/**
 * Modelo partilhado de "secções de produtos" da página inicial.
 *
 * Cada secção mostra uma categoria. Tokens especiais:
 *  - "__all__"      → todos os produtos (rótulo "Produtos")
 *  - "__featured__" → produtos destacados (rótulo "Destaques")
 * Caso contrário, o token é o nome de uma categoria real.
 */
import type { StoreRenderView, StoreProductView } from "../../src/storefront/storeRenderer.js";
import type { StoreCustomization } from "./types.js";
import { storeBasePath } from "../lib/routing.js";
import { categorySlug } from "../lib/slug.js";

export const SEC_ALL = "__all__";
export const SEC_FEATURED = "__featured__";
export const FEATURED_LABEL = "Destaques";
export const ALL_LABEL = "Produtos";

/** Rótulo amigável de um token de secção (para o seletor do editor). */
export function sectionLabel(token: string): string {
  if (token === SEC_ALL) return "Todos os produtos";
  if (token === SEC_FEATURED) return FEATURED_LABEL;
  return token;
}

export interface RenderSection {
  /** Token da secção (categoria ou especial). */
  token: string;
  /** Título a apresentar. */
  title: string;
  /** Produtos da secção. */
  products: StoreProductView[];
  /** Link para a página com todos os produtos desta secção. */
  moreHref: string;
}

function identifier(view: StoreRenderView): string {
  return view.subdomain.split(".")[0] ?? view.subdomain;
}
/** Caminho REAL (nunca `#`) da página de uma categoria — indexável pelo Google. */
function catHref(view: StoreRenderView, label: string): string {
  return `${storeBasePath(identifier(view))}/categoria/${categorySlug(label)}`;
}

/** Link para a página com TODOS os produtos (rótulo "Produtos"). */
export function allProductsHref(view: StoreRenderView): string {
  return catHref(view, ALL_LABEL);
}

/** Resolve as secções configuradas para produtos concretos. */
export function resolveSections(view: StoreRenderView, custom?: StoreCustomization): RenderSection[] {
  const list = custom?.sections && custom.sections.length ? custom.sections : [{ category: SEC_ALL }];
  return list.map((s) => {
    if (s.category === SEC_FEATURED) {
      return { token: SEC_FEATURED, title: FEATURED_LABEL, products: view.products.filter((p) => p.featured), moreHref: catHref(view, FEATURED_LABEL) };
    }
    if (!s.category || s.category === SEC_ALL) {
      return { token: SEC_ALL, title: ALL_LABEL, products: [...view.products], moreHref: catHref(view, "Todos") };
    }
    return { token: s.category, title: s.category, products: view.products.filter((p) => (p.category ?? "") === s.category), moreHref: catHref(view, s.category) };
  });
}

/** Filtra os produtos para a página de categoria (aceita "Destaques" e "Todos"/"Produtos"). */
export function filterForCategoryPage(view: StoreRenderView, label: string): StoreProductView[] {
  if (label === FEATURED_LABEL) return view.products.filter((p) => p.featured);
  if (label === "Todos" || label === ALL_LABEL) return [...view.products];
  return view.products.filter((p) => (p.category ?? "") === label);
}

/** Categorias para o dropdown do cabeçalho (inclui "Destaques" se houver destacados). */
export function headerCategories(view: StoreRenderView): string[] {
  const cats = [...new Set(view.products.map((p) => p.category).filter((c): c is string => !!c))];
  return view.products.some((p) => p.featured) ? [FEATURED_LABEL, ...cats] : cats;
}

/**
 * Produtos a desenhar na grelha da página de listagem.
 *
 * A grelha leva **todos** os produtos da loja, não só os da categoria pedida,
 * porque é isso que permite à barra de filtros trocar de categoria sem navegar
 * nem voltar ao servidor: `web/views/category.ts` esconde os que não pertencem à
 * categoria activa logo à entrada. Só a listagem "Destaques" continua a desenhar
 * o seu próprio conjunto — «destacado» não é uma categoria, não se resolve pelo
 * atributo `data-product-category` dos cartões.
 *
 * Com a categoria vazia (um endereço que já não corresponde a categoria alguma)
 * devolve lista vazia, para o modelo mostrar o mesmo aviso de sempre.
 */
export function listingProducts(view: StoreRenderView, category: string): StoreProductView[] {
  if (filterForCategoryPage(view, category).length === 0) return [];
  if (category === FEATURED_LABEL) return view.products.filter((p) => p.featured);
  return [...view.products];
}

/**
 * Rótulos da barra de filtros da listagem: o rótulo de todos os produtos seguido
 * das categorias que **têm** produtos (uma categoria vazia daria um chip que não
 * mostra nada).
 *
 * Devolve lista vazia — logo, barra nenhuma — quando não há cartões no ecrã para
 * filtrar, e na listagem "Destaques", que desenha só os destacados: filtrar por
 * categoria ali daria uma contagem que não corresponde à da categoria.
 */
export function categoryFilterLabels(view: StoreRenderView, active: string): string[] {
  if (active === FEATURED_LABEL || listingProducts(view, active).length === 0) return [];
  const cats = headerCategories(view).filter(
    (c) => c !== FEATURED_LABEL && filterForCategoryPage(view, c).length > 0,
  );
  return [ALL_LABEL, ...cats];
}
