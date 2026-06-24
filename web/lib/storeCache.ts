/**
 * Cache em memória da loja resolvida + personalização, por identificador.
 *
 * Evita re-consultar o Supabase a cada navegação entre páginas da mesma loja
 * (home, produto, categoria, carrinho), tornando a navegação instantânea.
 */
import { storeRepository, assetRepository, bannerRepository, productRepository } from "../composition.js";
import { createStorefrontResolver, type StorefrontResult } from "../../src/services/storefrontResolver.js";
import { renderStore, type StoreViewModel } from "../../src/storefront/storeRenderer.js";
import { getCustomization } from "../supabase/customization.js";
import type { StoreCustomization } from "../templates/types.js";

const resolver = createStorefrontResolver({ storeRepository, assetRepository, bannerRepository, productRepository });

export interface LoadedStorefront {
  result: StorefrontResult;
  view: StoreViewModel;
  custom: StoreCustomization;
}

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; data: LoadedStorefront }>();

/** Carrega (e memoiza) a loja por identificador. */
export async function loadStorefront(identifier: string): Promise<LoadedStorefront> {
  const key = identifier.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const host = `${identifier}.mobisno.store`;
  const result = await resolver.resolve(host);
  const view = renderStore(result);
  const custom: StoreCustomization = result.kind === "render"
    ? await getCustomization(result.store.id)
    : {};
  const data: LoadedStorefront = { result, view, custom };
  cache.set(key, { at: Date.now(), data });
  return data;
}

/** Invalida a cache (uma loja específica ou toda). */
export function invalidateStorefront(identifier?: string): void {
  if (identifier) cache.delete(identifier.toLowerCase());
  else cache.clear();
}
