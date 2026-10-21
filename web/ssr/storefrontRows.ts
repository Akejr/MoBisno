/**
 * Loja construída a partir das LINHAS cruas do Supabase — o mesmo caminho no
 * servidor e no navegador.
 *
 * A pré-renderização (`web/ssr/entry.ts`) lê a loja, o logótipo, os banners e
 * os produtos com a chave de serviço; a SPA recebe essas mesmas linhas
 * embutidas no HTML (`#mb-ssr-data`) e lê-as em `web/lib/storeCache.ts`. Para o
 * HTML que o servidor escreve ser **byte a byte** o que a SPA escreveria (é isso
 * que permite adotar o DOM em vez de o substituir), os dois lados têm de passar
 * pelos mesmos conversores e pelo mesmo renderizador. Esta função é esse ponto
 * único.
 *
 * Sem DOM e sem o cliente Supabase: é empacotada para o servidor.
 */
import { renderStore, type StoreViewModel } from "../../src/storefront/storeRenderer.js";
import type { StorefrontResult } from "../../src/services/storefrontResolver.js";
import { toStore, toProduct, toBanner, toAsset } from "../supabase/mappers.js";
import type { StoreCustomization } from "../templates/types.js";

/** Loja resolvida, pronta a desenhar. */
export interface LoadedStorefront {
  result: StorefrontResult;
  view: StoreViewModel;
  custom: StoreCustomization;
  /**
   * Loja por publicar, aberta pelo próprio Dono (pré-visualização). Só a SPA o
   * marca — o servidor nunca serve rascunhos.
   */
  draft?: boolean;
}

/** Linhas de que a loja é feita, tal como saem do Supabase. */
export interface StorefrontRows {
  store?: { identifier?: unknown; customization?: unknown } & Record<string, unknown>;
  logo?: unknown;
  banners?: unknown[];
  products?: ({ available?: unknown } & Record<string, unknown>)[];
}

/** Personalização utilizável: um objeto, ou vazia. */
export function customizationOf(store: { customization?: unknown } | null | undefined): StoreCustomization {
  const c = store?.customization;
  return (c && typeof c === "object" && !Array.isArray(c) ? c : {}) as StoreCustomization;
}

/**
 * Constrói a loja a partir das linhas. Devolve `null` quando falta a loja.
 *
 * Só entram os produtos com `available === true` — a mesma regra do
 * `storefrontResolver`, repetida aqui para a garantia não depender de o
 * servidor ter filtrado na consulta.
 */
export function storefrontFromRows(rows: StorefrontRows | null | undefined): LoadedStorefront | null {
  const store = rows?.store;
  if (!store || typeof store !== "object") return null;
  const result: StorefrontResult = {
    kind: "render",
    store: toStore(store),
    logo: rows.logo ? toAsset(rows.logo) : null,
    banners: (rows.banners ?? []).map(toBanner),
    products: (rows.products ?? []).filter((p) => p && p.available === true).map(toProduct),
  };
  return { result, view: renderStore(result), custom: customizationOf(store) };
}
