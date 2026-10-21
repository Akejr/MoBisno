/**
 * Ponto de entrada da pré-renderização **com os modelos verdadeiros**.
 *
 * Empacotado por `scripts/build-ssr.mjs` (esbuild, Node 18, ESM) para
 * `api/_ssr/render.mjs`, que `api/prerender.js` importa. Produz, para cada
 * página, **exatamente** o HTML que a SPA produziria no navegador — a mesma
 * função (`web/views/storeHtml.ts`, `web/views/landingHtml.ts`) sobre os mesmos
 * dados (`storefrontFromRows`). A SPA compara a impressão digital (`fnv1a`) e,
 * sendo igual, adota a página que já está no ecrã: acabou a «versão feia»
 * seguida da loja.
 *
 * ## Regras do pacote
 *
 * - Nada de DOM nem de rede ao importar. O pacote não pode puxar o cliente
 *   Supabase (`web/supabase/client.ts`) nem `import.meta.env` — o script de
 *   construção recusa-os.
 * - Os modelos leem `location` através dos ajudantes de `web/lib/routing.ts`
 *   (`storeBasePath`, `storeHomePath`, `platformHomeUrl`…). Cada render define
 *   um `location` construído a partir do pedido **imediatamente antes** e
 *   repõe o anterior logo a seguir. O render é síncrono, por isso dois pedidos
 *   em simultâneo na mesma instância nunca se cruzam.
 * - Determinista: o mesmo pedido dá sempre o mesmo HTML (sem datas nem ids
 *   aleatórios nos modelos — `tests/ssrRender.test.ts` verifica-o).
 */
import { fnv1a } from "./hash.js";
import { storefrontFromRows, type StorefrontRows } from "./storefrontRows.js";
import { storeLook, lookAppAttrs, lookHeadHtml, categoryHideStyle, withGlobal } from "./look.js";
import { markIconTextButtonsHtml } from "./iconText.js";
import {
  storeHomeHtml, findProduct, productPageHtml, resolveCategory, categoryPageHtml, categoryCanonicalLabel,
  isAllListingLabel,
} from "../views/storeHtml.js";
import { landingHtml } from "../views/landingHtml.js";
import { productSlugPath, categorySlug } from "../lib/slug.js";
import { filterForCategoryPage } from "../templates/sectionsModel.js";
import { platformFaq } from "../../src/services/seo.js";
import type { StoreRenderView, StoreCustomization } from "../templates/types.js";

export { fnv1a, platformFaq };

/** O pedido, tal como o navegador o vê: é daqui que sai o `location`. */
export interface SsrRequest {
  /** Cabeçalho `Host` (ex.: `ekolosports.sualoja.digital`, `www.mobisno.store`). */
  host: string;
  /** Caminho completo do pedido, sem query (ex.: `/loja/ekolo/produto/x/y`). */
  path: string;
  /** Query com `?`, ou vazia. */
  search?: string;
}

/** Uma página pronta a injetar em `#app`. */
export interface SsrPage {
  /** HTML a pôr dentro de `#app` (o do modelo, com as marcas do primeiro ecrã). */
  html: string;
  /** Impressão digital do HTML do modelo — o que a SPA passa a `render()`. */
  hash: string;
  /** Atributos a acrescentar ao `<div id="app">` (com espaço à frente). */
  appAttrs: string;
  /** Folhas de estilo para o `<head>`. */
  headHtml: string;
}

/** Resultado de uma página de loja. */
export type SsrStoreResult =
  | ({ kind: "home" } & SsrPage)
  | ({ kind: "product"; productId: string; canonicalPath: string } & SsrPage)
  | ({
    kind: "category";
    /** Rótulo resolvido (o que a SPA desenha). */
    label: string;
    /** Caminho canónico (`/categoria/produtos` para «Todos»). */
    canonicalPath: string;
    /** Produtos da listagem, pela ordem da página. */
    itemIds: string[];
    /** Tem produtos — só então é indexável. */
    indexable: boolean;
  } & SsrPage)
  | { kind: "product_not_found" }
  | { kind: "category_not_found" };

