/**
 * Renderizador da Loja Publicada (StorefrontRenderer) — ver design.md →
 * "Components and Interfaces → 7. Middleware de Subdomínio + Renderizador de
 * Loja (StorefrontRenderer)" e "Plano de Loja Publicada".
 *
 * Este módulo converte o resultado de resolução de storefront
 * ({@link StorefrontResult}, produzido pelo `StorefrontResolver`) num
 * **view model** estruturado, determinístico e independente de qualquer
 * framework de UI. A camada de apresentação (web/DOM/SSR) pode consumir este
 * view model para produzir o HTML final, mas o renderizador em si não depende
 * de nenhuma tecnologia de UI, o que o torna trivialmente testável.
 *
 * Responsabilidades (Requisitos cobertos):
 *  - Para `not_found`, produzir um view model de "Loja não encontrada" em
 *    português, sem expor quaisquer dados de Lojas (alinhado com Req. 9.3–9.5,
 *    cuja decisão foi tomada a montante pelo resolvedor).
 *  - Para `render`, produzir o cabeçalho e os menus a apresentar o Logótipo
 *    quando este existe (Req. 6.5, 6.6) ou a identidade visual de substituição
 *    predefinida quando o Logótipo é `null` (Req. 6.7).
 *  - Incluir os Banners pela ordem de adição (Req. 8.5), os Produtos
 *    disponíveis e a referência ao Modelo/Template associado (Req. 9.1).
 *
 * O renderizador é uma função pura: para o mesmo `StorefrontResult` produz
 * sempre o mesmo view model (Req. 6.8 — a propagação do novo Logótipo resulta
 * naturalmente de o resolvedor fornecer o Asset atualizado, refletido aqui de
 * forma determinística).
 */

import type { ImageFormat } from "../models/index.js";
import type { StorefrontResult } from "../services/storefrontResolver.js";

/**
 * Mensagem apresentada quando a Loja não pode ser resolvida (formato inválido,
 * inexistente ou não publicada). Em português (Req. 10.3 / 9.3).
 */
export const STORE_NOT_FOUND_MESSAGE = "Loja não encontrada";

/**
 * Identidade visual de substituição **predefinida**, usada no cabeçalho e nos
 * menus quando a Loja não tem Logótipo definido (Requisito 6.7).
 *
 * É uma marca textual neutra, com cores predefinidas, que garante uma
 * apresentação coerente da Loja mesmo na ausência de Logótipo.
 */
export interface FallbackVisualIdentity {
  /** Discriminador do tipo de marca. */
  readonly kind: "fallback";
  /** Texto/etiqueta apresentado na identidade de substituição. */
  readonly label: string;
  /** Cor de fundo (hex) da identidade de substituição. */
  readonly backgroundColor: string;
  /** Cor do texto (hex) da identidade de substituição. */
  readonly textColor: string;
}

/**
 * Constante exportada com a identidade visual de substituição predefinida
 * (Requisito 6.7). É imutável e partilhável entre cabeçalho e menus.
 */
export const DEFAULT_LOGO: FallbackVisualIdentity = Object.freeze({
  kind: "fallback",
  label: "MôBisno",
  backgroundColor: "#1f2937",
  textColor: "#ffffff",
});

/**
 * Marca apresentada no cabeçalho e nos menus. Quando existe Logótipo, usa o
 * Asset (Req. 6.5/6.6); caso contrário, usa a identidade de substituição
 * predefinida (Req. 6.7).
 */
export type StoreBrandMark =
  | {
      /** Há Logótipo definido para a Loja. */
      readonly kind: "logo";
      /** URL do Logótipo (Asset). */
      readonly url: string;
      /** Formato de imagem do Logótipo. */
      readonly format: ImageFormat;
      /** Texto alternativo acessível para o Logótipo. */
      readonly alt: string;
    }
  | {
      /** Não há Logótipo: usa a identidade visual de substituição. */
      readonly kind: "fallback";
      /** Identidade visual de substituição predefinida ({@link DEFAULT_LOGO}). */
      readonly identity: FallbackVisualIdentity;
      /** Texto alternativo acessível para a marca de substituição. */
      readonly alt: string;
    };

/** Cabeçalho da Loja publicada, com a marca (Logótipo ou substituição). */
export interface StoreHeaderView {
  /** Marca apresentada no cabeçalho (Req. 6.5/6.7). */
  readonly brand: StoreBrandMark;
  /** Nome da Loja apresentado no cabeçalho. */
  readonly storeName: string;
}

/** Item de navegação do menu da Loja publicada. */
export interface StoreMenuItemView {
  /** Rótulo do item, em português. */
  readonly label: string;
}

/** Menu da Loja publicada, com a marca (Logótipo ou substituição). */
export interface StoreMenuView {
  /** Marca apresentada nos menus (Req. 6.6/6.7). */
  readonly brand: StoreBrandMark;
  /** Itens de navegação do menu. */
  readonly items: readonly StoreMenuItemView[];
}

