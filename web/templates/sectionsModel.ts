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
function catHref(view: StoreRenderView, label: string): string {
  return `#/loja/${encodeURIComponent(identifier(view))}/categoria/${encodeURIComponent(label)}`;
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

/** Filtra os produtos para a página de categoria (aceita "Destaques" e "Todos"). */
export function filterForCategoryPage(view: StoreRenderView, label: string): StoreProductView[] {
  if (label === FEATURED_LABEL) return view.products.filter((p) => p.featured);
  if (label === "Todos") return [...view.products];
  return view.products.filter((p) => (p.category ?? "") === label);
}

/** Categorias para o dropdown do cabeçalho (inclui "Destaques" se houver destacados). */
export function headerCategories(view: StoreRenderView): string[] {
  const cats = [...new Set(view.products.map((p) => p.category).filter((c): c is string => !!c))];
  return view.products.some((p) => p.featured) ? [FEATURED_LABEL, ...cats] : cats;
}