/** `location` mínimo, com tudo o que os ajudantes de `routing.ts` leem. */
function locationFor(req: SsrRequest): Record<string, unknown> {
  const host = String(req.host || "").trim();
  const hostname = host.toLowerCase().split(":")[0] ?? "";
  const port = host.includes(":") ? host.split(":")[1] ?? "" : "";
  const pathname = req.path && req.path.startsWith("/") ? req.path : `/${req.path ?? ""}`;
  const search = req.search && req.search !== "?" ? req.search : "";
  const origin = `https://${host}`;
  const href = `${origin}${pathname}${search}`;
  return {
    protocol: "https:", host, hostname, port, origin, pathname, search, hash: "", href,
    toString: () => href,
    assign: () => undefined, replace: () => undefined, reload: () => undefined,
  };
}

/** Corre `fn` com o `location` do pedido e repõe o anterior. */
function withLocation<T>(req: SsrRequest, fn: () => T): T {
  return withGlobal("location", locationFor(req), fn);
}

/** `decodeURIComponent` que não lança (a SPA também não chegaria a desenhar). */
function safeDecode(v: string): string {
  try { return decodeURIComponent(v); } catch { return v; }
}

/** Página de loja: HTML do modelo + aspeto de `#app` + folhas do `<head>`. */
function storePage(html: string, view: StoreRenderView, custom: StoreCustomization, hideExcept?: string): SsrPage {
  const look = storeLook(view, custom);
  const styles = [...look.styles];
  if (hideExcept !== undefined) styles.push(categoryHideStyle(hideExcept));
  return {
    html: look.markIconTextButtons ? markIconTextButtonsHtml(html) : html,
    hash: fnv1a(html),
    appAttrs: lookAppAttrs(look),
    headHtml: lookHeadHtml(styles),
  };
}

/**
 * Desenha uma página pública de loja (início, produto ou listagem).
 *
 * `rest` é o caminho dentro da loja (`/`, `/produto/…`, `/categoria/…`),
 * resolvido com as mesmas regras do router da SPA (`web/main.ts`). Devolve
 * `null` quando as linhas não chegam para desenhar a loja — quem chama usa então
 * a versão simplificada.
 */
export function renderStorePage(
  req: SsrRequest & { identifier: string; rest: string; rows: StorefrontRows },
): SsrStoreResult | null {
  return withLocation(req, () => {
    const loaded = storefrontFromRows(req.rows);
    if (!loaded || loaded.view.kind !== "render") return null;
    const { view, custom } = loaded;

    const prod = /^\/produto\/(.+)$/.exec(req.rest);
    if (prod) {
      const product = findProduct(view, safeDecode(prod[1]!));
      if (!product) return { kind: "product_not_found" };
      const html = productPageHtml(view, product, custom, req.identifier);
      return {
        kind: "product",
        productId: product.id,
        canonicalPath: `/produto/${productSlugPath(product)}`,
        ...storePage(html, view, custom),
      };
    }

    const cat = /^\/categoria\/(.+)$/.exec(req.rest);
    if (cat) {
      const resolved = resolveCategory(view, safeDecode(cat[1]!));
      if (!resolved.known) return { kind: "category_not_found" };
      const html = categoryPageHtml(view, resolved.label, custom);
      // Só há filtro à entrada quando a barra existe — e «todos» não esconde nada.
      const hide = html.includes("data-cat-filter-bar") && !isAllListingLabel(resolved.label)
        ? resolved.label
        : undefined;
      return {
        kind: "category",
        label: resolved.label,
        canonicalPath: `/categoria/${categorySlug(categoryCanonicalLabel(resolved.label))}`,
        itemIds: filterForCategoryPage(view, resolved.label).map((p) => p.id),
        indexable: resolved.hasItems,
        ...storePage(html, view, custom, hide),
      };
    }

    return { kind: "home", ...storePage(storeHomeHtml(view, custom), view, custom) };
  });
}

/** Desenha a página inicial da plataforma (a versão de visitante sem sessão). */
export function renderLandingPage(req: SsrRequest): SsrPage {
  return withLocation(req, () => {
    const html = landingHtml();
    return { html, hash: fnv1a(html), appAttrs: "", headHtml: "" };
  });
}