/** Banner a apresentar na Loja publicada (ordem de adição — Req. 8.5). */
export interface StoreBannerView {
  readonly id: string;
  readonly imageUrl: string;
  /** Posição de ordenação (crescente = ordem de adição). */
  readonly position: number;
}

/** Produto disponível a apresentar na Loja publicada. */
export interface StoreProductView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Categoria do Produto, ou `null` se não tiver. */
  readonly category: string | null;
  /** Produto destacado (categoria "Destaques"). */
  readonly featured: boolean;
  /** Produto físico (precisa de entrega/morada). */
  readonly physical: boolean;
  readonly price: number;
  /** URL da imagem do Produto, ou `null` se não existir. */
  readonly imageUrl: string | null;
  /** Stock disponível (`null` = não controlado; `0` = esgotado). */
  readonly stock: number | null;
}

/** View model de uma Loja resolvida e renderizável (Req. 9.1). */
export interface StoreRenderView {
  readonly kind: "render";
  /** Referência ao Modelo/Template associado à Loja (Req. 9.1). */
  readonly templateId: string;
  /** Nome da Loja. */
  readonly storeName: string;
  /** Subdomínio da Loja (`identifier.mobisno.com`). */
  readonly subdomain: string;
  /** Cabeçalho com a marca (Logótipo ou substituição). */
  readonly header: StoreHeaderView;
  /** Menu com a marca (Logótipo ou substituição). */
  readonly menu: StoreMenuView;
  /** Banners pela ordem de adição (Req. 8.5). */
  readonly banners: readonly StoreBannerView[];
  /** Produtos disponíveis (Req. 9.1). */
  readonly products: readonly StoreProductView[];
}

/** View model apresentado quando a Loja não é encontrada (Req. 9.3–9.5). */
export interface StoreNotFoundView {
  readonly kind: "not_found";
  /** Mensagem em português ("Loja não encontrada"). */
  readonly message: string;
}

/** View model produzido por {@link renderStore}. */
export type StoreViewModel = StoreRenderView | StoreNotFoundView;

/**
 * Itens de menu predefinidos da Loja publicada, em português. Mantidos
 * estáticos e determinísticos para esta fase (Modelos não editáveis).
 */
const DEFAULT_MENU_ITEMS: readonly StoreMenuItemView[] = Object.freeze([
  Object.freeze({ label: "Início" }),
  Object.freeze({ label: "Produtos" }),
]);

/**
 * Constrói a marca (Logótipo ou identidade de substituição) a apresentar no
 * cabeçalho e nos menus.
 *
 * - Com Logótipo definido (`logo !== null`): usa o Asset (Req. 6.5/6.6).
 * - Sem Logótipo (`logo === null`): usa a identidade visual de substituição
 *   predefinida {@link DEFAULT_LOGO} (Req. 6.7).
 */
function buildBrandMark(
  storeName: string,
  logo: Extract<StorefrontResult, { kind: "render" }>["logo"],
): StoreBrandMark {
  if (logo !== null) {
    return {
      kind: "logo",
      url: logo.url,
      format: logo.format,
      alt: `Logótipo de ${storeName}`,
    };
  }
  return {
    kind: "fallback",
    identity: DEFAULT_LOGO,
    alt: storeName,
  };
}

/**
 * Renderiza o view model da Loja publicada a partir do resultado de resolução
 * de storefront.
 *
 * @param result Resultado produzido pelo `StorefrontResolver`.
 * @returns Um {@link StoreViewModel} determinístico: `not_found` para Lojas
 *   não resolvíveis, ou `render` com cabeçalho, menus, banners (por ordem de
 *   adição), produtos disponíveis e a referência ao Modelo.
 */
export function renderStore(result: StorefrontResult): StoreViewModel {
  if (result.kind === "not_found") {
    return { kind: "not_found", message: STORE_NOT_FOUND_MESSAGE };
  }

  const { store, logo, banners, products } = result;

  // A mesma marca é usada no cabeçalho e nos menus (Req. 6.5/6.6/6.7).
  const brand = buildBrandMark(store.name, logo);

  const header: StoreHeaderView = {
    brand,
    storeName: store.name,
  };

  const menu: StoreMenuView = {
    brand,
    items: DEFAULT_MENU_ITEMS,
  };

  // Banners pela ordem de adição (posição crescente) — Req. 8.5. Ordena de
  // forma estável e não-destrutiva (não muta o array de entrada).
  const orderedBanners: StoreBannerView[] = [...banners]
    .sort((a, b) => a.position - b.position)
    .map((banner) => ({
      id: banner.id,
      imageUrl: banner.imageUrl,
      position: banner.position,
    }));

  // Produtos disponíveis (o resolvedor já filtra por disponibilidade) — Req. 9.1.
  const productViews: StoreProductView[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category ?? null,
    featured: product.featured === true,
    physical: product.physical !== false,
    price: product.price,
    imageUrl: product.imageUrl ?? null,
    stock: product.stock ?? null,
  }));

  return {
    kind: "render",
    templateId: store.templateId,
    storeName: store.name,
    subdomain: store.subdomain,
    header,
    menu,
    banners: orderedBanners,
    products: productViews,
  };
}
